# V8.51 — passive Windows evidence inventory for GP iFood versus Teknisa.
# This script reads process metadata, local printer identity, and Windows 307
# event metadata only. It NEVER reads ticket documents, order bodies, customers,
# GP session storage, cookies, application secrets, or raw document titles.
# Windows 307 contains no emitting process identity: no app attribution is made.
param(
  [string]$Day = (Get-Date).AddDays(-1).ToString('yyyy-MM-dd'),
  [int]$MaxEvents = 7500
)
$ErrorActionPreference = 'Stop'
if ($Day -cnotmatch '^\d{4}-\d{2}-\d{2}$') { throw 'DAY_INVALID' }
try {
  $start = [datetime]::ParseExact($Day,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
} catch { throw 'DAY_INVALID_CALENDAR' }
if ($MaxEvents -lt 1 -or $MaxEvents -gt 7500) { throw 'MAX_EVENTS_OUT_OF_RANGE' }
$end = $start.AddDays(1)
$sha = [Security.Cryptography.SHA256]::Create()
function KeyForQueue([string]$name) {
  # Non-authenticating pseudonym for stable queue comparison; not a secret.
  $bytes = [Text.Encoding]::UTF8.GetBytes('V851:queue:' + $name)
  return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').Substring(0,12)
}
$out = [ordered]@{
  schema = 'deliveryos.comandas.gp-print-attribution.v851.readonly'
  day_local = $Day
  captured_local = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
  source = 'Windows PrintService/Operational event 307 + local process metadata'
  print_event_count = 0
  scan_limit = $MaxEvents
  scan_truncated = $false
  print_event_log_status = 'UNOBSERVED'
  gp_process_instances = 0
  gestor_process_instances = 0
  gp_oldest_running_start_local = $null
  gp_program_version = $null
  gestor_program_version = $null
  gp_log_exists = $false
  gp_log_last_modified_local = $null
  queue_groups = @()
  observed_windows_print_events = $false
  print_source_attribution_proven = $false
  gp_auto_print_setting_proven = $false
  physical_paper_proven = $false
  order_join_proven = $false
  alert_only_no_dispatch = $true
  evidence_limitations = @(
    'WINDOWS_EVENT_307_DOES_NOT_IDENTIFY_ORIGINATING_APPLICATION',
    'RUNNING_PROCESS_DOES_NOT_PROVE_PRINT_OR_AUTO_PRINT_SETTING',
    'EVENT_307_DOES_NOT_PROVE_PHYSICAL_PAPER',
    'LOG_COVERAGE_IS_BOUNDED_TO_AVAILABLE_WINDOWS_RETENTION'
  )
  effects = [ordered]@{
    ifood_api = $false
    ifood_order_change = $false
    teknisa_write = $false
    sql = $false
    printer_write = $false
    print = $false
    spooler_write = $false
    spooler_setting_change = $false
    install = $false
    service_change = $false
    file_write = $false
    sequence_write = $false
  }
}
try {
  $p = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'Impressora GP iFood.exe' -or $_.Name -eq 'Gestor de Pedidos.exe'
  })
  $gp = @($p | Where-Object { $_.Name -eq 'Impressora GP iFood.exe' })
  $gm = @($p | Where-Object { $_.Name -eq 'Gestor de Pedidos.exe' })
  $out.gp_process_instances = $gp.Count
  $out.gestor_process_instances = $gm.Count
  if ($gp.Count -gt 0) {
    $starts = @($gp | Where-Object { $_.CreationDate } | ForEach-Object { [datetime]$_.CreationDate } | Sort-Object)
    if ($starts.Count -gt 0) {
      $out.gp_oldest_running_start_local = $starts[0].ToString('yyyy-MM-ddTHH:mm:ss')
    }
  }
  foreach($spec in @(
    @{name='Impressora GP iFood.exe';field='gp_program_version'},
    @{name='Gestor de Pedidos.exe';field='gestor_program_version'}
  )){
    $item = @($p | Where-Object { $_.Name -eq $spec.name -and $_.ExecutablePath } | Select-Object -First 1)
    if ($item.Count -gt 0) {
      try { $out[$spec.field] = (Get-Item -LiteralPath $item[0].ExecutablePath).VersionInfo.ProductVersion }
      catch { $out[$spec.field] = $null }
    }
  }
} catch {
  $out.evidence_limitations += 'PROCESS_INVENTORY_UNAVAILABLE'
}
try {
  $logFile = Join-Path $env:APPDATA 'order-manager-printer\logs\main.log'
  if (Test-Path -LiteralPath $logFile) {
    $metadata = Get-Item -LiteralPath $logFile
    $out.gp_log_exists = $true
    $out.gp_log_last_modified_local = $metadata.LastWriteTime.ToString('yyyy-MM-ddTHH:mm:ss')
  }
} catch {
  $out.evidence_limitations += 'PRINTER_APP_LOG_METADATA_UNAVAILABLE'
}
$installed = @{}
try {
  foreach($p in @(Get-Printer -ErrorAction Stop)) {
    $installed[[string]$p.Name] = [ordered]@{
      driver_class = if([string]$p.DriverName -match '(?i)EPSON'){'EPSON'}
                     elseif([string]$p.DriverName -match '(?i)ELGIN'){'ELGIN'}
                     elseif([string]$p.DriverName -match '(?i)Brother'){'BROTHER'}
                     elseif([string]$p.DriverName -match '(?i)Microsoft'){'MICROSOFT'}else{'OTHER'}
      name_has_ifood = ([string]$p.Name -match '(?i)ifood|gestor')
      name_has_delivery = ([string]$p.Name -match '(?i)delivery')
      name_has_sushi = ([string]$p.Name -match '(?i)sushi')
      name_has_cozinha = ([string]$p.Name -match '(?i)cozinha')
    }
  }
} catch { $out.evidence_limitations += 'PRINTER_INVENTORY_UNAVAILABLE' }
$aggregate = @{}
try {
  $log = Get-WinEvent -ListLog 'Microsoft-Windows-PrintService/Operational' -ErrorAction Stop
  if (!$log.IsEnabled) {
    $out.print_event_log_status = 'DISABLED_NO_EVENT_COVERAGE'
  } else {
    $ev = @(Get-WinEvent -FilterHashtable @{
      LogName = 'Microsoft-Windows-PrintService/Operational'
      Id = 307
      StartTime = $start
      EndTime = $end
    } -MaxEvents $MaxEvents -ErrorAction Stop)
    $out.print_event_log_status = 'READABLE_BOUNDED'
    $out.print_event_count = $ev.Count
    $out.scan_truncated = ($ev.Count -ge $MaxEvents)
    $out.observed_windows_print_events = ($ev.Count -gt 0)
    foreach($event in $ev) {
      [xml]$xml = $event.ToXml()
      # PROVEN host schema 2026-10-20: Event.UserData.DocumentPrinted,
      # Param5 is printer queue, Param6 is port; Param4 is job owner.
      # Never access Param2 (document title) or Param3/4 (account).
      $queue = [string]$xml.Event.UserData.DocumentPrinted.Param5
      if ([string]::IsNullOrWhiteSpace($queue)) {
        $out.evidence_limitations += 'EVENT_307_QUEUE_MISSING'
        continue
      }
      $key = KeyForQueue $queue
      if (!$aggregate.ContainsKey($key)) {
        $known = if($installed.ContainsKey($queue)){$installed[$queue]}else{$null}
        $aggregate[$key] = [ordered]@{
          queue_pseudonym = $key
          count = 0
          before_current_gp_process_start = 0
          after_current_gp_process_start = 0
          gp_timing_unknown = 0
          driver_class = if($known){$known.driver_class}else{'UNKNOWN'}
          name_has_ifood = if($known){$known.name_has_ifood}else{$false}
          name_has_delivery = if($known){$known.name_has_delivery}else{$false}
          name_has_sushi = if($known){$known.name_has_sushi}else{$false}
          name_has_cozinha = if($known){$known.name_has_cozinha}else{$false}
          # Counts are not app-level or order-level attribution.
          source_app = 'UNKNOWN'
          paper_proven = $false
        }
      }
      $a = $aggregate[$key]
      $a.count++
      $gpStart = $out.gp_oldest_running_start_local
      if($gpStart) {
        if($event.TimeCreated -ge [datetime]$gpStart){$a.after_current_gp_process_start++}
        else{$a.before_current_gp_process_start++}
      } else {$a.gp_timing_unknown++}
    }
  }
} catch {
  $out.print_event_log_status = 'UNAVAILABLE_OR_NO_MATCHING_EVENT'
  $out.evidence_limitations += 'WINDOWS_EVENT_HISTORY_UNAVAILABLE_OR_EMPTY'
}
$out.queue_groups = @($aggregate.Values | Sort-Object -Property queue_pseudonym)
# Output is strictly aggregated. No raw process paths, document text, users,
# order numbers, queue names, printer ports, addresses, tokens or GP log lines.
[pscustomobject]$out | ConvertTo-Json -Depth 9 -Compress

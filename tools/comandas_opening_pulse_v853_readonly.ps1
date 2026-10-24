# V8.53 — bounded live opening pulse, read-only. NEVER a readiness
# authorization, order-status probe, or physical-print receipt.
# Safe to run with the iFood Gestor and GP iFood already operating.
[CmdletBinding()]
param([ValidateRange(1,120)][int]$WindowMinutes=60,
      [ValidateRange(1,2000)][int]$EventLimit=2000)
$ErrorActionPreference='Stop'
$now=Get-Date
$out=[ordered]@{
 schema='deliveryos.comandas.opening-pulse.v853.readonly'
 observed_at_local=$now.ToString('yyyy-MM-ddTHH:mm:sszzz')
 window_minutes=$WindowMinutes
 gp_processes=$null;gestor_processes=$null
 gp_oldest_running_start=$null;gestor_oldest_running_start=$null
 spooler_status='UNKNOWN'
 gp_log_exists=$null;gp_log_last_write=$null
 windows_print_log='UNKNOWN'
 windows_307_count=$null
 windows_307_scan_truncated=$false
 reader_last_event_age_minutes=$null
 reader_last_event_local=$null
 application_live_processes_proven=$false
 ifood_orders_received_proven=$false
 teknisa_parity_proven=$false
 gp_auto_print_setting_proven=$false
 print_origin_gp_proven=$false
 paper_exited_proven=$false
 orders_missing_proven=$false
 notes=@('PROCESSES_ARE_NOT_ORDER_RECEIPTS',
         'EVENT_307_NOT_PROOF_OF_GP_OR_PAPER',
         'NO_NEW_PRINT_EVENTS_NOT_PROOF_OF_MISSING_ORDERS',
         'STALE_READER_NOT_PROOF_OF_IFOOD_DOWN')
 effects=[ordered]@{
  sql=$false;api=$false;ack=$false;print=$false
  spooler_change=$false;service_change=$false
  file_write=$false;install=$false;config_change=$false;deploy=$false
 }
}
try {
 $p=@(Get-Process -ErrorAction Stop |
  Where-Object{ $_.ProcessName -eq 'Impressora GP iFood' -or
                $_.ProcessName -eq 'Gestor de Pedidos' })
 $gp=@($p|Where-Object{$_.ProcessName -eq 'Impressora GP iFood'})
 $gestor=@($p|Where-Object{$_.ProcessName -eq 'Gestor de Pedidos'})
 $out.gp_processes=$gp.Count
 $out.gestor_processes=$gestor.Count
 if($gp.Count -gt 0) {
  $first=@($gp|ForEach-Object{$_.StartTime}|Sort-Object)[0]
  $out.gp_oldest_running_start=$first.ToString('yyyy-MM-ddTHH:mm:ss')
 }
 if($gestor.Count -gt 0) {
  $first=@($gestor|ForEach-Object{$_.StartTime}|Sort-Object)[0]
  $out.gestor_oldest_running_start=$first.ToString('yyyy-MM-ddTHH:mm:ss')
 }
 $out.application_live_processes_proven=($gp.Count -gt 0 -and $gestor.Count -gt 0)
} catch {$out.notes+='APP_PROCESS_QUERY_UNAVAILABLE'}
try{
 $svc=Get-Service -Name Spooler -ErrorAction Stop
 $out.spooler_status=[string]$svc.Status
} catch {$out.notes+='SPOOLER_SERVICE_QUERY_UNAVAILABLE'}
try{
 $f=Join-Path $env:APPDATA 'order-manager-printer\logs\main.log'
 $out.gp_log_exists=(Test-Path -LiteralPath $f -PathType Leaf)
 if($out.gp_log_exists) {
  $out.gp_log_last_write=(Get-Item -LiteralPath $f).LastWriteTime.ToString('yyyy-MM-ddTHH:mm:ss')
 }
} catch {$out.notes+='GP_LOG_METADATA_QUERY_UNAVAILABLE'}
try{
 $log=Get-WinEvent -ListLog 'Microsoft-Windows-PrintService/Operational' -ErrorAction Stop
 if(!$log.IsEnabled) {
  $out.windows_print_log='DISABLED'
 } else {
  $out.windows_print_log='ENABLED'
  try{
   $events=@(Get-WinEvent -FilterHashtable @{
     LogName='Microsoft-Windows-PrintService/Operational'
     Id=307;StartTime=$now.AddMinutes(-$WindowMinutes);EndTime=$now
   } -MaxEvents $EventLimit -ErrorAction Stop)
   $out.windows_307_count=$events.Count
   $out.windows_307_scan_truncated=($events.Count -ge $EventLimit)
  } catch {
   if($_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') {
    $out.windows_307_count=0
   } else {
    $out.windows_print_log='EVENT_READ_UNKNOWN'
    $out.notes+='PRINT_EVENT_HISTORY_UNAVAILABLE'
   }
  }
 }
} catch {
 $out.windows_print_log='LOG_QUERY_UNKNOWN'
 $out.notes+='PRINT_EVENT_LOG_QUERY_UNAVAILABLE'
}
try{
 $root='C:\ProgramData\TataComandaReader\state\reader-events-v1'
 if(Test-Path -LiteralPath $root -PathType Container) {
  $last=Get-ChildItem -LiteralPath $root -File -Filter '*.json' -ErrorAction Stop |
   Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 1
  if($null -ne $last) {
   $out.reader_last_event_local=$last.LastWriteTime.ToString('yyyy-MM-ddTHH:mm:ss')
   $out.reader_last_event_age_minutes=[math]::Round(($now-$last.LastWriteTime).TotalMinutes,1)
  }
 }
} catch {$out.notes+='READER_EVENT_METADATA_UNAVAILABLE'}
# Privacy: no order identifiers, customers, raw logs, document titles, queue
# names, IPs, session values, user paths or print-job contents leave the host.
[pscustomobject]$out|ConvertTo-Json -Depth 6 -Compress

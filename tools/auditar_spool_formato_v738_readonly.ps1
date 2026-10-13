# V7.38 — One-shot PASSIVE spool payload-format sampler for CAIXA_ITAIM.
# Never retain a job, install a port monitor, change queues, print or read
# full customer content. First 64 bytes ONLY, only in process memory.
# Zero captures does not prove that interception cannot work.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$durationSec=18
$spoolDirectory=Join-Path $env:windir 'System32\spool\PRINTERS'
$start=[DateTime]::Now
$finish=$start.AddSeconds($durationSec)
$seen=New-Object 'System.Collections.Generic.HashSet[string]'
$sampled=0
$readable=0
$unreadable=0
$empty=0
$oversized=0
$headerCounts=@{}
$firstError="NONE"

while([DateTime]::Now -lt $finish) {
  try {
    $files=@(Get-ChildItem -LiteralPath $spoolDirectory -File -Filter '*.SPL' -ErrorAction Stop)
    foreach($file in $files){
      $key=[string]$file.FullName
      if(-not $seen.Add($key)){continue}
      $sampled++
      if($file.Length -lt 3){$empty++;continue}
      if($file.Length -gt 30000000){$oversized++;continue}
      try {
        $share=[IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete
        $stream=[IO.File]::Open($key,[IO.FileMode]::Open,[IO.FileAccess]::Read,$share)
        try {
          $limit=[int][Math]::Min([int64]64,$stream.Length)
          if($limit -lt 3){$empty++;continue}
          $buffer=New-Object byte[] $limit
          $got=$stream.Read($buffer,0,$limit)
          if($got -lt 3){$empty++;continue}
          $readable++
          $kind='UNKNOWN_HEADER'
          if($buffer[0] -eq 27 -and $buffer[1] -eq 64){
            $kind='ESC_POS_INITIALIZE_PREFIX'
          } elseif($buffer[0] -eq 37 -and $buffer[1] -eq 80 -and $buffer[2] -eq 68){
            $kind='PDF_PREFIX'
          } elseif($buffer[0] -eq 80 -and $buffer[1] -eq 75){
            $kind='ZIP_OR_XPS_PREFIX'
          } elseif($buffer[0] -ge 32 -and $buffer[0] -le 126 -and
                   $buffer[1] -ge 32 -and $buffer[1] -le 126){
            $kind='PRINTABLE_PREFIX_UNVERIFIED'
          }
          if(-not $headerCounts.ContainsKey($kind)){$headerCounts[$kind]=0}
          $headerCounts[$kind]++
        } finally { $stream.Dispose() }
      } catch {
        $unreadable++
        if($firstError -eq 'NONE'){$firstError='UNREADABLE_OR_RACED'}
      }
    }
  } catch {
    if($firstError -eq 'NONE'){$firstError='SPOOL_DIRECTORY_UNAVAILABLE'}
  }
  Start-Sleep -Milliseconds 100
}
# A recorded print completion is not paper proof. A sampled .SPL prefix
# is not source or order identification (iFood/Teknisa).
$jobs307=0
try {
  $events=@(Get-WinEvent -FilterHashtable @{
    LogName='Microsoft-Windows-PrintService/Operational'
    Id=307;StartTime=$start
  } -ErrorAction Stop)
  $jobs307=@($events |Where-Object {$_.TimeCreated -le [DateTime]::Now}).Count
} catch { if($firstError -eq 'NONE'){$firstError='PRINT_LOG_UNAVAILABLE'} }
$headerSorted=[ordered]@{}
foreach($k in @($headerCounts.Keys|Sort-Object)){$headerSorted[$k]=$headerCounts[$k]}
[ordered]@{
  schema='deliveryos.spool-format-passive-sample.v738'
  status='OBSERVATION_ONLY_NOT_SPOOL_CONTENT_PROOF'
  window_seconds=$durationSec
  spl_files_detected=$sampled
  header_readable=$readable
  header_unreadable=$unreadable
  too_small=$empty
  oversized_skipped=$oversized
  completed_print_events_during_probe=$jobs307
  prefix_classes=$headerSorted
  diagnostic=$firstError
  print_stream_source_proven=$false
  order_content_recovered=$false
  ifood_or_teknisa_origin_proven=$false
  customer_content_exported=$false
  effects=[ordered]@{
    service_change=$false;printer_change=$false;queue_change=$false
    spooler_change=$false;file_write=$false;print=$false
    driver_install=$false;session_change=$false
  }
} | ConvertTo-Json -Depth 6 -Compress

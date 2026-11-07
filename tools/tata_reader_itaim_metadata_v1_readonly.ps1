# TATA Comandas - first on-site, metadata-only health preflight for the
# EXISTING Reader. Does not inspect JSON contents, orders, processes, queues,
# services, configuration, credentials, SQL, or printers. No filesystem writes.
# Not an attestation of current service operation or native first dispatch.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$nowUtc=[DateTime]::UtcNow
$root='C:\ProgramData\TataComandaReader'
$approvedHost='CAIXA_MOOCA'
$files=[ordered]@{
 heartbeat='state\reader-heartbeat-v1.json'
 shadow_consumer='evidence\shadow-consumer-status.json'
 reporting_projector='evidence\reporting-projector-status.json'
 production_service='state\production-service-state.json'
}
$out=[ordered]@{
 schema='tata.comandas.itaim-reader-metadata.v1.readonly'
 captured_at_utc=$nowUtc.ToString('o')
 device_unit='ITAIM_HUMAN_CONFIRMED_NOT_INDEPENDENTLY_ATTESTED'
 host_matches_approved_name=$false
 root_directory_safe=$false
 files=@()
 status='HOLD'
 reader_service_running_proven=$false
 reader_content_valid_proven=$false
 native_first_dispatch_proven=$false
 printer_path_proven=$false
 physical_paper_proven=$false
 ready_for_operational_print=$false
 effect_boundary=[ordered]@{
  file_contents_read=$false;file_write=$false
  sql_read=$false;sql_write=$false
  network=$false;printer_read=$false;print=$false
  spooler_read=$false;spooler_write=$false
  service_read=$false;service_change=$false
  sequence_write=$false;fiscal=$false;deploy=$false
 }
}
# Fail closed before touching the Reader directory on a different device.
if([string]::Equals([string]$env:COMPUTERNAME,$approvedHost,
   [StringComparison]::OrdinalIgnoreCase)) {
 $out.host_matches_approved_name=$true
 try {
  $dir=Get-Item -LiteralPath $root -Force -ErrorAction Stop
  $out.root_directory_safe=($dir.PSIsContainer -and
   (($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0))
 } catch { $out.root_directory_safe=$false }
 if($out.root_directory_safe) {
  foreach($key in $files.Keys) {
   $rel=$files[$key]
   $entry=[ordered]@{
    logical_name=[string]$key
    status='UNAVAILABLE'
    last_write_utc=$null
    age_minutes=$null
    clock_anomaly=$null
    length_bytes=$null
   }
   try {
    $dirName=Split-Path -Path $rel -Parent
    $parent=Get-Item -LiteralPath (Join-Path $root $dirName) -Force -ErrorAction Stop
    if(-not $parent.PSIsContainer -or
       (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
     $entry.status='BLOCKED_UNSAFE_PARENT'
    } else {
     $f=Get-Item -LiteralPath (Join-Path $root $rel) -Force -ErrorAction Stop
     if($f.PSIsContainer -or
        (($f.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
      $entry.status='BLOCKED_UNSAFE_FILE'
     } else {
      $entry.status='PRESENT_METADATA_ONLY'
      $entry.length_bytes=[long]$f.Length
      $entry.last_write_utc=$f.LastWriteTimeUtc.ToString('o')
      $age=($nowUtc-$f.LastWriteTimeUtc).TotalMinutes
      $entry.clock_anomaly=($age -lt 0)
      if($age -ge 0) { $entry.age_minutes=[math]::Round($age,1) }
     }
    }
   } catch { $entry.status='UNAVAILABLE' }
   $out.files+=([pscustomobject]$entry)
  }
 }
}
# The word HOLD is intentional even if all files exist and are recent.
# Metadata cannot certify service health, JSON validity, independent source
# custody, first native production dispatch, or actual printed paper.
[pscustomobject]$out | ConvertTo-Json -Depth 5 -Compress

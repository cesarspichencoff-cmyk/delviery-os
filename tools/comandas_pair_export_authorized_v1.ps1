# One-shot protected-source export for an authorized human admin session.
# NEVER changes ACL, services, printers, SQL, or TATA sequence.
[CmdletBinding()]
param(
 [string]$DestinationRoot = '',
 [ValidateRange(1,150)][int]$MaxEvents=40,
 [switch]$FixtureMode,
 [string]$SourceRoot='C:\ProgramData\TataComandaReader\state'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Hold([string]$reason){
 Write-Output ('{"schema":"tata.comandas.pair-export.v1","status":"HOLD","reason":"'+$reason+'","effects":{"source_write":false,"acl_change":false,"service_change":false,"print":false,"sql":false}}')
 exit 2
}
$production='C:\ProgramData\TataComandaReader\state'
if(-not $FixtureMode){
 if($SourceRoot -cne $production){Hold 'SOURCE_ROOT_NOT_APPROVED'}
 $who=[Security.Principal.WindowsIdentity]::GetCurrent()
 $wp=[Security.Principal.WindowsPrincipal]::new($who)
 if(-not $wp.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){Hold 'ADMIN_TOKEN_NOT_ELEVATED'}
 $permitted=Join-Path $env:LOCALAPPDATA 'TataComandasPairPilot'
 if([string]::IsNullOrWhiteSpace($DestinationRoot)){$DestinationRoot=$permitted}
 if([IO.Path]::GetFullPath($DestinationRoot).TrimEnd('\') -cne [IO.Path]::GetFullPath($permitted).TrimEnd('\')){
   Hold 'DESTINATION_OUTSIDE_USER_LOCALAPPDATA'
 }
}else{
 if($SourceRoot -like 'C:\ProgramData\TataComandaReader*'){Hold 'FIXTURE_MUST_NOT_USE_PRODUCTION'}
 if([string]::IsNullOrWhiteSpace($DestinationRoot)){Hold 'FIXTURE_DESTINATION_REQUIRED'}
}
function Bytes([string]$p,[int]$limit){
 $f=Get-Item -LiteralPath $p -ErrorAction Stop
 if($f.PSIsContainer -or $f.Length -gt $limit -or $f.Length -lt 1 -or
   ($f.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'UNSAFE_SOURCE_FILE'}
 return [IO.File]::ReadAllBytes($p)
}
function SHA([byte[]]$data){
 $h=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($h.ComputeHash($data))).Replace('-','').ToLowerInvariant()}
 finally{$h.Dispose()}
}
try {
 $eventDir=Join-Path $SourceRoot 'reader-events-v1'
 $decisionDir=Join-Path $SourceRoot 'reader-shadow-decisions-v1'
 $candidates=@(Get-ChildItem -LiteralPath $eventDir -Filter '*.json' -File -ErrorAction Stop |
  Where-Object { $_.Name -cmatch '^[0-9]{10}_[0-9a-fA-F]{64}\.json$' } |
  Sort-Object LastWriteTimeUtc -Descending | Select-Object -First $MaxEvents)
 if($candidates.Count -eq 0){Hold 'NO_EVENT_FILES'}
 $chosen=$null
 foreach($ev in $candidates){
  $decisionName=$ev.Name -replace '\.json$','.decision.json'
  $decPath=Join-Path $decisionDir $decisionName
  if(-not (Test-Path -LiteralPath $decPath -PathType Leaf)){continue}
  try{
   [byte[]]$eb=Bytes $ev.FullName 2097152
   [byte[]]$db=Bytes $decPath 2097152
   $e=[Text.Encoding]::UTF8.GetString($eb) | ConvertFrom-Json
   $dec=[Text.Encoding]::UTF8.GetString($db) | ConvertFrom-Json
   if($e.schema -cne 'deliveryos.tata-reader-stable-order-event.v1' -or
      $dec.schema -cne 'deliveryos.live-shadow-decision.v1'){continue}
   if($e.order_key -cne $dec.order_key -or $e.snapshot_hash -cne $dec.snapshot_hash){continue}
   if(([string]$e.order_key) -cnotmatch '^[0-9]{4}\|[0-9]{2}\|[0-9]{1,12}\|[0-9]{1,12}$' -or
      ([string]$e.snapshot_hash) -cnotmatch '^[a-fA-F0-9]{64}$'){continue}
   if(([string]$dec.fingerprint) -cnotmatch '^[a-fA-F0-9]{64}$'){continue}
   $chosen=@{event=$eb;decision=$db;eventInfo=$ev;decisionInfo=(Get-Item -LiteralPath $decPath)}
   break
  }catch {continue}
 }
 if($null -eq $chosen){Hold 'NO_MATCHING_BOUNDED_EVENT_DECISION'}
 # Copies only one matched pair; source is never opened for write.
 if(Test-Path -LiteralPath $DestinationRoot){
  $dir=Get-Item -LiteralPath $DestinationRoot
  if(-not $dir.PSIsContainer -or ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint)){
   Hold 'INVALID_DESTINATION_DIRECTORY'
  }
 }else{
  New-Item -ItemType Directory -Path $DestinationRoot -ErrorAction Stop | Out-Null
 }
 $fresh=(Get-Date).ToUniversalTime()
 $sub='pair-'+[guid]::NewGuid().ToString('N')
 $path=Join-Path $DestinationRoot $sub
 New-Item -ItemType Directory -Path $path -ErrorAction Stop | Out-Null
 $ep=Join-Path $path 'event.json'
 $dp=Join-Path $path 'decision.json'
 [IO.File]::WriteAllBytes($ep,[byte[]]$chosen.event)
 [IO.File]::WriteAllBytes($dp,[byte[]]$chosen.decision)
 $eh=SHA ([byte[]]$chosen.event)
 $dh=SHA ([byte[]]$chosen.decision)
 if((SHA ([IO.File]::ReadAllBytes($ep))) -cne $eh -or
    (SHA ([IO.File]::ReadAllBytes($dp))) -cne $dh){throw 'EXPORT_COPY_READBACK_MISMATCH'}
 $receipt=[ordered]@{
  schema='tata.comandas.pair-export-receipt.v1'
  outcome='EXPORTED_UNATTESTED_SOURCE'
  exported_at_utc=$fresh.ToString('o')
  event_sha256=$eh;decision_sha256=$dh
  event_lastwrite_utc=$chosen.eventInfo.LastWriteTimeUtc.ToString('o')
  decision_lastwrite_utc=$chosen.decisionInfo.LastWriteTimeUtc.ToString('o')
  event_age_min=([math]::Round(($fresh-$chosen.eventInfo.LastWriteTimeUtc).TotalMinutes,2))
  observed_not_independently_attested=$true
  effects=@{source_write=$false;acl_change=$false;service_change=$false;print=$false;sql=$false}
 }
 [IO.File]::WriteAllText((Join-Path $path 'receipt.json'),($receipt|ConvertTo-Json -Depth 5),
  [Text.UTF8Encoding]::new($false))
 Write-Output ('{"schema":"tata.comandas.pair-export.v1","status":"ONE_PAIR_EXPORTED","receipt_saved":true,"source_write":false,"acl_change":false,"print":false}')
}catch{
 Hold 'PROTECTED_SOURCE_OR_EXPORT_FAILED'
}

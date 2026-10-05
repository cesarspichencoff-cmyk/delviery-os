param(
  [Parameter(Mandatory=$true)]
  [string]$AuthorizationId,

  [Parameter(Mandatory=$true)]
  [string]$ExpectedHostSha256,

  [Parameter(Mandatory=$true)]
  [string]$ExpectedReaderSha256,

  [Parameter(Mandatory=$true)]
  [string]$ExpectedEntrypointSha256,

  [string]$HostSource = "C:\TATA\comanda-v1\cutover\TataComandaReader.ContinuousService.exe",
  [string]$ReaderSource = "C:\TATA\comanda-v1\cutover\tata_reader_continuous_watch_candidate_v1.ps1",
  [string]$EntrypointSource = "C:\TATA\comanda-v1\cutover\tata_reader_continuous_service_entrypoint_v1.ps1",
  [string]$InstallRoot = "C:\ProgramData\TataComandaReader",
  [string]$ServiceName = "TataComandaReader"
)

$ErrorActionPreference="Stop"

$ExpectedAuthorizationId="CESAR-2026-10-05-CONTINUOUS-READER-DEDICATED-HOST-CUTOVER-V1"
$ExpectedPrincipal="NT SERVICE\TataComandaReader"
$ExpectedOriginalPreflightSha="3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035"

$BinDir=Join-Path $InstallRoot "bin"
$StateDir=Join-Path $InstallRoot "state"
$RollbackDir=Join-Path $StateDir "dedicated-host-cutover-v1"
$ManifestPath=Join-Path $RollbackDir "manifest.json"
$OriginalPreflight=Join-Path $BinDir "tata_reader_least_privilege_preflight.ps1"
$OriginalPreflightBackup=Join-Path $StateDir "hostslot-cutover-v1\original_preflight.ps1"
$HostDest=Join-Path $BinDir "TataComandaReader.ContinuousService.exe"
$ReaderDest=Join-Path $BinDir "tata_reader_continuous_watch_candidate_v1.ps1"
$EntrypointDest=Join-Path $BinDir "tata_reader_continuous_service_entrypoint_v1.ps1"
$Checkpoint=Join-Path $StateDir "reader-watch-checkpoint-v1.json"
$HostStatus=Join-Path $InstallRoot "evidence\continuous-host-status.json"

function Sha([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant()}
function Stop-Reader {
  $s=Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if($s -and $s.Status -ne "Stopped"){Stop-Service -Name $ServiceName -Force -ErrorAction Stop}
  for($i=0;$i -lt 60;$i++){ $s=Get-Service -Name $ServiceName -ErrorAction SilentlyContinue; if($s -and $s.Status -eq "Stopped"){return}; Start-Sleep -Milliseconds 500 }
  throw "SERVICE_STOP_TIMEOUT"
}
function Restore($m){
  $errs=@()
  try{Stop-Reader}catch{$errs+=("STOP:"+$_.Exception.Message)}
  try{
    & sc.exe config $ServiceName binPath= ([string]$m.original_service.path_name) | Out-Null
    if($LASTEXITCODE -ne 0){throw "BINPATH_RESTORE_FAILED"}
  }catch{$errs+=("BINPATH:"+$_.Exception.Message)}
  try{
    if(Test-Path -LiteralPath $OriginalPreflightBackup){
      if((Sha $OriginalPreflightBackup) -ne $ExpectedOriginalPreflightSha){throw "ORIGINAL_BACKUP_HASH_MISMATCH"}
      Copy-Item -LiteralPath $OriginalPreflightBackup -Destination $OriginalPreflight -Force
      if((Sha $OriginalPreflight) -ne $ExpectedOriginalPreflightSha){throw "ORIGINAL_PREFLIGHT_RESTORE_HASH_MISMATCH"}
    }
  }catch{$errs+=("PREFLIGHT:"+$_.Exception.Message)}
  try{
    foreach($p in @($HostDest,$ReaderDest,$EntrypointDest)){ if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force} }
  }catch{$errs+=("FILES:"+$_.Exception.Message)}
  return @($errs)
}

$result=[ordered]@{
 schema="deliveryos.tata-reader-dedicated-host-cutover-result.v1"
 authorization_id=$AuthorizationId
 status="STARTED"
 started_at=(Get-Date).ToString("o")
 original_service=$null
 candidate=$null
 post_start=$null
 rollback=[ordered]@{attempted=$false;complete=$false;errors=@()}
 effects=[ordered]@{service_binpath_change=$false;service_start=$false;service_stop=$false;local_candidate_copy=$false;preflight_restore=$false;database_write=$false;print=$false;spooler_write=$false;odhen_write=$false;fiscal_action=$false;sefaz_call=$false}
 error=$null
}

if($AuthorizationId -ne $ExpectedAuthorizationId){throw "AUTHORIZATION_ID_MISMATCH"}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw "NOT_ELEVATED"}

foreach($p in @($HostSource,$ReaderSource,$EntrypointSource)){if(-not(Test-Path -LiteralPath $p -PathType Leaf)){throw ("SOURCE_MISSING:"+$p)}}
if((Sha $HostSource) -ne $ExpectedHostSha256.ToUpperInvariant()){throw "HOST_SOURCE_HASH_MISMATCH"}
if((Sha $ReaderSource) -ne $ExpectedReaderSha256.ToUpperInvariant()){throw "READER_SOURCE_HASH_MISMATCH"}
if((Sha $EntrypointSource) -ne $ExpectedEntrypointSha256.ToUpperInvariant()){throw "ENTRYPOINT_SOURCE_HASH_MISMATCH"}
if(-not(Test-Path -LiteralPath $OriginalPreflightBackup -PathType Leaf)){throw "ORIGINAL_PREFLIGHT_BACKUP_MISSING"}
if((Sha $OriginalPreflightBackup) -ne $ExpectedOriginalPreflightSha){throw "ORIGINAL_PREFLIGHT_BACKUP_HASH_MISMATCH"}

$svc=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if($null -eq $svc){throw "SERVICE_NOT_FOUND"}
if([string]$svc.State -ne "Stopped"){throw ("SERVICE_NOT_STOPPED:"+[string]$svc.State)}
if(-not [string]::Equals([string]$svc.StartName,$ExpectedPrincipal,[StringComparison]::OrdinalIgnoreCase)){throw ("SERVICE_IDENTITY_MISMATCH:"+[string]$svc.StartName)}

New-Item -ItemType Directory -Force -Path $RollbackDir | Out-Null
$manifest=[ordered]@{
 schema="deliveryos.tata-reader-dedicated-host-rollback-manifest.v1"
 captured_at=(Get-Date).ToString("o")
 original_service=[ordered]@{path_name=[string]$svc.PathName;start_mode=[string]$svc.StartMode;start_name=[string]$svc.StartName}
 original_preflight=[ordered]@{backup_path=$OriginalPreflightBackup;sha256=$ExpectedOriginalPreflightSha}
 candidate=[ordered]@{host_sha256=(Sha $HostSource);reader_sha256=(Sha $ReaderSource);entrypoint_sha256=(Sha $EntrypointSource)}
}
$manifest|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $ManifestPath -Encoding UTF8
$result.original_service=$manifest.original_service
$result.candidate=$manifest.candidate

try{
  Copy-Item -LiteralPath $OriginalPreflightBackup -Destination $OriginalPreflight -Force
  if((Sha $OriginalPreflight) -ne $ExpectedOriginalPreflightSha){throw "PREFLIGHT_RESTORE_FAILED"}
  $result.effects.preflight_restore=$true

  Copy-Item -LiteralPath $HostSource -Destination $HostDest -Force
  Copy-Item -LiteralPath $ReaderSource -Destination $ReaderDest -Force
  Copy-Item -LiteralPath $EntrypointSource -Destination $EntrypointDest -Force
  $result.effects.local_candidate_copy=$true

  if((Sha $HostDest) -ne (Sha $HostSource)){throw "HOST_DEST_HASH_MISMATCH"}
  if((Sha $ReaderDest) -ne (Sha $ReaderSource)){throw "READER_DEST_HASH_MISMATCH"}
  if((Sha $EntrypointDest) -ne (Sha $EntrypointSource)){throw "ENTRYPOINT_DEST_HASH_MISMATCH"}

  & sc.exe config $ServiceName binPath= $HostDest | Out-Null
  if($LASTEXITCODE -ne 0){throw "SERVICE_BINPATH_CONFIG_FAILED"}
  $result.effects.service_binpath_change=$true

  $checkpointBefore=if(Test-Path -LiteralPath $Checkpoint){(Get-Item -LiteralPath $Checkpoint).LastWriteTimeUtc}else{$null}
  Start-Service -Name $ServiceName
  $result.effects.service_start=$true

  Start-Sleep -Seconds 5
  $post=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
  if($null -eq $post){throw "SERVICE_DISAPPEARED_AFTER_START"}
  if([string]$post.State -ne "Running"){throw ("SERVICE_NOT_RUNNING_AFTER_START:"+[string]$post.State)}
  if(-not [string]::Equals([string]$post.StartName,$ExpectedPrincipal,[StringComparison]::OrdinalIgnoreCase)){throw "SERVICE_IDENTITY_CHANGED_AFTER_START"}
  if(-not [string]::Equals([string]$post.PathName,$HostDest,[StringComparison]::OrdinalIgnoreCase)){throw "SERVICE_HOST_PATH_MISMATCH_AFTER_START"}

  $advanced=$false
  for($i=0;$i -lt 30;$i++){
    if(Test-Path -LiteralPath $Checkpoint -PathType Leaf){
      $lw=(Get-Item -LiteralPath $Checkpoint).LastWriteTimeUtc
      if($null -eq $checkpointBefore -or $lw -gt $checkpointBefore){$advanced=$true;break}
    }
    Start-Sleep -Milliseconds 500
  }
  if(-not $advanced){throw "CHECKPOINT_DID_NOT_ADVANCE"}

  if(-not(Test-Path -LiteralPath $HostStatus -PathType Leaf)){throw "HOST_STATUS_FILE_MISSING"}
  $hs=Get-Content -LiteralPath $HostStatus -Raw -Encoding UTF8|ConvertFrom-Json
  if([string]$hs.state -ne "RUNNING"){throw ("HOST_STATUS_NOT_RUNNING:"+[string]$hs.state)}

  $cp=Get-Content -LiteralPath $Checkpoint -Raw -Encoding UTF8|ConvertFrom-Json
  $result.post_start=[ordered]@{
    service_state=[string]$post.State
    service_start_name=[string]$post.StartName
    service_path_name=[string]$post.PathName
    host_status=$hs
    checkpoint_advanced=$advanced
    checkpoint_entries=@($cp.entries).Count
    checkpoint_sha256=Sha $Checkpoint
  }
  $result.status="DEDICATED_HOST_RUNNING_READONLY_PROVEN_INITIAL"
}catch{
  $result.error=[string]$_.Exception.Message
  $result.rollback.attempted=$true
  $errs=Restore $manifest
  $result.rollback.errors=@($errs)
  $result.rollback.complete=($errs.Count -eq 0)
  $result.status=if($result.rollback.complete){"CUTOVER_FAILED_ROLLBACK_COMPLETE"}else{"CUTOVER_FAILED_ROLLBACK_INCOMPLETE"}
}finally{
  $result.completed_at=(Get-Date).ToString("o")
  $result|ConvertTo-Json -Depth 10
}

if($result.status -eq "CUTOVER_FAILED_ROLLBACK_INCOMPLETE"){exit 9}
if($result.status -eq "CUTOVER_FAILED_ROLLBACK_COMPLETE"){exit 7}
if($result.status -ne "DEDICATED_HOST_RUNNING_READONLY_PROVEN_INITIAL"){exit 6}
exit 0

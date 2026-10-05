param(
  [Parameter(Mandatory=$true)]
  [string]$AuthorizationId,

  [Parameter(Mandatory=$true)]
  [string]$ExpectedReaderSha256,

  [Parameter(Mandatory=$true)]
  [string]$ExpectedEntrypointSha256,

  [string]$ReaderSource = "C:\TATA\comanda-v1\cutover\tata_reader_continuous_watch_candidate_v1.ps1",
  [string]$EntrypointSource = "C:\TATA\comanda-v1\cutover\tata_reader_continuous_service_entrypoint_v1.ps1",
  [string]$InstallRoot = "C:\ProgramData\TataComandaReader",
  [string]$ServiceName = "TataComandaReader"
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-05-CONTINUOUS-READER-HOSTSLOT-CUTOVER-V1"
$ExpectedPrincipal = "NT SERVICE\TataComandaReader"
$ExpectedOriginalPreflightSha = "3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035"
$ExpectedServiceExe = "C:\ProgramData\TataComandaReader\bin\TataComandaReader.PreflightService.exe"

$BinDir = Join-Path $InstallRoot "bin"
$StateDir = Join-Path $InstallRoot "state"
$RollbackDir = Join-Path $StateDir "hostslot-cutover-v1"
$ManifestPath = Join-Path $RollbackDir "manifest.json"
$OriginalPreflightPath = Join-Path $BinDir "tata_reader_least_privilege_preflight.ps1"
$BackupPreflightPath = Join-Path $RollbackDir "original_preflight.ps1"
$ReaderDest = Join-Path $BinDir "tata_reader_continuous_watch_candidate_v1.ps1"
$EntrypointDest = Join-Path $BinDir "tata_reader_continuous_service_entrypoint_v1.ps1"
$CheckpointPath = Join-Path $StateDir "reader-watch-checkpoint-v1.json"

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Stop-ReaderService {
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -ne "Stopped") {
    Stop-Service -Name $ServiceName -Force -ErrorAction Stop
  }
  for ($i=0; $i -lt 60; $i++) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Stopped") { return }
    Start-Sleep -Milliseconds 500
  }
  throw "SERVICE_STOP_TIMEOUT"
}

function Restore-Original {
  $errors=@()
  try { Stop-ReaderService } catch { $errors += ("STOP:" + $_.Exception.Message) }
  try {
    if (-not (Test-Path -LiteralPath $BackupPreflightPath -PathType Leaf)) {
      throw "BACKUP_PREFLIGHT_MISSING"
    }
    if ((Get-Sha256 $BackupPreflightPath) -ne $ExpectedOriginalPreflightSha) {
      throw "BACKUP_PREFLIGHT_HASH_MISMATCH"
    }
    Copy-Item -LiteralPath $BackupPreflightPath -Destination $OriginalPreflightPath -Force
    if ((Get-Sha256 $OriginalPreflightPath) -ne $ExpectedOriginalPreflightSha) {
      throw "PREFLIGHT_RESTORE_HASH_MISMATCH"
    }
  } catch { $errors += ("PREFLIGHT:" + $_.Exception.Message) }
  try {
    if (Test-Path -LiteralPath $ReaderDest) { Remove-Item -LiteralPath $ReaderDest -Force }
    if (Test-Path -LiteralPath $EntrypointDest) { Remove-Item -LiteralPath $EntrypointDest -Force }
  } catch { $errors += ("FILES:" + $_.Exception.Message) }
  return @($errors)
}

$result=[ordered]@{
  schema="deliveryos.tata-reader-hostslot-cutover-result.v1"
  authorization_id=$AuthorizationId
  status="STARTED"
  started_at=(Get-Date).ToString("o")
  original=$null
  candidate=$null
  post_start=$null
  rollback=[ordered]@{attempted=$false;complete=$false;errors=@()}
  effects=[ordered]@{
    service_binpath_change=$false
    service_start=$false
    service_stop=$false
    preflight_slot_replace=$false
    local_candidate_copy=$false
    database_write=$false
    print=$false
    spooler_write=$false
    odhen_write=$false
    fiscal_action=$false
    sefaz_call=$false
  }
  error=$null
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) { throw "AUTHORIZATION_ID_MISMATCH" }

$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "NOT_ELEVATED" }

if (-not (Test-Path -LiteralPath $ReaderSource -PathType Leaf)) { throw "READER_SOURCE_MISSING" }
if (-not (Test-Path -LiteralPath $EntrypointSource -PathType Leaf)) { throw "ENTRYPOINT_SOURCE_MISSING" }
if (-not (Test-Path -LiteralPath $OriginalPreflightPath -PathType Leaf)) { throw "ORIGINAL_PREFLIGHT_MISSING" }

$readerSha=Get-Sha256 $ReaderSource
$entrySha=Get-Sha256 $EntrypointSource
$originalSha=Get-Sha256 $OriginalPreflightPath
if ($readerSha -ne $ExpectedReaderSha256.ToUpperInvariant()) { throw "READER_SOURCE_HASH_MISMATCH" }
if ($entrySha -ne $ExpectedEntrypointSha256.ToUpperInvariant()) { throw "ENTRYPOINT_SOURCE_HASH_MISMATCH" }
if ($originalSha -ne $ExpectedOriginalPreflightSha) { throw "ORIGINAL_PREFLIGHT_HASH_MISMATCH" }

$svc=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if ($null -eq $svc) { throw "SERVICE_NOT_FOUND" }
if ([string]$svc.State -ne "Stopped") { throw ("SERVICE_NOT_STOPPED:" + [string]$svc.State) }
if (-not [string]::Equals([string]$svc.StartName,$ExpectedPrincipal,[StringComparison]::OrdinalIgnoreCase)) {
  throw ("SERVICE_IDENTITY_MISMATCH:" + [string]$svc.StartName)
}
if (-not [string]::Equals([string]$svc.PathName,$ExpectedServiceExe,[StringComparison]::OrdinalIgnoreCase)) {
  throw ("SERVICE_EXE_MISMATCH:" + [string]$svc.PathName)
}

New-Item -ItemType Directory -Force -Path $RollbackDir | Out-Null
Copy-Item -LiteralPath $OriginalPreflightPath -Destination $BackupPreflightPath -Force
if ((Get-Sha256 $BackupPreflightPath) -ne $ExpectedOriginalPreflightSha) { throw "BACKUP_PREFLIGHT_HASH_MISMATCH" }

$checkpointBeforeExists=Test-Path -LiteralPath $CheckpointPath -PathType Leaf
$checkpointBeforeWriteUtc=if($checkpointBeforeExists){(Get-Item -LiteralPath $CheckpointPath).LastWriteTimeUtc}else{$null}
$checkpointBeforeHash=if($checkpointBeforeExists){Get-Sha256 $CheckpointPath}else{$null}

$manifest=[ordered]@{
  schema="deliveryos.tata-reader-hostslot-cutover-rollback-manifest.v1"
  captured_at=(Get-Date).ToString("o")
  service=[ordered]@{
    name=$ServiceName
    state=[string]$svc.State
    path_name=[string]$svc.PathName
    start_mode=[string]$svc.StartMode
    start_name=[string]$svc.StartName
  }
  original_preflight=[ordered]@{
    path=$OriginalPreflightPath
    sha256=$originalSha
    backup_path=$BackupPreflightPath
  }
  candidate=[ordered]@{
    reader_source=$ReaderSource
    reader_sha256=$readerSha
    entrypoint_source=$EntrypointSource
    entrypoint_sha256=$entrySha
  }
}
$manifest|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $ManifestPath -Encoding UTF8
$result.original=$manifest.original_preflight
$result.candidate=$manifest.candidate

try {
  Copy-Item -LiteralPath $ReaderSource -Destination $ReaderDest -Force
  Copy-Item -LiteralPath $EntrypointSource -Destination $EntrypointDest -Force
  $result.effects.local_candidate_copy=$true

  if ((Get-Sha256 $ReaderDest) -ne $readerSha) { throw "READER_DEST_HASH_MISMATCH" }
  if ((Get-Sha256 $EntrypointDest) -ne $entrySha) { throw "ENTRYPOINT_DEST_HASH_MISMATCH" }

  Copy-Item -LiteralPath $EntrypointSource -Destination $OriginalPreflightPath -Force
  $result.effects.preflight_slot_replace=$true
  if ((Get-Sha256 $OriginalPreflightPath) -ne $entrySha) { throw "PREFLIGHT_SLOT_HASH_MISMATCH" }

  $startUtc=(Get-Date).ToUniversalTime()
  Start-Service -Name $ServiceName
  $result.effects.service_start=$true

  Start-Sleep -Seconds 4
  $post=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
  if ($null -eq $post) { throw "SERVICE_DISAPPEARED_AFTER_START" }
  if (-not [string]::Equals([string]$post.StartName,$ExpectedPrincipal,[StringComparison]::OrdinalIgnoreCase)) {
    throw "SERVICE_IDENTITY_CHANGED_AFTER_START"
  }
  if ([string]$post.State -ne "Running") { throw ("SERVICE_NOT_RUNNING_AFTER_START:" + [string]$post.State) }

  $checkpointAdvanced=$false
  for($i=0;$i -lt 30;$i++){
    if(Test-Path -LiteralPath $CheckpointPath -PathType Leaf){
      $item=Get-Item -LiteralPath $CheckpointPath
      if($item.LastWriteTimeUtc -ge $startUtc.AddSeconds(-1)){
        if(-not $checkpointBeforeExists -or $item.LastWriteTimeUtc -gt $checkpointBeforeWriteUtc){
          $checkpointAdvanced=$true
          break
        }
      }
    }
    Start-Sleep -Milliseconds 500
  }
  if(-not $checkpointAdvanced){throw "CHECKPOINT_DID_NOT_ADVANCE_AFTER_START"}

  $checkpoint=Get-Content -LiteralPath $CheckpointPath -Raw -Encoding UTF8|ConvertFrom-Json
  if($checkpoint.schema -ne "deliveryos.tata-reader-continuous-checkpoint.v1"){throw "CHECKPOINT_SCHEMA_MISMATCH_AFTER_START"}

  $result.post_start=[ordered]@{
    service_state=[string]$post.State
    service_start_name=[string]$post.StartName
    service_path_name=[string]$post.PathName
    service_start_mode=[string]$post.StartMode
    checkpoint_present=$true
    checkpoint_advanced=$checkpointAdvanced
    checkpoint_bootstrap_complete=[bool]$checkpoint.bootstrap_complete
    checkpoint_entries=@($checkpoint.entries).Count
    checkpoint_sha256=Get-Sha256 $CheckpointPath
    checkpoint_before_sha256=$checkpointBeforeHash
  }
  $result.status="CUTOVER_RUNNING_READONLY_HOSTSLOT_PROVEN"
}
catch {
  $result.error=[string]$_.Exception.Message
  $result.rollback.attempted=$true
  $rollbackErrors=Restore-Original
  $result.rollback.errors=@($rollbackErrors)
  $result.rollback.complete=($rollbackErrors.Count -eq 0)
  $result.status=if($result.rollback.complete){"CUTOVER_FAILED_ROLLBACK_COMPLETE"}else{"CUTOVER_FAILED_ROLLBACK_INCOMPLETE"}
}
finally {
  $result.completed_at=(Get-Date).ToString("o")
  $result|ConvertTo-Json -Depth 12
}

if($result.status -eq "CUTOVER_FAILED_ROLLBACK_INCOMPLETE"){exit 9}
if($result.status -eq "CUTOVER_FAILED_ROLLBACK_COMPLETE"){exit 7}
if($result.status -ne "CUTOVER_RUNNING_READONLY_HOSTSLOT_PROVEN"){exit 6}
exit 0

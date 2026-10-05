param(
  [Parameter(Mandatory=$true)]
  [string]$AuthorizationId,

  [Parameter(Mandatory=$true)]
  [string]$ExpectedReaderSha256,

  [Parameter(Mandatory=$true)]
  [string]$ExpectedEntrypointSha256,

  [string]$ReaderSource = "C:\\TATA\\comanda-v1\\cutover\\tata_reader_continuous_watch_candidate_v1.ps1",
  [string]$EntrypointSource = "C:\\TATA\\comanda-v1\\cutover\\tata_reader_continuous_service_entrypoint_v1.ps1",
  [string]$InstallRoot = "C:\\ProgramData\\TataComandaReader",
  [string]$ServiceName = "TataComandaReader"
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-05-CONTINUOUS-READER-CUTOVER-V1"
$ExpectedPrincipal = "NT SERVICE\\TataComandaReader"
$BinDir = Join-Path $InstallRoot "bin"
$StateDir = Join-Path $InstallRoot "state"
$EvidenceDir = Join-Path $InstallRoot "evidence"
$RollbackDir = Join-Path $StateDir "cutover-rollback-v1"
$ManifestPath = Join-Path $RollbackDir "manifest.json"
$ReaderDest = Join-Path $BinDir "tata_reader_continuous_watch_candidate_v1.ps1"
$EntrypointDest = Join-Path $BinDir "tata_reader_continuous_service_entrypoint_v1.ps1"
$OriginalPreflight = Join-Path $BinDir "tata_reader_least_privilege_preflight.ps1"

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Quote([string]$Value) {
  return '"' + ($Value -replace '"','\"') + '"'
}

function Set-ServiceBinPath([string]$PathName) {
  & sc.exe config $ServiceName binPath= $PathName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "SERVICE_BINPATH_CONFIG_FAILED" }
}

function StartMode-To-Sc([string]$Mode) {
  switch ($Mode) {
    "Auto" { return "auto" }
    "Automatic" { return "auto" }
    "Manual" { return "demand" }
    "Disabled" { return "disabled" }
    default { return "demand" }
  }
}

function Restore-Original($manifest) {
  $errors = @()
  try {
    $s = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($s -and $s.Status -ne "Stopped") {
      Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    }
  } catch { $errors += ("STOP:" + $_.Exception.Message) }

  try {
    Set-ServiceBinPath ([string]$manifest.original.path_name)
  } catch { $errors += ("BINPATH:" + $_.Exception.Message) }

  try {
    $startMode = StartMode-To-Sc ([string]$manifest.original.start_mode)
    & sc.exe config $ServiceName start= $startMode | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "SERVICE_STARTMODE_RESTORE_FAILED" }
  } catch { $errors += ("STARTMODE:" + $_.Exception.Message) }

  try {
    if (Test-Path -LiteralPath $ReaderDest) { Remove-Item -LiteralPath $ReaderDest -Force }
    if (Test-Path -LiteralPath $EntrypointDest) { Remove-Item -LiteralPath $EntrypointDest -Force }
  } catch { $errors += ("FILES:" + $_.Exception.Message) }

  return @($errors)
}

$result = [ordered]@{
  schema = "deliveryos.tata-reader-continuous-cutover-result.v1"
  authorization_id = $AuthorizationId
  status = "STARTED"
  started_at = (Get-Date).ToString("o")
  original = $null
  candidate = $null
  post_start = $null
  rollback = [ordered]@{ attempted=$false; complete=$false; errors=@() }
  effects = [ordered]@{
    service_binpath_change = $false
    service_start_mode_change = $false
    service_start = $false
    service_stop = $false
    local_candidate_copy = $false
    database_write = $false
    print = $false
    spooler_write = $false
    odhen_write = $false
    fiscal_action = $false
    sefaz_call = $false
  }
  error = $null
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) {
  throw "AUTHORIZATION_ID_MISMATCH"
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "NOT_ELEVATED"
}

if (-not (Test-Path -LiteralPath $ReaderSource -PathType Leaf)) { throw "READER_SOURCE_MISSING" }
if (-not (Test-Path -LiteralPath $EntrypointSource -PathType Leaf)) { throw "ENTRYPOINT_SOURCE_MISSING" }
if (-not (Test-Path -LiteralPath $OriginalPreflight -PathType Leaf)) { throw "ORIGINAL_PREFLIGHT_MISSING" }

$readerSha = Get-Sha256 $ReaderSource
$entrySha = Get-Sha256 $EntrypointSource
if ($readerSha -ne $ExpectedReaderSha256.ToUpperInvariant()) { throw "READER_SOURCE_HASH_MISMATCH" }
if ($entrySha -ne $ExpectedEntrypointSha256.ToUpperInvariant()) { throw "ENTRYPOINT_SOURCE_HASH_MISMATCH" }

New-Item -ItemType Directory -Force -Path $RollbackDir | Out-Null
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null

$svc = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if ($null -eq $svc) { throw "SERVICE_NOT_FOUND" }
if (-not [string]::Equals([string]$svc.StartName,$ExpectedPrincipal,[StringComparison]::OrdinalIgnoreCase)) {
  throw ("SERVICE_IDENTITY_MISMATCH:" + [string]$svc.StartName)
}
if ([string]$svc.State -ne "Stopped") { throw ("SERVICE_NOT_STOPPED:" + [string]$svc.State) }

$manifest = [ordered]@{
  schema = "deliveryos.tata-reader-continuous-cutover-rollback-manifest.v1"
  captured_at = (Get-Date).ToString("o")
  service_name = $ServiceName
  original = [ordered]@{
    path_name = [string]$svc.PathName
    start_mode = [string]$svc.StartMode
    start_name = [string]$svc.StartName
    preflight_path = $OriginalPreflight
    preflight_sha256 = Get-Sha256 $OriginalPreflight
  }
  candidate = [ordered]@{
    reader_source = $ReaderSource
    reader_sha256 = $readerSha
    entrypoint_source = $EntrypointSource
    entrypoint_sha256 = $entrySha
  }
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
$result.original = $manifest.original
$result.candidate = $manifest.candidate

try {
  Copy-Item -LiteralPath $ReaderSource -Destination $ReaderDest -Force
  Copy-Item -LiteralPath $EntrypointSource -Destination $EntrypointDest -Force
  $result.effects.local_candidate_copy = $true

  if ((Get-Sha256 $ReaderDest) -ne $readerSha) { throw "READER_DEST_HASH_MISMATCH" }
  if ((Get-Sha256 $EntrypointDest) -ne $entrySha) { throw "ENTRYPOINT_DEST_HASH_MISMATCH" }

  $newBinPath =
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " +
    (Quote $EntrypointDest)

  Set-ServiceBinPath $newBinPath
  $result.effects.service_binpath_change = $true

  & sc.exe config $ServiceName start= demand | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "SERVICE_STARTMODE_CONFIG_FAILED" }
  $result.effects.service_start_mode_change = $true

  Start-Service -Name $ServiceName
  $result.effects.service_start = $true

  Start-Sleep -Seconds 3
  $post = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
  if ($null -eq $post) { throw "SERVICE_DISAPPEARED_AFTER_START" }
  if (-not [string]::Equals([string]$post.StartName,$ExpectedPrincipal,[StringComparison]::OrdinalIgnoreCase)) {
    throw "SERVICE_IDENTITY_CHANGED_AFTER_START"
  }
  if ([string]$post.State -ne "Running") {
    throw ("SERVICE_NOT_RUNNING_AFTER_START:" + [string]$post.State)
  }

  $checkpoint = Join-Path $StateDir "reader-watch-checkpoint-v1.json"
  for ($i=0; $i -lt 20; $i++) {
    if (Test-Path -LiteralPath $checkpoint -PathType Leaf) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not (Test-Path -LiteralPath $checkpoint -PathType Leaf)) {
    throw "CHECKPOINT_NOT_OBSERVED_AFTER_START"
  }

  $result.post_start = [ordered]@{
    service_state = [string]$post.State
    service_start_name = [string]$post.StartName
    service_path_name = [string]$post.PathName
    checkpoint_present = $true
    checkpoint_sha256 = Get-Sha256 $checkpoint
  }
  $result.status = "CUTOVER_STARTED_OBSERVED_NO_PHYSICAL_EFFECTS_ENABLED"
}
catch {
  $result.error = [string]$_.Exception.Message
  $result.rollback.attempted = $true
  $rollbackErrors = Restore-Original $manifest
  $result.rollback.errors = @($rollbackErrors)
  $result.rollback.complete = ($rollbackErrors.Count -eq 0)
  $result.status = if ($result.rollback.complete) { "CUTOVER_FAILED_ROLLBACK_COMPLETE" } else { "CUTOVER_FAILED_ROLLBACK_INCOMPLETE" }
}
finally {
  $result.completed_at = (Get-Date).ToString("o")
  $result | ConvertTo-Json -Depth 12
}

if ($result.status -eq "CUTOVER_FAILED_ROLLBACK_INCOMPLETE") { exit 9 }
if ($result.status -eq "CUTOVER_FAILED_ROLLBACK_COMPLETE") { exit 7 }
if ($result.status -ne "CUTOVER_STARTED_OBSERVED_NO_PHYSICAL_EFFECTS_ENABLED") { exit 6 }
exit 0

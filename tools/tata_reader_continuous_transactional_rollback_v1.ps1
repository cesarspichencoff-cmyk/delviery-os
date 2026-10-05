param(
  [Parameter(Mandatory=$true)]
  [string]$AuthorizationId,

  [string]$InstallRoot = "C:\ProgramData\TataComandaReader",
  [string]$ServiceName = "TataComandaReader"
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-05-CONTINUOUS-READER-ROLLBACK-V1"
$StateDir = Join-Path $InstallRoot "state"
$RollbackDir = Join-Path $StateDir "cutover-rollback-v1"
$ManifestPath = Join-Path $RollbackDir "manifest.json"
$ReaderDest = Join-Path (Join-Path $InstallRoot "bin") "tata_reader_continuous_watch_candidate_v1.ps1"
$EntrypointDest = Join-Path (Join-Path $InstallRoot "bin") "tata_reader_continuous_service_entrypoint_v1.ps1"

function StartMode-To-Sc([string]$Mode) {
  switch ($Mode) {
    "Auto" { return "auto" }
    "Automatic" { return "auto" }
    "Manual" { return "demand" }
    "Disabled" { return "disabled" }
    default { return "demand" }
  }
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) { throw "AUTHORIZATION_ID_MISMATCH" }
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw "ROLLBACK_MANIFEST_MISSING" }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "NOT_ELEVATED" }

$m = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($m.schema -ne "deliveryos.tata-reader-continuous-cutover-rollback-manifest.v1") {
  throw "ROLLBACK_MANIFEST_SCHEMA_MISMATCH"
}

$errors = @()

try {
  $s = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($s -and $s.Status -ne "Stopped") {
    Stop-Service -Name $ServiceName -Force -ErrorAction Stop
  }
} catch { $errors += ("STOP:" + $_.Exception.Message) }

try {
  & sc.exe config $ServiceName binPath= ([string]$m.original.path_name) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "BINPATH_RESTORE_FAILED" }
} catch { $errors += ("BINPATH:" + $_.Exception.Message) }

try {
  $mode = StartMode-To-Sc ([string]$m.original.start_mode)
  & sc.exe config $ServiceName start= $mode | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "STARTMODE_RESTORE_FAILED" }
} catch { $errors += ("STARTMODE:" + $_.Exception.Message) }

try {
  if (Test-Path -LiteralPath $ReaderDest) { Remove-Item -LiteralPath $ReaderDest -Force }
  if (Test-Path -LiteralPath $EntrypointDest) { Remove-Item -LiteralPath $EntrypointDest -Force }
} catch { $errors += ("FILES:" + $_.Exception.Message) }

$svc = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
$restored =
  ($errors.Count -eq 0) -and
  ([string]$svc.State -eq "Stopped") -and
  ([string]$svc.PathName -eq [string]$m.original.path_name) -and
  ([string]$svc.StartName -eq [string]$m.original.start_name)

[ordered]@{
  schema = "deliveryos.tata-reader-continuous-rollback-result.v1"
  status = if ($restored) { "ROLLBACK_COMPLETE" } else { "ROLLBACK_INCOMPLETE" }
  completed_at = (Get-Date).ToString("o")
  restored = $restored
  service = [ordered]@{
    state = [string]$svc.State
    path_name = [string]$svc.PathName
    start_mode = [string]$svc.StartMode
    start_name = [string]$svc.StartName
  }
  expected = $m.original
  errors = @($errors)
  effects = [ordered]@{
    service_stop = $true
    service_binpath_restore = $true
    service_start_mode_restore = $true
    candidate_files_remove = $true
    database_write = $false
    print = $false
    spooler_write = $false
    odhen_write = $false
    fiscal_action = $false
    sefaz_call = $false
  }
} | ConvertTo-Json -Depth 10

if (-not $restored) { exit 8 }
exit 0

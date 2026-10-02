param(
  [Parameter(Mandatory = $true)]
  [string]$BinarySource,
  [Parameter(Mandatory = $true)]
  [string]$PreflightSource
)

$ErrorActionPreference = "Stop"

# REVIEW ONLY / NOT AUTHORIZED.
# This guard intentionally prevents every administrative/file-system effect.
throw "REVIEW_ONLY_NOT_AUTHORIZED:TataComandaReader runtime/service installation"

# The code below is unreachable in this review artifact.
# After César explicitly authorizes the administrative change, generate a fresh
# executable script rather than editing/removing this guard in place.

$ServiceName = "TataComandaReader"
$ServicePrincipal = "NT SERVICE\$ServiceName"
$SqlDependency = 'MSSQL$SQLEXPRESS'
$InstallRoot = "C:\ProgramData\TataComandaReader"
$BinDirectory = Join-Path $InstallRoot "bin"
$EvidenceDirectory = Join-Path $InstallRoot "evidence"
$InstalledBinary = Join-Path $BinDirectory "TataComandaReader.PreflightService.exe"
$InstalledPreflight = Join-Path $BinDirectory "tata_reader_least_privilege_preflight.ps1"

if (-not (Test-Path -LiteralPath $BinarySource -PathType Leaf)) {
  throw "READER_BINARY_SOURCE_NOT_FOUND"
}
if (-not (Test-Path -LiteralPath $PreflightSource -PathType Leaf)) {
  throw "PREFLIGHT_SCRIPT_SOURCE_NOT_FOUND"
}
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  throw "TATA_READER_SERVICE_ALREADY_EXISTS_RECONCILIATION_REQUIRED"
}
if (Test-Path -LiteralPath $InstallRoot) {
  throw "TATA_READER_INSTALL_ROOT_ALREADY_EXISTS_RECONCILIATION_REQUIRED"
}

New-Item -ItemType Directory -Path $BinDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
Copy-Item -LiteralPath $BinarySource -Destination $InstalledBinary
Copy-Item -LiteralPath $PreflightSource -Destination $InstalledPreflight

$quotedBinary = [char]34 + $InstalledBinary + [char]34
& sc.exe create $ServiceName binPath= $quotedBinary start= demand obj= $ServicePrincipal
if ($LASTEXITCODE -ne 0) { throw "SERVICE_CREATE_FAILED" }

& sc.exe config $ServiceName depend= $SqlDependency
if ($LASTEXITCODE -ne 0) { throw "SERVICE_SQL_DEPENDENCY_FAILED" }

# Grant only the runtime rights needed by the virtual service account.
& icacls.exe $BinDirectory /grant:r ($ServicePrincipal + ":(OI)(CI)RX")
if ($LASTEXITCODE -ne 0) { throw "BIN_ACL_FAILED" }

& icacls.exe $EvidenceDirectory /grant:r ($ServicePrincipal + ":(OI)(CI)M")
if ($LASTEXITCODE -ne 0) { throw "EVIDENCE_ACL_FAILED" }

# Intentionally start=demand and NOT started here.
# SQL login/user/grants and review must happen before the one-shot preflight start.
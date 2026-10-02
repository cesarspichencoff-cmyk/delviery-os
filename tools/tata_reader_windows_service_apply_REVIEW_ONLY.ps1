param(
  [Parameter(Mandatory = $true)]
  [string]$BinaryPath
)

$ErrorActionPreference = "Stop"

# REVIEW ONLY / NOT AUTHORIZED.
# This guard intentionally prevents any service change.
throw "REVIEW_ONLY_NOT_AUTHORIZED:TataComandaReader service creation"

# The code below is unreachable in this review artifact.
# After César explicitly authorizes the administrative change, generate a fresh
# executable script rather than editing/removing this guard in place.

$ServiceName = "TataComandaReader"
$ServicePrincipal = "NT SERVICE\$ServiceName"
$SqlDependency = "MSSQL$SQLEXPRESS"

if (-not (Test-Path -LiteralPath $BinaryPath -PathType Leaf)) {
  throw "READER_BINARY_NOT_FOUND"
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  throw "TATA_READER_SERVICE_ALREADY_EXISTS_RECONCILIATION_REQUIRED"
}

$quotedBinary = [char]34 + $BinaryPath + [char]34

& sc.exe create $ServiceName binPath= $quotedBinary start= auto obj= $ServicePrincipal password= ""
if ($LASTEXITCODE -ne 0) { throw "SERVICE_CREATE_FAILED" }

& sc.exe sidtype $ServiceName unrestricted
if ($LASTEXITCODE -ne 0) { throw "SERVICE_SIDTYPE_FAILED" }

& sc.exe config $ServiceName depend= $SqlDependency
if ($LASTEXITCODE -ne 0) { throw "SERVICE_SQL_DEPENDENCY_FAILED" }

# Intentionally not started here.
# Starting the service is a later gate after SQL grants and the least-privilege
# preflight have both been reviewed and authorized.
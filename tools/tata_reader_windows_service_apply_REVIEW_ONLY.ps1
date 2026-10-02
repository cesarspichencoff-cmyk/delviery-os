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

# Literal SHA-256 pins from the no-effect CAIXA_MOOCA build on 2026-10-02.
# A production-ready installer must never accept these expected hashes as caller-supplied parameters.
$ExpectedBinarySha256 = "241073DA0AE678933E2EF88AF2DA2091F1DF4A578E1D78AD2B48839D4465BA6C"
$ExpectedPreflightSha256 = "FFCFB49577280A596EA951C839C881528D187A33F0B5D19DE08D2A86D1FEFFC6"

function Assert-PinnedHash {
  param(
    [string]$Path,
    [string]$Expected,
    [string]$Label
  )

  if ($Expected -like "__PIN_*") {
    throw ($Label + "_HASH_NOT_PINNED")
  }

  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if (-not [string]::Equals($actual, $Expected, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw ($Label + "_HASH_MISMATCH:" + $actual)
  }
}

function Assert-ClosedAcl {
  param(
    [string]$Path,
    [string[]]$AllowedSidValues
  )

  $acl = Get-Acl -LiteralPath $Path
  if (-not $acl.AreAccessRulesProtected) {
    throw ("ACL_INHERITANCE_STILL_ENABLED:" + $Path)
  }

  $rules = $acl.GetAccessRules($true, $false, [System.Security.Principal.SecurityIdentifier])
  foreach ($rule in $rules) {
    $sid = $rule.IdentityReference.Value
    if ($sid -notin $AllowedSidValues) {
      throw ("UNEXPECTED_ACL_PRINCIPAL:" + $Path + ":" + $sid)
    }
  }
}

if (-not (Test-Path -LiteralPath $BinarySource -PathType Leaf)) { throw "READER_BINARY_SOURCE_NOT_FOUND" }
if (-not (Test-Path -LiteralPath $PreflightSource -PathType Leaf)) { throw "PREFLIGHT_SCRIPT_SOURCE_NOT_FOUND" }
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) { throw "TATA_READER_SERVICE_ALREADY_EXISTS_RECONCILIATION_REQUIRED" }
if (Test-Path -LiteralPath $InstallRoot) { throw "TATA_READER_INSTALL_ROOT_ALREADY_EXISTS_RECONCILIATION_REQUIRED" }

Assert-PinnedHash -Path $BinarySource -Expected $ExpectedBinarySha256 -Label "BINARY"
Assert-PinnedHash -Path $PreflightSource -Expected $ExpectedPreflightSha256 -Label "PREFLIGHT"

$serviceCreated = $false
try {
  New-Item -ItemType Directory -Path $BinDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
  Copy-Item -LiteralPath $BinarySource -Destination $InstalledBinary
  Copy-Item -LiteralPath $PreflightSource -Destination $InstalledPreflight

  Assert-PinnedHash -Path $InstalledBinary -Expected $ExpectedBinarySha256 -Label "INSTALLED_BINARY"
  Assert-PinnedHash -Path $InstalledPreflight -Expected $ExpectedPreflightSha256 -Label "INSTALLED_PREFLIGHT"

  $quotedBinary = [char]34 + $InstalledBinary + [char]34
  & sc.exe create $ServiceName binPath= $quotedBinary start= demand obj= $ServicePrincipal
  if ($LASTEXITCODE -ne 0) { throw "SERVICE_CREATE_FAILED" }
  $serviceCreated = $true

  & sc.exe config $ServiceName depend= $SqlDependency
  if ($LASTEXITCODE -ne 0) { throw "SERVICE_SQL_DEPENDENCY_FAILED" }

  $serviceMetadata = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $ServiceName.Replace("'", "''") + "'")
  if (-not $serviceMetadata) { throw "SERVICE_METADATA_NOT_FOUND" }
  if (-not [string]::Equals($serviceMetadata.StartName, $ServicePrincipal, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("SERVICE_ACCOUNT_MISMATCH:" + $serviceMetadata.StartName)
  }
  if (-not [string]::Equals($serviceMetadata.StartMode, "Manual", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("SERVICE_START_MODE_MISMATCH:" + $serviceMetadata.StartMode)
  }
  if (-not [string]::Equals($serviceMetadata.PathName.Trim('"'), $InstalledBinary, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("SERVICE_BINARY_PATH_MISMATCH:" + $serviceMetadata.PathName)
  }

  $serviceObject = Get-Service -Name $ServiceName
  $dependencyNames = @($serviceObject.ServicesDependedOn | ForEach-Object { $_.Name })
  if ($dependencyNames -notcontains $SqlDependency) {
    throw ("SERVICE_SQL_DEPENDENCY_MISMATCH:" + ($dependencyNames -join ","))
  }

  $serviceSid = (New-Object System.Security.Principal.NTAccount($ServicePrincipal)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  if ([string]::IsNullOrWhiteSpace($serviceSid)) { throw "SERVICE_SID_RESOLUTION_FAILED" }

  $systemSid = "S-1-5-18"
  $administratorsSid = "S-1-5-32-544"
  $allowedSids = @($systemSid, $administratorsSid, $serviceSid)

  foreach ($directory in @($InstallRoot, $BinDirectory, $EvidenceDirectory)) {
    & icacls.exe $directory /inheritance:r | Out-Null
    if ($LASTEXITCODE -ne 0) { throw ("ACL_INHERITANCE_DISABLE_FAILED:" + $directory) }
  }

  & icacls.exe $InstallRoot /grant:r ("*" + $systemSid + ":(OI)(CI)F") ("*" + $administratorsSid + ":(OI)(CI)F") ("*" + $serviceSid + ":(RX)") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "ROOT_ACL_FAILED" }

  & icacls.exe $BinDirectory /grant:r ("*" + $systemSid + ":(OI)(CI)F") ("*" + $administratorsSid + ":(OI)(CI)F") ("*" + $serviceSid + ":(OI)(CI)RX") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "BIN_ACL_FAILED" }

  & icacls.exe $EvidenceDirectory /grant:r ("*" + $systemSid + ":(OI)(CI)F") ("*" + $administratorsSid + ":(OI)(CI)F") ("*" + $serviceSid + ":(OI)(CI)M") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "EVIDENCE_ACL_FAILED" }

  Assert-ClosedAcl -Path $InstallRoot -AllowedSidValues $allowedSids
  Assert-ClosedAcl -Path $BinDirectory -AllowedSidValues $allowedSids
  Assert-ClosedAcl -Path $EvidenceDirectory -AllowedSidValues $allowedSids
}
catch {
  if ($serviceCreated) {
    & sc.exe delete $ServiceName | Out-Null
  }
  if (Test-Path -LiteralPath $InstallRoot) {
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  throw
}

# Intentionally start=demand and NOT started here.
# SQL login/user/grants and review must happen before the one-shot preflight start.
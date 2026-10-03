param(
  [Parameter(Mandatory = $true)]
  [string]$AuthorizationId
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-02-TATA-READER-ADMIN-V1"
$ExpectedBinarySha256 = "241073DA0AE678933E2EF88AF2DA2091F1DF4A578E1D78AD2B48839D4465BA6C"
$ExpectedPreflightSha256 = "FFCFB49577280A596EA951C839C881528D187A33F0B5D19DE08D2A86D1FEFFC6"

$ServiceName = "TataComandaReader"
$ServicePrincipal = "NT SERVICE\TataComandaReader"
$SqlDependency = 'MSSQL$SQLEXPRESS'
$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"
$Schema = "TEKNISA"

$BinarySource = "C:\TATA\comanda-v1\saida\fase3\TataComandaReader.PreflightService.exe"
$InstallRoot = "C:\ProgramData\TataComandaReader"
$BinDirectory = Join-Path $InstallRoot "bin"
$EvidenceDirectory = Join-Path $InstallRoot "evidence"
$InstalledBinary = Join-Path $BinDirectory "TataComandaReader.PreflightService.exe"
$InstalledPreflight = Join-Path $BinDirectory "tata_reader_least_privilege_preflight.ps1"

$ResultDirectory = "C:\TATA\comanda-v1\saida\fase3"
$ResultPath = Join-Path $ResultDirectory "TATA_READER_ADMIN_PHASE_RESULT.json"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$PreflightSource = Join-Path $RepoRoot "tools\tata_reader_least_privilege_preflight.ps1"
$AuthorizationFile = Join-Path $RepoRoot "data\tata_reader_admin_authorization_v1.json"
$RetryAuthorizationFile = Join-Path $RepoRoot "data\tata_reader_admin_retry_authorization_v2.json"
$BundleVerifier = Join-Path $RepoRoot "tools\verificar_tata_reader_admin_bundle_static_v1.ps1"

$allowed = [ordered]@{
  COMANDAVEN = @(
    "CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA","NRCOMANDAEXT",
    "IDORGCMDVENDA","IDSTCOMANDA","DSOBSCOMANDA"
  )
  ITCOMANDAVEN = @(
    "CDFILIAL","NRVENDAREST","NRCOMANDA","NRPRODCOMVEN","CDPRODUTO",
    "QTPRODCOMVEN","IDSTPRCOMVEN","DSOBSDESCIT","DSOBSPEDDIGCMD",
    "TXPRODCOMVEN"
  )
  PRODUTO = @("CDPRODUTO","NMPRODUTO")
  VENDAREST = @("CDFILIAL","NRVENDAREST","DTHRABERMESA")
}

function Assert-Administrator {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "ADMINISTRATOR_REQUIRED"
  }
}

function Assert-Hash {
  param([string]$Path,[string]$Expected,[string]$Label)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw ($Label + "_NOT_FOUND:" + $Path)
  }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if (-not [string]::Equals($actual,$Expected,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ($Label + "_HASH_MISMATCH:" + $actual)
  }
}

function New-SqlConnection {
  param([string]$DatabaseName)
  $cs =
    "Server=$SqlServer;Database=$DatabaseName;Integrated Security=SSPI;" +
    "Application Name=TataReaderAuthorizedAdminV1;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  return New-Object System.Data.SqlClient.SqlConnection $cs
}

function Assert-PreEffectSqlMetadata {
  $master = New-SqlConnection "master"
  try {
    $master.Open()
    $cmd = $master.CreateCommand()
    $cmd.CommandText = "SELECT IS_SRVROLEMEMBER('sysadmin')"
    if ([int]$cmd.ExecuteScalar() -ne 1) {
      throw "CURRENT_PRINCIPAL_NOT_SYSADMIN_FOR_AUTHORIZED_ADMIN_CHANGE"
    }
    $cmd = $master.CreateCommand()
    $cmd.CommandText = "SELECT COUNT_BIG(*) FROM sys.server_principals WHERE name=N'NT SERVICE\TataComandaReader'"
    if ([int64]$cmd.ExecuteScalar() -ne 0) {
      throw "TARGET_SQL_LOGIN_ALREADY_EXISTS"
    }
  }
  finally {
    if ($master.State -ne [System.Data.ConnectionState]::Closed) { $master.Close() }
  }

  $db = New-SqlConnection $Database
  try {
    $db.Open()
    $cmd = $db.CreateCommand()
    $cmd.CommandText = "SELECT COUNT_BIG(*) FROM sys.database_principals WHERE name=N'NT SERVICE\TataComandaReader'"
    if ([int64]$cmd.ExecuteScalar() -ne 0) {
      throw "TARGET_DATABASE_USER_ALREADY_EXISTS"
    }

    foreach ($table in $allowed.Keys) {
      $cmd = $db.CreateCommand()
      $cmd.CommandText = @"
SELECT COUNT_BIG(*)
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id=t.schema_id
WHERE s.name=@schema_name AND t.name=@table_name;
"@
      $null = $cmd.Parameters.Add("@schema_name",[System.Data.SqlDbType]::NVarChar,128)
      $null = $cmd.Parameters.Add("@table_name",[System.Data.SqlDbType]::NVarChar,128)
      $cmd.Parameters["@schema_name"].Value = $Schema
      $cmd.Parameters["@table_name"].Value = $table
      if ([int64]$cmd.ExecuteScalar() -ne 1) {
        throw ("TARGET_TABLE_NOT_UNIQUE:" + $table)
      }

      foreach ($column in $allowed[$table]) {
        $cc = $db.CreateCommand()
        $cc.CommandText = @"
SELECT COUNT_BIG(*)
FROM sys.columns c
JOIN sys.tables t ON t.object_id=c.object_id
JOIN sys.schemas s ON s.schema_id=t.schema_id
WHERE s.name=@schema_name
  AND t.name=@table_name
  AND c.name=@column_name;
"@
        $null = $cc.Parameters.Add("@schema_name",[System.Data.SqlDbType]::NVarChar,128)
        $null = $cc.Parameters.Add("@table_name",[System.Data.SqlDbType]::NVarChar,128)
        $null = $cc.Parameters.Add("@column_name",[System.Data.SqlDbType]::NVarChar,128)
        $cc.Parameters["@schema_name"].Value = $Schema
        $cc.Parameters["@table_name"].Value = $table
        $cc.Parameters["@column_name"].Value = $column
        if ([int64]$cc.ExecuteScalar() -ne 1) {
          throw ("TARGET_COLUMN_MISSING:" + $table + "." + $column)
        }
      }
    }
  }
  finally {
    if ($db.State -ne [System.Data.ConnectionState]::Closed) { $db.Close() }
  }
}

function Assert-ClosedAcl {
  param([string]$Path,[string[]]$AllowedSidValues)
  $acl = Get-Acl -LiteralPath $Path
  if (-not $acl.AreAccessRulesProtected) {
    throw ("ACL_INHERITANCE_STILL_ENABLED:" + $Path)
  }
  $rules = $acl.GetAccessRules($true,$false,[System.Security.Principal.SecurityIdentifier])
  foreach ($rule in $rules) {
    $sid = $rule.IdentityReference.Value
    if ($sid -notin $AllowedSidValues) {
      throw ("UNEXPECTED_ACL_PRINCIPAL:" + $Path + ":" + $sid)
    }
  }
}

function Install-ReaderService {
  if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    throw "TARGET_SERVICE_ALREADY_EXISTS"
  }
  if (Test-Path -LiteralPath $InstallRoot) {
    throw "TARGET_INSTALL_ROOT_ALREADY_EXISTS"
  }

  New-Item -ItemType Directory -Path $BinDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
  Copy-Item -LiteralPath $BinarySource -Destination $InstalledBinary
  Copy-Item -LiteralPath $PreflightSource -Destination $InstalledPreflight

  Assert-Hash $InstalledBinary $ExpectedBinarySha256 "INSTALLED_BINARY"
  Assert-Hash $InstalledPreflight $ExpectedPreflightSha256 "INSTALLED_PREFLIGHT"

  $quotedBinary = [char]34 + $InstalledBinary + [char]34
  & sc.exe create $ServiceName binPath= $quotedBinary start= demand obj= $ServicePrincipal | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "SERVICE_CREATE_FAILED" }

  & sc.exe config $ServiceName depend= $SqlDependency | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "SERVICE_DEPENDENCY_CONFIG_FAILED" }

  $metadata = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $ServiceName.Replace("'","''") + "'")
  if (-not $metadata) { throw "SERVICE_METADATA_NOT_FOUND" }
  if (-not [string]::Equals($metadata.StartName,$ServicePrincipal,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("SERVICE_ACCOUNT_MISMATCH:" + $metadata.StartName)
  }
  if (-not [string]::Equals($metadata.StartMode,"Manual",[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("SERVICE_START_MODE_MISMATCH:" + $metadata.StartMode)
  }
  if (-not [string]::Equals($metadata.PathName.Trim('"'),$InstalledBinary,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("SERVICE_BINARY_PATH_MISMATCH:" + $metadata.PathName)
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
  $allowedSids = @($systemSid,$administratorsSid,$serviceSid)

  # ACL_ORDER_V2: establish explicit recovery-safe access on each directory
  # before removing inheritance. This prevents the 2026-10-03 lockout class.
  & icacls.exe $InstallRoot /grant:r ("*" + $systemSid + ":(OI)(CI)F") ("*" + $administratorsSid + ":(OI)(CI)F") ("*" + $serviceSid + ":(RX)") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "ROOT_ACL_GRANT_FAILED" }
  & icacls.exe $InstallRoot /inheritance:r | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "ROOT_ACL_INHERITANCE_DISABLE_FAILED" }

  & icacls.exe $BinDirectory /grant:r ("*" + $systemSid + ":(OI)(CI)F") ("*" + $administratorsSid + ":(OI)(CI)F") ("*" + $serviceSid + ":(OI)(CI)RX") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "BIN_ACL_GRANT_FAILED" }
  & icacls.exe $BinDirectory /inheritance:r | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "BIN_ACL_INHERITANCE_DISABLE_FAILED" }

  & icacls.exe $EvidenceDirectory /grant:r ("*" + $systemSid + ":(OI)(CI)F") ("*" + $administratorsSid + ":(OI)(CI)F") ("*" + $serviceSid + ":(OI)(CI)M") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "EVIDENCE_ACL_GRANT_FAILED" }
  & icacls.exe $EvidenceDirectory /inheritance:r | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "EVIDENCE_ACL_INHERITANCE_DISABLE_FAILED" }

  Assert-ClosedAcl $InstallRoot $allowedSids
  Assert-ClosedAcl $BinDirectory $allowedSids
  Assert-ClosedAcl $EvidenceDirectory $allowedSids
}

function Apply-SqlPermissions {
  $master = New-SqlConnection "master"
  try {
    $master.Open()
    $cmd = $master.CreateCommand()
    $cmd.CommandTimeout = 10
    $cmd.CommandText = "CREATE LOGIN [NT SERVICE\TataComandaReader] FROM WINDOWS;"
    $null = $cmd.ExecuteNonQuery()
  }
  finally {
    if ($master.State -ne [System.Data.ConnectionState]::Closed) { $master.Close() }
  }

  $db = New-SqlConnection $Database
  try {
    $db.Open()
    $cmd = $db.CreateCommand()
    $cmd.CommandTimeout = 20
    $cmd.CommandText = @"
CREATE USER [NT SERVICE\TataComandaReader]
  FOR LOGIN [NT SERVICE\TataComandaReader];

GRANT SELECT ([CDFILIAL],[CDLOJA],[NRVENDAREST],[NRCOMANDA],[NRCOMANDAEXT],[IDORGCMDVENDA],[IDSTCOMANDA],[DSOBSCOMANDA])
ON OBJECT::[TEKNISA].[COMANDAVEN]
TO [NT SERVICE\TataComandaReader];

GRANT SELECT ([CDFILIAL],[NRVENDAREST],[NRCOMANDA],[NRPRODCOMVEN],[CDPRODUTO],[QTPRODCOMVEN],[IDSTPRCOMVEN],[DSOBSDESCIT],[DSOBSPEDDIGCMD],[TXPRODCOMVEN])
ON OBJECT::[TEKNISA].[ITCOMANDAVEN]
TO [NT SERVICE\TataComandaReader];

GRANT SELECT ([CDPRODUTO],[NMPRODUTO])
ON OBJECT::[TEKNISA].[PRODUTO]
TO [NT SERVICE\TataComandaReader];

GRANT SELECT ([CDFILIAL],[NRVENDAREST],[DTHRABERMESA])
ON OBJECT::[TEKNISA].[VENDAREST]
TO [NT SERVICE\TataComandaReader];
"@
    $null = $cmd.ExecuteNonQuery()
  }
  finally {
    if ($db.State -ne [System.Data.ConnectionState]::Closed) { $db.Close() }
  }
}

function Remove-ServiceIfPresent {
  $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $service) { return }

  if ($service.Status -ne "Stopped") {
    try { Stop-Service -Name $ServiceName -Force -ErrorAction Stop } catch { }
  }

  & sc.exe delete $ServiceName | Out-Null

  for ($i=0; $i -lt 30; $i++) {
    if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 500
  }
}

function Rollback-SqlIfPresent {
  $errors = @()

  try {
    $db = New-SqlConnection $Database
    try {
      $db.Open()
      $cmd = $db.CreateCommand()
      $cmd.CommandText = "IF USER_ID(N'NT SERVICE\TataComandaReader') IS NOT NULL DROP USER [NT SERVICE\TataComandaReader];"
      $null = $cmd.ExecuteNonQuery()
    }
    finally {
      if ($db.State -ne [System.Data.ConnectionState]::Closed) { $db.Close() }
    }
  }
  catch { $errors += ("DROP_USER:" + $_.Exception.Message) }

  try {
    $master = New-SqlConnection "master"
    try {
      $master.Open()
      $cmd = $master.CreateCommand()
      $cmd.CommandText = "IF SUSER_ID(N'NT SERVICE\TataComandaReader') IS NOT NULL DROP LOGIN [NT SERVICE\TataComandaReader];"
      $null = $cmd.ExecuteNonQuery()
    }
    finally {
      if ($master.State -ne [System.Data.ConnectionState]::Closed) { $master.Close() }
    }
  }
  catch { $errors += ("DROP_LOGIN:" + $_.Exception.Message) }

  return @($errors)
}

function Remove-RuntimeIfPresent {
  if (-not (Test-Path -LiteralPath $InstallRoot)) { return }

  try {
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction Stop
    return
  }
  catch {
  }

  $systemSid = "S-1-5-18"
  $administratorsSid = "S-1-5-32-544"

  & takeown.exe /F $InstallRoot /A /R /D Y | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "RUNTIME_TAKEOWN_FAILED" }

  & icacls.exe $InstallRoot /grant:r ("*" + $administratorsSid + ":(OI)(CI)F") ("*" + $systemSid + ":(OI)(CI)F") /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "RUNTIME_ACL_RECOVERY_FAILED" }

  Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction Stop
  if (Test-Path -LiteralPath $InstallRoot) { throw "RUNTIME_DELETE_NOT_CONFIRMED" }
}

function Invoke-Rollback {
  $errors = @()

  try { Remove-ServiceIfPresent }
  catch { $errors += ("SERVICE:" + $_.Exception.Message) }

  $errors += @(Rollback-SqlIfPresent)

  try { Remove-RuntimeIfPresent }
  catch { $errors += ("RUNTIME:" + $_.Exception.Message) }

  return @($errors)
}

function Wait-ForPreflightEvidence {
  $exitPath = Join-Path $EvidenceDirectory "preflight.exitcode.txt"
  $jsonPath = Join-Path $EvidenceDirectory "preflight.json"
  $identityPath = Join-Path $EvidenceDirectory "preflight.identity.txt"

  # The host gives the inner preflight up to 60s. Allow 180s here so service
  # startup, file flush and shutdown cannot race the outer rollback timer.
  for ($i=0; $i -lt 360; $i++) {
    if ((Test-Path -LiteralPath $exitPath) -and (Test-Path -LiteralPath $jsonPath) -and (Test-Path -LiteralPath $identityPath)) { break }
    Start-Sleep -Milliseconds 500
  }

  if (-not (Test-Path -LiteralPath $exitPath)) { throw "PREFLIGHT_EXITCODE_NOT_PRODUCED" }
  if (-not (Test-Path -LiteralPath $jsonPath)) { throw "PREFLIGHT_JSON_NOT_PRODUCED" }
  if (-not (Test-Path -LiteralPath $identityPath)) { throw "PREFLIGHT_IDENTITY_NOT_PRODUCED" }

  $exitCode = [int](Get-Content -LiteralPath $exitPath -Raw)
  $preflight = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
  $identityText = Get-Content -LiteralPath $identityPath -Raw

  if ($exitCode -ne 0) { throw ("PREFLIGHT_EXIT_CODE:" + $exitCode) }
  if (-not [bool]$preflight.safe_for_minimized_order_read) { throw ("PREFLIGHT_NOT_SAFE:" + [string]$preflight.blocker) }
  if ($preflight.current_login -ne $ServicePrincipal) { throw ("PREFLIGHT_LOGIN_MISMATCH:" + [string]$preflight.current_login) }
  if (-not $identityText.Contains("name=" + $ServicePrincipal)) { throw "PREFLIGHT_WINDOWS_IDENTITY_MISMATCH" }

  for ($i=0; $i -lt 30; $i++) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Stopped") { return $preflight }
    Start-Sleep -Milliseconds 500
  }

  throw "PREFLIGHT_SERVICE_DID_NOT_STOP"
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) { throw "AUTHORIZATION_ID_MISMATCH" }
if (-not (Test-Path -LiteralPath $AuthorizationFile -PathType Leaf)) { throw "AUTHORIZATION_FILE_MISSING" }

$authorization = Get-Content -LiteralPath $AuthorizationFile -Raw | ConvertFrom-Json
if (-not [bool]$authorization.human_authorized) { throw "HUMAN_AUTHORIZATION_NOT_PRESENT" }
if ($authorization.authorization_id -ne $ExpectedAuthorizationId) { throw "AUTHORIZATION_FILE_ID_MISMATCH" }

# The first authorized attempt failed with FAILED_ROLLBACK_INCOMPLETE on 2026-10-03.
# A fresh, explicit human retry authorization is required before any new admin effect.
if (-not (Test-Path -LiteralPath $RetryAuthorizationFile -PathType Leaf)) {
  throw "RETRY_NOT_AUTHORIZED_AFTER_INCIDENT"
}
$retryAuthorization = Get-Content -LiteralPath $RetryAuthorizationFile -Raw | ConvertFrom-Json
if (-not [bool]$retryAuthorization.human_retry_authorized) { throw "HUMAN_RETRY_AUTHORIZATION_NOT_PRESENT" }
if ($retryAuthorization.authorization_id -ne $ExpectedAuthorizationId) { throw "RETRY_AUTHORIZATION_ID_MISMATCH" }
if ($retryAuthorization.incident_head -ne "9e3f8f4248ba054161dad564931b30c02d73851a") { throw "RETRY_AUTHORIZATION_INCIDENT_MISMATCH" }

Assert-Administrator
Assert-Hash $BinarySource $ExpectedBinarySha256 "BINARY_SOURCE"
Assert-Hash $PreflightSource $ExpectedPreflightSha256 "PREFLIGHT_SOURCE"

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) { throw "PREEXISTING_SERVICE_BLOCKS_AUTHORIZED_PHASE" }
if (Test-Path -LiteralPath $InstallRoot) { throw "PREEXISTING_RUNTIME_BLOCKS_AUTHORIZED_PHASE" }

& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $BundleVerifier
if ($LASTEXITCODE -ne 0) { throw ("STATIC_BUNDLE_VERIFIER_FAILED:" + $LASTEXITCODE) }

Assert-PreEffectSqlMetadata

New-Item -ItemType Directory -Path $ResultDirectory -Force | Out-Null
$startedAt = (Get-Date).ToString("o")

try {
  Install-ReaderService
  Apply-SqlPermissions
  Start-Service -Name $ServiceName
  $preflightResult = Wait-ForPreflightEvidence

  $result = [ordered]@{
    schema = "deliveryos.tata-reader-admin-phase-result.v1"
    authorization_id = $ExpectedAuthorizationId
    started_at = $startedAt
    completed_at = (Get-Date).ToString("o")
    status = "PROVEN_ADMIN_PHASE_PASS"
    rollback_performed = $false
    service_installed = $true
    service_start_mode = "Manual"
    sql_login_present = $true
    sql_user_present = $true
    preflight_exit_code = 0
    safe_for_minimized_order_read = [bool]$preflightResult.safe_for_minimized_order_read
    order_row_read = $false
    print = $false
    fiscal_action = $false
    cutover = $false
  }

  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ResultPath -Encoding UTF8
  $result | ConvertTo-Json -Depth 8
  exit 0
}
catch {
  $failure = $_.Exception.Message
  $rollbackErrors = @(Invoke-Rollback)

  $result = [ordered]@{
    schema = "deliveryos.tata-reader-admin-phase-result.v1"
    authorization_id = $ExpectedAuthorizationId
    started_at = $startedAt
    completed_at = (Get-Date).ToString("o")
    status = if ($rollbackErrors.Count -eq 0) { "FAILED_ROLLED_BACK" } else { "FAILED_ROLLBACK_INCOMPLETE" }
    failure = $failure
    rollback_performed = $true
    rollback_complete = ($rollbackErrors.Count -eq 0)
    rollback_errors = $rollbackErrors
    order_row_read = $false
    print = $false
    fiscal_action = $false
    cutover = $false
  }

  try { $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ResultPath -Encoding UTF8 } catch { }
  $result | ConvertTo-Json -Depth 8
  exit 4
}

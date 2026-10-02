param(
  [Parameter(Mandatory = $true)]
  [string]$AuthorizationId
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-02-TATA-READER-ADMIN-V1"
$ServiceName = "TataComandaReader"
$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"
$InstallRoot = "C:\ProgramData\TataComandaReader"

function New-SqlConnection {
  param([string]$DatabaseName)
  $cs =
    "Server=$SqlServer;Database=$DatabaseName;Integrated Security=SSPI;" +
    "Application Name=TataReaderAuthorizedRollbackV1;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  return New-Object System.Data.SqlClient.SqlConnection $cs
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) {
  throw "AUTHORIZATION_ID_MISMATCH"
}

$rollbackErrors = @()

try {
  $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($service) {
    if ($service.Status -ne "Stopped") {
      try { Stop-Service -Name $ServiceName -Force -ErrorAction Stop } catch { }
    }

    & sc.exe delete $ServiceName | Out-Null

    for ($i=0; $i -lt 30; $i++) {
      if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 500
    }

    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
      throw "SERVICE_DELETE_NOT_CONFIRMED"
    }
  }
}
catch {
  $rollbackErrors += ("SERVICE:" + $_.Exception.Message)
}

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
catch {
  $rollbackErrors += ("DROP_USER:" + $_.Exception.Message)
}

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
catch {
  $rollbackErrors += ("DROP_LOGIN:" + $_.Exception.Message)
}

try {
  if (Test-Path -LiteralPath $InstallRoot) {
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force
  }
}
catch {
  $rollbackErrors += ("RUNTIME:" + $_.Exception.Message)
}

$result = [ordered]@{
  schema = "deliveryos.tata-reader-authorized-rollback-result.v1"
  authorization_id = $ExpectedAuthorizationId
  completed_at = (Get-Date).ToString("o")
  rollback_complete = ($rollbackErrors.Count -eq 0)
  rollback_errors = $rollbackErrors
}

$result | ConvertTo-Json -Depth 6

if ($rollbackErrors.Count -gt 0) {
  exit 4
}

exit 0

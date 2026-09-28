param(
  [string]$Server = "192.168.0.24\SQLEXPRESS",
  [string]$Database = "teknisa"
)

$ErrorActionPreference = "Stop"

# PRE-FLIGHT ONLY.
# Uses Windows Integrated Authentication. No username/password is read from Odhen.
# Executes metadata/permission SELECTs only. It does not read order/customer tables.

$result = [ordered]@{
  schema = "deliveryos.shadow.sql-integrated-preflight.v1"
  mode = "WINDOWS_INTEGRATED_AUTH_METADATA_ONLY"
  server = $Server
  database = $Database
  connected = $false
  database_matches = $false
  permissions = [ordered]@{
    select = $null
    insert = $null
    update = $null
    delete = $null
    execute = $null
    alter = $null
    control = $null
  }
  safe_for_order_read = $false
  blocker = $null
}

$connectionString =
  "Server=$Server;Database=$Database;Integrated Security=SSPI;" +
  "Application Name=DeliveryOSShadowPreflight;Connect Timeout=5;" +
  "Encrypt=False;TrustServerCertificate=True"

$conn = New-Object System.Data.SqlClient.SqlConnection $connectionString

try {
  $conn.Open()
  $result.connected = $true

  $cmd = $conn.CreateCommand()
  $cmd.CommandTimeout = 5
  $cmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  CASE WHEN DB_NAME() = @expected_db THEN 1 ELSE 0 END AS database_matches,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'SELECT') AS can_select,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS can_insert,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'UPDATE') AS can_update,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'DELETE') AS can_delete,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'EXECUTE') AS can_execute,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER') AS can_alter,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') AS can_control;
"@
  $null = $cmd.Parameters.Add("@expected_db", [System.Data.SqlDbType]::NVarChar, 128)
  $cmd.Parameters["@expected_db"].Value = $Database

  $reader = $cmd.ExecuteReader()
  if (-not $reader.Read()) {
    throw "PREFLIGHT_NO_ROW"
  }

  $result.database_matches = ([int]$reader["database_matches"] -eq 1)
  $result.permissions.select = ([int]$reader["can_select"] -eq 1)
  $result.permissions.insert = ([int]$reader["can_insert"] -eq 1)
  $result.permissions.update = ([int]$reader["can_update"] -eq 1)
  $result.permissions.delete = ([int]$reader["can_delete"] -eq 1)
  $result.permissions.execute = ([int]$reader["can_execute"] -eq 1)
  $result.permissions.alter = ([int]$reader["can_alter"] -eq 1)
  $result.permissions.control = ([int]$reader["can_control"] -eq 1)
  $reader.Close()

  $hasWrite =
    $result.permissions.insert -or
    $result.permissions.update -or
    $result.permissions.delete -or
    $result.permissions.execute -or
    $result.permissions.alter -or
    $result.permissions.control

  if (-not $result.database_matches) {
    $result.blocker = "DATABASE_MISMATCH"
  }
  elseif (-not $result.permissions.select) {
    $result.blocker = "NO_SELECT_PERMISSION"
  }
  elseif ($hasWrite) {
    $result.blocker = "WINDOWS_PRINCIPAL_NOT_READ_ONLY"
  }
  else {
    $result.safe_for_order_read = $true
  }
}
catch {
  $result.blocker = "INTEGRATED_AUTH_CONNECTION_OR_METADATA_FAILED"
}
finally {
  if ($conn.State -ne [System.Data.ConnectionState]::Closed) {
    $conn.Close()
  }
}

$result | ConvertTo-Json -Depth 6

if (-not $result.safe_for_order_read) {
  exit 3
}

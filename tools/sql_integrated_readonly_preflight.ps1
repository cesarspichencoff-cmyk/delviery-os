param(
  [string]$Server = "192.168.0.24\SQLEXPRESS",
  [string]$Database = "teknisa",
  [string[]]$ObjectNames = @(
    "COMANDAVEN",
    "VENDAREST",
    "ITCOMANDAVEN",
    "PRODUTO"
  )
)

$ErrorActionPreference = "Stop"

# PRE-FLIGHT ONLY.
# Uses Windows Integrated Authentication. No username/password is read from Odhen.
# Executes metadata/permission SELECTs only. It does not read order/customer rows.
#
# Safety model:
# 1) database-level write/execute/control permissions must be absent;
# 2) elevated built-in roles must be absent;
# 3) every target object must resolve uniquely and allow SELECT;
# 4) every target object must deny INSERT/UPDATE/DELETE/ALTER/CONTROL/TAKE OWNERSHIP;
# 5) every column of every target object must deny column-level UPDATE.
#
# No GRANT/DENY/CREATE LOGIN is performed.

$result = [ordered]@{
  schema = "deliveryos.shadow.sql-integrated-preflight.v2"
  mode = "WINDOWS_INTEGRATED_AUTH_METADATA_ONLY"
  server = $Server
  database = $Database
  connected = $false
  database_matches = $false
  database_permissions = [ordered]@{
    select = $null
    insert = $null
    update = $null
    delete = $null
    execute = $null
    alter = $null
    control = $null
  }
  elevated_roles = [ordered]@{
    sysadmin = $null
    db_owner = $null
    db_datawriter = $null
    db_ddladmin = $null
  }
  objects = @()
  safe_for_order_read = $false
  blocker = $null
}

$connectionString =
  "Server=$Server;Database=$Database;Integrated Security=SSPI;" +
  "Application Name=DeliveryOSShadowPreflight;Connect Timeout=5;" +
  "Encrypt=False;TrustServerCertificate=True"

$conn = New-Object System.Data.SqlClient.SqlConnection $connectionString

function BoolFromReader($reader, [string]$name) {
  if ($reader[$name] -is [DBNull]) { return $false }
  return ([int]$reader[$name] -eq 1)
}

try {
  $conn.Open()
  $result.connected = $true

  # Database-level effective permissions + elevated roles.
  $dbCmd = $conn.CreateCommand()
  $dbCmd.CommandTimeout = 5
  $dbCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  CASE WHEN DB_NAME() = @expected_db THEN 1 ELSE 0 END AS database_matches,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'SELECT') AS can_select,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS can_insert,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'UPDATE') AS can_update,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'DELETE') AS can_delete,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'EXECUTE') AS can_execute,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER') AS can_alter,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') AS can_control,
  IS_SRVROLEMEMBER('sysadmin') AS is_sysadmin,
  IS_MEMBER('db_owner') AS is_db_owner,
  IS_MEMBER('db_datawriter') AS is_db_datawriter,
  IS_MEMBER('db_ddladmin') AS is_db_ddladmin;
"@
  $null = $dbCmd.Parameters.Add("@expected_db", [System.Data.SqlDbType]::NVarChar, 128)
  $dbCmd.Parameters["@expected_db"].Value = $Database

  $dbReader = $dbCmd.ExecuteReader()
  if (-not $dbReader.Read()) {
    throw "PREFLIGHT_NO_DATABASE_ROW"
  }

  $result.database_matches = BoolFromReader $dbReader "database_matches"
  $result.database_permissions.select = BoolFromReader $dbReader "can_select"
  $result.database_permissions.insert = BoolFromReader $dbReader "can_insert"
  $result.database_permissions.update = BoolFromReader $dbReader "can_update"
  $result.database_permissions.delete = BoolFromReader $dbReader "can_delete"
  $result.database_permissions.execute = BoolFromReader $dbReader "can_execute"
  $result.database_permissions.alter = BoolFromReader $dbReader "can_alter"
  $result.database_permissions.control = BoolFromReader $dbReader "can_control"
  $result.elevated_roles.sysadmin = BoolFromReader $dbReader "is_sysadmin"
  $result.elevated_roles.db_owner = BoolFromReader $dbReader "is_db_owner"
  $result.elevated_roles.db_datawriter = BoolFromReader $dbReader "is_db_datawriter"
  $result.elevated_roles.db_ddladmin = BoolFromReader $dbReader "is_db_ddladmin"
  $dbReader.Close()

  foreach ($objectName in $ObjectNames) {
    # Resolve the operational object by metadata only.
    $objCmd = $conn.CreateCommand()
    $objCmd.CommandTimeout = 5
    $objCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  s.name AS schema_name,
  o.name AS object_name,
  o.type_desc,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'SELECT') AS can_select,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'INSERT') AS can_insert,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'UPDATE') AS can_update,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'DELETE') AS can_delete,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'ALTER') AS can_alter,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'CONTROL') AS can_control,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'TAKE OWNERSHIP') AS can_take_ownership
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.name = @object_name
  AND o.type IN ('U','V','SN')
ORDER BY s.name;
"@
    $null = $objCmd.Parameters.Add("@object_name", [System.Data.SqlDbType]::NVarChar, 128)
    $objCmd.Parameters["@object_name"].Value = $objectName

    $objRows = @()
    $objReader = $objCmd.ExecuteReader()
    while ($objReader.Read()) {
      $objRows += [ordered]@{
        schema = [string]$objReader["schema_name"]
        name = [string]$objReader["object_name"]
        type = [string]$objReader["type_desc"]
        select = BoolFromReader $objReader "can_select"
        insert = BoolFromReader $objReader "can_insert"
        update = BoolFromReader $objReader "can_update"
        delete = BoolFromReader $objReader "can_delete"
        alter = BoolFromReader $objReader "can_alter"
        control = BoolFromReader $objReader "can_control"
        take_ownership = BoolFromReader $objReader "can_take_ownership"
      }
    }
    $objReader.Close()

    if ($objRows.Count -ne 1) {
      $result.objects += [ordered]@{
        requested_name = $objectName
        resolved = $false
        match_count = $objRows.Count
        blocker = if ($objRows.Count -eq 0) { "OBJECT_NOT_FOUND_OR_NOT_VISIBLE" } else { "OBJECT_NAME_AMBIGUOUS" }
      }
      continue
    }

    $obj = $objRows[0]

    # Column-level UPDATE can exist even when object-level UPDATE is false.
    $colCmd = $conn.CreateCommand()
    $colCmd.CommandTimeout = 5
    $colCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  COUNT_BIG(*) AS writable_columns
FROM sys.columns c
JOIN sys.objects o ON o.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE s.name = @schema_name
  AND o.name = @object_name
  AND HAS_PERMS_BY_NAME(
        s.name + '.' + o.name + '.' + c.name,
        'COLUMN',
        'UPDATE'
      ) = 1;
"@
    $null = $colCmd.Parameters.Add("@schema_name", [System.Data.SqlDbType]::NVarChar, 128)
    $colCmd.Parameters["@schema_name"].Value = $obj.schema
    $null = $colCmd.Parameters.Add("@object_name", [System.Data.SqlDbType]::NVarChar, 128)
    $colCmd.Parameters["@object_name"].Value = $obj.name
    $writableColumns = [int64]$colCmd.ExecuteScalar()

    $hasObjectWrite =
      $obj.insert -or
      $obj.update -or
      $obj.delete -or
      $obj.alter -or
      $obj.control -or
      $obj.take_ownership -or
      ($writableColumns -gt 0)

    $result.objects += [ordered]@{
      requested_name = $objectName
      resolved = $true
      schema = $obj.schema
      name = $obj.name
      type = $obj.type
      permissions = [ordered]@{
        select = $obj.select
        insert = $obj.insert
        update = $obj.update
        delete = $obj.delete
        alter = $obj.alter
        control = $obj.control
        take_ownership = $obj.take_ownership
        writable_column_count = $writableColumns
      }
      safe_read_only = ($obj.select -and -not $hasObjectWrite)
    }
  }

  $hasDatabaseWrite =
    $result.database_permissions.insert -or
    $result.database_permissions.update -or
    $result.database_permissions.delete -or
    $result.database_permissions.execute -or
    $result.database_permissions.alter -or
    $result.database_permissions.control

  $hasElevatedRole =
    $result.elevated_roles.sysadmin -or
    $result.elevated_roles.db_owner -or
    $result.elevated_roles.db_datawriter -or
    $result.elevated_roles.db_ddladmin

  $allObjectsResolved =
    $result.objects.Count -eq $ObjectNames.Count -and
    @($result.objects | Where-Object { -not $_.resolved }).Count -eq 0

  $allObjectsReadOnly =
    $allObjectsResolved -and
    @($result.objects | Where-Object { -not $_.safe_read_only }).Count -eq 0

  if (-not $result.database_matches) {
    $result.blocker = "DATABASE_MISMATCH"
  }
  elseif ($hasElevatedRole) {
    $result.blocker = "WINDOWS_PRINCIPAL_HAS_ELEVATED_ROLE"
  }
  elseif ($hasDatabaseWrite) {
    $result.blocker = "WINDOWS_PRINCIPAL_HAS_DATABASE_WRITE_OR_EXECUTE"
  }
  elseif (-not $allObjectsResolved) {
    $result.blocker = "TARGET_OBJECT_SET_NOT_PROVEN"
  }
  elseif (-not $allObjectsReadOnly) {
    $result.blocker = "TARGET_OBJECT_NOT_READ_ONLY"
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

$result | ConvertTo-Json -Depth 10

if (-not $result.safe_for_order_read) {
  exit 3
}

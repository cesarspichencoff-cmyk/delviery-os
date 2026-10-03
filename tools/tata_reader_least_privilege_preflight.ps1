param(
  [string]$Server = "(local)\SQLEXPRESS",
  [string]$Database = "teknisa",
  [string]$ExpectedPrincipal = "NT SERVICE\TataComandaReader"
)

$ErrorActionPreference = "Stop"

# Metadata/permission checks only.
# No operational table rows, no writes, no EXECUTE, no HTTP.
# Designed specifically for exact column-level SELECT grants.

$AllowedSchema = "TEKNISA"

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


$result = [ordered]@{
  schema = "deliveryos.tata-reader-least-privilege-preflight.v4"
  mode = "WINDOWS_INTEGRATED_AUTH_EXACT_COLUMN_SURFACE_METADATA_ONLY"
  server = $Server
  database = $Database
  expected_principal = $ExpectedPrincipal
  expected_schema = $AllowedSchema
  scope = "INTEGRATED_DELIVERY_CHANNELS_ONLY"

  current_login = $null
  original_login = $null
  current_user = $null
  database_matches = $false

  server_roles = [ordered]@{}
  server_permissions = [ordered]@{}
  database_roles = [ordered]@{}
  database_permissions = [ordered]@{}

  executable_procedure_count = $null
  specific_login_impersonation_count = $null
  specific_user_impersonation_count = $null
  non_table_object_permissions = @()
  non_table_object_permission_count = $null
  objects = @()

  extra_readable_surface = @()
  extra_readable_surface_count = $null
  sensitive_extra_readable_columns = @()

  safe_for_minimized_order_read = $false
  blocker = $null

  effects = [ordered]@{
    order_row_read = $false
    database_write = $false
    ddl = $false
    execute = $false
    http = $false
    print = $false
    file_write = $false
  }
}

$connectionString =
  "Server=$Server;Database=$Database;Integrated Security=SSPI;" +
  "Application Name=TataReaderLeastPrivilegePreflight;Connect Timeout=5;" +
  "Encrypt=False;TrustServerCertificate=True"

$conn = New-Object System.Data.SqlClient.SqlConnection $connectionString

function BoolFromReader($reader, [string]$name) {
  if ($reader[$name] -is [DBNull]) {
    return $null
  }
  return ([int]$reader[$name] -eq 1)
}

try {
  $conn.Open()

  $identityCmd = $conn.CreateCommand()
  $identityCmd.CommandTimeout = 5
  $identityCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  SUSER_SNAME() AS [current_login],
  ORIGINAL_LOGIN() AS [original_login],
  USER_NAME() AS [current_user],
  CASE WHEN DB_NAME() = @expected_db THEN 1 ELSE 0 END AS [database_matches];
"@
  $null = $identityCmd.Parameters.Add("@expected_db", [System.Data.SqlDbType]::NVarChar, 128)
  $identityCmd.Parameters["@expected_db"].Value = $Database

  $identityReader = $identityCmd.ExecuteReader()
  if (-not $identityReader.Read()) {
    throw "PREFLIGHT_NO_IDENTITY_ROW"
  }

  $result.current_login = [string]$identityReader["current_login"]
  $result.original_login = [string]$identityReader["original_login"]
  $result.current_user = [string]$identityReader["current_user"]
  $result.database_matches = BoolFromReader $identityReader "database_matches"
  $identityReader.Close()

  foreach ($role in @(
    "sysadmin",
    "securityadmin",
    "serveradmin",
    "setupadmin",
    "processadmin",
    "diskadmin",
    "dbcreator",
    "bulkadmin"
  )) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 5
    $cmd.CommandText = "SELECT IS_SRVROLEMEMBER(@role)"
    $null = $cmd.Parameters.Add("@role", [System.Data.SqlDbType]::NVarChar, 128)
    $cmd.Parameters["@role"].Value = $role
    $value = $cmd.ExecuteScalar()
    $result.server_roles[$role] =
      if ($value -is [DBNull]) { $null } else { ([int]$value -eq 1) }
  }

  foreach ($permission in @(
    "CONTROL SERVER",
    "ALTER ANY LOGIN",
    "ALTER ANY SERVER ROLE",
    "ALTER ANY DATABASE",
    "IMPERSONATE ANY LOGIN",
    "VIEW SERVER STATE"
  )) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 5
    $cmd.CommandText = "SELECT HAS_PERMS_BY_NAME(NULL,'SERVER',@permission)"
    $null = $cmd.Parameters.Add("@permission", [System.Data.SqlDbType]::NVarChar, 128)
    $cmd.Parameters["@permission"].Value = $permission
    $value = $cmd.ExecuteScalar()
    $result.server_permissions[$permission] =
      if ($value -is [DBNull]) { $null } else { ([int]$value -eq 1) }
  }

  foreach ($role in @(
    "db_owner",
    "db_datareader",
    "db_datawriter",
    "db_ddladmin",
    "db_securityadmin",
    "db_accessadmin",
    "db_backupoperator"
  )) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 5
    $cmd.CommandText = "SELECT IS_MEMBER(@role)"
    $null = $cmd.Parameters.Add("@role", [System.Data.SqlDbType]::NVarChar, 128)
    $cmd.Parameters["@role"].Value = $role
    $value = $cmd.ExecuteScalar()
    $result.database_roles[$role] =
      if ($value -is [DBNull]) { $null } else { ([int]$value -eq 1) }
  }

  foreach ($permission in @(
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "EXECUTE",
    "ALTER",
    "CONTROL",
    "VIEW DEFINITION",
    "VIEW DATABASE STATE",
    "ALTER ANY USER",
    "ALTER ANY ROLE"
  )) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 5
    $cmd.CommandText = "SELECT HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE',@permission)"
    $null = $cmd.Parameters.Add("@permission", [System.Data.SqlDbType]::NVarChar, 128)
    $cmd.Parameters["@permission"].Value = $permission
    $value = $cmd.ExecuteScalar()
    $result.database_permissions[$permission] =
      if ($value -is [DBNull]) { $null } else { ([int]$value -eq 1) }
  }

  $procedureCmd = $conn.CreateCommand()
  $procedureCmd.CommandTimeout = 5
  $procedureCmd.CommandText = @"
SET NOCOUNT ON;
SELECT COUNT_BIG(*)
FROM sys.procedures p
JOIN sys.schemas s ON s.schema_id = p.schema_id
WHERE HAS_PERMS_BY_NAME(
        s.name + '.' + p.name,
        'OBJECT',
        'EXECUTE'
      ) = 1;
"@
  $result.executable_procedure_count = [int64]$procedureCmd.ExecuteScalar()

  $loginImpersonationCmd = $conn.CreateCommand()
  $loginImpersonationCmd.CommandTimeout = 5
  $loginImpersonationCmd.CommandText = @"
SET NOCOUNT ON;
SELECT COUNT_BIG(*)
FROM sys.server_principals sp
WHERE sp.name <> SUSER_SNAME()
  AND sp.type IN ('S','U','G')
  AND HAS_PERMS_BY_NAME(sp.name, 'LOGIN', 'IMPERSONATE') = 1;
"@
  $result.specific_login_impersonation_count =
    [int64]$loginImpersonationCmd.ExecuteScalar()

  $userImpersonationCmd = $conn.CreateCommand()
  $userImpersonationCmd.CommandTimeout = 5
  $userImpersonationCmd.CommandText = @"
SET NOCOUNT ON;
SELECT COUNT_BIG(*)
FROM sys.database_principals dp
WHERE dp.name <> USER_NAME()
  AND dp.type IN ('S','U','G')
  AND HAS_PERMS_BY_NAME(dp.name, 'USER', 'IMPERSONATE') = 1;
"@
  $result.specific_user_impersonation_count =
    [int64]$userImpersonationCmd.ExecuteScalar()

  foreach ($objectName in $allowed.Keys) {
    $objectCmd = $conn.CreateCommand()
    $objectCmd.CommandTimeout = 5
    $objectCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  s.name AS schema_name,
  o.name AS object_name,
  o.type_desc,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'SELECT') AS object_select,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'INSERT') AS object_insert,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'UPDATE') AS object_update,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'DELETE') AS object_delete,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'ALTER') AS object_alter,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'CONTROL') AS object_control,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'TAKE OWNERSHIP') AS object_take_ownership
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE s.name = @schema_name
  AND o.name = @object_name
  AND o.type IN ('U','V');
"@
    $null = $objectCmd.Parameters.Add("@schema_name", [System.Data.SqlDbType]::NVarChar, 128)
    $objectCmd.Parameters["@schema_name"].Value = $AllowedSchema
    $null = $objectCmd.Parameters.Add("@object_name", [System.Data.SqlDbType]::NVarChar, 128)
    $objectCmd.Parameters["@object_name"].Value = $objectName

    $rows = @()
    $reader = $objectCmd.ExecuteReader()
    while ($reader.Read()) {
      $rows += [ordered]@{
        schema = [string]$reader["schema_name"]
        name = [string]$reader["object_name"]
        type = [string]$reader["type_desc"]
        object_select = BoolFromReader $reader "object_select"
        object_insert = BoolFromReader $reader "object_insert"
        object_update = BoolFromReader $reader "object_update"
        object_delete = BoolFromReader $reader "object_delete"
        object_alter = BoolFromReader $reader "object_alter"
        object_control = BoolFromReader $reader "object_control"
        object_take_ownership = BoolFromReader $reader "object_take_ownership"
      }
    }
    $reader.Close()

    if ($rows.Count -ne 1) {
      $result.objects += [ordered]@{
        requested_schema = $AllowedSchema
        requested_name = $objectName
        resolved = $false
        match_count = $rows.Count
        safe = $false
      }
      continue
    }

    $object = $rows[0]

    $columnCmd = $conn.CreateCommand()
    $columnCmd.CommandTimeout = 5
    $columnCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  c.name AS column_name,
  HAS_PERMS_BY_NAME(
    s.name + '.' + o.name,
    'OBJECT',
    'SELECT',
    c.name,
    'COLUMN'
  ) AS can_select,
  HAS_PERMS_BY_NAME(
    s.name + '.' + o.name,
    'OBJECT',
    'UPDATE',
    c.name,
    'COLUMN'
  ) AS can_update
FROM sys.columns c
JOIN sys.objects o ON o.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE s.name = @schema_name
  AND o.name = @object_name
ORDER BY c.column_id;
"@
    $null = $columnCmd.Parameters.Add("@schema_name", [System.Data.SqlDbType]::NVarChar, 128)
    $columnCmd.Parameters["@schema_name"].Value = $AllowedSchema
    $null = $columnCmd.Parameters.Add("@object_name", [System.Data.SqlDbType]::NVarChar, 128)
    $columnCmd.Parameters["@object_name"].Value = $objectName

    $columnReader = $columnCmd.ExecuteReader()
    $columns = @()
    while ($columnReader.Read()) {
      $columns += [ordered]@{
        name = [string]$columnReader["column_name"]
        select = BoolFromReader $columnReader "can_select"
        update = BoolFromReader $columnReader "can_update"
      }
    }
    $columnReader.Close()

    $required = @($allowed[$objectName])
    $allColumnNames = @($columns | ForEach-Object { $_.name })

    $missingRequired = @(
      $required |
        Where-Object { $_ -notin $allColumnNames }
    )

    $requiredWithoutSelect = @(
      $columns |
        Where-Object {
          $_.name -in $required -and
          $_.select -ne $true
        } |
        ForEach-Object { $_.name }
    )

    $extraReadable = @(
      $columns |
        Where-Object {
          $_.name -notin $required -and
          $_.select -eq $true
        } |
        ForEach-Object { $_.name }
    )

    $writableColumns = @(
      $columns |
        Where-Object { $_.update -eq $true } |
        ForEach-Object { $_.name }
    )

    $objectWrite =
      ($object.object_insert -eq $true) -or
      ($object.object_update -eq $true) -or
      ($object.object_delete -eq $true) -or
      ($object.object_alter -eq $true) -or
      ($object.object_control -eq $true) -or
      ($object.object_take_ownership -eq $true)

    # Do not require object-level SELECT=false here. SQL Server can report
    # effective SELECT differently when column grants exist. Exact safety is
    # proven below from the per-column readable surface: all required columns
    # must be readable and every non-allowlisted column must remain unreadable.
    $safe =
      (-not $objectWrite) -and
      ($missingRequired.Count -eq 0) -and
      ($requiredWithoutSelect.Count -eq 0) -and
      ($extraReadable.Count -eq 0) -and
      ($writableColumns.Count -eq 0)

    $result.objects += [ordered]@{
      requested_schema = $AllowedSchema
      requested_name = $objectName
      resolved = $true
      schema = $object.schema
      name = $object.name
      type = $object.type
      object_permissions = [ordered]@{
        select = $object.object_select
        insert = $object.object_insert
        update = $object.object_update
        delete = $object.object_delete
        alter = $object.object_alter
        control = $object.object_control
        take_ownership = $object.object_take_ownership
      }
      required_columns = $required
      missing_required_columns = $missingRequired
      required_without_select = $requiredWithoutSelect
      extra_readable_columns = $extraReadable
      writable_columns = $writableColumns
      safe = $safe
    }
  }

  # Audit every user-table column outside the exact approved surface.
  # This catches unexpected access to CONSUMIDOR or any other operational table,
  # and also catches personal/financial columns added by future Teknisa updates.
  $surfaceCmd = $conn.CreateCommand()
  $surfaceCmd.CommandTimeout = 10
  $surfaceCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  s.name AS schema_name,
  o.name AS object_name,
  o.type_desc AS object_type,
  c.name AS column_name
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.columns c ON c.object_id = o.object_id
WHERE o.is_ms_shipped = 0
  AND o.type IN ('U','V','IF','TF')
  AND HAS_PERMS_BY_NAME(
        s.name + '.' + o.name,
        'OBJECT',
        'SELECT',
        c.name,
        'COLUMN'
      ) = 1
ORDER BY s.name, o.name, c.column_id;
"@

  $surfaceReader = $surfaceCmd.ExecuteReader()
  $readableSurface = @()
  while ($surfaceReader.Read()) {
    $readableSurface += [ordered]@{
      schema = [string]$surfaceReader["schema_name"]
      object = [string]$surfaceReader["object_name"]
      object_type = [string]$surfaceReader["object_type"]
      column = [string]$surfaceReader["column_name"]
    }
  }
  $surfaceReader.Close()

  $approvedKeys = New-Object System.Collections.Generic.HashSet[string]
  foreach ($objectName in $allowed.Keys) {
    foreach ($columnName in $allowed[$objectName]) {
      $null = $approvedKeys.Add(
        ("{0}|{1}|{2}" -f $AllowedSchema, $objectName, $columnName).ToUpperInvariant()
      )
    }
  }

  foreach ($entry in $readableSurface) {
    $key =
      ("{0}|{1}|{2}" -f $entry.schema, $entry.object, $entry.column).ToUpperInvariant()

    if (-not $approvedKeys.Contains($key)) {
      $result.extra_readable_surface += $entry

      if ($entry.column -match "(?i)(CPF|CNPJ|TEL|EMAIL|E.?MAIL|END|CEP|BAIRRO|MUNIC|CONSUM|LAT|LONG|INSCR|NOME|NMCONS|ESTRANGEIRA)") {
        $result.sensitive_extra_readable_columns += $entry
      }
    }
  }

  $result.extra_readable_surface_count = $result.extra_readable_surface.Count

  # Any effective permission on a non-table application object is outside the
  # intended contract. This covers views, scalar/table-valued/CLR functions,
  # procedures, synonyms, sequences and aggregates even when they expose no columns.
  $nonTableCmd = $conn.CreateCommand()
  $nonTableCmd.CommandTimeout = 10
  $nonTableCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  s.name AS schema_name,
  o.name AS object_name,
  o.type_desc,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'SELECT') AS can_select,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'EXECUTE') AS can_execute,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'ALTER') AS can_alter,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'CONTROL') AS can_control,
  HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'TAKE OWNERSHIP') AS can_take_ownership
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.is_ms_shipped = 0
  AND o.type IN ('V','P','PC','FN','IF','TF','FS','FT','SN','SO','AF')
ORDER BY s.name, o.name;
"@

  $nonTableReader = $nonTableCmd.ExecuteReader()
  while ($nonTableReader.Read()) {
    $canSelect = BoolFromReader $nonTableReader "can_select"
    $canExecute = BoolFromReader $nonTableReader "can_execute"
    $canAlter = BoolFromReader $nonTableReader "can_alter"
    $canControl = BoolFromReader $nonTableReader "can_control"
    $canTakeOwnership = BoolFromReader $nonTableReader "can_take_ownership"

    if (
      ($canSelect -eq $true) -or
      ($canExecute -eq $true) -or
      ($canAlter -eq $true) -or
      ($canControl -eq $true) -or
      ($canTakeOwnership -eq $true)
    ) {
      $result.non_table_object_permissions += [ordered]@{
        schema = [string]$nonTableReader["schema_name"]
        object = [string]$nonTableReader["object_name"]
        type = [string]$nonTableReader["type_desc"]
        select = $canSelect
        execute = $canExecute
        alter = $canAlter
        control = $canControl
        take_ownership = $canTakeOwnership
      }
    }
  }
  $nonTableReader.Close()
  $result.non_table_object_permission_count =
    $result.non_table_object_permissions.Count

  $anyServerRole =
    @($result.server_roles.Values | Where-Object { $_ -eq $true }).Count -gt 0

  $anyServerPermission =
    @($result.server_permissions.Values | Where-Object { $_ -eq $true }).Count -gt 0

  $anyDatabaseRole =
    @($result.database_roles.Values | Where-Object { $_ -eq $true }).Count -gt 0

  $anyBroadDatabasePermission =
    @(
      $result.database_permissions.GetEnumerator() |
        Where-Object { $_.Value -eq $true }
    ).Count -gt 0

  $allObjectsSafe =
    ($result.objects.Count -eq $allowed.Keys.Count) -and
    (@($result.objects | Where-Object { -not $_.safe }).Count -eq 0)

  if (-not $result.database_matches) {
    $result.blocker = "DATABASE_MISMATCH"
  }
  elseif ($result.current_login -ne $ExpectedPrincipal) {
    $result.blocker = "UNEXPECTED_WINDOWS_PRINCIPAL"
  }
  elseif ($anyServerRole) {
    $result.blocker = "SERVER_ROLE_PRESENT"
  }
  elseif ($anyServerPermission) {
    $result.blocker = "DANGEROUS_SERVER_PERMISSION_PRESENT"
  }
  elseif ($anyDatabaseRole) {
    $result.blocker = "DATABASE_ROLE_PRESENT"
  }
  elseif ($anyBroadDatabasePermission) {
    $result.blocker = "BROAD_DATABASE_PERMISSION_PRESENT"
  }
  elseif ($result.specific_login_impersonation_count -gt 0) {
    $result.blocker = "SPECIFIC_LOGIN_IMPERSONATION_PRESENT"
  }
  elseif ($result.specific_user_impersonation_count -gt 0) {
    $result.blocker = "SPECIFIC_USER_IMPERSONATION_PRESENT"
  }
  elseif ($result.executable_procedure_count -gt 0) {
    $result.blocker = "EXECUTABLE_PROCEDURE_PRESENT"
  }
  elseif ($result.non_table_object_permission_count -gt 0) {
    $result.blocker = "NON_TABLE_OBJECT_PERMISSION_PRESENT"
  }
  elseif (-not $allObjectsSafe) {
    $result.blocker = "COLUMN_SURFACE_NOT_EXACT"
  }
  elseif ($result.extra_readable_surface_count -gt 0) {
    $result.blocker = "READABLE_SURFACE_OUTSIDE_ALLOWLIST"
  }
  else {
    $result.safe_for_minimized_order_read = $true
  }
}
catch {
  $result.blocker = "CONNECTION_OR_METADATA_FAILED"
  $result.error = $_.Exception.Message
}
finally {
  if ($conn.State -ne [System.Data.ConnectionState]::Closed) {
    $conn.Close()
  }
}

$result | ConvertTo-Json -Depth 12

if (-not $result.safe_for_minimized_order_read) {
  exit 3
}

exit 0

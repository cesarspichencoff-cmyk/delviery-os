$ErrorActionPreference = "Stop"

$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"
$Principal = "NT SERVICE\TataComandaReader"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-cdarvprod-permission-migration.review.v1"
  mode = "PERMISSION_SWAP_NMPRODUTO_TO_CDARVPROD_REVIEW_ONLY"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  current_login = $null
  database = $null
  before = $null
  after = $null
  transaction_committed = $false
  rollback_completed = $false
  effects = [ordered]@{
    permission_change = $false
    database_row_read = $false
    database_write = $false
    service_change = $false
    odhen_write = $false
    print = $false
    spooler_write = $false
    fiscal_action = $false
    sefaz_call = $false
    cutover = $false
  }
  error = $null
}

function Get-ColumnSurface($Connection) {
  $cmd = $Connection.CreateCommand()
  $cmd.CommandTimeout = 5
  $cmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  c.name AS [column_name],
  HAS_PERMS_BY_NAME(
    QUOTENAME(s.name) + '.' + QUOTENAME(o.name) + '.' + QUOTENAME(c.name),
    'COLUMN',
    'SELECT'
  ) AS [can_select]
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.columns c ON c.object_id = o.object_id
WHERE s.name = N'TEKNISA'
  AND o.name = N'PRODUTO'
  AND c.name IN (N'CDPRODUTO',N'NMPRODUTO',N'CDARVPROD')
ORDER BY c.column_id;
"@
  $reader = $cmd.ExecuteReader()
  $out = [ordered]@{}
  while ($reader.Read()) {
    $out[[string]$reader["column_name"]] = ([int]$reader["can_select"] -eq 1)
  }
  $reader.Close()
  return $out
}

$conn = $null
$tx = $null
try {
  $conn = New-Object System.Data.SqlClient.SqlConnection (
    "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;" +
    "Application Name=TataReaderCdArvProdPermissionMigrationReviewV1;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  )
  $conn.Open()

  $identity = $conn.CreateCommand()
  $identity.CommandTimeout = 5
  $identity.CommandText = "SELECT SUSER_SNAME() AS [current_login], DB_NAME() AS [database_name];"
  $rd = $identity.ExecuteReader()
  if (-not $rd.Read()) { throw "IDENTITY_ROW_NOT_RETURNED" }
  $result.current_login = [string]$rd["current_login"]
  $result.database = [string]$rd["database_name"]
  $rd.Close()

  if (-not [string]::Equals($result.database,$Database,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("DATABASE_MISMATCH:" + $result.database)
  }

  $principalCmd = $conn.CreateCommand()
  $principalCmd.CommandTimeout = 5
  $principalCmd.CommandText = @"
SET NOCOUNT ON;
SELECT COUNT_BIG(*)
FROM sys.database_principals
WHERE name = @principal;
"@
  $null = $principalCmd.Parameters.Add("@principal",[System.Data.SqlDbType]::NVarChar,128)
  $principalCmd.Parameters["@principal"].Value = $Principal
  if ([long]$principalCmd.ExecuteScalar() -ne 1) { throw "SERVICE_DATABASE_PRINCIPAL_NOT_FOUND" }

  $result.before = Get-ColumnSurface $conn
  if ($result.before["CDPRODUTO"] -ne $true) { throw "BEFORE_CDPRODUTO_SELECT_NOT_TRUE" }
  if ($result.before["NMPRODUTO"] -ne $true) { throw "BEFORE_NMPRODUTO_SELECT_NOT_TRUE" }
  if ($result.before["CDARVPROD"] -ne $false) { throw "BEFORE_CDARVPROD_SELECT_NOT_FALSE" }

  $tx = $conn.BeginTransaction()

  $swap = $conn.CreateCommand()
  $swap.Transaction = $tx
  $swap.CommandTimeout = 5
  $swap.CommandText = @"
REVOKE SELECT ([NMPRODUTO])
ON OBJECT::[TEKNISA].[PRODUTO]
FROM [NT SERVICE\TataComandaReader];

GRANT SELECT ([CDARVPROD])
ON OBJECT::[TEKNISA].[PRODUTO]
TO [NT SERVICE\TataComandaReader];
"@
  $null = $swap.ExecuteNonQuery()

  $verify = $conn.CreateCommand()
  $verify.Transaction = $tx
  $verify.CommandTimeout = 5
  $verify.CommandText = @"
SET NOCOUNT ON;
SELECT
  c.name AS [column_name],
  HAS_PERMS_BY_NAME(
    QUOTENAME(s.name) + '.' + QUOTENAME(o.name) + '.' + QUOTENAME(c.name),
    'COLUMN',
    'SELECT'
  ) AS [can_select]
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.columns c ON c.object_id = o.object_id
WHERE s.name = N'TEKNISA'
  AND o.name = N'PRODUTO'
  AND c.name IN (N'CDPRODUTO',N'NMPRODUTO',N'CDARVPROD')
ORDER BY c.column_id;
"@
  $vr = $verify.ExecuteReader()
  $after = [ordered]@{}
  while ($vr.Read()) { $after[[string]$vr["column_name"]] = ([int]$vr["can_select"] -eq 1) }
  $vr.Close()
  $result.after = $after

  if ($after["CDPRODUTO"] -ne $true) { throw "AFTER_CDPRODUTO_SELECT_NOT_TRUE" }
  if ($after["NMPRODUTO"] -ne $false) { throw "AFTER_NMPRODUTO_SELECT_NOT_FALSE" }
  if ($after["CDARVPROD"] -ne $true) { throw "AFTER_CDARVPROD_SELECT_NOT_TRUE" }

  $tx.Commit()
  $tx = $null
  $result.transaction_committed = $true
  $result.effects.permission_change = $true
  $result.status = "PERMISSION_SWAP_COMMITTED"
  $result | ConvertTo-Json -Depth 8
  exit 0
}
catch {
  if ($null -ne $tx) {
    try {
      $tx.Rollback()
      $result.rollback_completed = $true
    } catch { }
  }
  $result.status = if ($result.rollback_completed) { "FAILED_ROLLED_BACK" } else { "FAILED_ROLLBACK_UNKNOWN" }
  $result.error = [string]$_.Exception.Message
  $result | ConvertTo-Json -Depth 8
  exit 6
}
finally {
  if ($null -ne $conn -and $conn.State -ne [System.Data.ConnectionState]::Closed) { $conn.Close() }
}

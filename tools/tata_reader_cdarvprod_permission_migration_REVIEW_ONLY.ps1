$ErrorActionPreference = "Stop"

$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"
$Principal = "NT SERVICE\TataComandaReader"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-cdarvprod-permission-migration.review.v2"
  mode = "PERMISSION_SWAP_NMPRODUTO_TO_CDARVPROD_REVIEW_ONLY"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  current_login = $null
  database = $null
  before_explicit_grants = @()
  after_explicit_grants = @()
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

function Get-ExplicitProdutoSelectGrants($Connection, $Transaction = $null) {
  $cmd = $Connection.CreateCommand()
  if ($null -ne $Transaction) { $cmd.Transaction = $Transaction }
  $cmd.CommandTimeout = 5
  $cmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  c.name AS [column_name],
  p.state_desc AS [state_desc]
FROM sys.database_permissions p
JOIN sys.database_principals dp
  ON dp.principal_id = p.grantee_principal_id
JOIN sys.objects o
  ON o.object_id = p.major_id
JOIN sys.schemas s
  ON s.schema_id = o.schema_id
JOIN sys.columns c
  ON c.object_id = o.object_id
 AND c.column_id = p.minor_id
WHERE dp.name = @principal
  AND s.name = N'TEKNISA'
  AND o.name = N'PRODUTO'
  AND p.class = 1
  AND p.permission_name = N'SELECT'
  AND p.minor_id > 0
ORDER BY c.column_id;
"@
  $null = $cmd.Parameters.Add("@principal",[System.Data.SqlDbType]::NVarChar,128)
  $cmd.Parameters["@principal"].Value = $Principal
  $reader = $cmd.ExecuteReader()
  $rows = @()
  while ($reader.Read()) {
    $rows += [ordered]@{
      column_name = [string]$reader["column_name"]
      state_desc = [string]$reader["state_desc"]
    }
  }
  $reader.Close()
  return $rows
}

function Assert-ExactProdutoGrantSurface($Rows, $ExpectedColumns, $Phase) {
  $grants = @($Rows | Where-Object { $_.state_desc -in @("GRANT","GRANT_WITH_GRANT_OPTION") })
  $denies = @($Rows | Where-Object { $_.state_desc -eq "DENY" })
  if ($denies.Count -gt 0) { throw ($Phase + "_EXPLICIT_DENY_PRESENT") }

  $actual = @($grants | ForEach-Object { [string]$_.column_name } | Sort-Object -Unique)
  $expected = @($ExpectedColumns | Sort-Object -Unique)

  if ($actual.Count -ne $expected.Count) {
    throw ($Phase + "_COLUMN_GRANT_COUNT_MISMATCH:" + $actual.Count)
  }
  for ($i=0; $i -lt $expected.Count; $i++) {
    if ($actual[$i] -ne $expected[$i]) {
      throw ($Phase + "_COLUMN_GRANT_SURFACE_MISMATCH:" + ($actual -join ","))
    }
  }
}

$conn = $null
$tx = $null
try {
  $conn = New-Object System.Data.SqlClient.SqlConnection (
    "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;" +
    "Application Name=TataReaderCdArvProdPermissionMigrationReviewV2;Connect Timeout=5;" +
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

  $result.before_explicit_grants = @(Get-ExplicitProdutoSelectGrants $conn)
  Assert-ExactProdutoGrantSurface $result.before_explicit_grants @("CDPRODUTO","NMPRODUTO") "BEFORE"

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

  $result.after_explicit_grants = @(Get-ExplicitProdutoSelectGrants $conn $tx)
  Assert-ExactProdutoGrantSurface $result.after_explicit_grants @("CDPRODUTO","CDARVPROD") "AFTER"

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
  if ($null -ne $conn -and $conn.State -ne [System.Data.ConnectionState]::Closed) {
    $conn.Close()
  }
}

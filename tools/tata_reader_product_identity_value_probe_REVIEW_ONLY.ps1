$ErrorActionPreference = "Stop"

$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"
$ExpectedProductIds = @("0000001459","0000001641")

$result = [ordered]@{
  schema = "deliveryos.tata-reader-product-identity-value-probe.review.v1"
  mode = "READ_ONLY_TWO_PRODUCT_ROWS_REVIEW_ONLY"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  current_login = $null
  current_user = $null
  database = $null
  requested_product_ids = $ExpectedProductIds
  rows = @()
  rows_read = 0
  effects = [ordered]@{
    product_row_read = $false
    order_row_read = $false
    database_write = $false
    permission_change = $false
    odhen_write = $false
    print = $false
    spooler_write = $false
    fiscal_action = $false
    sefaz_call = $false
    cutover = $false
  }
  error = $null
}

$conn = $null
try {
  $conn = New-Object System.Data.SqlClient.SqlConnection (
    "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;" +
    "Application Name=TataReaderProductIdentityValueProbeReviewV1;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  )
  $conn.Open()

  $identity = $conn.CreateCommand()
  $identity.CommandTimeout = 5
  $identity.CommandText = @"
SET NOCOUNT ON;
SELECT
  SUSER_SNAME() AS [current_login],
  USER_NAME() AS [current_user],
  DB_NAME() AS [database_name];
"@
  $rd = $identity.ExecuteReader()
  if (-not $rd.Read()) { throw "IDENTITY_ROW_NOT_RETURNED" }
  $result.current_login = [string]$rd["current_login"]
  $result.current_user = [string]$rd["current_user"]
  $result.database = [string]$rd["database_name"]
  $rd.Close()

  if (-not [string]::Equals($result.database,$Database,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("DATABASE_MISMATCH:" + $result.database)
  }

  $cmd = $conn.CreateCommand()
  $cmd.CommandTimeout = 5
  $cmd.CommandText = @"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;

SELECT TOP (3)
  p.CDPRODUTO,
  p.CDPRODINTE,
  p.CDARVPROD,
  p.CDPRODESTO
FROM TEKNISA.PRODUTO p
WHERE p.CDPRODUTO IN (@p1,@p2)
ORDER BY p.CDPRODUTO;
"@
  $null = $cmd.Parameters.Add("@p1",[System.Data.SqlDbType]::VarChar,10)
  $null = $cmd.Parameters.Add("@p2",[System.Data.SqlDbType]::VarChar,10)
  $cmd.Parameters["@p1"].Value = $ExpectedProductIds[0]
  $cmd.Parameters["@p2"].Value = $ExpectedProductIds[1]

  $reader = $cmd.ExecuteReader()
  while ($reader.Read()) {
    $result.rows += [ordered]@{
      CDPRODUTO = [string]$reader["CDPRODUTO"]
      CDPRODINTE = if ($reader["CDPRODINTE"] -is [DBNull]) { $null } else { [string]$reader["CDPRODINTE"] }
      CDARVPROD = if ($reader["CDARVPROD"] -is [DBNull]) { $null } else { [string]$reader["CDARVPROD"] }
      CDPRODESTO = if ($reader["CDPRODESTO"] -is [DBNull]) { $null } else { [string]$reader["CDPRODESTO"] }
    }
  }
  $reader.Close()

  $result.rows_read = $result.rows.Count
  $result.effects.product_row_read = ($result.rows_read -gt 0)

  if ($result.rows_read -gt 2) { throw ("ROW_BOUND_EXCEEDED:" + $result.rows_read) }

  $unexpected = @($result.rows | Where-Object { $_.CDPRODUTO -notin $ExpectedProductIds })
  if ($unexpected.Count -gt 0) { throw "UNEXPECTED_PRODUCT_ID_RETURNED" }

  $result.status = if ($result.rows_read -eq 2) {
    "TWO_PRODUCT_IDENTITY_VALUES_READ"
  } elseif ($result.rows_read -eq 1) {
    "ONE_PRODUCT_IDENTITY_VALUE_READ"
  } else {
    "NO_TARGET_PRODUCT_ROWS_FOUND"
  }

  $result | ConvertTo-Json -Depth 8
  exit 0
}
catch {
  $result.status = "VALUE_PROBE_FAILED"
  $result.error = [string]$_.Exception.Message
  $result | ConvertTo-Json -Depth 8
  exit 6
}
finally {
  if ($null -ne $conn -and $conn.State -ne [System.Data.ConnectionState]::Closed) {
    $conn.Close()
  }
}

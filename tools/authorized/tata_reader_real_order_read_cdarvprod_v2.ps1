$ErrorActionPreference = "Stop"

$ExpectedLogin = "NT SERVICE\TataComandaReader"
$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-real-order-read.v2"
  mode = "READ_ONLY_MINIMIZED_REAL_ORDER_WITH_CDARVPROD"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  current_login = $null
  current_user = $null
  database = $null
  order = $null
  items = @()
  rows_read = 0
  customer_pii_fields_read = $false
  observations_read = $false\r\n  product_name_read = $false
  effects = [ordered]@{
    order_row_read = $false
    database_write = $false
    odhen_write = $false
    print = $false
    spooler_write = $false
    fiscal_action = $false
    sefaz_call = $false
    danfe_print = $false
    cutover = $false
  }
  error = $null
}

function New-ReaderConnection {
  return New-Object System.Data.SqlClient.SqlConnection (
    "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;" +
    "Application Name=TataReaderRealOrderReadV2;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  )
}

$conn = $null
try {
  $conn = New-ReaderConnection
  $conn.Open()

  $identityCmd = $conn.CreateCommand()
  $identityCmd.CommandTimeout = 5
  $identityCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  SUSER_SNAME() AS [current_login],
  USER_NAME() AS [current_user],
  DB_NAME() AS [database_name];
"@

  $identityReader = $identityCmd.ExecuteReader()
  if (-not $identityReader.Read()) { throw "IDENTITY_ROW_NOT_RETURNED" }
  $result.current_login = [string]$identityReader["current_login"]
  $result.current_user = [string]$identityReader["current_user"]
  $result.database = [string]$identityReader["database_name"]
  $identityReader.Close()

  if (-not [string]::Equals($result.current_login,$ExpectedLogin,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("UNEXPECTED_SQL_LOGIN:" + $result.current_login)
  }
  if (-not [string]::Equals($result.database,$Database,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("DATABASE_MISMATCH:" + $result.database)
  }

  $orderCmd = $conn.CreateCommand()
  $orderCmd.CommandTimeout = 5
  $orderCmd.CommandText = @"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;

SELECT TOP (1)
  c.CDFILIAL,
  c.CDLOJA,
  c.NRVENDAREST,
  c.NRCOMANDA,
  c.NRCOMANDAEXT,
  c.IDORGCMDVENDA,
  c.IDSTCOMANDA,
  v.DTHRABERMESA
FROM TEKNISA.COMANDAVEN c
JOIN TEKNISA.VENDAREST v
  ON v.CDFILIAL = c.CDFILIAL
 AND v.NRVENDAREST = c.NRVENDAREST
WHERE c.NRCOMANDAEXT IS NOT NULL
  AND LTRIM(RTRIM(CONVERT(nvarchar(128), c.NRCOMANDAEXT))) <> N''
  AND CONVERT(nvarchar(64), c.IDORGCMDVENDA) LIKE N'DLV[_]%'
ORDER BY v.DTHRABERMESA DESC, c.NRVENDAREST DESC;
"@

  $orderReader = $orderCmd.ExecuteReader()
  if (-not $orderReader.Read()) {
    $orderReader.Close()
    $result.status = "NO_INTEGRATED_ORDER_FOUND"
    $result.effects.order_row_read = $true
    $result | ConvertTo-Json -Depth 8
    exit 4
  }

  $cdfilial = $orderReader["CDFILIAL"]
  $nrvendarest = $orderReader["NRVENDAREST"]
  $nrcomanda = $orderReader["NRCOMANDA"]

  $result.order = [ordered]@{
    CDFILIAL = [string]$orderReader["CDFILIAL"]
    CDLOJA = [string]$orderReader["CDLOJA"]
    NRVENDAREST = [string]$orderReader["NRVENDAREST"]
    NRCOMANDA = [string]$orderReader["NRCOMANDA"]
    NRCOMANDAEXT = [string]$orderReader["NRCOMANDAEXT"]
    IDORGCMDVENDA = [string]$orderReader["IDORGCMDVENDA"]
    IDSTCOMANDA = [string]$orderReader["IDSTCOMANDA"]
    DTHRABERMESA = if ($orderReader["DTHRABERMESA"] -is [DBNull]) { $null } else { ([datetime]$orderReader["DTHRABERMESA"]).ToString("o") }
  }
  $orderReader.Close()

  $itemCmd = $conn.CreateCommand()
  $itemCmd.CommandTimeout = 5
  $itemCmd.CommandText = @"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;

SELECT TOP (20)
  i.NRPRODCOMVEN,
  i.CDPRODUTO,
  p.CDARVPROD,
  i.QTPRODCOMVEN,
  i.IDSTPRCOMVEN
FROM TEKNISA.ITCOMANDAVEN i
LEFT JOIN TEKNISA.PRODUTO p
  ON p.CDPRODUTO = i.CDPRODUTO
WHERE i.CDFILIAL = @cdfilial
  AND i.NRVENDAREST = @nrvendarest
  AND i.NRCOMANDA = @nrcomanda
ORDER BY i.NRPRODCOMVEN;
"@
  $null = $itemCmd.Parameters.AddWithValue("@cdfilial",$cdfilial)
  $null = $itemCmd.Parameters.AddWithValue("@nrvendarest",$nrvendarest)
  $null = $itemCmd.Parameters.AddWithValue("@nrcomanda",$nrcomanda)

  $itemReader = $itemCmd.ExecuteReader()
  while ($itemReader.Read()) {
    $result.items += [ordered]@{
      NRPRODCOMVEN = [string]$itemReader["NRPRODCOMVEN"]
      CDPRODUTO = [string]$itemReader["CDPRODUTO"]
      CDARVPROD = if ($itemReader["CDARVPROD"] -is [DBNull]) { $null } else { [string]$itemReader["CDARVPROD"] }
      QTPRODCOMVEN = [string]$itemReader["QTPRODCOMVEN"]
      IDSTPRCOMVEN = [string]$itemReader["IDSTPRCOMVEN"]
    }
  }
  $itemReader.Close()

  $result.effects.order_row_read = $true
  $result.rows_read = 1 + $result.items.Count

  if ($result.items.Count -lt 1) {
    $result.status = "ORDER_FOUND_WITHOUT_ITEMS"
    $result | ConvertTo-Json -Depth 8
    exit 5
  }

  $result.status = "PROVEN_MINIMIZED_REAL_ORDER_READ_WITH_CDARVPROD"
  $result | ConvertTo-Json -Depth 8
  exit 0
}
catch {
  $result.status = "READ_FAILED"
  $result.error = [string]$_.Exception.Message
  $result | ConvertTo-Json -Depth 8
  exit 6
}
finally {
  if ($null -ne $conn -and $conn.State -ne [System.Data.ConnectionState]::Closed) {
    $conn.Close()
  }
}

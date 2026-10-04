$ErrorActionPreference = "Stop"

$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-cdarvprod-catalog-audit.review.v1"
  mode = "READ_ONLY_CDARVPROD_CATALOG_AGGREGATE_REVIEW_ONLY"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  current_login = $null
  current_user = $null
  database = $null
  summary = $null
  values = @()
  distinct_values_returned = 0
  effects = [ordered]@{
    product_catalog_aggregate_read = $false
    product_identity_row_read = $false
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
    "Application Name=TataReaderCdArvProdCatalogAuditReviewV1;Connect Timeout=5;" +
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

  $summaryCmd = $conn.CreateCommand()
  $summaryCmd.CommandTimeout = 10
  $summaryCmd.CommandText = @"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;

SELECT
  COUNT_BIG(*) AS total_product_rows,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(CDARVPROD)), '') IS NULL THEN 1 ELSE 0 END) AS null_or_blank_cdarvprod_rows,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(CDARVPROD)), '') IS NOT NULL THEN 1 ELSE 0 END) AS nonblank_cdarvprod_rows,
  COUNT(DISTINCT NULLIF(LTRIM(RTRIM(CDARVPROD)), '')) AS distinct_nonblank_cdarvprod
FROM TEKNISA.PRODUTO;
"@
  $sr = $summaryCmd.ExecuteReader()
  if (-not $sr.Read()) { throw "SUMMARY_ROW_NOT_RETURNED" }
  $result.summary = [ordered]@{
    total_product_rows = [long]$sr["total_product_rows"]
    null_or_blank_cdarvprod_rows = [long]$sr["null_or_blank_cdarvprod_rows"]
    nonblank_cdarvprod_rows = [long]$sr["nonblank_cdarvprod_rows"]
    distinct_nonblank_cdarvprod = [long]$sr["distinct_nonblank_cdarvprod"]
  }
  $sr.Close()

  $valuesCmd = $conn.CreateCommand()
  $valuesCmd.CommandTimeout = 10
  $valuesCmd.CommandText = @"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;

SELECT TOP (2001)
  LTRIM(RTRIM(CDARVPROD)) AS [CDARVPROD],
  COUNT_BIG(*) AS [product_rows]
FROM TEKNISA.PRODUTO
WHERE NULLIF(LTRIM(RTRIM(CDARVPROD)), '') IS NOT NULL
GROUP BY LTRIM(RTRIM(CDARVPROD))
ORDER BY LTRIM(RTRIM(CDARVPROD));
"@
  $vr = $valuesCmd.ExecuteReader()
  while ($vr.Read()) {
    $result.values += [ordered]@{
      CDARVPROD = [string]$vr["CDARVPROD"]
      product_rows = [long]$vr["product_rows"]
    }
  }
  $vr.Close()

  $result.distinct_values_returned = $result.values.Count
  $result.effects.product_catalog_aggregate_read = $true

  if ($result.values.Count -gt 2000) { throw ("DISTINCT_VALUE_BOUND_EXCEEDED:" + $result.values.Count) }
  if ($result.summary.distinct_nonblank_cdarvprod -ne $result.values.Count) {
    throw ("DISTINCT_COUNT_MISMATCH:" + $result.summary.distinct_nonblank_cdarvprod + ":" + $result.values.Count)
  }

  $result.status = "CDARVPROD_CATALOG_AGGREGATE_READ"
  $result | ConvertTo-Json -Depth 8
  exit 0
}
catch {
  $result.status = "CATALOG_AUDIT_FAILED"
  $result.error = [string]$_.Exception.Message
  $result | ConvertTo-Json -Depth 8
  exit 6
}
finally {
  if ($null -ne $conn -and $conn.State -ne [System.Data.ConnectionState]::Closed) {
    $conn.Close()
  }
}

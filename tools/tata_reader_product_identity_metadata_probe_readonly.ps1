param(
  [string]$SqlServer = "(local)\SQLEXPRESS",
  [string]$Database = "teknisa"
)

$ErrorActionPreference = "Stop"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-product-identity-metadata-probe.v3"
  mode = "METADATA_ONLY_NO_OPERATIONAL_ROWS"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  current_login = $null
  current_user = $null
  database = $null
  product_object = $null
  product_candidate_columns = @()
  candidate_objects = @()
  official_candidate_field_names = @("CDPROINTE","CDPRODINTE","CDARVPROD","CDPRODESTO")
  operational_rows_read = 0
  effects = [ordered]@{
    database_write = $false
    operational_row_read = $false
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
    "Application Name=TataReaderProductIdentityMetadataProbeV3;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  )
  $conn.Open()

  $identity = $conn.CreateCommand()
  $identity.CommandTimeout = 5
  $identity.CommandText = @"
SET NOCOUNT ON;
SELECT
  SUSER_SNAME() AS current_login,
  USER_NAME() AS [current_user],
  DB_NAME() AS database_name;
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

  $meta = $conn.CreateCommand()
  $meta.CommandTimeout = 5
  $meta.CommandText = @"
SET NOCOUNT ON;

SELECT
  s.name AS schema_name,
  o.name AS object_name,
  o.type_desc,
  c.column_id,
  c.name AS column_name,
  TYPE_NAME(c.user_type_id) AS data_type,
  c.max_length,
  c.is_nullable
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.columns c ON c.object_id = o.object_id
WHERE s.name = N'TEKNISA'
  AND o.name = N'PRODUTO'
  AND o.type IN ('U','V')
ORDER BY c.column_id;

SELECT
  s.name AS schema_name,
  o.name AS object_name,
  o.type_desc,
  SUM(CASE WHEN c.name = N'CDPRODUTO' THEN 1 ELSE 0 END) AS has_cdproduto,
  SUM(CASE WHEN c.name = N'CDPROINTE' THEN 1 ELSE 0 END) AS has_cdprointe,
  SUM(CASE WHEN c.name = N'CDPRODINTE' THEN 1 ELSE 0 END) AS has_cdprodinte,
  SUM(CASE WHEN c.name = N'CDARVPROD' THEN 1 ELSE 0 END) AS has_cdarvprod,
  SUM(CASE WHEN c.name = N'CDPRODESTO' THEN 1 ELSE 0 END) AS has_cdprodesto
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.columns c ON c.object_id = o.object_id
WHERE s.name = N'TEKNISA'
  AND o.type IN ('U','V')
  AND c.name IN (N'CDPRODUTO',N'CDPROINTE',N'CDPRODINTE',N'CDARVPROD',N'CDPRODESTO')
GROUP BY s.name,o.name,o.type_desc
HAVING SUM(CASE WHEN c.name = N'CDPRODUTO' THEN 1 ELSE 0 END) > 0
   AND (
        SUM(CASE WHEN c.name = N'CDPROINTE' THEN 1 ELSE 0 END) > 0
     OR SUM(CASE WHEN c.name = N'CDPRODINTE' THEN 1 ELSE 0 END) > 0
     OR SUM(CASE WHEN c.name = N'CDARVPROD' THEN 1 ELSE 0 END) > 0
     OR SUM(CASE WHEN c.name = N'CDPRODESTO' THEN 1 ELSE 0 END) > 0
   )
ORDER BY o.name;
"@

  $reader = $meta.ExecuteReader()
  $productCols = @()
  while ($reader.Read()) {
    $productCols += [ordered]@{
      schema_name = [string]$reader["schema_name"]
      object_name = [string]$reader["object_name"]
      type_desc = [string]$reader["type_desc"]
      column_id = [int]$reader["column_id"]
      column_name = [string]$reader["column_name"]
      data_type = [string]$reader["data_type"]
      max_length = [int]$reader["max_length"]
      is_nullable = [bool]$reader["is_nullable"]
    }
  }
  $result.product_object = if ($productCols.Count -gt 0) {
    [ordered]@{schema_name="TEKNISA";object_name="PRODUTO";columns=$productCols.Count}
  } else { $null }
  $result.product_candidate_columns = @(
    $productCols |
      Where-Object { $_.column_name -in @("CDPRODUTO","NMPRODUTO","CDPROINTE","CDPRODINTE","CDARVPROD","CDPRODESTO") }
  )

  if ($reader.NextResult()) {
    while ($reader.Read()) {
      $result.candidate_objects += [ordered]@{
        schema_name = [string]$reader["schema_name"]
        object_name = [string]$reader["object_name"]
        type_desc = [string]$reader["type_desc"]
        has_cdproduto = ([int]$reader["has_cdproduto"] -gt 0)
        has_cdprointe = ([int]$reader["has_cdprointe"] -gt 0)
        has_cdprodinte = ([int]$reader["has_cdprodinte"] -gt 0)
        has_cdarvprod = ([int]$reader["has_cdarvprod"] -gt 0)
        has_cdprodesto = ([int]$reader["has_cdprodesto"] -gt 0)
      }
    }
  }
  $reader.Close()

  $result.status = if ($result.candidate_objects.Count -gt 0) {
    "CANDIDATE_CROSSWALK_SURFACE_FOUND"
  } else {
    "NO_OFFICIAL_CANDIDATE_CROSSWALK_FIELD_FOUND_IN_VISIBLE_METADATA"
  }

  $result | ConvertTo-Json -Depth 10
  exit 0
}
catch {
  $result.status = "METADATA_PROBE_FAILED"
  $result.error = [string]$_.Exception.Message
  $result | ConvertTo-Json -Depth 10
  exit 6
}
finally {
  if ($null -ne $conn -and $conn.State -ne [System.Data.ConnectionState]::Closed) {
    $conn.Close()
  }
}

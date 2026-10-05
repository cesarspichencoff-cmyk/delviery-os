$ErrorActionPreference = "Stop"

$ExpectedLogin = "NT SERVICE\TataComandaReader"
$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"
$ExpectedFilial = "0001"
$ExpectedLoja = "01"
$ExpectedStore = "0001 - TATA ITAIM"
$RoutingPath = Join-Path $PSScriptRoot "odhen_product_routing_compact_v1.json"
$PrinterMapPath = Join-Path $PSScriptRoot "runtime_printer_map_v1.json"
$ExpectedRoutingSha256 = "7084771026CA54F10069F02E0BABCAA00F9C7666484CBAF80EC1ECDCDCAA165D"
$ExpectedPrinterMapSha256 = "F37DAE40779C5A205A26CEB289CD748D1C7747C1947C278F534A2DCC2F296F4C"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-real-order-shadow-route.v1"
  mode = "READ_ONLY_REAL_ORDER_CDARVPROD_EXPECTED_ROUTE_NO_PRINT"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  current_login = $null
  current_user = $null
  database = $null
  routing_sha256 = $null
  printer_map_sha256 = $null
  order = $null
  items = @()
  order_targets = @()
  blockers = @()
  ready = $false
  rows_read = 0
  customer_pii_fields_read = $false
  observations_read = $false
  product_name_read = $false
  effects = [ordered]@{
    order_row_read = $false
    local_config_read = $false
    database_write = $false
    permission_change = $false
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

function Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Canonicalize-RetailCode([string]$Raw) {
  if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }
  $compact = $Raw.Trim().ToUpperInvariant().Replace(".","")
  if ($compact -notmatch '^[A-Z0-9]{10}$') { return $null }
  return (
    $compact.Substring(0,1) + "." +
    $compact.Substring(1,2) + "." +
    $compact.Substring(3,2) + "." +
    $compact.Substring(5,3) + "." +
    $compact.Substring(8,2)
  )
}

$conn = $null
try {
  if (-not (Test-Path -LiteralPath $RoutingPath -PathType Leaf)) { throw "ROUTING_FILE_MISSING" }
  if (-not (Test-Path -LiteralPath $PrinterMapPath -PathType Leaf)) { throw "PRINTER_MAP_FILE_MISSING" }

  $result.routing_sha256 = Hash $RoutingPath
  $result.printer_map_sha256 = Hash $PrinterMapPath
  if ($result.routing_sha256 -ne $ExpectedRoutingSha256) { throw ("ROUTING_HASH_MISMATCH:" + $result.routing_sha256) }
  if ($result.printer_map_sha256 -ne $ExpectedPrinterMapSha256) { throw ("PRINTER_MAP_HASH_MISMATCH:" + $result.printer_map_sha256) }

  $routing = Get-Content -LiteralPath $RoutingPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $printers = Get-Content -LiteralPath $PrinterMapPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $result.effects.local_config_read = $true

  if ($routing.schema -ne "deliveryos.odhen.product-routing.compact.v1") { throw "ROUTING_SCHEMA_MISMATCH" }
  if ($printers.schema -ne "deliveryos.runtime-printer-map.v1") { throw "PRINTER_MAP_SCHEMA_MISMATCH" }
  if ($routing.store -ne $ExpectedStore) { throw ("ROUTING_STORE_MISMATCH:" + $routing.store) }
  if ($printers.store -ne $ExpectedStore) { throw ("PRINTER_STORE_MISMATCH:" + $printers.store) }

  $printerByCode = @{}
  foreach ($p in @($printers.mappings)) {
    $code = [string]$p.printer_code
    if ([string]::IsNullOrWhiteSpace($code)) { throw "EMPTY_PRINTER_CODE" }
    if ($printerByCode.ContainsKey($code)) { throw ("DUPLICATE_PRINTER_CODE:" + $code) }
    $printerByCode[$code] = $p
  }

  $conn = New-Object System.Data.SqlClient.SqlConnection (
    "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;" +
    "Application Name=TataReaderShadowRouteV1;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  )
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
WHERE c.CDFILIAL = @cdfilial
  AND c.CDLOJA = @cdloja
  AND c.NRCOMANDAEXT IS NOT NULL
  AND LTRIM(RTRIM(CONVERT(nvarchar(128), c.NRCOMANDAEXT))) <> N''
  AND CONVERT(nvarchar(64), c.IDORGCMDVENDA) LIKE N'DLV[_]%'
ORDER BY v.DTHRABERMESA DESC, c.NRVENDAREST DESC;
"@
  $null = $orderCmd.Parameters.Add("@cdfilial",[System.Data.SqlDbType]::VarChar,4)
  $orderCmd.Parameters["@cdfilial"].Value = $ExpectedFilial
  $null = $orderCmd.Parameters.Add("@cdloja",[System.Data.SqlDbType]::VarChar,4)
  $orderCmd.Parameters["@cdloja"].Value = $ExpectedLoja

  $orderReader = $orderCmd.ExecuteReader()
  if (-not $orderReader.Read()) {
    $orderReader.Close()
    $result.status = "NO_INTEGRATED_ORDER_FOUND_FOR_STORE"
    $result.effects.order_row_read = $true
    $result | ConvertTo-Json -Depth 12
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

  $rawItems = @()
  $itemReader = $itemCmd.ExecuteReader()
  while ($itemReader.Read()) {
    $rawItems += [ordered]@{
      NRPRODCOMVEN = [string]$itemReader["NRPRODCOMVEN"]
      CDPRODUTO = [string]$itemReader["CDPRODUTO"]
      CDARVPROD = if ($itemReader["CDARVPROD"] -is [DBNull]) { $null } else { [string]$itemReader["CDARVPROD"] }
      QTPRODCOMVEN = [string]$itemReader["QTPRODCOMVEN"]
      IDSTPRCOMVEN = [string]$itemReader["IDSTPRCOMVEN"]
    }
  }
  $itemReader.Close()

  $result.effects.order_row_read = $true
  $result.rows_read = 1 + $rawItems.Count

  if ($rawItems.Count -lt 1) {
    $result.blockers += "ORDER_FOUND_WITHOUT_ITEMS"
  }

  $orderTargets = @{}
  foreach ($raw in $rawItems) {
    $itemBlockers = @()
    $canonical = Canonicalize-RetailCode ([string]$raw.CDARVPROD)
    if ($null -eq $canonical) {
      $itemBlockers += ("INVALID_OR_MISSING_CDARVPROD:" + [string]$raw.CDPRODUTO)
    }

    $routeCodes = @()
    if ($null -ne $canonical) {
      $routeProperty = $routing.products.PSObject.Properties[$canonical]
      if ($null -eq $routeProperty) {
        $itemBlockers += ("PRODUCT_ROUTE_NOT_FOUND:" + $canonical)
      }
      else {
        $routeCodes = @($routeProperty.Value)
        if ($routeCodes.Count -lt 1) { $itemBlockers += ("EMPTY_PRODUCT_ROUTE:" + $canonical) }
      }
    }

    $targets = @()
    $seenTargets = @{}
    foreach ($printerCode in $routeCodes) {
      $pc = [string]$printerCode
      if ($seenTargets.ContainsKey($pc)) {
        $itemBlockers += ("DUPLICATE_ROUTE_TARGET:" + $canonical + ":" + $pc)
        continue
      }
      $seenTargets[$pc] = $true
      if (-not $printerByCode.ContainsKey($pc)) {
        $itemBlockers += ("PRINTER_NOT_FOUND:" + $pc)
        continue
      }
      $p = $printerByCode[$pc]
      if ([string]::IsNullOrWhiteSpace([string]$p.printer_ip)) {
        $itemBlockers += ("PRINTER_IP_MISSING:" + $pc)
        continue
      }

      $target = [ordered]@{
        printer_code = [string]$p.printer_code
        printer_name = [string]$p.printer_name
        printer_ip = [string]$p.printer_ip
        printer_port = if ($null -eq $p.printer_port) { $null } else { [string]$p.printer_port }
        peripherals_server = if ($null -eq $p.peripherals_server) { $null } else { [string]$p.peripherals_server }
      }
      $targets += $target
      $orderTargets[$pc] = $target
    }

    foreach ($b in $itemBlockers) { $result.blockers += $b }
    $result.items += [ordered]@{
      NRPRODCOMVEN = [string]$raw.NRPRODCOMVEN
      CDPRODUTO = [string]$raw.CDPRODUTO
      CDARVPROD = $raw.CDARVPROD
      retail_product_code = $canonical
      QTPRODCOMVEN = [string]$raw.QTPRODCOMVEN
      IDSTPRCOMVEN = [string]$raw.IDSTPRCOMVEN
      route_status = if ($itemBlockers.Count -eq 0) { "ROUTED" } else { "UNRESOLVED" }
      blockers = $itemBlockers
      targets = $targets
    }
  }

  $result.order_targets = @($orderTargets.Values)
  $result.blockers = @($result.blockers | Sort-Object -Unique)
  $result.ready = ($result.blockers.Count -eq 0)

  if ($result.ready) {
    $result.status = "PROVEN_REAL_ORDER_SHADOW_ROUTE"
    $result | ConvertTo-Json -Depth 12
    exit 0
  }

  $result.status = "SHADOW_ROUTE_BLOCKED"
  $result | ConvertTo-Json -Depth 12
  exit 5
}
catch {
  $result.status = "SHADOW_ROUTE_FAILED"
  $result.error = [string]$_.Exception.Message
  $result | ConvertTo-Json -Depth 12
  exit 6
}
finally {
  if ($null -ne $conn -and $conn.State -ne [System.Data.ConnectionState]::Closed) {
    $conn.Close()
  }
}

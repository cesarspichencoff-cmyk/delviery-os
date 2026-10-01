param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos",
  [string]$OdhenPosRoot = ""
)

$ErrorActionPreference = "Stop"

# TARGETED READ-PATH PROBE.
# Reads bounded context only from six exact source files already proven present.
# No recursion, no logs, no SQL, no HTTP, no processes, no printing, no writes.

if ([string]::IsNullOrWhiteSpace($OdhenPosRoot)) {
  $TeknisaRoot = Split-Path -Parent $OdhenRoot
  $OdhenPosRoot = Join-Path $TeknisaRoot "odhenPOS"
}

$targets = @(
  [ordered]@{
    path = (Join-Path $OdhenPosRoot "backend_74000\routes.json")
    anchors = @("/DeliveryRepository", "/AllDeliveryRepository")
    before = 8
    after = 16
  },
  [ordered]@{
    path = (Join-Path $OdhenPosRoot "backend_74000\src\Controller\Delivery.php")
    anchors = @("function getDeliveryOrders", "function getAllDeliveryOrders")
    before = 4
    after = 36
  },
  [ordered]@{
    path = (Join-Path $OdhenPosRoot "backend_74000\src\Service\Delivery.php")
    anchors = @("function getAllDeliveryOrders", "function getProdutosDlv", "function getMovcaixadlv")
    before = 4
    after = 48
  },
  [ordered]@{
    path = (Join-Path $OdhenPosRoot "backend_74000\src\Util\MSDEQuery.php")
    anchors = @("GET_ALL_DELIVERY_ORDERS", "GET_PRODUTOS_PEDIDODLV")
    before = 4
    after = 72
  },
  [ordered]@{
    path = (Join-Path $OdhenPosRoot "mobile\js\repositories\DeliveryRepository.js")
    anchors = @("DeliveryRepository", "RepositoryFactory.factory")
    before = 2
    after = 28
  },
  [ordered]@{
    path = (Join-Path $OdhenPosRoot "mobile\js\services\DeliveryService.js")
    anchors = @("DeliveryRepository.download", "getDeliveryOrders", "getAllDeliveryOrders")
    before = 2
    after = 32
  }
)

$result = [ordered]@{
  schema = "deliveryos.odhen-read-path-targeted-probe.v1"
  mode = "READ_ONLY_EXACT_FILES_BOUNDED_CONTEXT"
  captured_at = (Get-Date).ToString("o")
  targets = @()
  excerpts = @()
  errors = @()
  effects = [ordered]@{
    process_start = $false
    http = $false
    database_query = $false
    database_write = $false
    order_read = $false
    log_read = $false
    fiscal_action = $false
    sefaz_call = $false
    print = $false
    spooler_write = $false
    printer_configuration_change = $false
    network_payload_sent_to_printer = $false
    file_write = $false
    cutover = $false
  }
}

foreach ($target in $targets) {
  $path = [string]$target.path
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    $result.errors += ("TARGET_FILE_NOT_FOUND:" + $path)
    continue
  }

  $result.targets += [ordered]@{
    path = $path
    sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    length = (Get-Item -LiteralPath $path).Length
    anchors = $target.anchors
  }

  foreach ($anchor in $target.anchors) {
    $hits = @(Select-String -LiteralPath $path -SimpleMatch -Pattern $anchor -Context $target.before,$target.after -ErrorAction SilentlyContinue)

    if ($hits.Count -eq 0) {
      $result.errors += ("ANCHOR_NOT_FOUND:" + $path + ":" + $anchor)
      continue
    }

    foreach ($hit in $hits) {
      $context = @()
      foreach ($line in @($hit.Context.PreContext)) { $context += [string]$line }
      $context += [string]$hit.Line
      foreach ($line in @($hit.Context.PostContext)) { $context += [string]$line }

      $result.excerpts += [ordered]@{
        anchor = $anchor
        path = $path
        match_line = $hit.LineNumber
        context_start_line = [Math]::Max(1, $hit.LineNumber - [int]$target.before)
        context_end_line = $hit.LineNumber + [int]$target.after
        context = $context
      }
    }
  }
}

$result | ConvertTo-Json -Depth 10

if ($result.errors.Count -gt 0) { exit 2 }
exit 0

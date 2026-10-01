param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos",
  [string]$OdhenPosRoot = "",
  [int]$ContextBefore = 4,
  [int]$ContextAfter = 8,
  [int]$MaxMatchesPerTokenPerFile = 8
)

$ErrorActionPreference = "Stop"

# SOURCE SEMANTICS PROBE.
# Reads bounded source-code context only from a strict file-name whitelist under
# the four already-proven code roots. No logs, no SQL, no network, no processes,
# no printing, no order rows, no config mutation.

if ([string]::IsNullOrWhiteSpace($OdhenPosRoot)) {
  $TeknisaRoot = Split-Path -Parent $OdhenRoot
  $OdhenPosRoot = Join-Path $TeknisaRoot "odhenPOS"
}

$roots = @(
  (Join-Path $OdhenRoot "src"),
  (Join-Path $OdhenRoot "routes"),
  (Join-Path $OdhenPosRoot "mobile"),
  (Join-Path $OdhenPosRoot "backend_74000")
)

$allowedFileNames = @(
  "routes.json",
  "Delivery.php",
  "MSDEQuery.php",
  "ImpressaoDelivery.php",
  "Printing.php",
  "imp.js",
  "index.js",
  "DeliveryRepository.js",
  "DeliveryService.js",
  "PerifericosService.js",
  "DeliveryController.js",
  "orderDelivery.json"
)

$tokens = @(
  "DeliveryRepository",
  "getAllDeliveryOrders",
  "BUSCA_ITPEDIDO_ENTREGA",
  "NRCOMANDA",
  "NRCOMANDAEXT",
  "NRVENDAREST",
  "CDPRODUTO",
  "NMPRODUTO",
  "QTPRODCOMVEN",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "TXPRODCOMVEN"
)

$result = [ordered]@{
  schema = "deliveryos.odhen-source-semantics-probe.v1"
  mode = "READ_ONLY_BOUNDED_SOURCE_CONTEXT"
  captured_at = (Get-Date).ToString("o")
  roots = $roots
  allowed_file_names = $allowedFileNames
  context_before = $ContextBefore
  context_after = $ContextAfter
  max_matches_per_token_per_file = $MaxMatchesPerTokenPerFile
  files_considered = @()
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

$files = @()
foreach ($root in $roots) {
  if (-not (Test-Path -LiteralPath $root -PathType Container)) {
    $result.errors += ("ROOT_NOT_FOUND:" + $root)
    continue
  }

  $files += Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $allowedFileNames -contains $_.Name -and
      $_.FullName -notmatch "\\Log(\\|$)" -and
      $_.FullName -notmatch "\\Logs(\\|$)" -and
      $_.FullName -notmatch "\\Temp(\\|$)" -and
      $_.FullName -notmatch "\\cache(\\|$)" -and
      $_.FullName -notmatch "\\node_modules(\\|$)" -and\n      $_.FullName -notmatch "\\bower_components(\\|$)"
    }
}

$files = @($files | Sort-Object FullName -Unique)

foreach ($file in $files) {
  $result.files_considered += [ordered]@{
    path = $file.FullName
    sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    length = $file.Length
  }

  foreach ($token in $tokens) {
    $hits = @(Select-String -LiteralPath $file.FullName -SimpleMatch -Pattern $token -Context $ContextBefore,$ContextAfter -ErrorAction SilentlyContinue |
      Select-Object -First $MaxMatchesPerTokenPerFile)

    foreach ($hit in $hits) {
      $contextLines = @()

      foreach ($pre in @($hit.Context.PreContext)) {
        $contextLines += [string]$pre
      }

      $contextLines += [string]$hit.Line

      foreach ($post in @($hit.Context.PostContext)) {
        $contextLines += [string]$post
      }

      $result.excerpts += [ordered]@{
        token = $token
        path = $file.FullName
        match_line = $hit.LineNumber
        context_start_line = [Math]::Max(1, $hit.LineNumber - $ContextBefore)
        context_end_line = $hit.LineNumber + $ContextAfter
        context = $contextLines
      }
    }
  }
}

$result | ConvertTo-Json -Depth 10

if ($result.errors.Count -gt 0) { exit 2 }
if ($result.excerpts.Count -eq 0) { exit 4 }
exit 0

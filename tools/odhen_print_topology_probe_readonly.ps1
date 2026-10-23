param(
  [string]$TeknisaRoot = "C:\TEKNISA"
)

$ErrorActionPreference = "Stop"

# TARGETED SOURCE-ONLY PRINT-TOPOLOGY PROBE.
# Designed after the 2026-09-30 CAIXA_MOOCA source audit.
# Reads only a small allowlist of known code files.
# It never opens Log/Logs, reads orders, queries SQL, calls HTTP/print,
# starts processes, reads credential files, or writes files.

$relativeCandidates = @(
  "odhenPOS\backend_74000\vendor\odhen\api\src\Service\ImpressaoDelivery.php",
  "odhenPOS\backend_74000\vendor\odhen\api\src\Service\ImpressaoPedido.php",
  "odhenPOS\backend_74000\vendor\odhen\api\src\Service\Pedido.php",
  "odhenPOS\backend_74000\vendor\odhen\api\src\Controller\Delivery.php",
  "odhenPOS\backend_74000\vendor\odhen\api\src\Controller\Account.php",
  "odhenPOS\backend_74000\vendor\odhen\api\src\Controller\Payment.php",
  "odhenPOS\backend_74000\vendor\odhen\api\src\Lib\ImpressaoUtil.php",
  "odhenPOS\backend_74000\vendor\odhen\api\src\Remote\Printer\Command.php",
  "odhenPOS\backend_74000\vendor\odhen\api\src\Remote\Printer\Printing.php",
  "odhenPOS\mobile\js\services\PerifericosService.js",
  "odhen-perifericos\routes\imp.js",
  "odhen-perifericos\src\IMP\index.js",
  "odhen-perifericos\src\IMP\PrinterLibraryHandler.js",
  "odhen-perifericos\src\util\dbModelCache.js",
  "odhen-perifericos\src\util\Log.js"
)

$tokens = @(
  "ImpressaoDelivery",
  "montaImpressaoDelivery",
  "imprimePedido",
  "montaPedido",
  "TXPRODCOMVEN",
  "QTPRODCOMVEN",
  "NRCOMANDA",
  "NRCOMANDAEXT",
  "DSCOMANDA",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "configuracaoPonte",
  "impressaoPedidos",
  "sendPrint",
  "/print",
  "saveItemRequest",
  "arrFila",
  "printDocs",
  "printCommands",
  "LogIMP",
  "formatTX",
  "salvaLogDetalhadoIMP",
  "IDUTILIMPFRONT",
  "UTILIZA_IMPRESSAO_PONTE"
)

$result = [ordered]@{
  schema = "deliveryos.shadow.odhen.print-topology.targeted-probe.v2"
  mode = "READ_ONLY_TARGETED_SOURCE_CODE_ONLY"
  root = $TeknisaRoot
  files_considered = 0
  files_read = 0
  skipped = @()
  hits = [System.Collections.Generic.List[object]]::new()
  effects = [ordered]@{
    log_read = $false
    order_read = $false
    database_query = $false
    http = $false
    print = $false
    process_start = $false
    credential_read = $false
    file_write = $false
    odhen_change = $false
  }
  errors = @()
}

foreach ($relative in $relativeCandidates) {
  $result.files_considered++
  $full = Join-Path $TeknisaRoot $relative

  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
    $result.skipped += $relative
    continue
  }

  try {
    $result.files_read++
    $lines = Get-Content -LiteralPath $full -ErrorAction Stop
    for ($i = 0; $i -lt $lines.Count; $i++) {
      $line = [string]$lines[$i]
      foreach ($token in $tokens) {
        if ($line.IndexOf($token, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
          $clean = $line.Trim()
          if ($clean.Length -gt 240) {
            $clean = $clean.Substring(0, 240) + "..."
          }
          $result.hits.Add([pscustomobject]@{
            token = $token
            path = $relative
            line = $i + 1
            code = $clean
          })
        }
      }
    }
  } catch {
    $result.errors += ("READ_ERROR:" + $relative)
  }
}

$result | ConvertTo-Json -Depth 8

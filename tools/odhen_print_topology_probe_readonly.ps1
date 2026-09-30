param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos"
)

$ErrorActionPreference = "Stop"

# SOURCE-ONLY PRINT-TOPOLOGY PROBE.
# Reads code files only. It does not touch Log/Logs, order data, SQL, HTTP,
# printer devices, processes, credential files or operational payloads.

$codeRoots = @(
  (Join-Path $OdhenRoot "perifericos\src"),
  (Join-Path $OdhenRoot "perifericos\routes"),
  (Join-Path $OdhenRoot "odhenPOS\mobile"),
  (Join-Path $OdhenRoot "odhenPOS\backend_74000")
)

$tokens = @(
  "ImpressaoDelivery",
  "montaImpressaoDelivery",
  "ImpressaoUtil",
  "impressaoPedidos",
  "Printing",
  "sendPrint",
  "/print",
  "saveItemRequest",
  "arrFila",
  "printDocs",
  "printCommands",
  "LogIMP",
  "formatTX",
  "PrinterLibraryHandler",
  "salvaLogDetalhadoIMP",
  "salvaimpressao",
  "salvarequisicoes",
  "TXPRODCOMVEN",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "NRCOMANDA",
  "NRCOMANDAEXT",
  "NRVENDAREST",
  "QTPRODCOMVEN",
  "NMPRODUTO",
  "CDPRODUTO",
  "modelo",
  "porta",
  "printer",
  "impressora",
  "fila",
  "setor",
  "praca",
  "cozinha",
  "producao"
)

$result = [ordered]@{
  schema = "deliveryos.shadow.odhen.print-topology.source-probe.v1"
  mode = "READ_ONLY_SOURCE_CODE_ONLY"
  root = $OdhenRoot
  root_exists = $false
  scanned_roots = @()
  skipped_roots = @()
  files_scanned = 0
  hits = @()
  effects = [ordered]@{
    log_read = $false
    order_read = $false
    database_query = $false
    http = $false
    print = $false
    process_start = $false
    file_write = $false
    odhen_change = $false
  }
  errors = @()
}

if (-not (Test-Path -LiteralPath $OdhenRoot -PathType Container)) {
  $result.errors += "ODHEN_ROOT_NOT_FOUND"
  $result | ConvertTo-Json -Depth 8
  exit 2
}

$result.root_exists = $true

$extensions = @(".js", ".ts", ".php")
$files = @()

foreach ($root in $codeRoots) {
  if (Test-Path -LiteralPath $root -PathType Container) {
    $result.scanned_roots += $root
    $files += Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object {
        $extensions -contains $_.Extension.ToLowerInvariant() -and
        $_.FullName -notmatch "\\Log(\\|$)" -and
        $_.FullName -notmatch "\\Logs(\\|$)" -and
        $_.FullName -notmatch "\\Temp(\\|$)" -and
        $_.FullName -notmatch "\\cache(\\|$)" -and
        $_.FullName -notmatch "\\node_modules(\\|$)"
      }
  } else {
    $result.skipped_roots += $root
  }
}

$files = @($files | Sort-Object FullName -Unique)
$result.files_scanned = $files.Count

foreach ($file in $files) {
  try {
    $lines = Get-Content -LiteralPath $file.FullName -ErrorAction Stop
    for ($i = 0; $i -lt $lines.Count; $i++) {
      $line = [string]$lines[$i]
      foreach ($token in $tokens) {
        if ($line.IndexOf($token, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
          $clean = $line.Trim()
          if ($clean.Length -gt 240) {
            $clean = $clean.Substring(0, 240) + "..."
          }
          $result.hits += [ordered]@{
            token = $token
            path = $file.FullName
            line = $i + 1
            code = $clean
          }
        }
      }
    }
  } catch {
    $result.errors += ("READ_ERROR:" + $file.FullName)
  }
}

$result | ConvertTo-Json -Depth 8

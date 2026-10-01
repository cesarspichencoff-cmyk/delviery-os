param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos"
)

$ErrorActionPreference = "Stop"

# SOURCE/CONFIG METADATA-ONLY PROBE.
# Finds candidate native fiscal surfaces without reading order rows, starting
# processes, calling HTTP/SEFAZ, printing, or mutating configuration.

$roots = @(
  (Join-Path $OdhenRoot "perifericos\src"),
  (Join-Path $OdhenRoot "perifericos\routes"),
  (Join-Path $OdhenRoot "odhenPOS\mobile"),
  (Join-Path $OdhenRoot "odhenPOS\backend_74000")
)

$tokens = @(
  "NFCe",
  "NFC-e",
  "SEFAZ",
  "DANFE",
  "QRCode",
  "QR Code",
  "Transmissao Automatica",
  "Transmissão Automática",
  "CSC",
  "certificado",
  "cupom fiscal",
  "fiscal",
  "Interface"
)

$result = [ordered]@{
  schema = "deliveryos.odhen-fiscal-surface-probe.v1"
  mode = "READ_ONLY_SOURCE_CONFIG_METADATA_ONLY"
  root = $OdhenRoot
  root_exists = $false
  scanned_roots = @()
  files_scanned = 0
  token_hits = @()
  effects = [ordered]@{
    process_start = $false
    http = $false
    sefaz_call = $false
    database_query = $false
    database_write = $false
    order_read = $false
    fiscal_action = $false
    print = $false
    file_write = $false
  }
}

if (-not (Test-Path -LiteralPath $OdhenRoot -PathType Container)) {
  $result | ConvertTo-Json -Depth 8
  exit 2
}

$result.root_exists = $true
$extensions = @(".js", ".ts", ".json", ".config", ".txt", ".sql", ".xml", ".yml", ".yaml", ".php", ".ini", ".env", ".properties")
$files = @()
foreach ($root in $roots) {
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
  }
}

$files = @($files | Sort-Object FullName -Unique)
$result.files_scanned = $files.Count

foreach ($file in $files) {
  foreach ($token in $tokens) {
    $hits = Select-String -LiteralPath $file.FullName -SimpleMatch -Pattern $token -ErrorAction SilentlyContinue
    foreach ($hit in $hits) {
      $result.token_hits += [ordered]@{
        token = $token
        path = $file.FullName
        line = $hit.LineNumber
      }
    }
  }
}

$result | ConvertTo-Json -Depth 8
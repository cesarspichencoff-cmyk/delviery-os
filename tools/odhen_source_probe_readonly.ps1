param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos"
)

$ErrorActionPreference = "Stop"

# SOURCE-ONLY PROBE.
# It never starts Perifericos.exe, never calls HTTP, never reads orders and never writes files.

$tokens = @(
  "DeliveryRepository",
  "getAllDeliveryOrders",
  "NRCOMANDA",
  "NRCOMANDAEXT",
  "NRVENDAREST",
  "CDPRODUTO",
  "NMPRODUTO",
  "QTPRODCOMVEN",
  "BUSCA_ITPEDIDO_ENTREGA",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "/print"
)

$result = [ordered]@{
  schema = "deliveryos.shadow.odhen.source-probe.v132"
  mode = "READ_ONLY_SOURCE_CODE_ONLY"
  root = $OdhenRoot
  root_exists = $false
  effects = [ordered]@{
    process_start = $false
    http = $false
    database_query = $false
    database_write = $false
    order_read = $false
    print = $false
    file_write = $false
  }
  files_scanned = 0
  file_hashes = @()
  token_hits = @()
  errors = @()
}

if (-not (Test-Path -LiteralPath $OdhenRoot -PathType Container)) {
  $result.errors += "ODHEN_ROOT_NOT_FOUND"
  $result | ConvertTo-Json -Depth 8
  exit 2
}

$result.root_exists = $true

$extensions = @(".js", ".ts", ".json", ".config", ".txt", ".sql", ".xml", ".yml", ".yaml")
$files = Get-ChildItem -LiteralPath $OdhenRoot -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() }

$result.files_scanned = @($files).Count

foreach ($file in $files) {
  try {
    $hash = Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256
    $result.file_hashes += [ordered]@{
      path = $file.FullName
      sha256 = $hash.Hash
      length = $file.Length
      last_write_utc = $file.LastWriteTimeUtc.ToString("o")
    }

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
  catch {
    $result.errors += ("READ_ERROR:" + $file.FullName)
  }
}

$result | ConvertTo-Json -Depth 8

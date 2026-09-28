param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos"
)

$ErrorActionPreference = "Stop"

# SOURCE-ONLY PROBE.
# It never starts Perifericos.exe, never calls HTTP, never queries the database,
# never reads orders and never writes files.
#
# IMPORTANT: intentionally scans only code/config roots and excludes Log/Temp/cache
# trees so the probe does not touch large operational logs that may contain orders.

$codeRoots = @(
  (Join-Path $OdhenRoot "perifericos\src"),
  (Join-Path $OdhenRoot "perifericos\routes"),
  (Join-Path $OdhenRoot "odhenPOS\mobile"),
  (Join-Path $OdhenRoot "odhenPOS\backend_74000")
)

$tokenSpecs = @(
  @{ token = "DeliveryRepository"; caseSensitive = $false },
  @{ token = "getAllDeliveryOrders"; caseSensitive = $false },
  @{ token = "NRCOMANDA"; caseSensitive = $false },
  @{ token = "NRCOMANDAEXT"; caseSensitive = $false },
  @{ token = "NRVENDAREST"; caseSensitive = $false },
  @{ token = "CDPRODUTO"; caseSensitive = $false },
  @{ token = "NMPRODUTO"; caseSensitive = $false },
  @{ token = "QTPRODCOMVEN"; caseSensitive = $false },
  @{ token = "BUSCA_ITPEDIDO_ENTREGA"; caseSensitive = $false },
  @{ token = "DSOBSDESCIT"; caseSensitive = $false },
  @{ token = "DSOBSPEDDIGCMD"; caseSensitive = $false },
  @{ token = "DSOBSCOMANDA"; caseSensitive = $false },
  @{ token = "TXPRODCOMVEN"; caseSensitive = $false },
  @{ token = "/print"; caseSensitive = $true }
)

$result = [ordered]@{
  schema = "deliveryos.shadow.odhen.source-probe.v132.1"
  mode = "READ_ONLY_SOURCE_CODE_ONLY"
  root = $OdhenRoot
  root_exists = $false
  scanned_roots = @()
  skipped_roots = @()
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

$extensions = @(
  ".js", ".ts", ".json", ".config", ".txt", ".sql", ".xml",
  ".yml", ".yaml", ".php", ".ini", ".env", ".properties"
)

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
  }
  else {
    $result.skipped_roots += $root
  }
}

$files = @($files | Sort-Object FullName -Unique)
$result.files_scanned = $files.Count

foreach ($file in $files) {
  try {
    $hash = Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256
    $result.file_hashes += [ordered]@{
      path = $file.FullName
      sha256 = $hash.Hash
      length = $file.Length
      last_write_utc = $file.LastWriteTimeUtc.ToString("o")
    }

    foreach ($spec in $tokenSpecs) {
      $args = @{
        LiteralPath = $file.FullName
        SimpleMatch = $true
        Pattern = $spec.token
        ErrorAction = "SilentlyContinue"
      }
      if ($spec.caseSensitive) {
        $args.CaseSensitive = $true
      }

      $hits = Select-String @args
      foreach ($hit in $hits) {
        $result.token_hits += [ordered]@{
          token = $spec.token
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

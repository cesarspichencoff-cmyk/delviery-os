param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos",
  [string]$OdhenPosRoot = ""
)

$ErrorActionPreference = "Stop"

# SOURCE-ONLY PROBE.
# It never starts Odhen/Perifericos, never calls HTTP, never queries the database,
# never reads order rows and never writes files.
#
# Topology is based on real CAIXA_MOOCA evidence from 2026-10-01:
# - Perifericos code lives under C:\TEKNISA\odhen-perifericos\{src,routes}
# - Delivery/POS code lives in sibling C:\TEKNISA\odhenPOS\{mobile,backend_74000}
#
# IMPORTANT: scans only code/config roots and excludes Log/Temp/cache/node_modules.

if ([string]::IsNullOrWhiteSpace($OdhenPosRoot)) {
  $TeknisaRoot = Split-Path -Parent $OdhenRoot
  $OdhenPosRoot = Join-Path $TeknisaRoot "odhenPOS"
}

$codeRoots = @(
  (Join-Path $OdhenRoot "src"),
  (Join-Path $OdhenRoot "routes"),
  (Join-Path $OdhenPosRoot "mobile"),
  (Join-Path $OdhenPosRoot "backend_74000")
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
  schema = "deliveryos.shadow.odhen.source-probe.v133.0"
  mode = "READ_ONLY_SOURCE_CODE_ONLY"
  topology_basis = "REAL_CAIXA_MOOCA_2026-10-01"
  perifericos_root = $OdhenRoot
  perifericos_root_exists = $false
  odhen_pos_root = $OdhenPosRoot
  odhen_pos_root_exists = $false
  scanned_roots = @()
  skipped_roots = @()
  effects = [ordered]@{
    process_start = $false
    http = $false
    database_query = $false
    database_write = $false
    order_read = $false
    fiscal_action = $false
    sefaz_call = $false
    print = $false
    spooler_write = $false
    printer_configuration_change = $false
    network_payload_sent_to_printer = $false
    cutover = $false
    file_write = $false
  }
  files_scanned = 0
  file_hashes = @()
  token_hits = @()
  errors = @()
}

$result.perifericos_root_exists = Test-Path -LiteralPath $OdhenRoot -PathType Container
$result.odhen_pos_root_exists = Test-Path -LiteralPath $OdhenPosRoot -PathType Container

if (-not $result.perifericos_root_exists) {
  $result.errors += "PERIFERICOS_ROOT_NOT_FOUND"
}
if (-not $result.odhen_pos_root_exists) {
  $result.errors += "ODHEN_POS_ROOT_NOT_FOUND"
}
if ($result.errors.Count -gt 0) {
  $result | ConvertTo-Json -Depth 8
  exit 2
}

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

if ($result.errors.Count -gt 0) { exit 3 }
exit 0
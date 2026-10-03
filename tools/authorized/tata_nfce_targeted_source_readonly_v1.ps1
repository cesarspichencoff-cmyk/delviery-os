param(
  [string]$AuthorizationId = "CESAR-2026-10-03-TATA-NFCE-SOURCE-READONLY-V1",
  [string]$TeknisaRoot = "C:\TEKNISA"
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-03-TATA-NFCE-SOURCE-READONLY-V1"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$AuthorizationFile = Join-Path $RepoRoot "data\tata_nfce_source_readonly_authorization_v1.json"

function Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Sanitize-Line([string]$Line) {
  if ($null -eq $Line) { return "" }

  $s = $Line

  if ($s -match '(?i)(senha|password|passwd|pwd|secret|token|csc|private[_ -]?key|chave[_ -]?privada)\s*[:=]') {
    return "[REDACTED_SENSITIVE_ASSIGNMENT]"
  }

  if ($s -match '(?i)<\s*(senha|password|passwd|pwd|secret|token|csc|privatekey|chaveprivada)\b[^>]*>') {
    return "[REDACTED_SENSITIVE_XML]"
  }

  if ($s -match '(?i)"(senha|password|passwd|pwd|secret|token|csc|privateKey|chavePrivada)"\s*:') {
    return "[REDACTED_SENSITIVE_JSON]"
  }

  if ($s -match '[A-Za-z0-9+/=]{96,}') {
    return "[REDACTED_LONG_SECRET_LIKE_VALUE]"
  }

  return $s
}

function Add-Range {
  param(
    [hashtable]$Result,
    [string]$Path,
    [int]$Start,
    [int]$End,
    [string[]]$Needles
  )

  $entry = [ordered]@{
    path = $Path
    exists = $false
    sha256 = $null
    ranges = @()
    findings = @()
  }

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    $Result.files += $entry
    return
  }

  $entry.exists = $true
  $entry.sha256 = Hash $Path

  $lines = Get-Content -LiteralPath $Path -ErrorAction Stop
  $lo = [Math]::Max(1,$Start)
  $hi = [Math]::Min($End,$lines.Count)
  $entry.ranges += [ordered]@{ start = $lo; end = $hi }

  for ($i = $lo; $i -le $hi; $i++) {
    $line = [string]$lines[$i-1]
    $matched = $false
    foreach ($needle in $Needles) {
      if ($line -match [regex]::Escape($needle)) {
        $matched = $true
        break
      }
    }

    if ($matched) {
      $ctxLo = [Math]::Max($lo,$i-2)
      $ctxHi = [Math]::Min($hi,$i+2)

      $context = @()
      for ($j=$ctxLo; $j -le $ctxHi; $j++) {
        $context += [ordered]@{
          line = $j
          text = Sanitize-Line ([string]$lines[$j-1])
        }
      }

      $entry.findings += [ordered]@{
        matched_line = $i
        context = $context
      }
    }
  }

  $Result.files += $entry
}

if ($AuthorizationId -ne $ExpectedAuthorizationId) { throw "AUTHORIZATION_ID_MISMATCH" }
if (-not (Test-Path -LiteralPath $AuthorizationFile -PathType Leaf)) { throw "NFCE_SOURCE_AUTHORIZATION_FILE_MISSING" }

$auth = Get-Content -LiteralPath $AuthorizationFile -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not [bool]$auth.human_authorized) { throw "NFCE_SOURCE_HUMAN_AUTHORIZATION_FALSE" }
if ($auth.authorization_id -ne $ExpectedAuthorizationId) { throw "NFCE_SOURCE_AUTHORIZATION_ID_FILE_MISMATCH" }
if ((Hash $PSCommandPath) -ne [string]$auth.discovery_script_sha256) { throw "NFCE_SOURCE_SCRIPT_HASH_MISMATCH" }

$backend = Join-Path $TeknisaRoot "odhenPOS\backend_74000"

$result = [ordered]@{
  schema = "deliveryos.tata-nfce-targeted-source-readonly.v1"
  mode = "TARGETED_SANITIZED_SOURCE_READ_ONLY"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  files = @()
  effects = [ordered]@{
    order_read = $false
    database_query = $false
    database_write = $false
    odhen_write = $false
    config_write = $false
    process_start = $false
    service_change = $false
    printer_change = $false
    print = $false
    http = $false
    sefaz_call = $false
    fiscal_action = $false
    danfe_print = $false
    cutover = $false
  }
  error = $null
}

$needles = @(
  "NFCe","NFC-e","DANFE","fiscal","Fiscal","QRCode","QR Code",
  "certificado","Certificado","impress","Impress","delivery","Delivery",
  "pagamento","Pagamento","transmiss","Transmiss","automatic","Automatic",
  "conting","Conting","Interface","caixa","Caixa","printer","Printer"
)

try {
  Add-Range -Result $result -Path (Join-Path $backend "environment.xml") -Start 18 -End 35 -Needles $needles
  Add-Range -Result $result -Path (Join-Path $backend "services.xml") -Start 185 -End 230 -Needles $needles
  Add-Range -Result $result -Path (Join-Path $backend "services.xml") -Start 345 -End 375 -Needles $needles
  Add-Range -Result $result -Path (Join-Path $backend "routes.json") -Start 830 -End 850 -Needles $needles
  Add-Range -Result $result -Path (Join-Path $backend "routes.json") -Start 1255 -End 1280 -Needles $needles

  Add-Range -Result $result -Path (Join-Path $backend "src\Controller\Delivery.php") -Start 190 -End 290 -Needles $needles
  Add-Range -Result $result -Path (Join-Path $backend "src\Controller\Delivery.php") -Start 370 -End 400 -Needles $needles

  Add-Range -Result $result -Path (Join-Path $backend "src\Controller\Payment.php") -Start 820 -End 935 -Needles $needles
  Add-Range -Result $result -Path (Join-Path $backend "src\Controller\Payment.php") -Start 1000 -End 1035 -Needles $needles
  Add-Range -Result $result -Path (Join-Path $backend "src\Controller\Payment.php") -Start 1650 -End 1785 -Needles $needles

  Add-Range -Result $result -Path (Join-Path $backend "src\Controller\FiscalFunctions.php") -Start 1 -End 90 -Needles $needles
  Add-Range -Result $result -Path (Join-Path $backend "src\Service\FiscalFunctions.php") -Start 1 -End 90 -Needles $needles

  Add-Range -Result $result -Path (Join-Path $backend "src\Service\GeneralFunctions.php") -Start 1 -End 210 -Needles $needles
  Add-Range -Result $result -Path (Join-Path $backend "src\Service\GeneralFunctions.php") -Start 870 -End 935 -Needles $needles

  Add-Range -Result $result -Path (Join-Path $backend "src\Service\Operator.php") -Start 770 -End 845 -Needles $needles

  $result.status = "PROVEN_TARGETED_SANITIZED_SOURCE_READ"
}
catch {
  $result.status = "TARGETED_SOURCE_READ_FAILED"
  $result.error = [string]$_.Exception.Message
}

$result | ConvertTo-Json -Depth 12
if ($result.status -eq "PROVEN_TARGETED_SANITIZED_SOURCE_READ") { exit 0 }
exit 4

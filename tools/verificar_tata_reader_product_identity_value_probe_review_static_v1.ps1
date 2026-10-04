param(
  [string]$ProbePath = (Join-Path $PSScriptRoot "tata_reader_product_identity_value_probe_REVIEW_ONLY.ps1")
)

$ErrorActionPreference = "Stop"

try {
  if (-not (Test-Path -LiteralPath $ProbePath -PathType Leaf)) {
    throw ("probe-not-found: " + $ProbePath)
  }

  $s = Get-Content -LiteralPath $ProbePath -Raw

  $required = @(
    "READ_ONLY_TWO_PRODUCT_ROWS_REVIEW_ONLY",
    '"0000001459","0000001641"',
    "SELECT TOP (3)",
    "p.CDPRODUTO",
    "p.CDPRODINTE",
    "p.CDARVPROD",
    "p.CDPRODESTO",
    "FROM TEKNISA.PRODUTO p",
    "WHERE p.CDPRODUTO IN (@p1,@p2)",
    "ROW_BOUND_EXCEEDED",
    'product_row_read = $false',
    'database_write = $false',
    'permission_change = $false',
    'order_row_read = $false',
    'print = $false',
    'fiscal_action = $false',
    'cutover = $false'
  )

  foreach ($token in $required) {
    if (-not $s.Contains($token)) {
      throw ("missing guard/token " + $token)
    }
  }

  $forbidden = @(
    'TEKNISA\.(COMANDAVEN|ITCOMANDAVEN|VENDAREST)\b',
    '\bJOIN\b',
    '\bINSERT\b',
    '\bUPDATE\b',
    '\bDELETE\b',
    '\bMERGE\b',
    '\bDROP\b',
    '\bALTER\b',
    '\bCREATE\b',
    '\bGRANT\b',
    '\bREVOKE\b',
    '\bDENY\b',
    '\bEXEC(UTE)?\b',
    'NMPRODUTO',
    '/print'
  )

  foreach ($pattern in $forbidden) {
    if ($s -match $pattern) {
      throw ("forbidden capability/pattern " + $pattern)
    }
  }

  $selectCount = ([regex]::Matches($s,'(?im)^\s*SELECT\b')).Count
  if ($selectCount -ne 2) {
    throw ("unexpected SELECT count " + $selectCount)
  }

  Write-Output "TATA_READER_PRODUCT_IDENTITY_VALUE_PROBE_REVIEW_STATIC_PASS"
  exit 0
}
catch {
  [Console]::Error.WriteLine("product-identity-value-probe-review-static: " + $_.Exception.Message)
  exit 7
}

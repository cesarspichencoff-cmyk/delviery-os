param(
  [string]$ProbePath = (Join-Path $PSScriptRoot "tata_reader_cdarvprod_catalog_audit_REVIEW_ONLY.ps1")
)

$ErrorActionPreference = "Stop"

try {
  if (-not (Test-Path -LiteralPath $ProbePath -PathType Leaf)) {
    throw ("probe-not-found: " + $ProbePath)
  }

  $s = Get-Content -LiteralPath $ProbePath -Raw

  $required = @(
    "READ_ONLY_CDARVPROD_CATALOG_AGGREGATE_REVIEW_ONLY",
    "COUNT_BIG(*) AS total_product_rows",
    "null_or_blank_cdarvprod_rows",
    "distinct_nonblank_cdarvprod",
    "SELECT TOP (2001)",
    "LTRIM(RTRIM(CDARVPROD)) AS [CDARVPROD]",
    "COUNT_BIG(*) AS [product_rows]",
    "FROM TEKNISA.PRODUTO",
    "GROUP BY LTRIM(RTRIM(CDARVPROD))",
    "DISTINCT_VALUE_BOUND_EXCEEDED",
    "DISTINCT_COUNT_MISMATCH",
    'product_catalog_aggregate_read = $false',
    'product_identity_row_read = $false',
    'order_row_read = $false',
    'database_write = $false',
    'permission_change = $false',
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
    '\bCDPRODUTO\b',
    '\bNMPRODUTO\b',
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
    '/print'
  )

  foreach ($pattern in $forbidden) {
    if ($s -match $pattern) {
      throw ("forbidden capability/pattern " + $pattern)
    }
  }

  $selectCount = ([regex]::Matches($s,'(?im)^\s*SELECT\b')).Count
  if ($selectCount -ne 3) {
    throw ("unexpected SELECT count " + $selectCount)
  }

  Write-Output "TATA_READER_CDARVPROD_CATALOG_AUDIT_REVIEW_STATIC_PASS"
  exit 0
}
catch {
  [Console]::Error.WriteLine("cdarvprod-catalog-audit-review-static: " + $_.Exception.Message)
  exit 7
}

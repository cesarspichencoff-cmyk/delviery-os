param(
  [string]$ProbePath = (Join-Path $PSScriptRoot "tata_reader_product_identity_metadata_probe_readonly.ps1")
)

$ErrorActionPreference = "Stop"

try {
  if (-not (Test-Path -LiteralPath $ProbePath -PathType Leaf)) {
    throw ("probe-not-found: " + $ProbePath)
  }

  $s = Get-Content -LiteralPath $ProbePath -Raw

  $required = @(
    "METADATA_ONLY_NO_OPERATIONAL_ROWS",
    "sys.objects",
    "sys.schemas",
    "sys.columns",
    "CDPRODUTO",
    "CDPROINTE",
    "CDPRODINTE",
    "CDARVPROD",
    "CDPRODESTO",
    "operational_rows_read = 0",
    'operational_row_read = $false',
    'database_write = $false',
    'fiscal_action = $false'
  )

  foreach ($token in $required) {
    if (-not $s.Contains($token)) {
      throw ("missing guard/token " + $token)
    }
  }

  $forbidden = @(
    '\bINSERT\b',
    '\bUPDATE\s+TEKNISA\.',
    '\bDELETE\s+FROM\b',
    '\bMERGE\b',
    '\bDROP\b',
    '\bALTER\b',
    '\bCREATE\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER|LOGIN|USER)\b',
    '\bGRANT\b',
    '\bREVOKE\b',
    '\bDENY\b',
    'TEKNISA\.(COMANDAVEN|ITCOMANDAVEN|VENDAREST)\b',
    'FROM\s+TEKNISA\.PRODUTO\b',
    'JOIN\s+TEKNISA\.PRODUTO\b',
    '/print'
  )

  foreach ($pattern in $forbidden) {
    if ($s -match $pattern) {
      throw ("forbidden capability/pattern " + $pattern)
    }
  }

  if ($s -notmatch 'FROM\s+sys\.objects') {
    throw "metadata source sys.objects missing"
  }
  if ($s -notmatch 'JOIN\s+sys\.columns') {
    throw "metadata source sys.columns missing"
  }

  Write-Output "TATA_READER_PRODUCT_IDENTITY_METADATA_PROBE_STATIC_PASS"
  exit 0
}
catch {
  [Console]::Error.WriteLine("product-identity-metadata-probe-static: " + $_.Exception.Message)
  exit 7
}

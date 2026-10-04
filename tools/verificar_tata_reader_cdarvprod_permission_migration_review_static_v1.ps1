param(
  [string]$MigrationPath = (Join-Path $PSScriptRoot "tata_reader_cdarvprod_permission_migration_REVIEW_ONLY.ps1")
)
$ErrorActionPreference="Stop"
try {
  if(-not(Test-Path -LiteralPath $MigrationPath -PathType Leaf)){throw "migration-not-found"}
  $s=Get-Content -LiteralPath $MigrationPath -Raw
  $required=@(
    "PERMISSION_SWAP_NMPRODUTO_TO_CDARVPROD_REVIEW_ONLY",
    "BEFORE_CDPRODUTO_SELECT_NOT_TRUE",
    "BEFORE_NMPRODUTO_SELECT_NOT_TRUE",
    "BEFORE_CDARVPROD_SELECT_NOT_FALSE",
    "REVOKE SELECT ([NMPRODUTO])",
    "GRANT SELECT ([CDARVPROD])",
    "AFTER_NMPRODUTO_SELECT_NOT_FALSE",
    "AFTER_CDARVPROD_SELECT_NOT_TRUE",
    "BeginTransaction",
    "Rollback()",
    "PERMISSION_SWAP_COMMITTED",
    'database_row_read = $false',
    'database_write = $false',
    'service_change = $false',
    'print = $false',
    'fiscal_action = $false',
    'cutover = $false'
  )
  foreach($token in $required){if(-not $s.Contains($token)){throw("missing guard/token "+$token)}}
  $forbidden=@(
    'FROM\s+TEKNISA\.',
    'JOIN\s+TEKNISA\.',
    '\bINSERT\b',
    '\bUPDATE\b',
    '\bDELETE\b',
    '\bMERGE\b',
    '\bDROP\b',
    '\bALTER\b',
    '\bCREATE\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER)\b',
    'COMANDAVEN',
    'ITCOMANDAVEN',
    'VENDAREST',
    '/print'
  )
  foreach($pattern in $forbidden){if($s-match$pattern){throw("forbidden capability/pattern "+$pattern)}}
  Write-Output "TATA_READER_CDARVPROD_PERMISSION_MIGRATION_REVIEW_STATIC_PASS"
  exit 0
}
catch{
  [Console]::Error.WriteLine("cdarvprod-permission-migration-review-static: "+$_.Exception.Message)
  exit 7
}

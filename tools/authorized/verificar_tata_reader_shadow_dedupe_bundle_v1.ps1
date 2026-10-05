param()
$ErrorActionPreference="Stop"
$RepoRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
function Text([string]$p){Get-Content -LiteralPath (Join-Path $RepoRoot $p) -Raw -Encoding UTF8}
function Assert([bool]$ok,[string]$msg){ if (-not $ok) { throw $msg } }

$dedupe=Text "tools\authorized\tata_reader_shadow_dedupe_v1.ps1"
$runner=Text "tools\authorized\tata_reader_shadow_dedupe_cycle_runner_v1.ps1"
$authPath=Join-Path $RepoRoot "data\tata_reader_shadow_dedupe_authorization_v1.json"

$dt=$null;$de=$null
[System.Management.Automation.Language.Parser]::ParseInput($dedupe,[ref]$dt,[ref]$de)|Out-Null
Assert ($de.Count -eq 0) ("DEDUPE_SCRIPT_SYNTAX_ERROR:"+($de -join " | "))
$rt=$null;$re=$null
[System.Management.Automation.Language.Parser]::ParseInput($runner,[ref]$rt,[ref]$re)|Out-Null
Assert ($re.Count -eq 0) ("RUNNER_SYNTAX_ERROR:"+($re -join " | "))

foreach($token in @(
  'REPLAY_DEDUPE_PROOF_NO_PRINT',
  '956110A442164E380A7097CF3078B8C855C79EE79C8AEED97CB22099C86F6AC6',
  'shadow-dedupe-proof-state-v1.json',
  'NEW_SHADOW_ORDER_RECORDED',
  'DUPLICATE_SHADOW_ORDER_NO_ACTION',
  'SHA256',
  'database_read = $false',
  'database_write = $false',
  'network_call = $false',
  'print = $false',
  'fiscal_action = $false',
  'cutover = $false'
)){Assert ($dedupe.Contains($token))("DEDUPE_REQUIRED_TOKEN_MISSING:"+$token)}

foreach($forbidden in @(
  'SqlConnection','TEKNISA.','COMANDAVEN','ITCOMANDAVEN','VENDAREST',
  'Invoke-WebRequest','Invoke-RestMethod','System.Net.Http',
  'Out-Printer','WritePrinter','StartDocPrinter','/print',
  'INSERT ','UPDATE ','DELETE ','MERGE ','GRANT ','REVOKE ','DENY '
)){Assert (-not $dedupe.ToUpperInvariant().Contains($forbidden.ToUpperInvariant()))("DEDUPE_FORBIDDEN_SURFACE:"+$forbidden)}

foreach($token in @(
  'Run-OneCycle "run1"',
  'Run-OneCycle "run2"',
  'PROVEN_REPLAY_DEDUPLICATION',
  'state_restored',
  'input_restored',
  'evidence_restored',
  'service_stopped',
  'INSTALLED_PREFLIGHT_HASH_MISMATCH'
)){Assert ($runner.Contains($token))("RUNNER_REQUIRED_TOKEN_MISSING:"+$token)}

if(Test-Path $authPath -PathType Leaf){
  $auth=Get-Content $authPath -Raw -Encoding UTF8|ConvertFrom-Json
  $dh=(Get-FileHash (Join-Path $RepoRoot "tools\authorized\tata_reader_shadow_dedupe_v1.ps1") -Algorithm SHA256).Hash
  $rh=(Get-FileHash (Join-Path $RepoRoot "tools\authorized\tata_reader_shadow_dedupe_cycle_runner_v1.ps1") -Algorithm SHA256).Hash
  $ih=(Get-FileHash (Join-Path $RepoRoot "data\tata_reader_shadow_route_success_20261005_v1.json") -Algorithm SHA256).Hash
  Assert ([string]::Equals($dh,[string]$auth.dedupe_script.sha256,[System.StringComparison]::OrdinalIgnoreCase))"AUTH_DEDUPE_HASH_MISMATCH"
  Assert ([string]::Equals($rh,[string]$auth.runner.sha256,[System.StringComparison]::OrdinalIgnoreCase))"AUTH_RUNNER_HASH_MISMATCH"
  Assert ([string]::Equals($ih,[string]$auth.input.sha256,[System.StringComparison]::OrdinalIgnoreCase))"AUTH_INPUT_HASH_MISMATCH"
}

[ordered]@{
  schema="deliveryos.tata-reader-shadow-dedupe-bundle-static.v1"
  passed=$true
  operational_effect=$false
  ready_for_authorized_dedupe=(Test-Path $authPath -PathType Leaf)
}|ConvertTo-Json -Depth 4

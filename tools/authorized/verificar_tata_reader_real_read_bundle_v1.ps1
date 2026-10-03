param()

$ErrorActionPreference="Stop"
$RepoRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Text([string]$p){ Get-Content -LiteralPath (Join-Path $RepoRoot $p) -Raw -Encoding UTF8 }
function Assert([bool]$ok,[string]$msg){ if(-not $ok){ throw $msg } }

$read=Text "tools\authorized\tata_reader_real_order_read_v1.ps1"
$runner=Text "tools\authorized\tata_reader_real_read_cycle_runner_v1.ps1"
$authPath=Join-Path $RepoRoot "data\tata_reader_real_read_authorization_v1.json"

$rt=$null;$re=$null
[System.Management.Automation.Language.Parser]::ParseInput($read,[ref]$rt,[ref]$re)|Out-Null
Assert ($re.Count -eq 0) ("READ_SCRIPT_SYNTAX_ERROR:"+($re -join " | "))
$xt=$null;$xe=$null
[System.Management.Automation.Language.Parser]::ParseInput($runner,[ref]$xt,[ref]$xe)|Out-Null
Assert ($xe.Count -eq 0) ("RUNNER_SYNTAX_ERROR:"+($xe -join " | "))

Assert ($read.Contains('READ_ONLY_MINIMIZED_REAL_ORDER')) "READ_MODE_MARKER_MISSING"
Assert ($read.Contains('TOP (1)')) "ORDER_LIMIT_ONE_MISSING"
Assert ($read.Contains('TOP (20)')) "ITEM_LIMIT_MISSING"
Assert ($read.Contains("NRCOMANDAEXT")) "NRCOMANDAEXT_MISSING"
Assert ($read.Contains("CDPRODUTO")) "CDPRODUTO_MISSING"
Assert ($read.Contains("QTPRODCOMVEN")) "QTPRODCOMVEN_MISSING"
Assert ($read.Contains("customer_pii_fields_read = $false")) "PII_BOUNDARY_MISSING"
Assert ($read.Contains("observations_read = $false")) "OBSERVATION_BOUNDARY_MISSING"

foreach($forbidden in @(
  "INSERT ","UPDATE ","DELETE ","MERGE ","CREATE ","ALTER ","DROP ","GRANT ","DENY ","REVOKE ",
  "EXEC ","EXECUTE ","TRUNCATE ","DBCC ","sp_configure","xp_cmdshell",
  "Out-Printer","WritePrinter","StartDocPrinter","SEFAZ","NFC-e","NFCE","DANFE"
)){
  Assert (-not $read.ToUpperInvariant().Contains($forbidden.ToUpperInvariant())) ("READ_SCRIPT_FORBIDDEN_SURFACE:"+$forbidden)
}

Assert ($runner.Contains("runtime_restored")) "RUNNER_RESTORE_PROOF_MISSING"
Assert ($runner.Contains("service_stopped")) "RUNNER_SERVICE_STOP_PROOF_MISSING"
Assert ($runner.Contains("INSTALLED_PREFLIGHT_HASH_MISMATCH")) "RUNNER_PREFLIGHT_GUARD_MISSING"
Assert ($runner.Contains("Start-Service -Name $ExpectedServiceName")) "RUNNER_SERVICE_START_MISSING"
Assert ($runner.Contains("Copy-Item -LiteralPath $backupPath -Destination $InstalledScript")) "RUNNER_PREFLIGHT_RESTORE_MISSING"

if(Test-Path -LiteralPath $authPath -PathType Leaf){
  $auth=Get-Content -LiteralPath $authPath -Raw -Encoding UTF8|ConvertFrom-Json
  $actualRead=(Get-FileHash -LiteralPath (Join-Path $RepoRoot "tools\authorized\tata_reader_real_order_read_v1.ps1") -Algorithm SHA256).Hash
  $actualRunner=(Get-FileHash -LiteralPath (Join-Path $RepoRoot "tools\authorized\tata_reader_real_read_cycle_runner_v1.ps1") -Algorithm SHA256).Hash
  Assert ([string]::Equals($actualRead,[string]$auth.read_script_sha256,[System.StringComparison]::OrdinalIgnoreCase)) "AUTH_READ_SCRIPT_HASH_MISMATCH"
  Assert ([string]::Equals($actualRunner,[string]$auth.runner_sha256,[System.StringComparison]::OrdinalIgnoreCase)) "AUTH_RUNNER_HASH_MISMATCH"
}

[ordered]@{
  schema="deliveryos.tata-reader-real-read-bundle-static.v1"
  passed=$true
  administrative_effect=$false
  real_order_read_effect=$false
  ready_for_authorized_real_read=(Test-Path -LiteralPath $authPath -PathType Leaf)
}|ConvertTo-Json -Depth 4

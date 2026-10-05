param()
$ErrorActionPreference="Stop"
$RepoRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Text([string]$p){ Get-Content -LiteralPath (Join-Path $RepoRoot $p) -Raw -Encoding UTF8 }
function Assert([bool]$ok,[string]$msg){ if(-not $ok){ throw $msg } }

$shadow=Text "tools\authorized\tata_reader_real_order_shadow_route_v1.ps1"
$runner=Text "tools\authorized\tata_reader_shadow_route_cycle_runner_v1.ps1"
$authPath=Join-Path $RepoRoot "data\tata_reader_shadow_route_authorization_v1.json"

$st=$null;$se=$null
[System.Management.Automation.Language.Parser]::ParseInput($shadow,[ref]$st,[ref]$se)|Out-Null
Assert ($se.Count -eq 0) ("SHADOW_SCRIPT_SYNTAX_ERROR:"+($se -join " | "))
$rt=$null;$re=$null
[System.Management.Automation.Language.Parser]::ParseInput($runner,[ref]$rt,[ref]$re)|Out-Null
Assert ($re.Count -eq 0) ("RUNNER_SYNTAX_ERROR:"+($re -join " | "))

foreach($token in @(
  'READ_ONLY_REAL_ORDER_CDARVPROD_EXPECTED_ROUTE_NO_PRINT',
  'TOP (1)','TOP (20)','CDARVPROD',
  '$ExpectedFilial = "0001"','$ExpectedLoja = "01"',
  '7084771026CA54F10069F02E0BABCAA00F9C7666484CBAF80EC1ECDCDCAA165D',
  'F37DAE40779C5A205A26CEB289CD748D1C7747C1947C278F534A2DCC2F296F4C',
  'PRODUCT_ROUTE_NOT_FOUND','PRINTER_NOT_FOUND','PRINTER_IP_MISSING',
  'PROVEN_REAL_ORDER_SHADOW_ROUTE',
  'customer_pii_fields_read = $false',
  'observations_read = $false',
  'product_name_read = $false',
  'print = $false','database_write = $false','fiscal_action = $false','cutover = $false'
)){ Assert ($shadow.Contains($token)) ("SHADOW_REQUIRED_TOKEN_MISSING:"+$token) }

foreach($forbidden in @(
  'NMPRODUTO','DSOBSCOMANDA','DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN',
  'INSERT ','UPDATE ','DELETE ','MERGE ','CREATE ','ALTER ','DROP ','GRANT ','DENY ','REVOKE ',
  'EXEC ','EXECUTE ','TRUNCATE ','DBCC ','sp_configure','xp_cmdshell',
  'Out-Printer','WritePrinter','StartDocPrinter','Invoke-WebRequest','Invoke-RestMethod','System.Net.Http','/print'
)){ Assert (-not $shadow.ToUpperInvariant().Contains($forbidden.ToUpperInvariant())) ("SHADOW_FORBIDDEN_SURFACE:"+$forbidden) }

foreach($token in @(
  'runtime_restored','service_stopped','evidence_restored','config_restored',
  'Start-Service -Name $ExpectedServiceName',
  'INSTALLED_PREFLIGHT_HASH_MISMATCH'
)){ Assert ($runner.Contains($token)) ("RUNNER_REQUIRED_TOKEN_MISSING:"+$token) }

if(Test-Path -LiteralPath $authPath -PathType Leaf){
  $auth=Get-Content -LiteralPath $authPath -Raw -Encoding UTF8|ConvertFrom-Json
  $shadowHash=(Get-FileHash -LiteralPath (Join-Path $RepoRoot "tools\authorized\tata_reader_real_order_shadow_route_v1.ps1") -Algorithm SHA256).Hash
  $runnerHash=(Get-FileHash -LiteralPath (Join-Path $RepoRoot "tools\authorized\tata_reader_shadow_route_cycle_runner_v1.ps1") -Algorithm SHA256).Hash
  $routingHash=(Get-FileHash -LiteralPath (Join-Path $RepoRoot "data\odhen_product_routing_compact_v1.json") -Algorithm SHA256).Hash
  $printerHash=(Get-FileHash -LiteralPath (Join-Path $RepoRoot "data\runtime_printer_map_v1.json") -Algorithm SHA256).Hash
  Assert ([string]::Equals($shadowHash,[string]$auth.shadow_script.sha256,[System.StringComparison]::OrdinalIgnoreCase)) "AUTH_SHADOW_SCRIPT_HASH_MISMATCH"
  Assert ([string]::Equals($runnerHash,[string]$auth.runner.sha256,[System.StringComparison]::OrdinalIgnoreCase)) "AUTH_RUNNER_HASH_MISMATCH"
  Assert ([string]::Equals($routingHash,[string]$auth.routing.sha256,[System.StringComparison]::OrdinalIgnoreCase)) "AUTH_ROUTING_HASH_MISMATCH"
  Assert ([string]::Equals($printerHash,[string]$auth.printer_map.sha256,[System.StringComparison]::OrdinalIgnoreCase)) "AUTH_PRINTER_MAP_HASH_MISMATCH"
}

[ordered]@{
  schema="deliveryos.tata-reader-shadow-route-bundle-static.v1"
  passed=$true
  shadow_effect=$false
  ready_for_authorized_shadow=(Test-Path -LiteralPath $authPath -PathType Leaf)
}|ConvertTo-Json -Depth 4

param()

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Text([string]$p){ Get-Content -LiteralPath (Join-Path $RepoRoot $p) -Raw -Encoding UTF8 }
function Assert([bool]$ok,[string]$msg){ if(-not $ok){ throw $msg } }

$script = Text "tools\authorized\tata_nfce_targeted_source_readonly_v1.ps1"
$authPath = Join-Path $RepoRoot "data\tata_nfce_source_readonly_authorization_v1.json"

$t=$null;$e=$null
[System.Management.Automation.Language.Parser]::ParseInput($script,[ref]$t,[ref]$e)|Out-Null
Assert ($e.Count -eq 0) ("TARGETED_SOURCE_SYNTAX_ERROR:"+($e -join " | "))

foreach($required in @(
  "TARGETED_SANITIZED_SOURCE_READ_ONLY",
  "REDACTED_SENSITIVE_ASSIGNMENT",
  "[System.Collections.IDictionary]$Result",
  "NO_TARGET_FILE_ENTRIES_CAPTURED",
  "TARGET_FILE_SET_INCOMPLETE",
  "NO_SANITIZED_FINDINGS_CAPTURED",
  "expected_unique_target_files = 9",
  "environment.xml",
  "services.xml",
  "routes.json",
  "Delivery.php",
  "Payment.php",
  "FiscalFunctions.php",
  "FiscalFunctions.php",
  "GeneralFunctions.php",
  "Operator.php",
  'order_read = $false',
  'database_query = $false',
  'database_write = $false',
  'odhen_write = $false',
  'config_write = $false',
  'process_start = $false',
  'print = $false',
  'http = $false',
  'sefaz_call = $false',
  'fiscal_action = $false',
  'danfe_print = $false',
  'cutover = $false'
)){
  Assert ($script.Contains($required)) ("TARGETED_SOURCE_REQUIRED_MARKER_MISSING:"+$required)
}

foreach($forbidden in @(
  "Invoke-WebRequest","Invoke-RestMethod","Start-Service","Stop-Service","Restart-Service","Set-Service",
  "Set-Printer","Out-Printer","WritePrinter","StartDocPrinter",
  "SqlConnection","System.Data.Sql","Invoke-Sqlcmd",
  "Set-Content","Add-Content","Out-File","New-Item ","Remove-Item ","Copy-Item ","Move-Item ","Rename-Item ",
  "Set-ItemProperty","New-ItemProperty","Remove-ItemProperty",
  "Start-Process","sc.exe","net.exe","curl.exe","wget.exe"
)){
  Assert (-not $script.ToLowerInvariant().Contains($forbidden.ToLowerInvariant())) ("TARGETED_SOURCE_FORBIDDEN_SURFACE:"+$forbidden)
}

if(Test-Path -LiteralPath $authPath -PathType Leaf){
  $auth = Get-Content -LiteralPath $authPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $actual = (Get-FileHash -LiteralPath (Join-Path $RepoRoot "tools\authorized\tata_nfce_targeted_source_readonly_v1.ps1") -Algorithm SHA256).Hash
  Assert ([string]::Equals($actual,[string]$auth.discovery_script_sha256,[System.StringComparison]::OrdinalIgnoreCase)) "AUTH_TARGETED_SOURCE_HASH_MISMATCH"
}

[ordered]@{
  schema = "deliveryos.tata-nfce-targeted-source-readonly-static.v1"
  passed = $true
  fiscal_effect = $false
  ready_for_authorized_discovery = (Test-Path -LiteralPath $authPath -PathType Leaf)
}|ConvertTo-Json -Depth 4

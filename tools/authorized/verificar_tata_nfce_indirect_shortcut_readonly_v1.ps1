param()

$ErrorActionPreference="Stop"
$RepoRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Text([string]$p){ Get-Content -LiteralPath (Join-Path $RepoRoot $p) -Raw -Encoding UTF8 }
function Assert([bool]$ok,[string]$msg){ if(-not $ok){ throw $msg } }

$script=Text "tools\authorized\tata_nfce_indirect_shortcut_readonly_v1.ps1"
$authPath=Join-Path $RepoRoot "data\tata_nfce_indirect_readonly_authorization_v1.json"

$t=$null;$e=$null
[System.Management.Automation.Language.Parser]::ParseInput($script,[ref]$t,[ref]$e)|Out-Null
Assert ($e.Count -eq 0) ("INDIRECT_SYNTAX_ERROR:"+($e -join " | "))

foreach($required in @(
  "READ_ONLY_INDIRECT_SHORTCUT_AND_FISCAL_SOURCE_DISCOVERY",
  "shortcut_findings",
  "cross_signal_files",
  "targeted_sources",
  "target_file_count",
  "target_findings_count",
  "extracted_symbols",
  "symbol_references",
  "binary_string_findings",
  "binary_keyboard_file_count",
  "binary_keyboard_and_fiscal_file_count",
  "binary_skipped_large_samples",
  "package_candidate_count",
  "package_candidates",
  "keyboard_terms",
  "fiscal_terms",
  "ReadAllBytes",
  "VK_F7",
  "0x76",
  "keyCode",
  "KeyboardEvent",
  "keydown",
  "hotkey",
  "shortcut",
  "environment.xml",
  "services.xml",
  "routes.json",
  "Delivery.php",
  "Payment.php",
  "Controller\FiscalFunctions.php",
  "Service\FiscalFunctions.php",
  "GeneralFunctions.php",
  "Operator.php",
  "TARGET_FILE_SET_INCOMPLETE",
  "NO_TARGETED_FISCAL_FINDINGS",
  "REDACTED_SENSITIVE_ASSIGNMENT",
  'order_read=$false',
  'database_query=$false',
  'database_write=$false',
  'odhen_write=$false',
  'config_write=$false',
  'process_start=$false',
  'print=$false',
  'http=$false',
  'sefaz_call=$false',
  'fiscal_action=$false',
  'danfe_print=$false',
  'cutover=$false'
)){
  Assert ($script.Contains($required)) ("INDIRECT_REQUIRED_MARKER_MISSING:"+$required)
}

foreach($forbidden in @(
  "Invoke-WebRequest","Invoke-RestMethod","Start-Service","Stop-Service","Restart-Service","Set-Service",
  "Set-Printer","Out-Printer","WritePrinter","StartDocPrinter",
  "SqlConnection","System.Data.Sql","Invoke-Sqlcmd",
  "Set-Content","Add-Content","Out-File","New-Item ","Remove-Item ","Copy-Item ","Move-Item ","Rename-Item ",
  "Set-ItemProperty","New-ItemProperty","Remove-ItemProperty",
  "Start-Process","sc.exe","net.exe","curl.exe","wget.exe",
  "WriteAllBytes","WriteAllText","CreateText","AppendAllText"
)){
  Assert (-not $script.ToLowerInvariant().Contains($forbidden.ToLowerInvariant())) ("INDIRECT_FORBIDDEN_SURFACE:"+$forbidden)
}

$ast=[System.Management.Automation.Language.Parser]::ParseInput($script,[ref]$null,[ref]$null)
$commands=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst]},$true) |
  ForEach-Object { $_.GetCommandName() } |
  Where-Object { $_ } |
  Sort-Object -Unique)

$allowed=@(
  "Context","ConvertFrom-Json","ConvertTo-Json","Get-ChildItem","Get-Content","Get-Date","Get-FileHash",
  "Group-Object","Hash","Is-CommentLike","Join-Path","New-Object","Sanitize","Select-Object","Sort-Object",
  "Split-Path","Test-Path","Where-Object"
)
foreach($cmd in $commands){
  Assert ($allowed -contains $cmd) ("INDIRECT_COMMAND_NOT_ALLOWLISTED:"+$cmd)
}

if(Test-Path -LiteralPath $authPath -PathType Leaf){
  $auth=Get-Content -LiteralPath $authPath -Raw -Encoding UTF8|ConvertFrom-Json
  $actual=(Get-FileHash -LiteralPath (Join-Path $RepoRoot "tools\authorized\tata_nfce_indirect_shortcut_readonly_v1.ps1") -Algorithm SHA256).Hash
  Assert ([string]::Equals($actual,[string]$auth.discovery_script_sha256,[System.StringComparison]::OrdinalIgnoreCase)) "AUTH_INDIRECT_HASH_MISMATCH"
}

[ordered]@{
  schema="deliveryos.tata-nfce-indirect-shortcut-static.v1"
  passed=$true
  fiscal_effect=$false
  ready_for_authorized_discovery=(Test-Path -LiteralPath $authPath -PathType Leaf)
  command_allowlist_passed=$true
}|ConvertTo-Json -Depth 4

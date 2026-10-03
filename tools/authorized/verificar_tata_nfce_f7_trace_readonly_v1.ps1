param()

$ErrorActionPreference="Stop"
$RepoRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Text([string]$p){Get-Content -LiteralPath (Join-Path $RepoRoot $p) -Raw -Encoding UTF8}
function Assert([bool]$ok,[string]$msg){if(-not $ok){throw $msg}}

$script=Text "tools\authorized\tata_nfce_f7_trace_readonly_v1.ps1"
$authPath=Join-Path $RepoRoot "data\tata_nfce_f7_trace_authorization_v1.json"

$t=$null;$e=$null
[System.Management.Automation.Language.Parser]::ParseInput($script,[ref]$t,[ref]$e)|Out-Null
Assert ($e.Count -eq 0) ("F7_TRACE_SYNTAX_ERROR:"+($e -join " | "))

foreach($required in @(
  "READ_ONLY_F7_TO_FISCAL_TRACE_DISCOVERY",
  "NO_F7_OR_KEY118_HANDLER_FOUND",
  "NO_F7_CANDIDATE_FILES_CAPTURED",
  "primary_match_count",
  "candidate_files",
  'case\s+118',
  "REDACTED_SENSITIVE_ASSIGNMENT",
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
  Assert ($script.Contains($required)) ("F7_TRACE_REQUIRED_MARKER_MISSING:"+$required)
}

foreach($forbidden in @(
  "Invoke-WebRequest","Invoke-RestMethod","Start-Service","Stop-Service","Restart-Service","Set-Service",
  "Set-Printer","Out-Printer","WritePrinter","StartDocPrinter",
  "SqlConnection","System.Data.Sql","Invoke-Sqlcmd",
  "Set-Content","Add-Content","Out-File","New-Item ","Remove-Item ","Copy-Item ","Move-Item ","Rename-Item ",
  "Set-ItemProperty","New-ItemProperty","Remove-ItemProperty",
  "Start-Process","sc.exe","net.exe","curl.exe","wget.exe"
)){
  Assert (-not $script.ToLowerInvariant().Contains($forbidden.ToLowerInvariant())) ("F7_TRACE_FORBIDDEN_SURFACE:"+$forbidden)
}

if(Test-Path -LiteralPath $authPath -PathType Leaf){
  $auth=Get-Content -LiteralPath $authPath -Raw -Encoding UTF8|ConvertFrom-Json
  $actual=(Get-FileHash -LiteralPath (Join-Path $RepoRoot "tools\authorized\tata_nfce_f7_trace_readonly_v1.ps1") -Algorithm SHA256).Hash
  Assert ([string]::Equals($actual,[string]$auth.trace_script_sha256,[System.StringComparison]::OrdinalIgnoreCase)) "AUTH_F7_TRACE_HASH_MISMATCH"
}

[ordered]@{
  schema="deliveryos.tata-nfce-f7-trace-static.v1"
  passed=$true
  fiscal_effect=$false
  ready_for_authorized_discovery=(Test-Path -LiteralPath $authPath -PathType Leaf)
}|ConvertTo-Json -Depth 4

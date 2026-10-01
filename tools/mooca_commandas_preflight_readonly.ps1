param(
  [string]$OdhenRoot = "C:\TEKNISA\odhen-perifericos",
  [string]$Server = "192.168.0.24\SQLEXPRESS",
  [string]$Database = "teknisa",
  [string]$OutputPath = ".\mooca-commandas-preflight.json"
)

$ErrorActionPreference = "Stop"

# ORCHESTRATOR ONLY.
# Composes existing metadata/source/read-only probes.
# Never reads an order row, prints, or changes Teknisa/printer configuration.

function Invoke-JsonScript([string]$ScriptPath, [string[]]$Arguments) {
  $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | Out-String).Trim()
  $parsed = $null
  try { if ($text) { $parsed = $text | ConvertFrom-Json } } catch {}
  return [ordered]@{
    exit_code = $exitCode
    parsed = $parsed
    raw_parse_failed = ($null -eq $parsed)
  }
}

$sourceProbe = Invoke-JsonScript (Join-Path $PSScriptRoot "odhen_source_probe_readonly.ps1") @("-OdhenRoot", $OdhenRoot)
$fiscalSurfaceProbe = Invoke-JsonScript (Join-Path $PSScriptRoot "odhen_fiscal_surface_probe_readonly.ps1") @("-OdhenRoot", $OdhenRoot)
$sqlProbe = Invoke-JsonScript (Join-Path $PSScriptRoot "sql_integrated_readonly_preflight.ps1") @("-Server", $Server, "-Database", $Database)

$tempPrinterPath = Join-Path $env:TEMP ("deliveryos-printer-preflight-" + [guid]::NewGuid().ToString("N") + ".json")
try {
  $printerProbe = Invoke-JsonScript (Join-Path $PSScriptRoot "production_printer_preflight_readonly.ps1") @("-OutputPath", $tempPrinterPath)
}
finally {
  if (Test-Path -LiteralPath $tempPrinterPath) { Remove-Item -LiteralPath $tempPrinterPath -Force }
}

$requiredTokens = @(
  "NRCOMANDA",
  "NRCOMANDAEXT",
  "CDPRODUTO",
  "NMPRODUTO",
  "QTPRODCOMVEN",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "TXPRODCOMVEN"
)

$presentTokens = @()
if ($sourceProbe.parsed -and $sourceProbe.parsed.token_hits) {
  $presentTokens = @($sourceProbe.parsed.token_hits | ForEach-Object { [string]$_.token } | Sort-Object -Unique)
}
$missingTokens = @($requiredTokens | Where-Object { $_ -notin $presentTokens })

$sourceContractCandidate =
  ($sourceProbe.exit_code -eq 0) -and
  ($sourceProbe.parsed.root_exists -eq $true) -and
  ($missingTokens.Count -eq 0) -and
  (@($sourceProbe.parsed.errors).Count -eq 0)

$sqlReadOnlyProven =
  ($sqlProbe.exit_code -eq 0) -and
  ($sqlProbe.parsed.safe_for_order_read -eq $true)

$result = [ordered]@{
  schema = "deliveryos.mooca-commandas-preflight.v1"
  captured_at = (Get-Date).ToString("o")
  computer_name = $env:COMPUTERNAME
  source = [ordered]@{
    contract_tokens_present = $sourceContractCandidate
    required_tokens = $requiredTokens
    missing_tokens = $missingTokens
    probe = $sourceProbe
  }
  sql = [ordered]@{
    read_only_proven = $sqlReadOnlyProven
    probe = $sqlProbe
  }
  printers = [ordered]@{
    metadata_collected = (($printerProbe.exit_code -eq 0) -and ($null -ne $printerProbe.parsed))
    probe = $printerProbe
  }
  fiscal_surface = [ordered]@{
    metadata_collected = (($fiscalSurfaceProbe.exit_code -eq 0) -and ($null -ne $fiscalSurfaceProbe.parsed))
    native_nfce_candidate_detected = (
      $null -ne $fiscalSurfaceProbe.parsed -and
      @($fiscalSurfaceProbe.parsed.token_hits | Where-Object {
        $_.token -in @("NFCe", "NFC-e", "DANFE", "SEFAZ")
      }).Count -gt 0
    )
    probe = $fiscalSurfaceProbe
  }
  gate = [ordered]@{
    ready_for_one_minimized_order_read_candidate = ($sourceContractCandidate -and $sqlReadOnlyProven)
    observation_semantics_proven = $false
    live_order_read_performed = $false
    physical_print_authorized = $false
  }
  effect_boundary = [ordered]@{
    order_row_read = $false
    database_write = $false
    odhen_write = $false
    print = $false
    spooler_write = $false
    printer_configuration_change = $false
    cutover = $false
  }
}

$json = $result | ConvertTo-Json -Depth 14
$json | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output $json

if (-not $result.gate.ready_for_one_minimized_order_read_candidate) { exit 4 }
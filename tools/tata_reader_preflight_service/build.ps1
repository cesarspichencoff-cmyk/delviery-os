param(
  [string]$OutputPath = ".\TataComandaReader.PreflightService.exe",
  [string]$PreflightPath = ""
)

$ErrorActionPreference = "Stop"

$source = Join-Path $PSScriptRoot "TataComandaReader.PreflightService.cs"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if ([string]::IsNullOrWhiteSpace($PreflightPath)) {
  $toolsDirectory = Split-Path -Parent $PSScriptRoot
  $PreflightPath = Join-Path $toolsDirectory "tata_reader_least_privilege_preflight.ps1"
}

if (-not (Test-Path -LiteralPath $csc -PathType Leaf)) { throw "CSC64_NOT_FOUND" }
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "PREFLIGHT_SERVICE_SOURCE_NOT_FOUND" }
if (-not (Test-Path -LiteralPath $PreflightPath -PathType Leaf)) { throw "PREFLIGHT_SCRIPT_NOT_FOUND" }

& $csc /nologo /target:exe /platform:anycpu /optimize+ /out:$OutputPath /reference:System.ServiceProcess.dll $source
if ($LASTEXITCODE -ne 0) { throw "PREFLIGHT_SERVICE_BUILD_FAILED" }

$binaryHash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$preflightHash = (Get-FileHash -LiteralPath $PreflightPath -Algorithm SHA256).Hash
$cscVersion = (Get-Item -LiteralPath $csc).VersionInfo.FileVersion

[ordered]@{
  schema = "deliveryos.tata-reader-preflight-service-build.v2"
  output = (Resolve-Path -LiteralPath $OutputPath).Path
  binary_sha256 = $binaryHash
  source_sha256 = $sourceHash
  preflight_sha256 = $preflightHash
  csc_path = $csc
  csc_file_version = $cscVersion
  nuget_used = $false
  administrative_effect = $false
} | ConvertTo-Json -Depth 4
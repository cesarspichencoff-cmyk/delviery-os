param(
  [string]$OutputPath = ".\\TataComandaReader.PreflightService.exe"
)

$ErrorActionPreference = "Stop"

$source = Join-Path $PSScriptRoot "TataComandaReader.PreflightService.cs"
$csc = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"

if (-not (Test-Path -LiteralPath $csc -PathType Leaf)) {
  throw "CSC64_NOT_FOUND"
}
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
  throw "PREFLIGHT_SERVICE_SOURCE_NOT_FOUND"
}

& $csc /nologo /target:exe /platform:anycpu /optimize+ /out:$OutputPath /reference:System.ServiceProcess.dll $source
if ($LASTEXITCODE -ne 0) {
  throw "PREFLIGHT_SERVICE_BUILD_FAILED"
}

$hash = Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256
[ordered]@{
  schema = "deliveryos.tata-reader-preflight-service-build.v1"
  output = (Resolve-Path -LiteralPath $OutputPath).Path
  sha256 = $hash.Hash
  nuget_used = $false
  administrative_effect = $false
} | ConvertTo-Json -Depth 4
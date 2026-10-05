param(
  [string]$SourcePath = "C:\TATA\comanda-v1\cutover\TataComandaReader.ContinuousService.cs",
  [string]$OutputPath = "C:\TATA\comanda-v1\cutover\TataComandaReader.ContinuousService.exe"
)

$ErrorActionPreference = "Stop"

$cscCandidates = @(
  "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $cscCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $csc) { throw "CSC_NOT_FOUND" }
if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) { throw "SOURCE_NOT_FOUND" }

if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }

$ref = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.ServiceProcess.dll"
if (-not (Test-Path -LiteralPath $ref)) {
  $ref = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\System.ServiceProcess.dll"
}
if (-not (Test-Path -LiteralPath $ref)) { throw "SERVICEPROCESS_REFERENCE_NOT_FOUND" }

& $csc /nologo /target:exe /optimize+ /platform:anycpu /reference:$ref /out:$OutputPath $SourcePath
if ($LASTEXITCODE -ne 0) { throw ("CSC_FAILED:" + $LASTEXITCODE) }
if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) { throw "OUTPUT_NOT_CREATED" }

[ordered]@{
  schema = "deliveryos.continuous-service-host-build.v1"
  status = "BUILD_PASS"
  compiler = $csc
  source_path = $SourcePath
  output_path = $OutputPath
  source_sha256 = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToUpperInvariant()
  output_sha256 = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToUpperInvariant()
  output_bytes = (Get-Item -LiteralPath $OutputPath).Length
}|ConvertTo-Json -Depth 5

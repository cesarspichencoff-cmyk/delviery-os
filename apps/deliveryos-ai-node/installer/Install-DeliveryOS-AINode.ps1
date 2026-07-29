[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BridgeUrl,
  [Parameter(Mandatory = $true)][string]$UnitId,
  [Parameter(Mandatory = $true)][securestring]$InstallationCode,
  [string]$OfflineBundle,
  [string]$InstallRoot = "$env:ProgramData\DeliveryOS\AINode"
)

. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Administrator
$root = [IO.Path]::GetFullPath($InstallRoot)
$canonicalRoot = [IO.Path]::GetFullPath("$env:ProgramData\DeliveryOS\AINode")
if ($root -ne $canonicalRoot) { throw 'DELIVERYOS_AI_NODE_INSTALL_ROOT_REFUSED' }
$staging = Join-Path $root 'updates\install-staging'
$directories = @('bin', 'runtime', 'models', 'config', 'state', 'logs', 'updates')
New-Item -ItemType Directory -Path $root -Force | Out-Null
foreach ($directory in $directories) { New-Item -ItemType Directory -Path (Join-Path $root $directory) -Force | Out-Null }
Set-DeliveryOsNodeAcl $root

$sourceRoot = Split-Path -Parent $PSScriptRoot
Copy-Item -LiteralPath (Join-Path $sourceRoot 'scripts') -Destination $root -Recurse -Force
$appRoot = Join-Path $root 'app'
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
foreach ($item in Get-ChildItem -LiteralPath $sourceRoot) {
  if ($item.Name -eq 'installer') { continue }
  Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $appRoot $item.Name) -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $sourceRoot 'manifests') -Destination $root -Recurse -Force

$manifestPath = Join-Path $root 'manifests\model-manifest.json'
$manifest = Get-ArtifactManifest $manifestPath
New-Item -ItemType Directory -Path $staging -Force | Out-Null
$probe = & (Join-Path $root 'scripts\Collect-Hardware.ps1') | ConvertFrom-Json
$vram = if ($probe.gpu) { [int64]$probe.gpu.vram_bytes } else { 0 }
$class = if ($probe.ram_total_bytes -ge 32GB -and $vram -ge 12GB) {
  'avancado'
} elseif ($probe.ram_total_bytes -ge 16GB -and ($vram -ge 6GB -or $probe.cpu.threads -ge 8)) {
  'intermediario'
} elseif ($probe.ram_total_bytes -ge 8GB -and $probe.cpu.threads -ge 4) {
  'basico'
} else {
  'nao_compativel'
}
if ($class -eq 'nao_compativel') { throw 'DELIVERYOS_AI_NODE_HARDWARE_INCOMPATIBLE' }

$modelId = if ($class -in @('intermediario', 'avancado')) { 'qwen3-4b-q4km' } else { 'qwen3-1.7b-q8' }
$selected = @(
  $manifest.artifacts | Where-Object id -eq 'node-portable-24.18.0-win-x64'
  $manifest.artifacts | Where-Object id -eq 'llama-cpp-b10172-win-cpu-x64'
  $manifest.artifacts | Where-Object id -eq $modelId
)
foreach ($artifact in $selected) {
  $destination = Join-Path $staging $artifact.filename
  Get-VerifiedArtifact -Artifact $artifact -Destination $destination -OfflineBundle $OfflineBundle | Out-Null
}

Expand-Archive -LiteralPath (Join-Path $staging 'node-v24.18.0-win-x64.zip') -DestinationPath (Join-Path $root 'runtime\node') -Force
Expand-Archive -LiteralPath (Join-Path $staging 'llama-b10172-bin-win-cpu-x64.zip') -DestinationPath (Join-Path $root 'runtime\llama.cpp') -Force
$modelArtifact = $selected | Where-Object id -eq $modelId
Copy-Item -LiteralPath (Join-Path $staging $modelArtifact.filename) -Destination (Join-Path $root 'models') -Force

$config = @{
  schema_version = 'deliveryos-ai-node-config-v1'
  bridge_url = $BridgeUrl
  bridge_host = ([Uri]$BridgeUrl).Host
  model_version = $modelId
  model_file = $modelArtifact.filename
  provider_version = 'llama.cpp-b10172'
  context_size = 4096
  gpu_layers = 0
  local_host = '127.0.0.1'
  local_port = 4191
  real_drivers_enabled = $false
}
$configJson = $config | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $root 'config\node-config.json'), $configJson, [Text.UTF8Encoding]::new($false))

$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($InstallationCode)
try {
  $plainCode = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $registration = @{
    bridge_url = $BridgeUrl
    bridge_host = ([Uri]$BridgeUrl).Host
    installation_code = $plainCode
    unit_id = $UnitId
    allowed_models = @($modelId)
    version = '0.1.0'
  } | ConvertTo-Json -Compress
  $nodeExe = Get-ChildItem -LiteralPath (Join-Path $root 'runtime\node') -Filter node.exe -Recurse | Select-Object -First 1
  $registration | & $nodeExe.FullName (Join-Path $root 'app\bin\deliveryos-ai-node.js') register --root $root
  if ($LASTEXITCODE -ne 0) { throw 'DELIVERYOS_AI_NODE_REGISTRATION_FAILED' }
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $plainCode = $null
}

$scriptPath = Join-Path $root 'app\bin\deliveryos-ai-node.js'
$taskArguments = '"' + $scriptPath + '" run --root "' + $root + '"'
$action = New-ScheduledTaskAction -Execute $nodeExe.FullName -Argument $taskArguments
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)
Register-ScheduledTask -TaskName 'DeliveryOS-AINode' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'DeliveryOS-AINode'

[pscustomobject]@{
  installed = $true
  root = $root
  hardware_class = $class
  model = $modelId
  local_bind = '127.0.0.1'
  startup = 'ScheduledTask:SYSTEM'
} | ConvertTo-Json -Compress

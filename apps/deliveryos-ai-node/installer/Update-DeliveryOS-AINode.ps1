[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ManifestPath,
  [string]$InstallRoot = "$env:ProgramData\DeliveryOS\AINode"
)

. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Administrator
$root = [IO.Path]::GetFullPath($InstallRoot)
$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
if ($manifest.schema_version -ne 'deliveryos-ai-node-update-v1' -or $manifest.automatic_install -ne $false) { throw 'DELIVERYOS_AI_NODE_UPDATE_MANIFEST_INVALID' }
$backup = Join-Path $root ("updates\backup-" + (Get-Date -Format 'yyyyMMddHHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Stop-ScheduledTask -TaskName 'DeliveryOS-AINode' -ErrorAction Stop
try {
  Copy-Item -LiteralPath (Join-Path $root 'app') -Destination $backup -Recurse -Force
  foreach ($artifact in $manifest.artifacts) {
    $destination = Join-Path (Join-Path $root 'updates') $artifact.filename
    Get-VerifiedArtifact -Artifact $artifact -Destination $destination | Out-Null
  }
  & (Join-Path $PSScriptRoot 'Repair-DeliveryOS-AINode.ps1') -InstallRoot $root
  if ($LASTEXITCODE -ne 0) { throw 'DELIVERYOS_AI_NODE_UPDATE_HEALTH_FAILED' }
} catch {
  Remove-Item -LiteralPath (Join-Path $root 'app') -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item -LiteralPath (Join-Path $backup 'app') -Destination $root -Recurse -Force
  Start-ScheduledTask -TaskName 'DeliveryOS-AINode' -ErrorAction SilentlyContinue
  throw
}
Start-ScheduledTask -TaskName 'DeliveryOS-AINode'
[pscustomobject]@{ updated = $true; version = $manifest.version; backup = $backup } | ConvertTo-Json -Compress

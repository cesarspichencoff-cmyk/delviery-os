[CmdletBinding()]
param([string]$InstallRoot = "$env:ProgramData\DeliveryOS\AINode")

. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Administrator
$root = [IO.Path]::GetFullPath($InstallRoot)
$required = @(
  'config\node-config.json',
  'config\node-identity.json',
  'app\bin\deliveryos-ai-node.js',
  'manifests\model-manifest.json',
  'scripts\Protect-NodeSecret.ps1'
)
$missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf) })
Set-DeliveryOsNodeAcl $root
if ($missing.Count -gt 0) {
  [pscustomobject]@{ repaired = $false; missing = $missing } | ConvertTo-Json -Compress
  exit 2
}
Start-ScheduledTask -TaskName 'DeliveryOS-AINode' -ErrorAction Stop
[pscustomobject]@{ repaired = $true; task = 'DeliveryOS-AINode' } | ConvertTo-Json -Compress

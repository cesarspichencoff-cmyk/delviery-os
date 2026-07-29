[CmdletBinding()]
param([string]$InstallRoot = "$env:ProgramData\DeliveryOS\AINode")

$root = [IO.Path]::GetFullPath($InstallRoot)
$node = Get-ChildItem -LiteralPath (Join-Path $root 'runtime\node') -Filter node.exe -Recurse | Select-Object -First 1
if (-not $node) { throw 'DELIVERYOS_AI_NODE_PORTABLE_NODE_MISSING' }
& $node.FullName (Join-Path $root 'app\bin\deliveryos-ai-node.js') doctor --root $root
exit $LASTEXITCODE

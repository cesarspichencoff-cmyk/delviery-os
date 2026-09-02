[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$InstallRoot = "$env:ProgramData\DeliveryOS\AINode",
  [switch]$PreserveDiagnostics
)

. (Join-Path $PSScriptRoot 'Common.ps1')
Assert-Administrator
$root = [IO.Path]::GetFullPath($InstallRoot)
$canonicalRoot = [IO.Path]::GetFullPath("$env:ProgramData\DeliveryOS\AINode")
if ($root -ne $canonicalRoot) { throw 'DELIVERYOS_AI_NODE_UNINSTALL_ROOT_REFUSED' }
$backup = $null
if ($PSCmdlet.ShouldProcess($root, 'Uninstall DeliveryOS AI Node')) {
  Stop-ScheduledTask -TaskName 'DeliveryOS-AINode' -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName 'DeliveryOS-AINode' -Confirm:$false -ErrorAction SilentlyContinue
  if ($PreserveDiagnostics -and (Test-Path -LiteralPath (Join-Path $root 'state\diagnostics'))) {
    $backup = Join-Path "$env:ProgramData\DeliveryOS" ("AINode-Diagnostics-" + (Get-Date -Format 'yyyyMMddHHmmss'))
    Copy-Item -LiteralPath (Join-Path $root 'state\diagnostics') -Destination $backup -Recurse -Force
  }
  Remove-Item -LiteralPath $root -Recurse -Force
}
[pscustomobject]@{ uninstalled = $true; diagnostics = $backup } | ConvertTo-Json -Compress

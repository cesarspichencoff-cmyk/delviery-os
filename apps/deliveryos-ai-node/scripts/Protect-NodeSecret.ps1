param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Protect', 'Unprotect')]
  [string]$Operation
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$value = [Console]::In.ReadToEnd().Trim()
if ([string]::IsNullOrWhiteSpace($value)) { throw 'AI_NODE_DPAPI_INPUT_REQUIRED' }

if ($Operation -eq 'Protect') {
  $plain = [Convert]::FromBase64String($value)
  $protected = [Security.Cryptography.ProtectedData]::Protect(
    $plain,
    $null,
    [Security.Cryptography.DataProtectionScope]::LocalMachine
  )
  [Convert]::ToBase64String($protected)
  exit 0
}

$encrypted = [Convert]::FromBase64String($value)
$plain = [Security.Cryptography.ProtectedData]::Unprotect(
  $encrypted,
  $null,
  [Security.Cryptography.DataProtectionScope]::LocalMachine
)
[Convert]::ToBase64String($plain)

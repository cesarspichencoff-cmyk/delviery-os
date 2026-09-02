$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Administrator {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'DELIVERYOS_AI_NODE_ADMINISTRATOR_REQUIRED' }
}

function Get-ArtifactManifest {
  param([Parameter(Mandatory = $true)][string]$ManifestPath)
  $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
  if ($manifest.schema_version -ne 'deliveryos-ai-node-artifacts-v1') { throw 'DELIVERYOS_AI_NODE_MANIFEST_INVALID' }
  $manifest
}

function Assert-OfficialArtifact {
  param([Parameter(Mandatory = $true)]$Artifact)
  $uri = [Uri]$Artifact.url
  if ($uri.Scheme -ne 'https') { throw 'DELIVERYOS_AI_NODE_ARTIFACT_PROTOCOL_INVALID' }
  if ($uri.Host -notin @('nodejs.org', 'github.com', 'huggingface.co')) { throw 'DELIVERYOS_AI_NODE_ARTIFACT_HOST_FORBIDDEN' }
  if ($Artifact.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'DELIVERYOS_AI_NODE_ARTIFACT_HASH_INVALID' }
}

function Get-VerifiedArtifact {
  param(
    [Parameter(Mandatory = $true)]$Artifact,
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$OfflineBundle
  )
  Assert-OfficialArtifact $Artifact
  $partial = "$Destination.partial"
  Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
  if ($OfflineBundle) {
    $source = Join-Path ([IO.Path]::GetFullPath($OfflineBundle)) $Artifact.filename
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "OFFLINE_ARTIFACT_MISSING:$($Artifact.id)" }
    Copy-Item -LiteralPath $source -Destination $partial
  } else {
    Invoke-WebRequest -Uri $Artifact.url -OutFile $partial -MaximumRedirection 4
  }
  $file = Get-Item -LiteralPath $partial
  if ($file.Length -ne [int64]$Artifact.size_bytes) {
    Remove-Item -LiteralPath $partial -Force
    throw "ARTIFACT_SIZE_MISMATCH:$($Artifact.id)"
  }
  $hash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $Artifact.sha256) {
    Remove-Item -LiteralPath $partial -Force
    throw "ARTIFACT_HASH_MISMATCH:$($Artifact.id)"
  }
  Move-Item -LiteralPath $partial -Destination $Destination -Force
  $Destination
}

function Set-DeliveryOsNodeAcl {
  param([Parameter(Mandatory = $true)][string]$Root)
  & icacls.exe $Root /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'BUILTIN\Administrators:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'DELIVERYOS_AI_NODE_ACL_FAILED' }
}

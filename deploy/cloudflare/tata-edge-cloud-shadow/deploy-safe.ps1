param(
  [string]$WatchBridgeToken = $env:WATCH_BRIDGE_TOKEN,
  [string]$AdminToken = $env:EDGE_PRODUCER_ADMIN_TOKEN
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WatchBridgeToken)) {
  throw "WATCH_BRIDGE_TOKEN is required"
}
if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  throw "EDGE_PRODUCER_ADMIN_TOKEN is required"
}

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = Resolve-Path (Join-Path $Here "..\..\..")
$Template = Join-Path $Here "wrangler.template.toml"
$Wrangler = Join-Path $Here "wrangler.toml"
$SecretFile = Join-Path $Here ".secrets.deploy.tmp.json"

Push-Location $Repo
try {
  npm.cmd run test:edge:cloud-producer
  if ($LASTEXITCODE -ne 0) { throw "producer tests failed" }

  Copy-Item $Template $Wrangler -Force

  Push-Location $Here
  try {
    npx.cmd wrangler deploy --config .\wrangler.toml
    if ($LASTEXITCODE -ne 0) { throw "wrangler deploy failed" }

    @{
      WATCH_BRIDGE_TOKEN = $WatchBridgeToken
      EDGE_PRODUCER_ADMIN_TOKEN = $AdminToken
    } | ConvertTo-Json -Compress |
      Set-Content $SecretFile -NoNewline -Encoding UTF8

    try {
      npx.cmd wrangler secret bulk .\.secrets.deploy.tmp.json --config .\wrangler.toml
      if ($LASTEXITCODE -ne 0) { throw "wrangler secret bulk failed" }
    }
    finally {
      Remove-Item $SecretFile -Force -ErrorAction SilentlyContinue
    }

    npx.cmd wrangler deployments list --name tata-edge-cloud-shadow

    Write-Output "DEPLOY_READY_FOR_LIVE_SMOKE"
  }
  finally {
    Pop-Location
  }
}
finally {
  Pop-Location
}

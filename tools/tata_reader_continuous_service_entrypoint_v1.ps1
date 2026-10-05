param(
  [int]$PollSeconds = 3,
  [int]$StablePolls = 2,
  [int]$TopOrders = 50
)

$ErrorActionPreference = "Stop"
$ExpectedIdentity = "NT SERVICE\\TataComandaReader"
$Reader = "C:\\ProgramData\\TataComandaReader\\bin\\tata_reader_continuous_watch_candidate_v1.ps1"
$Checkpoint = "C:\\ProgramData\\TataComandaReader\\state\\reader-watch-checkpoint-v1.json"
$Events = "C:\\ProgramData\\TataComandaReader\\state\\reader-events-v1"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not [string]::Equals($identity,$ExpectedIdentity,[StringComparison]::OrdinalIgnoreCase)) {
  throw ("UNEXPECTED_SERVICE_IDENTITY:" + $identity)
}
if (-not (Test-Path -LiteralPath $Reader -PathType Leaf)) {
  throw "CONTINUOUS_READER_SCRIPT_MISSING"
}

& $Reader `
  -MaxPolls 0 `
  -PollSeconds $PollSeconds `
  -StablePolls $StablePolls `
  -TopOrders $TopOrders `
  -CheckpointPath $Checkpoint `
  -EventDir $Events

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
exit 0

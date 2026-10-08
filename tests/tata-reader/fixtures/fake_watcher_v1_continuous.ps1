param(
  [int]$MaxPolls = 0,
  [int]$PollSeconds = 3,
  [int]$StablePolls = 2,
  [int]$TopOrders = 50,
  [string]$CheckpointPath,
  [string]$EventDir
)
# WATCHER V1 FALSO (o "instalado" do teste ponta a ponta do cutover): modo
# continuo, grava o checkpoint a cada poll, nunca sai. Sem SQL.
$ErrorActionPreference = "Stop"
$dir = [IO.Path]::GetDirectoryName($CheckpointPath)
if (-not [IO.Directory]::Exists($dir)) { [void][IO.Directory]::CreateDirectory($dir) }
while ($true) {
  $tmp = $CheckpointPath + ".tmp." + $PID
  [IO.File]::WriteAllText($tmp, '{"schema":"deliveryos.tata-reader-continuous-checkpoint.v1","bootstrap_complete":true,"entries":[],"writer":"v1"}')
  if ([IO.File]::Exists($CheckpointPath)) { $bak = $CheckpointPath + ".bak." + $PID; [IO.File]::Replace($tmp, $CheckpointPath, $bak, $true); [IO.File]::Delete($bak) } else { [IO.File]::Move($tmp, $CheckpointPath) }
  Start-Sleep -Seconds $PollSeconds
}

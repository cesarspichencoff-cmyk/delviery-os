param(
  [int]$MaxPolls = 0,
  [int]$PollSeconds = 3,
  [int]$StablePolls = 2,
  [int]$TopOrders = 50,
  [string]$CheckpointPath = "C:\ProgramData\TataComandaReader\state\reader-watch-checkpoint-v1.json",
  [string]$EventDir = "C:\ProgramData\TataComandaReader\state\reader-events-v1"
)
# CANDIDATO V2 FALSO, de laboratorio: a mesma FORMA do watcher real (conferencia
# de identidade, laco, checkpoint a cada poll, resultado do lote, falha em voz
# alta no modo limitado), sem SQL. Passa pela auditoria estatica real como
# INSTALL_ONLY_UNDER_SUPERVISOR. Comportamento lido de candidate-behavior.json
# ao lado do checkpoint: "ok" | "fail" | "hang_batch".
$ErrorActionPreference = "Stop"
$ExpectedLogin = "NT SERVICE\TataComandaReader"
$IdentityQuery = "SELECT SUSER_SNAME() AS current_login, DB_NAME() AS database_name;"
try { $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name } catch { $identity = $ExpectedLogin }

function Save-Checkpoint($checkpoint) {
  $tmp = $CheckpointPath + ".tmp." + $PID
  $json = '{"schema":"deliveryos.tata-reader-continuous-checkpoint.v1","bootstrap_complete":true,"entries":[],"writer":"candidate"}'
  [IO.File]::WriteAllText($tmp, $json)
  if ([IO.File]::Exists($CheckpointPath)) { $bak = $CheckpointPath + ".bak." + $PID; [IO.File]::Replace($tmp, $CheckpointPath, $bak, $true); [IO.File]::Delete($bak) } else { [IO.File]::Move($tmp, $CheckpointPath) }
}

$behaviorPath = [IO.Path]::Combine([IO.Path]::GetDirectoryName($CheckpointPath), "candidate-behavior.json")
$behavior = "ok"
if ([IO.File]::Exists($behaviorPath)) { $behavior = [string](([IO.File]::ReadAllText($behaviorPath) | ConvertFrom-Json).behavior) }
$checkpoint = @{}

$result = [ordered]@{
  schema = "deliveryos.tata-reader-continuous-watch-run.v1"
  mode = if ($MaxPolls -gt 0) { "BOUNDED_PROOF" } else { "CONTINUOUS_READ_ONLY" }
  service_identity = $identity
  polls = 0
  poll_errors = 0
  snapshots_observed = 0
  events_emitted = 0
  duplicates_suppressed = 0
  changed_snapshots = 0
  baseline_suppressed = 0
  effects = [ordered]@{
    database_read = $true
    database_write = $false
    local_checkpoint_write = $true
    local_event_write = $true
    network_call = $false
    odhen_write = $false
    print = $false
    spooler_write = $false
    fiscal_action = $false
    sefaz_call = $false
    cutover = $false
  }
  status = "RUNNING"
}

while ($true) {
  if ($MaxPolls -gt 0 -and $result.polls -ge $MaxPolls) { break }
  $result.polls++
  try {
    if ($behavior -eq "fail") { throw "SIMULATED_READ_FAILURE" }
    if ($behavior -eq "hang_batch") { Start-Sleep -Seconds 600 }
    $result.snapshots_observed++
    Save-Checkpoint $checkpoint
  } catch {
    $result.poll_errors++
    if($MaxPolls -gt 0){throw}
  }
  if($MaxPolls -eq 0 -or $result.polls -lt $MaxPolls){Start-Sleep -Seconds $PollSeconds}
}
$result.status = "COMPLETED"
$result | ConvertTo-Json -Depth 12

<#
  Sonda das funcoes PURAS do cutover. Carrega o script por dot-source — o que,
  por construcao, NAO executa nada — e imprime um JSON com o resultado de cada
  caso. O teste em Node confere esse JSON. Nada aqui toca servico, banco ou
  arquivo do sistema.
#>
param(
  [Parameter(Mandatory = $true)][string]$CutoverScript,
  [Parameter(Mandatory = $true)][string]$AcceptRoot,
  [Parameter(Mandatory = $true)][string]$WatcherSha,
  [Parameter(Mandatory = $true)][string]$PsExe
)
$ErrorActionPreference = "Stop"
. $CutoverScript

function Snap {
  return [ordered]@{
    scm_state = "Running"; host_state = "RUNNING"; host_updated_after_restart = $true; heartbeat_after_restart = $true
    heartbeat_supervisor_sha256 = "S"; expected_supervisor_sha256 = "S"
    heartbeat_watcher_expected_sha256 = "W"; heartbeat_watcher_verified = $true; expected_watcher_sha256 = "W"
    heartbeat_ok_batches = 2; min_ok_batches = 2; heartbeat_consecutive_failures = 0; heartbeat_last_batch_outcome = "OK"
    heartbeat_database_write = $false; checkpoint_advanced = $true; consumer_state = "RUNNING"; health_verdict = "HEALTHY"
    sql_session_after_restart = "UNKNOWN"; new_event_privacy = "UNKNOWN"
  }
}

$out = [ordered]@{}
$out.all_ok = (Test-CutoverGate (Snap)).pass
$cases = [ordered]@{
  scm_running = @{ scm_state = "Stopped" }
  host_running_after_restart = @{ host_updated_after_restart = $false }
  heartbeat_after_restart = @{ heartbeat_after_restart = $false }
  supervisor_sha_matches = @{ heartbeat_supervisor_sha256 = "X" }
  watcher_sha_pinned_and_verified = @{ heartbeat_watcher_verified = $false }
  ok_batches = @{ heartbeat_ok_batches = 1 }
  no_consecutive_failures = @{ heartbeat_consecutive_failures = 1 }
  last_batch_ok = @{ heartbeat_last_batch_outcome = "WATCHER_FAILED" }
  checkpoint_advanced = @{ checkpoint_advanced = $false }
  health_verdict_healthy = @{ health_verdict = "DEGRADED" }
  no_forbidden_effect = @{ heartbeat_database_write = $true }
  consumer_not_failed = @{ consumer_state = "FAILED" }
  sql_session_after_restart = @{ sql_session_after_restart = "FAIL" }
  new_event_privacy = @{ new_event_privacy = "FAIL" }
}
$out.single_failures = [ordered]@{}
foreach ($k in $cases.Keys) {
  $s = Snap
  foreach ($f in $cases[$k].Keys) { $s[$f] = $cases[$k][$f] }
  $g = Test-CutoverGate $s
  $out.single_failures[$k] = [ordered]@{ pass = $g.pass; failed = @($g.failed) }
}
$s = Snap; $s.heartbeat_supervisor_sha256 = $null; $s.expected_supervisor_sha256 = $null
$out.unknown_supervisor_sha_blocks = -not (Test-CutoverGate $s).pass
$out.audit = [ordered]@{
  under_supervisor = Test-AuditAllowsSupervisor ([pscustomobject]@{ recommendation = "INSTALL_ONLY_UNDER_SUPERVISOR" })
  safe = Test-AuditAllowsSupervisor ([pscustomobject]@{ recommendation = "SAFE_CONTINUOUS_AND_SUPERVISABLE" })
  do_not = Test-AuditAllowsSupervisor ([pscustomobject]@{ recommendation = "DO_NOT_INSTALL" })
  null = Test-AuditAllowsSupervisor $null
}
$v1 = '"deliveryos.tata-reader-continuous-checkpoint.v1"'
$out.checkpoint = [ordered]@{
  compatible = Test-CheckpointCompatible ("x " + $v1 + " y") "deliveryos.tata-reader-continuous-checkpoint.v1"
  incompatible = Test-CheckpointCompatible 'x "deliveryos.tata-reader-continuous-checkpoint.v2" y' "deliveryos.tata-reader-continuous-checkpoint.v1"
  none_yet = Test-CheckpointCompatible "x" ""
}
$L = Get-Layout "C:\ProgramData\TataComandaReader"
$out.layout = $L
$out.config_windows = New-SupervisorConfig $L ("ab" * 32) "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" 60
# Config gerada para um layout real (temporario) — o teste a entrega ao
# supervisor verdadeiro para provar que o cutover escreve o que ele aceita.
$A = Get-Layout $AcceptRoot
$cfg = New-SupervisorConfig $A $WatcherSha $PsExe 3
$out.accept_layout = $A
[IO.File]::WriteAllText($A.supervisor_config, ($cfg | ConvertTo-Json -Depth 5))
$out | ConvertTo-Json -Depth 8

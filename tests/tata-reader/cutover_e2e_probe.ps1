<#
  Sonda PONTA A PONTA do cutover com SCM simulado. Carrega o cutover real por
  dot-source e troca SO as funcoes que falam com o Service Control Manager do
  Windows (estado, parar, iniciar, info do servico, admin) por um host falso
  (fixtures/fake_service_host.cjs) que imita o host C# v2. Todo o resto e o
  codigo real: preflight, auditoria, backup, instalacao atomica, gates, caca
  por linha de comando, rollback, recibo e codigo de saida.

  -FailStartOnce: a primeira chamada de "iniciar o servico" lanca, para provar
  que erro depois do primeiro efeito vira rollback com recibo, nunca saida 1.
  -BreakProcessListOnRollback: a partir da parada do rollback, enumerar
  processos falha (como um WMI que falha por um instante); com
  -ErrorAction SilentlyContinue a falha some e a lista volta VAZIA.
  -FailMoveAsideOnRollback: no rollback, tirar o heartbeat do caminho lanca
  (antivirus segurando o arquivo).
  -ProbeBatchPolls: tamanho do lote do supervisor (padrao 3).
#>
param(
  [Parameter(Mandatory = $true)][string]$CutoverScript,
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$HostJs,
  [Parameter(Mandatory = $true)][string]$Node,
  [Parameter(Mandatory = $true)][string]$Pwsh,
  [Parameter(Mandatory = $true)][string]$PidFile,
  [Parameter(Mandatory = $true)][string]$ScenarioMode,
  [Parameter(Mandatory = $true)][string]$Candidate,
  [Parameter(Mandatory = $true)][string]$RuntimeDir,
  [string]$ConfirmInstalled = "",
  [string]$ConfirmHost = "",
  [string]$ConfirmSupervisor = "",
  [string]$RollbackDir = "",
  [int]$HealthWait = 45,
  [int]$RollbackProof = 30,
  [int]$ProbeBatchPolls = 3,
  [switch]$FailStartOnce,
  [switch]$BreakProcessListOnRollback,
  [switch]$FailMoveAsideOnRollback
)
$ErrorActionPreference = "Stop"
$probe = @{ Root = $Root; HostJs = $HostJs; Node = $Node; Pwsh = $Pwsh; PidFile = $PidFile; FailStartOnce = [bool]$FailStartOnce; StartCalls = 0
  StopCalls = 0; BreakProcList = [bool]$BreakProcessListOnRollback; ProcListBroken = $false; FailMoveAside = [bool]$FailMoveAsideOnRollback }
. $CutoverScript

function Get-FakeHostPid {
  if (-not [IO.File]::Exists($probe.PidFile)) { return $null }
  $t = [IO.File]::ReadAllText($probe.PidFile).Trim()
  if ($t -eq "") { return $null }
  return [int]$t
}
function Test-FakeAlive($Id) {
  if ($null -eq $Id) { return $false }
  try { $p = Microsoft.PowerShell.Management\Get-Process -Id $Id -ErrorAction Stop; return (-not $p.HasExited) } catch { return $false }
}
# ---- substituicoes do SCM -------------------------------------------------
function Get-ScmState { if (Test-FakeAlive (Get-FakeHostPid)) { return "Running" } return "Stopped" }
function Invoke-ServiceStop {
  $probe.StopCalls++
  # A segunda parada e a do rollback: dali em diante as falhas injetadas valem.
  if ($probe.StopCalls -ge 2 -and $probe.BreakProcList) { $probe.ProcListBroken = $true }
  $h = Get-FakeHostPid
  if (Test-FakeAlive $h) { & /bin/kill -TERM $h }
}
# Enumeracao de processos que falha (so a enumeracao; -Id continua): com
# -ErrorAction SilentlyContinue a falha some e a lista volta vazia.
function Get-Process {
  [CmdletBinding()] param([int[]]$Id)
  if ($PSBoundParameters.ContainsKey("Id")) { return Microsoft.PowerShell.Management\Get-Process -Id $Id }
  if ($probe.ProcListBroken) { Write-Error "SIMULATED_PROCESS_LIST_FAILURE"; return }
  return Microsoft.PowerShell.Management\Get-Process
}
$script:OriginalMoveAside = ${function:Move-Aside}
function Move-Aside([string]$Path, [string]$Suffix) {
  if ($probe.FailMoveAside -and $probe.StopCalls -ge 2 -and [IO.Path]::GetFileName($Path) -eq "reader-heartbeat-v1.json") { throw "SIMULATED_MOVE_ASIDE_LOCK" }
  return (& $script:OriginalMoveAside $Path $Suffix)
}
function Invoke-ServiceStart {
  $probe.StartCalls++
  if ($probe.FailStartOnce -and $probe.StartCalls -eq 1) { throw "SIMULATED_SERVICE_START_FAILURE" }
  & $probe.Node $probe.HostJs --launch --root $probe.Root --pwsh $probe.Pwsh --poll 1 --pidfile $probe.PidFile
  if ($LASTEXITCODE -ne 0) { throw "FAKE_HOST_LAUNCH_FAILED" }
}
function Get-ServiceInfo {
  $h = Get-FakeHostPid
  $alive = Test-FakeAlive $h
  return [ordered]@{
    state = if ($alive) { "Running" } else { "Stopped" }
    start_name = "NT SERVICE\TataComandaReader"
    path_name = '"' + $probe.HostJs + '" --service'
    start_mode = "Auto"
    process_id = if ($alive) { $h } else { $null }
  }
}
function Assert-Admin { }

# ---- parametros do cutover (o dot-source criou as variaveis neste escopo) ---
$Mode = $ScenarioMode
$InstallRoot = $Root
$CandidateWatcherPath = $Candidate
$CandidateWatcherSha256 = (Get-FileHash -LiteralPath $Candidate -Algorithm SHA256).Hash
$SupervisorSourcePath = [IO.Path]::Combine($RuntimeDir, "tata_reader_supervisor_v1.ps1")
$SupervisorSha256 = $ConfirmSupervisor
$ExpectedInstalledWatcherSha256 = $ConfirmInstalled
$ExpectedHostBinarySha256 = $ConfirmHost
$RepoRuntimeDir = $RuntimeDir
$NodeExe = $Node
$PowerShellExe = $Pwsh
$BatchPolls = $ProbeBatchPolls
$HealthWaitSeconds = $HealthWait
$MinOkBatches = 2
$RollbackProofSeconds = $RollbackProof
$BackupDir = $RollbackDir

$r = Invoke-Main
$r | ConvertTo-Json -Depth 14
exit (Get-ExitCodeForDecision ([string]$r.decision))

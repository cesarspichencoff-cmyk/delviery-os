<#
  PROVA EM WINDOWS REAL do cutover do supervisor do leitor TATA Comanda.

  O que e real aqui (e no ensaio Linux era simulado): o Service Control
  Manager do Windows, o Windows PowerShell 5.1 sobre .NET Framework 4.x, o
  NTFS (File.Replace de dois renames), a caca de processo pelo CIM, a conta
  virtual NT SERVICE\TataComandaReader e o HOST C# v2 DE VERDADE: a fonte
  copiada byte a byte de 93b006b (fixtures/host_v2) e compilada com o csc.exe
  do .NET Framework, como na CAIXA. O cutover roda sem nenhuma funcao trocada.

  O que continua falso (e dito): os watchers. O v1 "instalado" e o candidato
  v2 sao fixtures sem SQL (fake_watcher_v1_continuous.ps1, fake_candidate_v2.ps1),
  com o comportamento do candidato escolhido por cenario.

  Cenarios:
    W0 servico real sobe com o v1 e a conta virtual grava o checkpoint;
    W1 Plan: PLAN_OK, saida 0, nada escrito (bin\ e state\ intactos);
    W2 Apply com candidato bom: APPLIED_HEALTHY, saida 0, supervisor do repo no
       caminho fixo, lotes OK, checkpoint escrito pelo candidato;
    W3 Rollback manual do W2: MANUAL_ROLLBACK_PROVEN, saida 3, v1 restaurado
       byte a byte, v1 escrevendo de novo, nenhum processo do candidato;
    W4 candidato que falha: GATE_FAILED_ROLLBACK_PROVEN, saida 3;
    W5 candidato que trava o lote: o Stop-Service real mata so o supervisor,
       o lote orfao sobrevive e o rollback o encerra pela linha de comando.

  So roda em maquina DESCARTAVEL: exige GITHUB_ACTIONS=true e recusa se o
  servico TataComandaReader ou a pasta C:\ProgramData\TataComandaReader ja
  existirem. Nunca rodar numa CAIXA.
  Saida: um JSON por cenario em -OutDir e exit 0 so se todos passarem.
#>
param(
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe"
)
$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 aberto com o PSModulePath do PowerShell 7 (herdado de
# um pai qualquer) tenta carregar modulos do 7 e quebra o que vem de modulo
# (Get-CimInstance, Get-FileHash). O pwsh limpa isso quando ele mesmo abre o
# powershell.exe; aqui a limpeza vale para qualquer pai. Provado no Windows
# real: CI 37867864216, todo lote WATCHER_UNREADABLE.
if ($PSVersionTable.PSEdition -eq "Desktop" -and $env:PSModulePath) {
  $env:PSModulePath = (@($env:PSModulePath -split ";") | Where-Object { $_ -and $_ -notmatch "(^|[\\/])PowerShell([\\/]|$)" }) -join ";"
}

if ($env:GITHUB_ACTIONS -ne "true") { throw "RECUSADO: so em runner descartavel (GITHUB_ACTIONS=true)" }
$Svc = "TataComandaReader"
if ($null -ne (Get-Service -Name $Svc -ErrorAction SilentlyContinue)) { throw "RECUSADO: o servico $Svc ja existe nesta maquina" }
$Root = "C:\ProgramData\TataComandaReader"
# Servico removido com dados guardados tambem nao e maquina descartavel: nada
# aqui sobrescreve bin\, checkpoint ou ACL de uma instalacao que ja existiu.
if ([IO.Directory]::Exists($Root)) { throw "RECUSADO: $Root ja existe nesta maquina" }
if ([IO.Directory]::Exists("C:\TATA-E2E")) { throw "RECUSADO: C:\TATA-E2E ja existe nesta maquina" }

$Bin = [IO.Path]::Combine($Root, "bin")
$State = [IO.Path]::Combine($Root, "state")
$Evidence = [IO.Path]::Combine($Root, "evidence")
$ShadowDir = [IO.Path]::Combine($Root, "shadow")
$HostExe = [IO.Path]::Combine($Bin, "TataComandaReader.ContinuousHost.exe")
$Fixed = [IO.Path]::Combine($Bin, "tata_reader_continuous_watch_candidate_v1.ps1")
$Checkpoint = [IO.Path]::Combine($State, "reader-watch-checkpoint-v1.json")
$Heartbeat = [IO.Path]::Combine($State, "reader-heartbeat-v1.json")
$Behavior = [IO.Path]::Combine($State, "candidate-behavior.json")
$Stage = "C:\TATA-E2E\candidate"
$Candidate = [IO.Path]::Combine($Stage, "tata_reader_continuous_watch_candidate_v2.ps1")
$Runtime = [IO.Path]::Combine($RepoRoot, "runtime", "tata-reader")
$Cutover = [IO.Path]::Combine($Runtime, "tata_reader_supervisor_cutover_v1.ps1")
$SupervisorSrc = [IO.Path]::Combine($Runtime, "tata_reader_supervisor_v1.ps1")
$Fx = [IO.Path]::Combine($RepoRoot, "tests", "tata-reader", "fixtures")
$V1Fixture = [IO.Path]::Combine($Fx, "fake_watcher_v1_continuous.ps1")
$PsExe = [IO.Path]::Combine($env:SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
[void][IO.Directory]::CreateDirectory($OutDir)

function Get-Sha([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { return $null }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try { $h = $sha.ComputeHash($fs) } finally { $fs.Dispose() }
  } finally { $sha.Dispose() }
  return ([BitConverter]::ToString($h)).Replace("-", "")
}

function Write-Json([string]$Path, $Object) {
  [IO.File]::WriteAllText($Path, ($Object | ConvertTo-Json -Depth 16), (New-Object Text.UTF8Encoding($false)))
}

# Processo filho com stdout e stderr capturados SEM redirecionamento do
# PowerShell (no 5.1, stderr de comando nativo redirecionado vira erro).
function Invoke-Exe([string]$File, [string[]]$Arguments, [int]$TimeoutSeconds) {
  $quoted = @()
  foreach ($a in $Arguments) { $quoted += ('"' + ([string]$a).Replace('"', '\"') + '"') }
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $File
  $psi.Arguments = ($quoted -join " ")
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $p = [Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync()
  $err = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit($TimeoutSeconds * 1000)) { try { $p.Kill() } catch { }; throw ("TIMEOUT " + [IO.Path]::GetFileName($File)) }
  $p.WaitForExit()
  return [ordered]@{ code = $p.ExitCode; stdout = $out.Result; stderr = $err.Result }
}

function Invoke-Cutover([string[]]$Extra, [int]$TimeoutSeconds) {
  $base = @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", $Cutover,
    "-CandidateWatcherPath", $Candidate, "-CandidateWatcherSha256", (Get-Sha $Candidate),
    "-RepoRuntimeDir", $Runtime, "-NodeExe", $NodeExe, "-PowerShellExe", $PsExe,
    "-BatchPolls", "3", "-RollbackProofSeconds", "90")
  $r = Invoke-Exe $PsExe ($base + $Extra) $TimeoutSeconds
  $json = $null
  $i = $r.stdout.IndexOf("{")
  $j = $r.stdout.LastIndexOf("}")
  if ($i -ge 0 -and $j -gt $i) { $json = $r.stdout.Substring($i, $j - $i + 1) | ConvertFrom-Json }
  return [ordered]@{ code = $r.code; receipt = $json; stderr = $r.stderr }
}

# Processos PowerShell cuja linha de comando cita o caminho (CIM, como o cutover no 5.1).
function Get-PsCiting([string]$Needle) {
  $n = 0
  foreach ($p in @(Get-CimInstance -ClassName Win32_Process)) {
    if ([string]$p.Name -notmatch "^(powershell|pwsh)(\.exe)?$" -or [int]$p.ProcessId -eq $PID) { continue }
    if (([string]$p.CommandLine).IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $n++ }
  }
  return $n
}

function Get-Writer {
  try { return [string](([IO.File]::ReadAllText($Checkpoint)) | ConvertFrom-Json).writer } catch { return $null }
}

function Wait-Until([scriptblock]$Condition, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try { if (& $Condition) { return $true } } catch { }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Set-Behavior([string]$Name) {
  [IO.File]::WriteAllText($Behavior, ('{"behavior":"' + $Name + '"}'), (New-Object Text.UTF8Encoding($false)))
}

$results = [ordered]@{}
$failures = @()
function Add-Result([string]$Id, [string]$Name, [bool]$Pass, $Detail) {
  $script:results[$Id] = [ordered]@{ name = $Name; pass = $Pass; detail = $Detail }
  if ($Pass) { Write-Host ("  ok  " + $Id + " " + $Name) } else { Write-Host ("  XX  " + $Id + " " + $Name); $script:failures += $Id }
  Write-Json ([IO.Path]::Combine($OutDir, ($Id + ".json"))) $script:results[$Id]
}

# Plan -> SHAs -> Apply. Devolve o recibo do Apply.
function Invoke-PlanThenApply([int]$HealthWait) {
  $plan = Invoke-Cutover @("-Mode", "Plan") 300
  if ($plan.code -ne 0 -or $null -eq $plan.receipt -or [string]$plan.receipt.decision -ne "PLAN_OK") {
    return [ordered]@{ code = $plan.code; receipt = $plan.receipt; stage = "PLAN"; stderr = $plan.stderr }
  }
  $req = $plan.receipt.apply_requires
  $apply = Invoke-Cutover @("-Mode", "Apply",
    "-ExpectedInstalledWatcherSha256", [string]$req.ExpectedInstalledWatcherSha256,
    "-ExpectedHostBinarySha256", [string]$req.ExpectedHostBinarySha256,
    "-SupervisorSha256", [string]$req.SupervisorSha256,
    "-HealthWaitSeconds", [string]$HealthWait) ($HealthWait + 600)
  $apply.stage = "APPLY"
  return $apply
}

Write-Host "=== TATA READER - CUTOVER EM WINDOWS REAL (SCM, WinPS 5.1, host C# v2) ==="
$env_info = [ordered]@{
  ps_version = $PSVersionTable.PSVersion.ToString()
  ps_edition = [string]$PSVersionTable.PSEdition
  clr = $PSVersionTable.CLRVersion.ToString()
  netfx_release = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full").Release
  os = [Environment]::OSVersion.VersionString
  timezone = [TimeZoneInfo]::Local.Id
  host_source_sha256 = Get-Sha ([IO.Path]::Combine($Fx, "host_v2", "TataComandaReader.ContinuousService.v2.cs"))
  supervisor_sha256 = Get-Sha $SupervisorSrc
  cutover_sha256 = Get-Sha $Cutover
}
Write-Json ([IO.Path]::Combine($OutDir, "environment.json")) $env_info
$env_info | Format-List | Out-String | Write-Host
if ($PSVersionTable.PSVersion.Major -ne 5) { throw "ESTA PROVA E PARA O WINDOWS POWERSHELL 5.1; rodando " + $PSVersionTable.PSVersion }

try {
  # ------------------------------------------------ montagem da maquina --
  foreach ($d in @($Bin, $State, $Evidence, $ShadowDir, $Stage)) { [void][IO.Directory]::CreateDirectory($d) }
  if (-not [IO.File]::Exists($NodeExe)) {
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($NodeExe))
    [IO.File]::Copy((Get-Command node).Source, $NodeExe)
  }
  $csc = [IO.Path]::Combine($env:SystemRoot, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe")
  $build = Invoke-Exe $csc @("/nologo", "/target:exe", ("/out:" + $HostExe), "/r:System.ServiceProcess.dll", ([IO.Path]::Combine($Fx, "host_v2", "TataComandaReader.ContinuousService.v2.cs"))) 120
  if ($build.code -ne 0) { throw ("CSC_FALHOU " + $build.stdout + $build.stderr) }
  [IO.File]::Copy($V1Fixture, $Fixed, $true)
  [IO.File]::Copy([IO.Path]::Combine($Fx, "host_v2", "shadow_loop_stub.cjs"), [IO.Path]::Combine($ShadowDir, "live_shadow_consumer_loop_v1.cjs"), $true)
  [IO.File]::Copy([IO.Path]::Combine($Fx, "fake_candidate_v2.ps1"), $Candidate, $true)
  Set-Behavior "ok"

  $sc = Invoke-Exe "sc.exe" @("create", $Svc, "binPath=", $HostExe, "obj=", ("NT SERVICE\" + $Svc), "start=", "demand") 60
  if ($sc.code -ne 0) { throw ("SC_CREATE_FALHOU " + $sc.stdout) }
  # Recuperacao como na CAIXA: 5 s, 15 s, depois nenhuma (reset 24 h).
  $null = Invoke-Exe "sc.exe" @("failure", $Svc, "reset=", "86400", "actions=", "restart/5000/restart/15000") 60
  $acl = Invoke-Exe "icacls.exe" @($Root, "/grant", ("NT SERVICE\" + $Svc + ":(OI)(CI)M"), "/T", "/Q") 120
  if ($acl.code -ne 0) { throw ("ICACLS_FALHOU " + $acl.stdout) }

  # --------------------------------------------------------------- W0 --
  Start-Service -Name $Svc
  $w0 = Wait-Until { [IO.File]::Exists($Checkpoint) -and (Get-Writer) -eq "v1" } 60
  $svcInfo = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $Svc + "'")
  Add-Result "W0" "servico real sobe com o v1 e a conta virtual grava o checkpoint" ($w0 -and [string]$svcInfo.StartName -eq ("NT SERVICE\" + $Svc) -and [string]$svcInfo.State -eq "Running") ([ordered]@{ start_name = [string]$svcInfo.StartName; state = [string]$svcInfo.State; writer = (Get-Writer) })

  # --------------------------------------------------------------- W1 --
  $binBefore = @(Get-ChildItem -LiteralPath $Bin | ForEach-Object { $_.Name + "=" + (Get-Sha $_.FullName) }) -join ";"
  $plan = Invoke-Cutover @("-Mode", "Plan") 300
  $binAfter = @(Get-ChildItem -LiteralPath $Bin | ForEach-Object { $_.Name + "=" + (Get-Sha $_.FullName) }) -join ";"
  $noBackupDir = -not [IO.Directory]::Exists([IO.Path]::Combine($State, "supervisor-cutover-v1"))
  $planOk = ($plan.code -eq 0 -and $null -ne $plan.receipt -and [string]$plan.receipt.decision -eq "PLAN_OK" -and $binBefore -eq $binAfter -and $noBackupDir -and (Get-Service -Name $Svc).Status -eq "Running")
  Add-Result "W1" "Plan so le: PLAN_OK, saida 0, bin\ identico byte a byte, nenhum backup" $planOk ([ordered]@{ code = $plan.code; decision = if ($plan.receipt) { [string]$plan.receipt.decision } else { $null }; checks = if ($plan.receipt) { $plan.receipt.checks } else { $null }; bin_unchanged = ($binBefore -eq $binAfter); stderr = $plan.stderr })

  # --------------------------------------------------------------- W2 --
  $w2 = Invoke-PlanThenApply 240
  $fixedSha = Get-Sha $Fixed
  $hb = $null
  try { $hb = [IO.File]::ReadAllText($Heartbeat) | ConvertFrom-Json } catch { }
  $w2Pass = ($w2.code -eq 0 -and [string]$w2.receipt.decision -eq "APPLIED_HEALTHY" -and $fixedSha -eq (Get-Sha $SupervisorSrc) -and (Get-Writer) -eq "candidate" -and $null -ne $hb -and [int]$hb.totals.ok -ge 2)
  Add-Result "W2" "Apply real: APPLIED_HEALTHY, saida 0, supervisor do repo no caminho fixo, lotes OK, checkpoint do candidato" $w2Pass ([ordered]@{ code = $w2.code; stage = $w2.stage; decision = if ($w2.receipt) { [string]$w2.receipt.decision } else { $null }; gate = if ($w2.receipt) { $w2.receipt.gate } else { $null }; after = if ($w2.receipt) { $w2.receipt.after } else { $null }; heartbeat_ok = if ($hb) { [int]$hb.totals.ok } else { $null }; writer = (Get-Writer); stderr = $w2.stderr })

  # --------------------------------------------------------------- W3 --
  if ($w2Pass) {
    $rb = Invoke-Cutover @("-Mode", "Rollback", "-BackupDir", [string]$w2.receipt.backup_dir) 600
    $v1Back = Wait-Until { (Get-Writer) -eq "v1" } 60
    $w3Pass = ($rb.code -eq 3 -and [string]$rb.receipt.decision -eq "MANUAL_ROLLBACK_PROVEN" -and (Get-Sha $Fixed) -eq (Get-Sha $V1Fixture) -and $v1Back -and (Get-PsCiting $Candidate) -eq 0 -and (Get-PsCiting "tata_reader_continuous_watch_candidate_v2.ps1") -eq 0 -and -not [IO.File]::Exists([IO.Path]::Combine($Bin, "tata_reader_supervisor_v1.config.json")))
    Add-Result "W3" "Rollback manual real: MANUAL_ROLLBACK_PROVEN, saida 3, v1 restaurado byte a byte e escrevendo, nenhum processo do candidato" $w3Pass ([ordered]@{ code = $rb.code; decision = if ($rb.receipt) { [string]$rb.receipt.decision } else { $null }; rollback = if ($rb.receipt) { $rb.receipt.rollback } else { $null }; writer = (Get-Writer); stderr = $rb.stderr })
  } else {
    Add-Result "W3" "Rollback manual real (pulado: W2 falhou)" $false $null
  }

  # --------------------------------------------------------------- W4 --
  Set-Behavior "fail"
  $w4 = Invoke-PlanThenApply 45
  $w4Back = Wait-Until { (Get-Writer) -eq "v1" } 60
  $w4Pass = ($w4.code -eq 3 -and [string]$w4.receipt.decision -eq "GATE_FAILED_ROLLBACK_PROVEN" -and (Get-Sha $Fixed) -eq (Get-Sha $V1Fixture) -and $w4Back -and (Get-PsCiting "tata_reader_continuous_watch_candidate_v2.ps1") -eq 0)
  Add-Result "W4" "candidato que falha: GATE_FAILED_ROLLBACK_PROVEN, saida 3, v1 de volta" $w4Pass ([ordered]@{ code = $w4.code; stage = $w4.stage; decision = if ($w4.receipt) { [string]$w4.receipt.decision } else { $null }; gate_failure = if ($w4.receipt) { $w4.receipt.gate_failure } else { $null }; rollback = if ($w4.receipt) { $w4.receipt.rollback } else { $null }; stderr = $w4.stderr })

  # --------------------------------------------------------------- W5 --
  Set-Behavior "hang_batch"
  $w5 = Invoke-PlanThenApply 60
  $w5Back = Wait-Until { (Get-Writer) -eq "v1" } 60
  $killed = if ($w5.receipt -and $w5.receipt.rollback) { [int]$w5.receipt.rollback.candidate_processes_killed } else { -1 }
  $w5Pass = ($w5.code -eq 3 -and [string]$w5.receipt.decision -eq "GATE_FAILED_ROLLBACK_PROVEN" -and $killed -ge 1 -and (Get-PsCiting "tata_reader_continuous_watch_candidate_v2.ps1") -eq 0 -and $w5Back)
  Add-Result "W5" "lote travado: Stop-Service real mata so o supervisor; o orfao morre pela linha de comando; rollback provado" $w5Pass ([ordered]@{ code = $w5.code; stage = $w5.stage; decision = if ($w5.receipt) { [string]$w5.receipt.decision } else { $null }; candidate_processes_killed = $killed; rollback = if ($w5.receipt) { $w5.receipt.rollback } else { $null }; stderr = $w5.stderr })
} catch {
  $failures += "ORQUESTRADOR"
  Write-Host ("ERRO NO ORQUESTRADOR: " + $_.Exception.GetType().FullName + ": " + $_.Exception.Message)
  Write-Json ([IO.Path]::Combine($OutDir, "orchestrator-error.json")) ([ordered]@{ class = $_.Exception.GetType().FullName; message = $_.Exception.Message; at = [string]$_.InvocationInfo.PositionMessage })
} finally {
  # Retrato final e limpeza: logs do host e do supervisor so como artefato do CI.
  foreach ($f in @("continuous-host-status.json", "continuous-watcher.stdout.log", "continuous-watcher.stderr.log")) {
    $src = [IO.Path]::Combine($Evidence, $f)
    if ([IO.File]::Exists($src)) { [IO.File]::Copy($src, [IO.Path]::Combine($OutDir, "host-" + $f), $true) }
  }
  foreach ($d in @(Get-ChildItem -LiteralPath ([IO.Path]::Combine($State, "supervisor-cutover-v1")) -Directory -ErrorAction SilentlyContinue)) {
    foreach ($r in @(Get-ChildItem -LiteralPath $d.FullName -Filter "receipt-*.json" -ErrorAction SilentlyContinue)) {
      [IO.File]::Copy($r.FullName, [IO.Path]::Combine($OutDir, $d.Name + "-" + $r.Name), $true)
    }
  }
  try { Stop-Service -Name $Svc -Force -ErrorAction SilentlyContinue } catch { }
  $null = Invoke-Exe "sc.exe" @("delete", $Svc) 60
}

$summary = [ordered]@{ schema = "deliveryos.tata-reader-real-scm-e2e.v1"; environment = $env_info; results = $results; failures = $failures }
Write-Json ([IO.Path]::Combine($OutDir, "summary.json")) $summary
$total = @($results.Keys).Count
$ok = @($results.Keys | Where-Object { $results[$_].pass }).Count
Write-Host ("TATA_READER_REAL_SCM_E2E: " + $ok + "/" + $total + " PASS")
if ($failures.Count -gt 0 -or $total -lt 6) { Write-Host "TATA_READER_REAL_SCM_E2E_RED"; exit 1 }
Write-Host "TATA_READER_REAL_SCM_E2E_GREEN"
exit 0

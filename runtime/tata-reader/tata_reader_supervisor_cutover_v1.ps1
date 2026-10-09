<#
  TATA Comanda Reader - cutover do supervisor com rollback automatico (v1)
  ========================================================================
  Executa, NA CAIXA_MOOCA, a troca autorizada por Cesar: parar o servico
  TataComandaReader -> backup consistente -> instalar o watcher candidato (v2)
  SOB o supervisor -> iniciar -> provar saude REAL -> se qualquer gate falhar
  (ou qualquer erro acontecer depois do primeiro efeito), restaurar o watcher
  e o checkpoint anteriores, iniciar e provar o rollback.

  MODOS
    -Mode Plan      (padrao) so le e confere; nenhuma escrita, nenhum restart.
                    Imprime os tres SHA-256 que o Apply exige de volta.
    -Mode Apply     exige -ExpectedInstalledWatcherSha256, -ExpectedHostBinarySha256
                    e -SupervisorSha256 iguais aos lidos agora.
    -Mode Rollback  restaura um backup anterior (-BackupDir) e prova.

  ORDEM DO APPLY (cada fase depois da primeira e protegida por rollback):
    1 parar o servico e confirmar que NENHUM escritor do checkpoint ficou
      vivo: o watcher antigo e, numa reinstalacao, o lote orfao do supervisor
      anterior; lista de processos desconhecida = aborta e religa o antigo;
    2 backup com manifesto SHA (nada escreve durante a copia);
    3 instalar por arquivo temporario + SHA + troca atomica;
    4 linha de base do checkpoint (estavel: servico parado);
    5 iniciar e observar: SCM, host, heartbeat da MESMA execucao do supervisor
      (troca de run_id ou de PID do servico = reinicio = falha), SHAs, lotes
      OK, efeitos DECLARADOS pelo watcher dentro da politica, checkpoint
      andando, saude HEALTHY.

  ROLLBACK: para o servico; encerra todo processo PowerShell cuja linha de
  comando cite o caminho fixo (primeiro: pode abrir lote) ou o candidato (o
  host mata so o supervisor; o lote filho sobrevive), em rodadas ate uma
  limpa, e confirma; se algum nao morrer, ou se a lista de processos nao for
  conhecida, NAO restaura (dois escritores no checkpoint) e para pedindo
  humano; restaura watcher e checkpoint conferindo SHA; tira candidato,
  configuracao e heartbeat do caminho (falha aqui so fica registrada); inicia;
  prova checkpoint andando, watcher restaurado e nenhum processo do candidato
  vivo (lista desconhecida nao prova).

  FRONTEIRA (o que este script NUNCA faz): escrita no SQL Server, grant ou
  revogacao de permissao, impressao/spooler, Odhen, fiscal/SEFAZ, rede,
  qualquer servico alem de TataComandaReader. O unico acesso ao SQL Server e,
  com -SqlSessionCheck, uma CONSULTA a sys.dm_exec_sessions como o operador.

  RECIBO: todo Apply/Rollback grava um JSON sanitizado (sem PII, sem texto
  livre, sem identificador de pedido) com SHA de cada arquivo, horarios, fases,
  gates e veredito, em state\supervisor-cutover-v1\<carimbo>\.

  SAIDA: 0 PLAN_OK ou APPLIED_HEALTHY; 3 rollback provado; 2 qualquer outro
  desfecho (humano). Nunca 1: erro inesperado vira recibo e 2.

  Funcoes puras e de efeito ficam acima do bloco principal: carregar o script
  com ". arquivo" NAO executa nada. Windows PowerShell 5.1; ASCII puro.
#>
param(
  [ValidateSet("Plan", "Apply", "Rollback")][string]$Mode = "Plan",
  [string]$InstallRoot = "C:\ProgramData\TataComandaReader",
  [string]$ServiceName = "TataComandaReader",
  [string]$CandidateWatcherPath = "C:\TATA\comanda-v1\cutover\shadow-v1\live-truth-v1\tata_reader_continuous_watch_candidate_v2.ps1",
  [string]$CandidateWatcherSha256 = "77C16940EFCAF38E380369AD6F17FBC849C67EC191F9617C3C1EF5119DFF31F0",
  [string]$SupervisorSourcePath = "",
  [string]$SupervisorSha256 = "",
  [string]$ExpectedInstalledWatcherSha256 = "",
  [string]$ExpectedHostBinarySha256 = "",
  [string]$RepoRuntimeDir = "",
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe",
  [string]$PowerShellExe = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
  [int]$BatchPolls = 20,
  [int]$HealthWaitSeconds = 480,
  [int]$MinOkBatches = 2,
  [int]$RollbackProofSeconds = 120,
  [switch]$SqlSessionCheck,
  [string]$SqlServer = "(local)\SQLEXPRESS",
  [string]$BackupDir = ""
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
$CutoverSchema = "deliveryos.tata-reader-supervisor-cutover-receipt.v2"
$ServiceIdentity = "NT SERVICE\TataComandaReader"
# A mesma politica do supervisor, repetida aqui de proposito: o gate compara
# o que o watcher DECLAROU contra a politica do cutover, nao contra o que o
# proprio heartbeat diz que e permitido.
$AllowedWatcherEffects = @("database_read", "local_checkpoint_write", "local_event_write")

# ======================================================== funcoes puras ====

function Get-Layout([string]$Root) {
  $bin = [IO.Path]::Combine($Root, "bin")
  $state = [IO.Path]::Combine($Root, "state")
  $evidence = [IO.Path]::Combine($Root, "evidence")
  return [ordered]@{
    root = $Root
    bin = $bin
    state = $state
    evidence = $evidence
    host_fixed_watcher = [IO.Path]::Combine($bin, "tata_reader_continuous_watch_candidate_v1.ps1")
    candidate_target = [IO.Path]::Combine($bin, "tata_reader_continuous_watch_candidate_v2.ps1")
    supervisor_config = [IO.Path]::Combine($bin, "tata_reader_supervisor_v1.config.json")
    checkpoint = [IO.Path]::Combine($state, "reader-watch-checkpoint-v1.json")
    events = [IO.Path]::Combine($state, "reader-events-v1")
    heartbeat = [IO.Path]::Combine($state, "reader-heartbeat-v1.json")
    child_record = [IO.Path]::Combine($state, "reader-supervisor-child-v1.json")
    lock = [IO.Path]::Combine($state, "reader-supervisor-v1.lock")
    host_status = [IO.Path]::Combine($evidence, "continuous-host-status.json")
    consumer_status = [IO.Path]::Combine($evidence, "shadow-consumer-status.json")
    backups = [IO.Path]::Combine($state, "supervisor-cutover-v1")
  }
}

function New-SupervisorConfig($Layout, [string]$WatcherSha256, [string]$PsExe, [int]$Polls) {
  return [ordered]@{
    schema = "deliveryos.tata-reader-supervisor-config.v1"
    watcher_path = $Layout.candidate_target
    watcher_sha256 = $WatcherSha256.ToUpperInvariant()
    heartbeat_path = $Layout.heartbeat
    child_record_path = $Layout.child_record
    lock_path = $Layout.lock
    powershell_exe = $PsExe
    batch_polls = $Polls
    min_backoff_seconds = 3
    max_backoff_seconds = 60
    heartbeat_every_seconds = 5
  }
}

# Executavel do servico a partir do PathName do SCM: entre aspas, ou ate o
# primeiro ".exe" (caminho sem aspas com espaco), ou ate o primeiro espaco.
function Get-ExePathFromServicePathName([string]$PathName) {
  if ([string]::IsNullOrWhiteSpace($PathName)) { return $null }
  $p = $PathName.Trim()
  if ($p.StartsWith('"')) {
    $end = $p.IndexOf('"', 1)
    if ($end -gt 1) { return $p.Substring(1, $end - 1) }
    return $null
  }
  $m = [regex]::Match($p, "(?i)^.*?\.exe(?=\s|$)")
  if ($m.Success) { return $m.Value }
  $sp = $p.IndexOf(" ")
  if ($sp -gt 0) { return $p.Substring(0, $sp) }
  return $p
}

# Decide se o servico esta saudavel DEPOIS do start. Recebe um retrato ja
# coletado; nao toca em nada. Todo gate obrigatorio tem que ser $true; UNKNOWN
# nao passa. Os opcionais (sessao SQL, evento novo) so reprovam se FALHAREM;
# ausencia vira UNKNOWN registrado no recibo.
function Test-CutoverGate($Snap) {
  $g = [ordered]@{}
  $g.scm_running = ($Snap.scm_state -eq "Running")
  $g.host_running_after_restart = ($Snap.host_state -eq "RUNNING" -and $Snap.host_updated_after_restart -eq $true)
  $g.heartbeat_after_restart = ($Snap.heartbeat_after_restart -eq $true)
  $g.supervisor_run_stable = (-not [string]::IsNullOrWhiteSpace([string]$Snap.heartbeat_run_id) -and $Snap.heartbeat_run_id -eq $Snap.first_run_id)
  $g.service_process_stable = ($null -eq $Snap.first_service_pid -or $Snap.service_pid -eq $Snap.first_service_pid)
  $g.supervisor_sha_matches = (-not [string]::IsNullOrWhiteSpace([string]$Snap.expected_supervisor_sha256) -and $Snap.heartbeat_supervisor_sha256 -eq $Snap.expected_supervisor_sha256)
  $g.watcher_sha_pinned_and_verified = (-not [string]::IsNullOrWhiteSpace([string]$Snap.expected_watcher_sha256) -and $Snap.heartbeat_watcher_expected_sha256 -eq $Snap.expected_watcher_sha256 -and $Snap.heartbeat_watcher_verified -eq $true)
  $g.ok_batches = ($Snap.heartbeat_ok_batches -ge $Snap.min_ok_batches)
  $g.no_consecutive_failures = ($Snap.heartbeat_consecutive_failures -eq 0)
  $g.last_batch_ok = ($Snap.heartbeat_last_batch_outcome -eq "OK")
  $declared = $Snap.heartbeat_last_effects_true
  $effectsOk = ($null -ne $declared)
  if ($effectsOk) { foreach ($e in @($declared)) { if ($AllowedWatcherEffects -notcontains [string]$e) { $effectsOk = $false } } }
  $g.watcher_effects_declared_within_policy = $effectsOk
  $g.checkpoint_advanced = ($Snap.checkpoint_advanced -eq $true)
  $g.health_verdict_healthy = ($Snap.health_verdict -eq "HEALTHY")
  $g.consumer_not_failed = ($Snap.consumer_state -ne "FAILED")
  $optional = [ordered]@{
    sql_session_after_restart = $Snap.sql_session_after_restart
    new_event_privacy = $Snap.new_event_privacy
  }
  $failedRequired = @($g.Keys | Where-Object { -not $g[$_] })
  $failedOptional = @($optional.Keys | Where-Object { $optional[$_] -eq "FAIL" })
  $pass = ($failedRequired.Count -eq 0 -and $failedOptional.Count -eq 0)
  return [ordered]@{
    pass = $pass
    required = $g
    optional = $optional
    failed = @($failedRequired + $failedOptional)
  }
}

# Reinicio do supervisor ou do servico durante a observacao nao espera o fim
# do prazo: e falha na hora (um dos dois restarts do SCM ja foi gasto).
function Test-RestartedDuringGate($Snap) {
  if ([string]::IsNullOrWhiteSpace([string]$Snap.first_run_id)) { return $false }
  if (-not [string]::IsNullOrWhiteSpace([string]$Snap.heartbeat_run_id) -and $Snap.heartbeat_run_id -ne $Snap.first_run_id) { return $true }
  if ($null -ne $Snap.first_service_pid -and $null -ne $Snap.service_pid -and $Snap.service_pid -ne $Snap.first_service_pid) { return $true }
  return $false
}

# A auditoria estatica do candidato decide se ele pode rodar sob o supervisor.
function Test-AuditAllowsSupervisor($Audit) {
  if ($null -eq $Audit) { return $false }
  return ($Audit.recommendation -eq "INSTALL_ONLY_UNDER_SUPERVISOR" -or $Audit.recommendation -eq "SAFE_CONTINUOUS_AND_SUPERVISABLE")
}

# O candidato precisa ler o checkpoint ATUAL. Se ele declara outro schema de
# checkpoint, instalar exigiria migracao de estado: decisao humana.
function Test-CheckpointCompatible([string]$CandidateText, [string]$CurrentCheckpointSchema) {
  if ([string]::IsNullOrWhiteSpace($CurrentCheckpointSchema)) { return "NO_CHECKPOINT_YET" }
  if ($CandidateText.Contains('"' + $CurrentCheckpointSchema + '"')) { return "COMPATIBLE" }
  return "INCOMPATIBLE"
}

function Get-ExitCodeForDecision([string]$Decision) {
  if ([string]::IsNullOrWhiteSpace($Decision)) { return 2 }
  if ($Decision.StartsWith("PLAN_OK")) { return 0 }
  if ($Decision -eq "APPLIED_HEALTHY") { return 0 }
  if ($Decision.EndsWith("_ROLLBACK_PROVEN")) { return 3 }
  return 2
}

function Get-ExceptionClass($ErrorRecord) {
  try { return ($ErrorRecord.Exception.GetType().Name -replace "[^A-Za-z0-9_]", "") } catch { return "Unknown" }
}

# ================================================ efeitos (substituiveis) ==
# Os testes trocam estas funcoes por um SCM simulado; nada mais muda.

function Get-ServiceInfo {
  $w = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $ServiceName + "'")
  if ($null -eq $w) { throw "SERVICE_NOT_FOUND" }
  $procId = $null
  if ([int]$w.ProcessId -gt 0) { $procId = [int]$w.ProcessId }
  return [ordered]@{ state = [string]$w.State; start_name = [string]$w.StartName; path_name = [string]$w.PathName; start_mode = [string]$w.StartMode; process_id = $procId }
}

function Get-ScmState {
  return [string](Get-Service -Name $ServiceName -ErrorAction Stop).Status
}

function Invoke-ServiceStop { Stop-Service -Name $ServiceName -Force -ErrorAction Stop }

function Invoke-ServiceStart { Start-Service -Name $ServiceName -ErrorAction Stop }

function Assert-Admin {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "ADMINISTRATOR_REQUIRED" }
}

# Linux (testes): processo morto que o pai ainda nao recolheu fica "Z" na
# tabela, sem linha de comando. Ja nao executa nada: nao e escritor. No
# Windows nao ha esse estado: sempre $false.
function Test-Zombie([int]$ProcessId) {
  if (-not $IsLinux) { return $false }
  try { return ([IO.File]::ReadAllText("/proc/" + $ProcessId + "/stat") -match "^\d+ \(.*\) Z ") } catch { return $true }
}

# Processos DO POWERSHELL cuja linha de comando cita o caminho (um editor
# aberto no arquivo nunca entra). No Windows PowerShell 5.1 a linha de comando
# so vem do CIM; no PowerShell 7 vem do proprio Get-Process (tambem no Linux,
# o que deixa esta funcao testavel fora do Windows).
# Linha de comando de UM processo, relida agora: $null = nao existe mais (ou
# zumbi); "" = vivo e ilegivel neste instante; texto = a linha de comando.
function Read-ProcessCommandLine([int]$ProcessId) {
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    if (Test-Zombie $ProcessId) { return $null }
    $p = $null
    try { $p = Get-Process -Id $ProcessId -ErrorAction Stop } catch { return $null }
    try { if ($p.HasExited) { return $null } } catch { return $null }
    $cl = $null
    try { $cl = $p.CommandLine } catch { $cl = $null }
    if ([string]::IsNullOrEmpty([string]$cl)) { return "" }
    return [string]$cl
  }
  $w = $null
  try { $w = Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId=" + $ProcessId) -ErrorAction Stop } catch { return "" }
  if ($null -eq $w) { return $null }
  if ([string]::IsNullOrEmpty([string]$w.CommandLine)) { return "" }
  return [string]$w.CommandLine
}

# FALHA FECHADA: enumeracao que falha, ou PowerShell vivo cuja linha de
# comando continua ilegivel depois de ~2 s de novas leituras, LANCA
# "PROCESS_LIST_UNKNOWN". Lista vazia afirmaria "ninguem vivo" sem saber, e e
# com essa afirmacao que o rollback restaura. Ilegivel por um instante e o
# normal de quem esta nascendo ou saindo: espera curta e reconsulta.
function Find-ProcessesByCommandLine([string]$Needle) {
  $out = @()
  # Retorno simples: o chamador usa @(...), que normaliza 0, 1 ou N; com o
  # operador virgula o @() embrulharia o array e a contagem daria sempre 1.
  if ([string]::IsNullOrWhiteSpace($Needle)) { return $out }
  $shell = "^(powershell|pwsh)(\.exe)?$"
  $procs = $null
  try {
    if ($PSVersionTable.PSVersion.Major -ge 7) { $procs = @(Get-Process -ErrorAction Stop) }
    else { $procs = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop) }
  } catch { throw "PROCESS_LIST_UNKNOWN" }
  foreach ($p in $procs) {
    if ($PSVersionTable.PSVersion.Major -ge 7) {
      if ($p.ProcessName -notmatch $shell) { continue }
      $id = [int]$p.Id
      if ($id -eq $PID) { continue }
      $cl = Read-ProcessCommandLine $id
    } else {
      if ([string]$p.Name -notmatch $shell) { continue }
      $id = [int]$p.ProcessId
      if ($id -eq $PID) { continue }
      $cl = [string]$p.CommandLine
    }
    if ($null -ne $cl -and $cl -eq "") {
      for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Milliseconds 200
        $cl = Read-ProcessCommandLine $id
        if ($null -eq $cl -or $cl -ne "") { break }
      }
      if ($null -ne $cl -and $cl -eq "") { throw "PROCESS_LIST_UNKNOWN" }
    }
    if ($null -eq $cl) { continue }
    if ($cl.IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $out += $id }
  }
  return $out
}

# Mata todo processo que cite o caminho e CONFIRMA. Devolve quantos foram
# encerrados e quantos continuam vivos; alive = -1 quando a lista de processos
# nao e conhecida (nunca 0 por nao saber).
function Stop-ProcessesByCommandLine([string]$Needle) {
  $killed = 0
  try { $ids = @(Find-ProcessesByCommandLine $Needle) } catch { return [ordered]@{ killed = 0; alive = -1 } }
  foreach ($procId in $ids) {
    try {
      $p = Get-Process -Id $procId -ErrorAction Stop
      $p.Kill()
      $killed++
      $sw = [Diagnostics.Stopwatch]::StartNew()
      while ($sw.ElapsedMilliseconds -lt 15000) {
        if ($p.WaitForExit(200)) { break }
        if (Test-Zombie $procId) { break }
      }
    } catch { }
  }
  # Confirmacao por nova busca, repetida: um processo morto ainda aparece por
  # um instante enquanto sai (e WaitForExit de processo que nao e filho nao
  # e confiavel em toda plataforma).
  $alive = 0
  for ($i = 0; $i -lt 34; $i++) {
    try { $alive = @(Find-ProcessesByCommandLine $Needle).Count } catch { return [ordered]@{ killed = $killed; alive = -1 } }
    if ($alive -eq 0) { break }
    Start-Sleep -Milliseconds 300
  }
  return [ordered]@{ killed = $killed; alive = $alive }
}

# Todo escritor possivel do checkpoint: o que roda no caminho fixo do host (o
# watcher antigo, ou um supervisor que sobreviveu ao host) PRIMEIRO, porque
# ele pode abrir lote novo; depois os lotes do candidato. Repete ate uma rodada
# limpa (nada morto): um supervisor vivo entre as duas buscas poderia ter
# aberto um lote. alive: 0 provado; > 0 vivo; -1 desconhecido ou instavel.
function Stop-AllWriters($Layout) {
  $res = [ordered]@{ host_path_killed = 0; candidate_killed = 0; alive = -1; rounds = 0; list_unknown = $false; unstable = $false }
  for ($r = 1; $r -le 3; $r++) {
    $res.rounds = $r
    $a = Stop-ProcessesByCommandLine $Layout.host_fixed_watcher
    $b = Stop-ProcessesByCommandLine $Layout.candidate_target
    $res.host_path_killed += $a.killed
    $res.candidate_killed += $b.killed
    if ($a.alive -lt 0 -or $b.alive -lt 0) { $res.list_unknown = $true; $res.alive = -1; return $res }
    $res.alive = $a.alive + $b.alive
    if ($res.alive -gt 0) { return $res }
    if ($a.killed -eq 0 -and $b.killed -eq 0) { return $res }
  }
  $res.unstable = $true
  $res.alive = -1
  return $res
}

function Get-SqlSessionAfter([datetime]$Since) {
  # So leitura, como o operador. Sem VIEW SERVER STATE o resultado e UNKNOWN.
  try {
    $c = New-Object Data.SqlClient.SqlConnection("Server=$SqlServer;Database=master;Integrated Security=SSPI;Connect Timeout=5;Application Name=TataReaderCutoverProbe")
    $c.Open()
    try {
      $cmd = $c.CreateCommand()
      $cmd.CommandTimeout = 5
      $cmd.CommandText = "SELECT MAX(last_request_end_time) FROM sys.dm_exec_sessions WHERE program_name LIKE 'TataReaderContinuousWatch%'"
      $v = $cmd.ExecuteScalar()
      if ($v -is [DBNull] -or $null -eq $v) { return "UNKNOWN" }
      if ([datetime]$v -gt $Since) { return "PASS" }
      return "FAIL"
    } finally { $c.Dispose() }
  } catch { return "UNKNOWN" }
}

# Informativo: BUILTIN\Users com escrita em bin\ deixaria um usuario comum
# trocar o que o servico executa. Herdado do ProgramData; nao bloqueia, registra.
function Get-BinWritableByNonAdmin([string]$Bin) {
  try {
    $acl = Get-Acl -LiteralPath $Bin
    $w = @($acl.Access | Where-Object {
      $_.AccessControlType -eq "Allow" -and
      ([string]$_.IdentityReference) -match "\\(Users|Everyone|Authenticated Users|Usu.rios|Todos)$" -and
      ([string]$_.FileSystemRights) -match "Write|Modify|FullControl|CreateFiles|AppendData"
    })
    return ($w.Count -gt 0)
  } catch { return $null }
}

# ========================================================= infraestrutura ==

# SHA-256 por .NET puro: no Windows PowerShell 5.1, Get-FileHash e funcao de
# modulo carregada sob demanda e falha com PSModulePath herdado do PowerShell 7.
function Get-Sha([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { return $null }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try { $h = $sha.ComputeHash($fs) } finally { $fs.Dispose() }
  } finally { $sha.Dispose() }
  return ([BitConverter]::ToString($h)).Replace("-", "")
}

function Read-JsonOrNull([string]$Path) {
  try {
    if (-not [IO.File]::Exists($Path)) { return $null }
    return ([IO.File]::ReadAllText($Path) | ConvertFrom-Json)
  } catch { return $null }
}

function Write-Json([string]$Path, $Object) {
  $dir = [IO.Path]::GetDirectoryName($Path)
  if (-not [IO.Directory]::Exists($dir)) { [void][IO.Directory]::CreateDirectory($dir) }
  $tmp = $Path + ".tmp." + $PID + "." + [Guid]::NewGuid().ToString("N")
  [IO.File]::WriteAllText($tmp, ($Object | ConvertTo-Json -Depth 14), (New-Object Text.UTF8Encoding($false)))
  if ([IO.File]::Exists($Path)) {
    $bak = $Path + ".bak." + [Guid]::NewGuid().ToString("N")
    [IO.File]::Replace($tmp, $Path, $bak, $true)
    [IO.File]::Delete($bak)
  } else {
    [IO.File]::Move($tmp, $Path)
  }
}

# Copia para um temporario no MESMO diretorio, confere o SHA e so entao troca
# o destino de uma vez: o host nunca le um arquivo pela metade.
function Copy-Atomic([string]$From, [string]$To, [string]$ExpectedSha) {
  $dir = [IO.Path]::GetDirectoryName($To)
  if (-not [IO.Directory]::Exists($dir)) { [void][IO.Directory]::CreateDirectory($dir) }
  $tmp = $To + ".new." + [Guid]::NewGuid().ToString("N")
  [IO.File]::Copy($From, $tmp, $false)
  try {
    $got = Get-Sha $tmp
    if ($got -ne $ExpectedSha.ToUpperInvariant()) { throw ("COPY_SHA_MISMATCH:" + [IO.Path]::GetFileName($To)) }
    if ([IO.File]::Exists($To)) {
      $bak = $To + ".bak." + [Guid]::NewGuid().ToString("N")
      [IO.File]::Replace($tmp, $To, $bak, $true)
      [IO.File]::Delete($bak)
    } else {
      [IO.File]::Move($tmp, $To)
    }
  } finally {
    if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) }
  }
  $final = Get-Sha $To
  if ($final -ne $ExpectedSha.ToUpperInvariant()) { throw ("INSTALLED_SHA_MISMATCH:" + [IO.Path]::GetFileName($To)) }
  return $final
}

function Move-Aside([string]$Path, [string]$Suffix) {
  if ([IO.File]::Exists($Path)) {
    $dst = $Path + $Suffix
    if ([IO.File]::Exists($dst)) { [IO.File]::Delete($dst) }
    [IO.File]::Move($Path, $dst)
    return $dst
  }
  return $null
}

# Node chamado como processo, sem redirecionamento do PowerShell: no Windows
# PowerShell 5.1, "2>$null" com $ErrorActionPreference=Stop transforma
# qualquer linha de stderr em erro terminante.
function Invoke-NodeJson([string]$Script, [string[]]$Arguments) {
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $NodeExe
  $quoted = @('"' + $Script.Replace('"', '\"') + '"')
  foreach ($a in $Arguments) { $quoted += ('"' + ([string]$a).Replace('"', '\"') + '"') }
  $psi.Arguments = ($quoted -join " ")
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [Diagnostics.Process]::Start($psi)
  $outTask = $p.StandardOutput.ReadToEndAsync()
  $errTask = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit(60000)) { try { $p.Kill() } catch { }; return @{ code = -1; json = $null } }
  [void]$outTask.Wait(5000)
  [void]$errTask.Wait(5000)
  $text = ""
  if ($outTask.IsCompleted) { $text = $outTask.Result }
  $obj = $null
  try { $obj = $text | ConvertFrom-Json } catch { $obj = $null }
  return @{ code = $p.ExitCode; json = $obj }
}

function Wait-Scm([string]$Want, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try { if ((Get-ScmState) -eq $Want) { return $true } } catch { }
    Start-Sleep -Seconds 1
  }
  return $false
}

# Instante lido de JSON estritamente DEPOIS de $After. O PowerShell 7 entrega o
# texto ISO ja convertido em [datetime] Kind=Utc; o 5.1 entrega texto; o
# Get-Date e Local. Os dois lados vao para UTC antes de comparar: sem isso o 7
# compara relogios de parede diferentes e, em UTC-3, um arquivo de ate 3 h
# ANTES do restart passa por novo. Texto sem fuso e tratado como hora local.
function Test-InstantAfter($Value, [datetime]$After) {
  if ($null -eq $Value) { return $false }
  try {
    if ($Value -is [datetime]) {
      $v = $Value.ToUniversalTime()
    } else {
      $s = [string]$Value
      if ([string]::IsNullOrWhiteSpace($s)) { return $false }
      $v = [datetime]::Parse($s, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeLocal)
    }
    return ($v -gt $After.ToUniversalTime())
  } catch { return $false }
}

function Get-CheckpointTicks($Layout) {
  try {
    $t = [IO.File]::GetLastWriteTimeUtc($Layout.checkpoint).Ticks
    if ($t -eq [DateTime]::FromFileTimeUtc(0).Ticks) { return [long]0 }
    return [long]$t
  } catch { return [long]0 }
}

function Get-NewEventPrivacy($Layout, [datetime]$Since) {
  try {
    if (-not [IO.Directory]::Exists($Layout.events)) { return "UNKNOWN" }
    $files = @(Get-ChildItem -LiteralPath $Layout.events -Filter "*.json" | Where-Object { $_.LastWriteTimeUtc -gt $Since.ToUniversalTime() })
    if ($files.Count -eq 0) { return "UNKNOWN" }
    foreach ($f in $files) {
      $e = Read-JsonOrNull $f.FullName
      if ($null -eq $e) { return "FAIL" }
      if ($e.effects.database_write -ne $false) { return "FAIL" }
      $t = $e.order.truth
      if ($null -ne $t) {
        if ($t.privacy.customer_pii_persisted -ne $false) { return "FAIL" }
        if ($t.privacy.raw_observation_text_persisted -ne $false) { return "FAIL" }
        if ($t.privacy.coordinates_persisted -ne $false) { return "FAIL" }
        if ($null -ne $t.lifecycle.production_time_minutes -or $null -ne $t.lifecycle.delivery_time_minutes) { return "FAIL" }
      }
    }
    return "PASS"
  } catch { return "UNKNOWN" }
}

function Get-Snapshot($Layout, [datetime]$StartAt, [long]$CheckpointTicksBefore, [string]$ExpectedSupSha, [string]$ExpectedWatcherSha, [string]$HealthCli, $First, [switch]$Light) {
  $hb = Read-JsonOrNull $Layout.heartbeat
  $hs = Read-JsonOrNull $Layout.host_status
  $cs = Read-JsonOrNull $Layout.consumer_status
  $ckTicks = Get-CheckpointTicks $Layout
  $health = Invoke-NodeJson $HealthCli @("--heartbeat", $Layout.heartbeat, "--host-status", $Layout.host_status, "--consumer-status", $Layout.consumer_status, "--checkpoint", $Layout.checkpoint)
  $hostAfter = $false
  if ($null -ne $hs) { $hostAfter = Test-InstantAfter $hs.updated_at $StartAt }
  $hbAfter = $false
  if ($null -ne $hb -and $null -ne $hb.supervisor) { $hbAfter = Test-InstantAfter $hb.supervisor.started_at $StartAt }
  $svcPid = $null
  try { $svcPid = (Get-ServiceInfo).process_id } catch { $svcPid = $null }
  $effects = $null
  if ($null -ne $hb -and $null -ne $hb.last_batch -and $null -ne $hb.last_batch.effects_true) { $effects = @($hb.last_batch.effects_true) }
  return [ordered]@{
    taken_at = (Get-Date).ToString("o")
    scm_state = (Get-ScmState)
    service_pid = $svcPid
    first_service_pid = $First.service_pid
    host_state = if ($hs) { [string]$hs.state } else { $null }
    host_updated_after_restart = $hostAfter
    heartbeat_after_restart = $hbAfter
    heartbeat_run_id = if ($hb) { [string]$hb.supervisor.run_id } else { $null }
    first_run_id = $First.run_id
    heartbeat_supervisor_sha256 = if ($hb) { [string]$hb.supervisor.script_sha256 } else { $null }
    expected_supervisor_sha256 = $ExpectedSupSha
    heartbeat_watcher_expected_sha256 = if ($hb) { [string]$hb.watcher.expected_sha256 } else { $null }
    heartbeat_watcher_verified = if ($hb) { [bool]$hb.watcher.sha256_verified } else { $false }
    expected_watcher_sha256 = $ExpectedWatcherSha
    heartbeat_ok_batches = if ($hb) { [int]$hb.totals.ok } else { 0 }
    min_ok_batches = $MinOkBatches
    heartbeat_consecutive_failures = if ($hb) { [int]$hb.consecutive_failures } else { -1 }
    heartbeat_last_batch_outcome = if ($hb -and $hb.last_batch) { [string]$hb.last_batch.outcome } else { $null }
    heartbeat_last_error_class = if ($hb -and $hb.last_batch) { [string]$hb.last_batch.error_class } else { $null }
    heartbeat_last_effects_true = $effects
    checkpoint_advanced = ($ckTicks -gt $CheckpointTicksBefore -and $CheckpointTicksBefore -gt 0) -or ($CheckpointTicksBefore -eq 0 -and $ckTicks -gt 0)
    consumer_state = if ($cs) { [string]$cs.state } else { $null }
    health_verdict = if ($health.json) { [string]$health.json.verdict } else { "UNKNOWN" }
    health_reasons = if ($health.json) { @($health.json.reasons) } else { @("HEALTH_CLI_FAILED") }
    sql_session_after_restart = if ($Light) { "NOT_EVALUATED" } elseif ($SqlSessionCheck) { Get-SqlSessionAfter $StartAt } else { "NOT_REQUESTED" }
    new_event_privacy = if ($Light) { "NOT_EVALUATED" } else { Get-NewEventPrivacy $Layout $StartAt }
  }
}

# =============================================================== rollback ==
function Invoke-Rollback($L, [string]$Dir, $Receipt) {
  $rb = [ordered]@{ started_at = (Get-Date).ToString("o"); phase = "STOP" }
  $Receipt.rollback = $rb
  $Receipt.effects.rollback = $true
  try {
    $man = Read-JsonOrNull ([IO.Path]::Combine($Dir, "manifest.json"))
    if ($null -eq $man) { $rb.result = "BACKUP_MANIFEST_UNREADABLE"; return "ROLLBACK_MANIFEST_UNREADABLE_HUMAN_REQUIRED" }
    try { Invoke-ServiceStop } catch { $rb.stop_error = Get-ExceptionClass $_ }
    if (-not (Wait-Scm "Stopped" 60)) { $rb.result = "STOP_FAILED"; return "ROLLBACK_STOP_FAILED_HUMAN_REQUIRED" }

    # O host mata so o supervisor; o lote filho sobrevive. Todo processo que
    # cite o candidato ou o caminho fixo e encerrado, e confirmado.
    $rb.phase = "KILL_CANDIDATE_BATCHES"
    $w = Stop-AllWriters $L
    $rb.stop_writers = $w
    $rb.candidate_processes_killed = $w.candidate_killed
    $rb.host_path_processes_killed = $w.host_path_killed
    if ($w.alive -ne 0) {
      # Nunca restaura sem PROVAR que ninguem mais escreve: desconhecido nao e zero.
      if ($w.list_unknown) { $rb.result = "PROCESS_LIST_UNKNOWN"; return "ROLLBACK_BLOCKED_PROCESS_LIST_UNKNOWN_HUMAN_REQUIRED" }
      $rb.result = "CANDIDATE_PROCESS_ALIVE"
      return "ROLLBACK_BLOCKED_CANDIDATE_ALIVE_HUMAN_REQUIRED"
    }

    $rb.phase = "RESTORE"
    $suffix = ".rolled_back." + (Get-Date).ToString("yyyyMMdd-HHmmss")
    $rb.restored = @()
    foreach ($it in @($man.items)) {
      if ([string]$it.backup -eq "host_status.json") { continue }
      $src = [IO.Path]::Combine($Dir, [string]$it.backup)
      if ((Get-Sha $src) -ne [string]$it.sha256) { $rb.result = "BACKUP_CORRUPT:" + [string]$it.backup; return "ROLLBACK_BACKUP_CORRUPT_HUMAN_REQUIRED" }
      [void](Copy-Atomic $src ([string]$it.original) ([string]$it.sha256))
      $rb.restored += [string]$it.backup
    }
    # Fora do caminho: candidato, configuracao do supervisor, heartbeat e
    # registro de filho. Heartbeat velho faria a saude dizer STALLED/FATAL
    # sobre um supervisor que nao roda mais.
    # Arrumacao, nao restauracao: falhar aqui (antivirus segurando o
    # heartbeat, por exemplo) fica registrado e NUNCA impede o servico de
    # voltar com o watcher ja restaurado.
    $hadConfig = (@($man.items | Where-Object { [string]$_.backup -eq "supervisor_config.json" }).Count -gt 0)
    $rb.moved_aside = @()
    $rb.move_aside_errors = @()
    $aside = @($L.candidate_target, $L.heartbeat, $L.child_record)
    if (-not $hadConfig) { $aside += $L.supervisor_config }
    foreach ($p in $aside) {
      try {
        $moved = Move-Aside $p $suffix
        if ($null -ne $moved) { $rb.moved_aside += [IO.Path]::GetFileName($moved) }
      } catch {
        $rb.move_aside_errors += ([IO.Path]::GetFileName($p) + ":" + (Get-ExceptionClass $_))
      }
    }

    $rb.phase = "START"
    $ckBefore = Get-CheckpointTicks $L
    try { Invoke-ServiceStart } catch { $rb.start_error = Get-ExceptionClass $_ }
    $running = Wait-Scm "Running" 60
    $advanced = $false
    $deadline = (Get-Date).AddSeconds($RollbackProofSeconds)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 2
      if ((Get-CheckpointTicks $L) -gt $ckBefore) { $advanced = $true; break }
    }
    $candidateAlive = -1
    try { $candidateAlive = @(Find-ProcessesByCommandLine $L.candidate_target).Count } catch { $candidateAlive = -1 }
    $restoredSha = Get-Sha $L.host_fixed_watcher
    $originalSha = [string](@($man.items | Where-Object { [string]$_.backup -eq "installed_watcher.ps1" })[0].sha256)
    $rb.scm_running = $running
    $rb.checkpoint_advanced_after_rollback = $advanced
    $rb.candidate_processes_alive_after = $candidateAlive
    $rb.restored_watcher_sha256 = $restoredSha
    $rb.restored_watcher_matches_backup = ($restoredSha -eq $originalSha)
    $rb.finished_at = (Get-Date).ToString("o")
    if ($running -and $advanced -and $candidateAlive -eq 0 -and $rb.restored_watcher_matches_backup) {
      $rb.result = "PROVEN"
      return "ROLLBACK_PROVEN"
    }
    $rb.result = "UNPROVEN"
    return "ROLLBACK_UNPROVEN_HUMAN_REQUIRED"
  } catch {
    $rb.error_class = Get-ExceptionClass $_
    $rb.result = "ERROR"
    return "ROLLBACK_ERROR_HUMAN_REQUIRED"
  }
}

# ================================================================ principal ==
function New-Receipt {
  return [ordered]@{
    schema = $CutoverSchema
    mode = $Mode
    started_at = (Get-Date).ToString("o")
    machine_clock_note = "horarios no relogio local desta maquina; nao comparar com outro relogio"
    service = $ServiceName
    phase = "PREFLIGHT"
    checks = [ordered]@{}
    files = [ordered]@{}
    decision = $null
    effects = [ordered]@{ database_write = $false; permission_change = $false; print = $false; spooler_write = $false; odhen_write = $false; fiscal_action = $false; sefaz_call = $false; network_call = $false; service_stop = $false; service_start = $false; file_install = $false; rollback = $false }
    privacy = [ordered]@{ customer_pii = $false; order_identifiers = $false; raw_error_text = $false }
  }
}

function Invoke-Preflight($L, $Receipt, [string]$AuditCli, [string]$HealthCli) {
  $info = Get-ServiceInfo
  $Receipt.checks.service = $info
  $Receipt.checks.service_identity_ok = ($info.start_name -eq $ServiceIdentity)
  $hostExe = Get-ExePathFromServicePathName $info.path_name
  $Receipt.files.host_binary = if ($hostExe) { [IO.Path]::GetFileName($hostExe) } else { $null }
  $Receipt.files.host_binary_sha256 = if ($hostExe) { Get-Sha $hostExe } else { $null }
  $Receipt.files.installed_watcher_sha256 = Get-Sha $L.host_fixed_watcher
  $Receipt.files.candidate_sha256 = Get-Sha $CandidateWatcherPath
  $Receipt.files.candidate_expected_sha256 = $CandidateWatcherSha256.ToUpperInvariant()
  $Receipt.files.supervisor_sha256 = Get-Sha $SupervisorSourcePath
  $Receipt.files.checkpoint_sha256 = Get-Sha $L.checkpoint
  $ck = Read-JsonOrNull $L.checkpoint
  $Receipt.checks.checkpoint_schema = if ($ck) { [string]$ck.schema } else { $null }
  $Receipt.checks.node_present = [IO.File]::Exists($NodeExe)
  $Receipt.checks.bin_writable_by_non_admin = Get-BinWritableByNonAdmin $L.bin
  $Receipt.checks.candidate_sha_ok = ($null -ne $Receipt.files.candidate_sha256 -and $Receipt.files.candidate_sha256 -eq $Receipt.files.candidate_expected_sha256)
  $Receipt.checks.candidate_audit_allows_supervisor = $false
  if ($Receipt.checks.node_present -and $Receipt.checks.candidate_sha_ok) {
    $a = Invoke-NodeJson $AuditCli @($CandidateWatcherPath)
    $Receipt.checks.candidate_audit = if ($a.json) { [ordered]@{ recommendation = [string]$a.json.recommendation; findings = @($a.json.findings | ForEach-Object { [string]$_.code }) } } else { $null }
    $Receipt.checks.candidate_audit_allows_supervisor = Test-AuditAllowsSupervisor $a.json
    $Receipt.checks.candidate_checkpoint = Test-CheckpointCompatible ([IO.File]::ReadAllText($CandidateWatcherPath)) $Receipt.checks.checkpoint_schema
  }
  $Receipt.checks.health_before = $null
  if ($Receipt.checks.node_present) {
    $before = Get-Snapshot $L (Get-Date).AddYears(-10) ([long]0) $Receipt.files.supervisor_sha256 $Receipt.files.candidate_expected_sha256 $HealthCli @{ run_id = $null; service_pid = $null } -Light
    $Receipt.checks.health_before = [ordered]@{ verdict = $before.health_verdict; reasons = $before.health_reasons; scm = $before.scm_state; host = $before.host_state }
  }
  $Receipt.checks.preflight_ok = [bool](
    $Receipt.checks.service_identity_ok -and $Receipt.checks.node_present -and $Receipt.checks.candidate_sha_ok -and
    $null -ne $Receipt.files.supervisor_sha256 -and $null -ne $Receipt.files.installed_watcher_sha256 -and $null -ne $Receipt.files.host_binary_sha256 -and
    $Receipt.checks.candidate_audit_allows_supervisor -and
    ($Receipt.checks.candidate_checkpoint -eq "COMPATIBLE" -or $Receipt.checks.candidate_checkpoint -eq "NO_CHECKPOINT_YET"))
}

function Invoke-Apply($L, $Receipt, [string]$HealthCli, [string]$RunDir) {
  # Confirmacoes: o operador devolve os tres SHA que o Plan imprimiu. Nada
  # foi tocado ainda.
  if (-not $Receipt.checks.preflight_ok) { return "ABORTED_PREFLIGHT" }
  if ([string]::IsNullOrWhiteSpace($ExpectedInstalledWatcherSha256) -or $Receipt.files.installed_watcher_sha256 -ne $ExpectedInstalledWatcherSha256.ToUpperInvariant()) { return "ABORTED_INSTALLED_SHA_NOT_CONFIRMED" }
  if ([string]::IsNullOrWhiteSpace($ExpectedHostBinarySha256) -or $Receipt.files.host_binary_sha256 -ne $ExpectedHostBinarySha256.ToUpperInvariant()) { return "ABORTED_HOST_BINARY_SHA_NOT_CONFIRMED" }
  if ([string]::IsNullOrWhiteSpace($SupervisorSha256) -or $Receipt.files.supervisor_sha256 -ne $SupervisorSha256.ToUpperInvariant()) { return "ABORTED_SUPERVISOR_SHA_NOT_CONFIRMED" }
  Assert-Admin

  # ------------------------------------------------------------ 1 parar --
  $Receipt.phase = "STOP"
  $Receipt.effects.service_stop = $true
  try { Invoke-ServiceStop } catch { $Receipt.checks.stop_error = Get-ExceptionClass $_ }
  if (-not (Wait-Scm "Stopped" 60)) {
    try { Invoke-ServiceStart } catch { }
    return "ABORTED_STOP_FAILED"
  }
  # Todo escritor do checkpoint fica parado E CONFIRMADO antes da copia: o
  # watcher antigo e, numa segunda instalacao, o lote orfao do supervisor
  # anterior (o host mata so o supervisor). O registro do filho vai para fora
  # do caminho na instalacao; e esta caca que torna isso seguro.
  $w = Stop-AllWriters $L
  $Receipt.checks.stop_writers = $w
  $Receipt.checks.old_watcher_processes_killed = $w.host_path_killed
  $Receipt.checks.candidate_processes_killed_at_stop = $w.candidate_killed
  if ($w.alive -ne 0) {
    try { Invoke-ServiceStart } catch { }
    if ($w.list_unknown) { return "ABORTED_PROCESS_LIST_UNKNOWN" }
    return "ABORTED_OLD_WRITER_ALIVE"
  }

  # ----------------------------------------------------------- 2 backup --
  $Receipt.phase = "BACKUP"
  try {
    $bk = [IO.Path]::Combine($RunDir, "backup")
    [void][IO.Directory]::CreateDirectory($bk)
    $manifest = [ordered]@{ created_at = (Get-Date).ToString("o"); items = @() }
    foreach ($pair in @(@($L.host_fixed_watcher, "installed_watcher.ps1"), @($L.checkpoint, "checkpoint.json"), @($L.supervisor_config, "supervisor_config.json"), @($L.host_status, "host_status.json"))) {
      if ([IO.File]::Exists($pair[0])) {
        $dst = [IO.Path]::Combine($bk, $pair[1])
        [IO.File]::Copy($pair[0], $dst, $true)
        $manifest.items += [ordered]@{ original = $pair[0]; backup = $pair[1]; sha256 = Get-Sha $dst }
      }
    }
    if ((Get-Sha ([IO.Path]::Combine($bk, "installed_watcher.ps1"))) -ne $Receipt.files.installed_watcher_sha256) { throw "BACKUP_WATCHER_SHA_MISMATCH" }
    Write-Json ([IO.Path]::Combine($bk, "manifest.json")) $manifest
    $Receipt.backup_dir = $bk
  } catch {
    $Receipt.checks.backup_error = Get-ExceptionClass $_
    try { Invoke-ServiceStart } catch { }
    return "ABORTED_BACKUP_FAILED"
  }

  # Daqui em diante, qualquer falha e rollback.
  try {
    # --------------------------------------------------------- 3 instalar --
    $Receipt.phase = "INSTALL"
    $Receipt.effects.file_install = $true
    [void](Copy-Atomic $CandidateWatcherPath $L.candidate_target $Receipt.files.candidate_expected_sha256)
    Write-Json $L.supervisor_config (New-SupervisorConfig $L $Receipt.files.candidate_expected_sha256 $PowerShellExe $BatchPolls)
    [void](Copy-Atomic $SupervisorSourcePath $L.host_fixed_watcher $Receipt.files.supervisor_sha256)
    foreach ($p in @($L.heartbeat, $L.child_record)) { [void](Move-Aside $p (".before-cutover." + (Get-Date).ToString("yyyyMMdd-HHmmss"))) }

    # ------------------------------------------ 4 linha de base estavel --
    $ckBefore = Get-CheckpointTicks $L

    # ------------------------------------------------ 5 iniciar e observar --
    $Receipt.phase = "START"
    $startAt = Get-Date
    Start-Sleep -Milliseconds 1100
    $Receipt.start_at = $startAt.ToString("o")
    $Receipt.effects.service_start = $true
    Invoke-ServiceStart

    $Receipt.phase = "GATES"
    $first = @{ run_id = $null; service_pid = $null }
    $deadline = $startAt.AddSeconds($HealthWaitSeconds)
    $last = $null
    $gate = $null
    $restarted = $false
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 5
      $last = Get-Snapshot $L $startAt $ckBefore $Receipt.files.supervisor_sha256 $Receipt.files.candidate_expected_sha256 $HealthCli $first
      if ($null -eq $first.run_id -and $last.heartbeat_after_restart -and -not [string]::IsNullOrWhiteSpace([string]$last.heartbeat_run_id)) {
        $first.run_id = $last.heartbeat_run_id
        $first.service_pid = $last.service_pid
        $last.first_run_id = $first.run_id
        $last.first_service_pid = $first.service_pid
      }
      if (Test-RestartedDuringGate $last) { $restarted = $true; break }
      $gate = Test-CutoverGate $last
      if ($gate.pass) { break }
    }
    $Receipt.after = $last
    $Receipt.gate = $gate
    if (-not $restarted -and $null -ne $gate -and $gate.pass) { return "APPLIED_HEALTHY" }
    $Receipt.gate_failure = if ($restarted) { "SUPERVISOR_OR_SERVICE_RESTARTED_DURING_GATE" } else { "GATE_DEADLINE" }
    $rbd = [string](@(Invoke-Rollback $L $bk $Receipt)[-1])
    return ("GATE_FAILED_" + $rbd)
  } catch {
    $Receipt.error_phase = $Receipt.phase
    $Receipt.error_class = Get-ExceptionClass $_
    $rbd = [string](@(Invoke-Rollback $L $bk $Receipt)[-1])
    return ("ERROR_IN_" + $Receipt.phase + "_" + $rbd)
  }
}

function Invoke-Main {
  if ([string]::IsNullOrWhiteSpace($RepoRuntimeDir)) { $script:RepoRuntimeDir = $PSScriptRoot }
  if ([string]::IsNullOrWhiteSpace($SupervisorSourcePath)) { $script:SupervisorSourcePath = [IO.Path]::Combine($RepoRuntimeDir, "tata_reader_supervisor_v1.ps1") }
  $L = Get-Layout $InstallRoot
  $auditCli = [IO.Path]::Combine($RepoRuntimeDir, "tata_reader_watch_static_audit_v1.cjs")
  $healthCli = [IO.Path]::Combine($RepoRuntimeDir, "tata_reader_health_v1.cjs")
  $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
  $receipt = New-Receipt
  $runDir = $null
  try {
    # Saida sem querer de uma funcao vira parte do retorno no PowerShell: o
    # preflight e silenciado e as decisoes sao sempre o ULTIMO valor emitido.
    $null = Invoke-Preflight $L $receipt $auditCli $healthCli
    if ($Mode -eq "Plan") {
      if ($receipt.checks.preflight_ok) {
        $receipt.decision = "PLAN_OK"
        $receipt.apply_requires = [ordered]@{
          ExpectedInstalledWatcherSha256 = $receipt.files.installed_watcher_sha256
          ExpectedHostBinarySha256 = $receipt.files.host_binary_sha256
          SupervisorSha256 = $receipt.files.supervisor_sha256
        }
      } else {
        $receipt.decision = "PLAN_BLOCKED"
      }
      return $receipt
    }
    if ($Mode -eq "Apply") {
      $runDir = [IO.Path]::Combine($L.backups, $stamp)
      $receipt.decision = [string](@(Invoke-Apply $L $receipt $healthCli $runDir)[-1])
    } else {
      Assert-Admin
      if ([string]::IsNullOrWhiteSpace($BackupDir) -or -not [IO.File]::Exists([IO.Path]::Combine($BackupDir, "manifest.json"))) {
        $receipt.decision = "ROLLBACK_BACKUP_DIR_REQUIRED"
      } else {
        $runDir = [IO.Path]::GetDirectoryName($BackupDir.TrimEnd("\", "/"))
        $receipt.decision = "MANUAL_" + [string](@(Invoke-Rollback $L $BackupDir $receipt)[-1])
      }
    }
  } catch {
    $receipt.error_phase = $receipt.phase
    $receipt.error_class = Get-ExceptionClass $_
    if ($null -eq $receipt.decision) { $receipt.decision = "ERROR_IN_" + $receipt.phase }
  }
  $receipt.finished_at = (Get-Date).ToString("o")
  if ($null -ne $runDir) {
    try { Write-Json ([IO.Path]::Combine($runDir, "receipt-" + $Mode.ToLowerInvariant() + ".json")) $receipt } catch { $receipt.receipt_write_error = Get-ExceptionClass $_ }
  }
  return $receipt
}

if ($MyInvocation.InvocationName -ne ".") {
  $code = 2
  try {
    $r = Invoke-Main
    $r | ConvertTo-Json -Depth 14
    $code = Get-ExitCodeForDecision ([string]$r.decision)
  } catch {
    [Console]::Error.WriteLine("CUTOVER_UNHANDLED " + (Get-ExceptionClass $_))
    $code = 2
  }
  exit $code
}

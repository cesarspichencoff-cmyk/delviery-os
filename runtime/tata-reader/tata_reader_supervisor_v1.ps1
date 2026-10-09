<#
  TATA Comanda Reader - supervisor de lotes do watcher (v1)
  =========================================================
  POR QUE EXISTE. Em 05/10/2026 o servico TataComandaReader ficou RUNNING com
  os processos vivos e a sessao SQL "sleeping", mas sem nenhuma leitura nova
  desde 21:55:51. Reproduzido contra SQL Server 2022 real com o watcher v1
  byte-identico (so a identidade/conexao trocadas pelo harness): uma unica
  espera de lock acima do LOCK_TIMEOUT dentro de Read() deixa o SqlDataReader
  ABERTO; toda leitura seguinte falha no proprio cliente ("There is already an
  open DataReader...") e o modo continuo engole o erro para sempre.

  O QUE ESTE SUPERVISOR FAZ. Roda o watcher AUDITADO, sem alterar um byte dele,
  no modo em que ele foi provado: lotes limitados (-MaxPolls N). Cada lote e um
  processo novo com conexao nova: um erro encerra o lote em voz alta, nunca
  envenena o seguinte. Entre lotes:
    - confere o SHA-256 do watcher contra o valor fixado (codigo instalado =
      codigo auditado, a cada lote, nao so na instalacao);
    - valida o resultado JSON do lote (schema, status, polls, poll_errors e
      efeitos: efeito proibido ou efeitos NAO declarados param o supervisor);
    - mata lote sem progresso (checkpoint parado) ou acima do tempo maximo;
    - aplica backoff exponencial limitado depois de falha;
    - escreve um heartbeat atomico, sem PII e sem texto bruto de erro.

  DOIS ESCRITORES, NAO. Um lote so comeca quando nao ha outro vivo: o processo
  filho e registrado (PID + hora de inicio) antes de qualquer leitura; se o
  registro falha, o filho e morto na hora; se um filho nao morre, nenhum lote
  novo comeca (BLOCKED_CHILD_ALIVE); registro ilegivel de execucao anterior vira
  quarentena do tempo maximo de vida de um lote. Segunda camada, na partida:
  caca pela linha de comando de lote SEM registro (supervisor morto entre
  Process.Start e a gravacao do registro). Limite declarado: se a lista de
  processos nao puder ser lida (WMI negado ou falhando) E o supervisor anterior
  tiver morrido exatamente nessa janela de milissegundos, um lote pode
  sobrepor; a partida registra LIST_UNKNOWN no heartbeat em vez de travar.

  NUNCA CAI POR ACIDENTE. O host do servico so tem dois restarts do SCM por
  24 h. Erro de SQL, de arquivo (antivirus, indexador, a janela do File.Replace
  em que o checkpoint nao existe), de processo ou interno vira lote falho com
  backoff e verdade no heartbeat. Saidas: 75 (outra instancia viva) e 78
  (configuracao invalida, watcher adulterado, efeito proibido ou nao
  declarado). 70 so se um erro escapar de todas as protecoes.

  Ele NAO le o banco, NAO escreve no banco, NAO imprime, NAO toca Odhen, fiscal
  ou SEFAZ. Os unicos efeitos proprios sao arquivos locais de estado (heartbeat,
  lock e registro do lote filho).

  COMPATIBILIDADE. Aceita a mesma linha de comando que o host do servico ja
  passa ao watcher (-MaxPolls 0 -PollSeconds -StablePolls -TopOrders
  -CheckpointPath -EventDir), para poder ser instalado no caminho fixo do host
  sem recompilar o host. O resto vem do arquivo de configuracao ao lado do
  script (tata_reader_supervisor_v1.config.json), validado fail-closed.

  Windows PowerShell 5.1 (CAIXA) e PowerShell 7 (testes). Arquivo ASCII puro:
  o 5.1 le UTF-8 sem BOM como ANSI.
#>
param(
  [int]$MaxPolls = 0,
  [int]$PollSeconds = 3,
  [int]$StablePolls = 2,
  [int]$TopOrders = 50,
  [string]$CheckpointPath = "C:\ProgramData\TataComandaReader\state\reader-watch-checkpoint-v1.json",
  [string]$EventDir = "C:\ProgramData\TataComandaReader\state\reader-events-v1",
  [string]$ConfigPath = "",
  [int]$MaxBatches = 0
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
$SupervisorVersion = "tata-reader-supervisor@1"
$HeartbeatSchema = "deliveryos.tata-reader-heartbeat.v1"
$ConfigSchema = "deliveryos.tata-reader-supervisor-config.v1"
$RunSchema = "deliveryos.tata-reader-continuous-watch-run.v1"
$ExitConfig = 78
$ExitLocked = 75
$ExitInternal = 70

# Efeitos que o resultado de um lote pode declarar como verdadeiros. Qualquer
# outro efeito verdadeiro e violacao; resultado sem bloco de efeitos tambem:
# sem declaracao nao ha como provar que nada proibido aconteceu.
$AllowedTrueEffects = @("database_read", "local_checkpoint_write", "local_event_write")

# File.GetLastWriteTimeUtc devolve este instante (1601-01-01) para caminho que
# nao existe, em vez de lancar.
$NoFileTicks = [DateTime]::FromFileTimeUtc(0).Ticks

# SHA-256 por .NET puro. No Windows PowerShell 5.1, Get-FileHash e FUNCAO de
# modulo carregada sob demanda: com um PSModulePath herdado do PowerShell 7 ela
# nao carrega e TODO lote virava WATCHER_UNREADABLE (provado no Windows real,
# CI 37867864216: 4/23). Leitura compartilhada: o arquivo pode estar sendo
# trocado ou lido por outro processo.
function Get-Sha256Hex([string]$Path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try { $h = $sha.ComputeHash($fs) } finally { $fs.Dispose() }
  } finally { $sha.Dispose() }
  return ([BitConverter]::ToString($h)).Replace("-", "")
}

function Write-AtomicJson([string]$Path, $Object) {
  $dir = [IO.Path]::GetDirectoryName($Path)
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $tmp = $Path + ".tmp." + $PID + "." + [Guid]::NewGuid().ToString("N")
  $json = $Object | ConvertTo-Json -Depth 12
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)
  $fs = [IO.File]::Open($tmp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $fs.Write($bytes, 0, $bytes.Length); $fs.Flush($true) } finally { $fs.Dispose() }
  try {
    if ([IO.File]::Exists($Path)) {
      # $null vira "" ao atravessar para .NET; backup explicito, removido logo.
      $bak = $Path + ".bak"
      if ([IO.File]::Exists($bak)) { [IO.File]::Delete($bak) }
      [IO.File]::Replace($tmp, $Path, $bak, $true)
      if ([IO.File]::Exists($bak)) { [IO.File]::Delete($bak) }
    } else {
      [IO.File]::Move($tmp, $Path)
    }
  } catch {
    if ([IO.File]::Exists($tmp)) { try { [IO.File]::Delete($tmp) } catch { } }
    throw
  }
}

function Now-Iso { return (Get-Date).ToString("o") }

function Quote-Arg([string]$Value) {
  return '"' + $Value.Replace('"', '\"') + '"'
}

# Classifica o erro do lote em codigo fechado. Texto bruto nunca vai ao
# heartbeat: so o codigo e, quando houver, o numero do erro SQL.
function Get-ErrorClass([string]$StdErr, [int]$ExitCode) {
  $t = [string]$StdErr
  $num = $null
  $m = [regex]::Match($t, "(?i)(?:error number|msg)\D{0,3}([0-9]{3,6})\b")
  if ($m.Success) { $num = [int]$m.Groups[1].Value }
  $code = "WATCHER_EXIT_" + $ExitCode
  if ($t -match "(?i)Lock request time out") { $code = "LOCK_TIMEOUT"; if ($null -eq $num) { $num = 1222 } }
  elseif ($t -match "(?i)already an open DataReader") { $code = "OPEN_DATAREADER" }
  elseif ($t -match "(?i)Execution Timeout Expired|Timeout expired") { $code = "COMMAND_TIMEOUT" }
  elseif ($t -match "(?i)Login failed") { $code = "SQL_LOGIN_FAILED" }
  elseif ($t -match "UNEXPECTED_SERVICE_IDENTITY|UNEXPECTED_SQL_LOGIN|DATABASE_MISMATCH") { $code = "IDENTITY_MISMATCH" }
  elseif ($t -match "(?i)permission was denied") { $code = "SQL_PERMISSION_DENIED" }
  elseif ($t -match "(?i)Invalid (column|object) name") { $code = "SQL_SCHEMA_MISMATCH" }
  elseif ($t -match "(?i)network-related|transport-level|connection was closed|connection is broken|server was not found") { $code = "SQL_CONNECTION" }
  elseif ($t -match "CHECKPOINT_SCHEMA_MISMATCH") { $code = "CHECKPOINT_SCHEMA_MISMATCH" }
  elseif ($t -match "(?i)Cannot convert") { $code = "VALUE_CONVERSION" }
  return @{ code = $code; sql_error_number = $num }
}

# Nome de classe .NET sem o namespace: e o que vai ao heartbeat quando o erro
# e do proprio supervisor (nunca a mensagem, que pode citar caminho ou valor).
function Get-ExceptionClass($ErrorRecord) {
  try { return ($ErrorRecord.Exception.GetType().Name -replace "[^A-Za-z0-9_]", "") } catch { return "Unknown" }
}

function Read-Config {
  $path = $ConfigPath
  if ([string]::IsNullOrWhiteSpace($path)) {
    $path = Join-Path $PSScriptRoot "tata_reader_supervisor_v1.config.json"
  }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "CONFIG_MISSING" }
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($raw.schema -ne $ConfigSchema) { throw "CONFIG_SCHEMA_MISMATCH" }
  $cfg = @{}
  foreach ($k in @("watcher_path", "watcher_sha256", "heartbeat_path", "child_record_path", "lock_path", "powershell_exe")) {
    $v = [string]$raw.$k
    if ([string]::IsNullOrWhiteSpace($v)) { throw ("CONFIG_FIELD_REQUIRED:" + $k) }
    $cfg[$k] = $v
  }
  if ($cfg.watcher_sha256 -notmatch "^[0-9A-Fa-f]{64}$") { throw "CONFIG_WATCHER_SHA256_INVALID" }
  $cfg.watcher_sha256 = $cfg.watcher_sha256.ToUpperInvariant()
  $ints = @{ batch_polls = 20; min_backoff_seconds = 3; max_backoff_seconds = 60; progress_stall_seconds = 0; batch_timeout_seconds = 0; heartbeat_every_seconds = 5; orphan_quarantine_seconds = 0; watcher_missing_fatal_after = 5 }
  foreach ($k in @($ints.Keys)) {
    $v = $raw.$k
    if ($null -eq $v) { $cfg[$k] = [int]$ints[$k] } else { $cfg[$k] = [int]$v }
  }
  if ($cfg.batch_polls -lt 2 -or $cfg.batch_polls -gt 1000) { throw "CONFIG_BATCH_POLLS_OUT_OF_RANGE" }
  if ($cfg.min_backoff_seconds -lt 1 -or $cfg.max_backoff_seconds -lt $cfg.min_backoff_seconds) { throw "CONFIG_BACKOFF_INVALID" }
  if ($cfg.heartbeat_every_seconds -lt 1) { throw "CONFIG_HEARTBEAT_INVALID" }
  if ($cfg.watcher_missing_fatal_after -lt 1) { throw "CONFIG_WATCHER_MISSING_FATAL_AFTER_INVALID" }
  # Progresso: o watcher salva o checkpoint a cada poll bem-sucedido. Sem
  # checkpoint novo por este tempo, o lote esta parado e e encerrado.
  if ($cfg.progress_stall_seconds -le 0) { $cfg.progress_stall_seconds = (3 * $PollSeconds) + 30 }
  if ($cfg.batch_timeout_seconds -le 0) { $cfg.batch_timeout_seconds = ($cfg.batch_polls * ($PollSeconds + 20)) + 60 }
  # Vida maxima de um lote orfao (sem supervisor): cada poll tem CommandTimeout
  # 5 s e LOCK_TIMEOUT 2 s, mais o intervalo; o watcher sai sozinho no fim.
  if ($cfg.orphan_quarantine_seconds -le 0) { $cfg.orphan_quarantine_seconds = ($cfg.batch_polls * ($PollSeconds + 10)) + 30 }
  return $cfg
}

# ---------------------------------------------------------------- validacao --
if ($MaxPolls -ne 0) { [Console]::Error.WriteLine("SUPERVISOR_FATAL SUPERVISOR_REQUIRES_CONTINUOUS_HOST_MODE_MAXPOLLS_0"); exit $ExitConfig }
if ($StablePolls -lt 2) { [Console]::Error.WriteLine("SUPERVISOR_FATAL STABLE_POLLS_MUST_BE_AT_LEAST_2"); exit $ExitConfig }
if ($PollSeconds -lt 1) { [Console]::Error.WriteLine("SUPERVISOR_FATAL POLL_SECONDS_MUST_BE_AT_LEAST_1"); exit $ExitConfig }
if ($TopOrders -lt 1 -or $TopOrders -gt 100) { [Console]::Error.WriteLine("SUPERVISOR_FATAL TOP_ORDERS_OUT_OF_RANGE"); exit $ExitConfig }

$cfg = $null
try { $cfg = Read-Config } catch {
  [Console]::Error.WriteLine("SUPERVISOR_FATAL " + $_.Exception.Message)
  exit $ExitConfig
}

$runId = [Guid]::NewGuid().ToString()
$startedAt = Now-Iso
$selfSha = $null
try { $selfSha = Get-Sha256Hex $PSCommandPath } catch { $selfSha = $null }
$hbSeq = 0
$state = [ordered]@{
  status = "STARTING"
  last_batch = $null
  current_batch = $null
  last_success_at = $null
  consecutive_failures = 0
  next_attempt_at = $null
  fatal = $null
  blocked = $null
  totals = [ordered]@{ batches = 0; ok = 0; failed = 0; polls = 0; events_emitted = 0; duplicates_suppressed = 0 }
  watcher_sha256_verified = $false
  # O que a partida achou de lote anterior: pelo registro do filho e pela
  # linha de comando (lote sem registro).
  startup = [ordered]@{ child_record = $null; command_line_hunt = $null }
}
# O filho vivo deste supervisor (no maximo um). Nenhum lote novo comeca
# enquanto ele existir.
$script:child = $null

# Heartbeat e melhor-esforco: um lock transitorio no arquivo (antivirus,
# indexador, comum no Windows) nao pode derrubar o supervisor e queimar o
# orcamento de restart do SCM (5 s, 15 s, depois nada por 24 h). Se o disco
# inteiro falhar, o heartbeat envelhece e o avaliador de saude acusa STALLED.
function Write-Heartbeat {
  try { Write-HeartbeatNow } catch { [Console]::Error.WriteLine((Now-Iso) + " HEARTBEAT_WRITE_FAILED") }
}

function Write-HeartbeatNow {
  $script:hbSeq++
  $hb = [ordered]@{
    schema = $HeartbeatSchema
    supervisor = [ordered]@{
      version = $SupervisorVersion
      script_sha256 = $selfSha
      pid = $PID
      run_id = $runId
      started_at = $startedAt
    }
    watcher = [ordered]@{
      file_name = [IO.Path]::GetFileName($cfg.watcher_path)
      expected_sha256 = $cfg.watcher_sha256
      sha256_verified = [bool]$state.watcher_sha256_verified
      effects_allowed_true = $AllowedTrueEffects
    }
    state = $state.status
    seq = $hbSeq
    written_at = Now-Iso
    cadence = [ordered]@{
      poll_seconds = $PollSeconds
      batch_polls = $cfg.batch_polls
      expected_batch_seconds = ($cfg.batch_polls * $PollSeconds)
      progress_stall_seconds = $cfg.progress_stall_seconds
      batch_timeout_seconds = $cfg.batch_timeout_seconds
      heartbeat_every_seconds = $cfg.heartbeat_every_seconds
      max_backoff_seconds = $cfg.max_backoff_seconds
      orphan_quarantine_seconds = $cfg.orphan_quarantine_seconds
    }
    current_batch = $state.current_batch
    last_batch = $state.last_batch
    last_success_at = $state.last_success_at
    consecutive_failures = $state.consecutive_failures
    next_attempt_at = $state.next_attempt_at
    fatal = $state.fatal
    blocked = $state.blocked
    startup = $state.startup
    totals = $state.totals
    effects = [ordered]@{
      supervisor_database_read = $false
      database_write = $false
      local_state_write = $true
      network_call = $false
      print = $false
      spooler_write = $false
      odhen_write = $false
      fiscal_action = $false
      sefaz_call = $false
    }
    privacy = [ordered]@{
      customer_pii = $false
      raw_error_text = $false
      order_identifiers = $false
    }
  }
  Write-AtomicJson $cfg.heartbeat_path $hb
}

function Stop-Fatal([string]$Code) {
  $state.status = "FATAL"
  $state.fatal = $Code
  $state.current_batch = $null
  $state.next_attempt_at = $null
  Write-Heartbeat
  [Console]::Error.WriteLine("SUPERVISOR_FATAL " + $Code)
  if ($null -ne $lockStream) { try { $lockStream.Dispose() } catch { } }
  exit $ExitConfig
}

# Espera melhor-esforco com heartbeat, sem nunca lancar.
function Wait-WithHeartbeat([int]$Milliseconds) {
  $slept = 0
  while ($slept -lt $Milliseconds) {
    $step = [Math]::Min(5000, $Milliseconds - $slept)
    Start-Sleep -Milliseconds $step
    $slept += $step
    Write-Heartbeat
  }
}

# ----------------------------------------------------- instancia unica (lock) --
$lockStream = $null
try {
  $lockDir = [IO.Path]::GetDirectoryName($cfg.lock_path)
  if (-not (Test-Path -LiteralPath $lockDir -PathType Container)) { New-Item -ItemType Directory -Force -Path $lockDir | Out-Null }
} catch { }
# Ate 15 s de tentativas: a instancia anterior pode estar saindo, ou um
# antivirus segurando o arquivo. Persistindo, e outra instancia viva.
for ($try = 1; $try -le 15 -and $null -eq $lockStream; $try++) {
  try {
    $lockStream = [IO.File]::Open($cfg.lock_path, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  } catch {
    if ($try -lt 15) { Start-Sleep -Seconds 1 }
  }
}
if ($null -eq $lockStream) {
  [Console]::Error.WriteLine("SUPERVISOR_ALREADY_RUNNING")
  exit $ExitLocked
}

# -------------------------------------------------- processo filho (lote) --
function Test-SameProcess($Process, $RecordedStart) {
  # PID sozinho nao identifica processo (o Windows reutiliza PID): so e o
  # mesmo lote se a hora de inicio bater com a registrada, com tolerancia de
  # 1 s para a diferenca de arredondamento entre leituras do sistema.
  try {
    # PowerShell 7 converte texto ISO em [datetime] no ConvertFrom-Json; o 5.1
    # nao. Os dois caminhos chegam ao mesmo instante UTC.
    if ($RecordedStart -is [datetime]) {
      $recorded = $RecordedStart.ToUniversalTime()
    } else {
      $recorded = [datetime]::ParseExact([string]$RecordedStart, "yyyy-MM-ddTHH:mm:ss.fffZ", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal)
    }
    $delta = [Math]::Abs(($Process.StartTime.ToUniversalTime() - $recorded).TotalMilliseconds)
    return ($delta -le 1000)
  } catch { return $false }
}

# Linux (testes): processo morto que o pai ainda nao recolheu fica "Z" na
# tabela. Ja nao executa nada; contar como vivo travaria a confirmacao. No
# Windows nao ha esse estado: sempre $false.
function Test-Zombie([int]$ProcessId) {
  if (-not $IsLinux) { return $false }
  try { return ([IO.File]::ReadAllText("/proc/" + $ProcessId + "/stat") -match "^\d+ \(.*\) Z ") } catch { return $true }
}

# Mata e CONFIRMA. Devolve $true so quando o processo nao existe mais (ou
# virou zumbi, que nao escreve).
function Stop-AndConfirm($Process) {
  try { if ($Process.HasExited) { return $true } } catch { return $true }
  try { $Process.Kill() } catch { }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.ElapsedMilliseconds -lt 15000) {
    try { if ($Process.WaitForExit(200)) { return $true } } catch { return $true }
    if (Test-Zombie $Process.Id) { return $true }
  }
  return $false
}

# O host mata o supervisor sem sinal; o lote filho pode sobreviver ate terminar
# o proprio limite de polls. Antes de comecar, ele e encerrado: dois watchers
# escrevendo o mesmo checkpoint nunca rodam juntos.
function Stop-OrphanBatch {
  if (-not [IO.File]::Exists($cfg.child_record_path)) { return "NONE" }
  $rec = $null
  try { $rec = [IO.File]::ReadAllText($cfg.child_record_path) | ConvertFrom-Json } catch { return "RECORD_UNREADABLE" }
  if ($null -eq $rec -or $null -eq $rec.pid) { return "RECORD_UNREADABLE" }
  $p = $null
  try { $p = Get-Process -Id ([int]$rec.pid) -ErrorAction Stop } catch { return "NOT_RUNNING" }
  # PID reutilizado significa que o processo registrado ja terminou.
  if (-not (Test-SameProcess $p $rec.process_start_utc)) { return "PID_REUSED_NOT_TOUCHED" }
  if (Stop-AndConfirm $p) { return "ORPHAN_STOPPED" }
  return "ORPHAN_ALIVE"
}

# Lote SEM registro: o supervisor anterior morreu entre Process.Start e a
# gravacao do registro (janela de milissegundos), ou o registro foi tirado do
# caminho. Caca pela linha de comando, como o cutover: processo PowerShell que
# cita o watcher e nao e este supervisor. O servico so enxerga a linha de
# comando de processos do proprio usuario, e e com ele que os lotes rodam;
# linha de comando ilegivel e de outro usuario e fica de fora.
# Devolve NONE, UNRECORDED_STOPPED, UNRECORDED_ALIVE ou LIST_UNKNOWN.
function Stop-UnrecordedBatches {
  $shell = "^(powershell|pwsh)(\.exe)?$"
  $ids = @()
  try {
    if ($PSVersionTable.PSVersion.Major -ge 7) {
      foreach ($p in @(Get-Process -ErrorAction Stop)) {
        if ($p.ProcessName -notmatch $shell -or $p.Id -eq $PID) { continue }
        if (Test-Zombie $p.Id) { continue }
        $cl = $null
        try { $cl = $p.CommandLine } catch { $cl = $null }
        if ($null -ne $cl -and $cl.IndexOf($cfg.watcher_path, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $ids += [int]$p.Id }
      }
    } else {
      foreach ($p in @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)) {
        if ([string]$p.Name -notmatch $shell -or [int]$p.ProcessId -eq $PID) { continue }
        $cl = [string]$p.CommandLine
        if ($cl.IndexOf($cfg.watcher_path, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $ids += [int]$p.ProcessId }
      }
    }
  } catch { return "LIST_UNKNOWN" }
  if ($ids.Count -eq 0) { return "NONE" }
  $alive = 0
  foreach ($procId in $ids) {
    $p = $null
    try { $p = Get-Process -Id $procId -ErrorAction Stop } catch { continue }
    if (-not (Stop-AndConfirm $p)) { $alive++ }
  }
  if ($alive -gt 0) { return "UNRECORDED_ALIVE" }
  return "UNRECORDED_STOPPED"
}

function Remove-ChildRecord {
  try { if ([IO.File]::Exists($cfg.child_record_path)) { [IO.File]::Delete($cfg.child_record_path) } } catch { }
}

function Save-ChildRecord($Process) {
  $rec = [ordered]@{
    schema = "deliveryos.tata-reader-supervisor-child.v1"
    pid = $Process.Id
    process_start_utc = $Process.StartTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", [Globalization.CultureInfo]::InvariantCulture)
    supervisor_run_id = $runId
    written_at = Now-Iso
  }
  Write-AtomicJson $cfg.child_record_path $rec
}

# Marca de progresso: instante da ultima gravacao do checkpoint, ou $null
# quando nao observavel agora (arquivo sumido no meio do File.Replace do
# watcher, ou lock transitorio). Nunca lanca.
function Get-ProgressStamp {
  try {
    $t = [IO.File]::GetLastWriteTimeUtc($CheckpointPath).Ticks
    if ($t -eq $NoFileTicks) { return $null }
    return $t
  } catch { return $null }
}

function New-Batch([int]$BatchSeq, [string]$StartedAt) {
  return [ordered]@{
    seq = $BatchSeq
    started_at = $StartedAt
    finished_at = $null
    duration_ms = $null
    exit_code = $null
    outcome = $null
    error_class = $null
    sql_error_number = $null
    effects_true = $null
    polls = $null
    poll_errors = $null
    snapshots_observed = $null
    events_emitted = $null
    duplicates_suppressed = $null
    changed_snapshots = $null
    baseline_suppressed = $null
  }
}

function Invoke-Batch([int]$BatchSeq) {
  $batchStarted = Now-Iso
  $batch = New-Batch $BatchSeq $batchStarted
  $state.current_batch = [ordered]@{ seq = $BatchSeq; started_at = $batchStarted; last_progress_at = $null }
  $state.status = "RUNNING"
  Write-Heartbeat

  $argLine = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File " + (Quote-Arg $cfg.watcher_path) +
    " -MaxPolls " + $cfg.batch_polls +
    " -PollSeconds " + $PollSeconds +
    " -StablePolls " + $StablePolls +
    " -TopOrders " + $TopOrders +
    " -CheckpointPath " + (Quote-Arg $CheckpointPath) +
    " -EventDir " + (Quote-Arg $EventDir)
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $cfg.powershell_exe
  $psi.Arguments = $argLine
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.WorkingDirectory = [IO.Path]::GetDirectoryName($cfg.watcher_path)

  $sw = [Diagnostics.Stopwatch]::StartNew()
  $proc = $null
  try {
    $proc = [Diagnostics.Process]::Start($psi)
  } catch {
    $batch.outcome = "BATCH_START_FAILED"
    $batch.error_class = "BATCH_START_FAILED:" + (Get-ExceptionClass $_)
    $batch.finished_at = Now-Iso
    $batch.duration_ms = $sw.ElapsedMilliseconds
    return $batch
  }
  $script:child = $proc

  # Sem registro nao ha como achar o lote depois de uma queda do supervisor:
  # o filho nao pode seguir sem ele.
  try {
    Save-ChildRecord $proc
  } catch {
    if (Stop-AndConfirm $proc) { $script:child = $null }
    $batch.outcome = "CHILD_RECORD_WRITE_FAILED"
    $batch.error_class = "CHILD_RECORD_WRITE_FAILED"
    $batch.finished_at = Now-Iso
    $batch.duration_ms = $sw.ElapsedMilliseconds
    return $batch
  }

  $outTask = $proc.StandardOutput.ReadToEndAsync()
  $errTask = $proc.StandardError.ReadToEndAsync()
  $lastStamp = Get-ProgressStamp
  $lastProgressMs = [long]0
  $lastHbMs = [long]0
  $killed = $null
  while (-not $proc.WaitForExit(500)) {
    $now = $sw.ElapsedMilliseconds
    $stamp = Get-ProgressStamp
    if ($null -ne $stamp -and $stamp -ne $lastStamp) {
      $lastStamp = $stamp
      $lastProgressMs = $now
      $state.current_batch.last_progress_at = Now-Iso
    }
    if (($now - $lastProgressMs) -gt ([long]$cfg.progress_stall_seconds * 1000)) { $killed = "PROGRESS_STALL" }
    elseif ($now -gt ([long]$cfg.batch_timeout_seconds * 1000)) { $killed = "BATCH_TIMEOUT" }
    if ($null -ne $killed) { break }
    if (($now - $lastHbMs) -ge ([long]$cfg.heartbeat_every_seconds * 1000)) {
      $lastHbMs = $now
      Write-Heartbeat
    }
  }
  if ($null -ne $killed) {
    if (-not (Stop-AndConfirm $proc)) {
      # Filho que nao morre: o registro fica, e nenhum lote novo comeca.
      $batch.outcome = $killed
      $batch.error_class = $killed + "_CHILD_UNKILLABLE"
      $batch.finished_at = Now-Iso
      $batch.duration_ms = $sw.ElapsedMilliseconds
      return $batch
    }
  }
  # Processo encerrado: espera limitada pelo fim dos fluxos redirecionados.
  try { [void]$proc.WaitForExit(15000) } catch { }
  $stdout = ""
  $stderr = ""
  try { if ($outTask.Wait(5000)) { $stdout = $outTask.Result } } catch { }
  try { if ($errTask.Wait(5000)) { $stderr = $errTask.Result } } catch { }
  $exitCode = -1
  try { $exitCode = $proc.ExitCode } catch { }
  try { $proc.Dispose() } catch { }
  $script:child = $null
  Remove-ChildRecord

  $batch.finished_at = Now-Iso
  $batch.duration_ms = $sw.ElapsedMilliseconds
  $batch.exit_code = $exitCode

  if ($null -ne $killed) {
    $batch.outcome = $killed
    $batch.error_class = $killed
  } elseif ($exitCode -ne 0) {
    $cls = Get-ErrorClass $stderr $exitCode
    $batch.outcome = "WATCHER_FAILED"
    $batch.error_class = $cls.code
    $batch.sql_error_number = $cls.sql_error_number
  } else {
    $run = $null
    try {
      $jsonStart = $stdout.IndexOf("{")
      $jsonEnd = $stdout.LastIndexOf("}")
      if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) { throw "NO_JSON" }
      $run = $stdout.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json
    } catch { $run = $null }
    if ($null -eq $run) {
      $batch.outcome = "RESULT_UNPARSEABLE"
      $batch.error_class = "RESULT_UNPARSEABLE"
    } elseif ($null -eq $run.effects -or -not ($run.effects -is [System.Management.Automation.PSCustomObject]) -or @($run.effects.PSObject.Properties).Count -eq 0) {
      $batch.outcome = "EFFECTS_UNDECLARED"
      $batch.error_class = "EFFECTS_UNDECLARED"
    } else {
      $true_effects = @()
      $violations = @()
      foreach ($p in @($run.effects.PSObject.Properties)) {
        if ($p.Value -eq $true) {
          $true_effects += $p.Name
          if ($AllowedTrueEffects -notcontains $p.Name) { $violations += $p.Name }
        }
      }
      $batch.effects_true = @($true_effects | Sort-Object)
      if ($violations.Count -gt 0) {
        $batch.outcome = "EFFECT_VIOLATION"
        $batch.error_class = "EFFECT_VIOLATION:" + (($violations | Sort-Object) -join ",")
      } elseif ($run.schema -ne $RunSchema) {
        $batch.outcome = "RESULT_REJECTED"; $batch.error_class = "RUN_SCHEMA_MISMATCH"
      } elseif ($run.status -ne "COMPLETED") {
        $batch.outcome = "RESULT_REJECTED"; $batch.error_class = "RUN_NOT_COMPLETED"
      } elseif ([int]$run.poll_errors -ne 0) {
        $batch.outcome = "RESULT_REJECTED"; $batch.error_class = "RUN_POLL_ERRORS"
      } elseif ([int]$run.polls -ne $cfg.batch_polls) {
        $batch.outcome = "RESULT_REJECTED"; $batch.error_class = "RUN_POLL_COUNT_MISMATCH"
      } else {
        $batch.outcome = "OK"
      }
      foreach ($k in @("polls", "poll_errors", "snapshots_observed", "events_emitted", "duplicates_suppressed", "changed_snapshots", "baseline_suppressed")) {
        if ($null -ne $run.$k) { $batch[$k] = [int]$run.$k }
      }
    }
  }

  if ($batch.outcome -ne "OK") {
    $lines = @(($stderr -split "`r?`n") | Where-Object { $_.Trim() -ne "" } | Select-Object -Last 12)
    [Console]::Error.WriteLine((Now-Iso) + " BATCH_FAILED seq=" + $BatchSeq + " outcome=" + $batch.outcome + " class=" + $batch.error_class + " exit=" + $exitCode)
    foreach ($l in $lines) { [Console]::Error.WriteLine("  watcher: " + $l) }
  }
  return $batch
}

# Um filho que nao morreu bloqueia tudo: tenta de novo, com heartbeat, ate
# ele sumir. Nunca comeca lote novo por cima.
function Wait-ChildGone {
  while ($null -ne $script:child) {
    if (Stop-AndConfirm $script:child) {
      try { $script:child.Dispose() } catch { }
      $script:child = $null
      Remove-ChildRecord
      $state.blocked = $null
      return
    }
    $state.status = "BLOCKED_CHILD_ALIVE"
    $state.blocked = "CHILD_ALIVE_NO_NEW_BATCH"
    Wait-WithHeartbeat 10000
  }
}

function Register-Failure($Batch) {
  $state.totals.failed++
  $state.consecutive_failures++
  $exp = [Math]::Min(16, $state.consecutive_failures - 1)
  $wait = [Math]::Min([double]$cfg.max_backoff_seconds, [double]$cfg.min_backoff_seconds * [Math]::Pow(2, $exp))
  $state.status = "BACKOFF"
  $state.next_attempt_at = (Get-Date).AddSeconds($wait).ToString("o")
  Write-Heartbeat
  return [int]($wait * 1000)
}

# ------------------------------------------------------------------- laco --
$exitCode = 0
try {
  $orphan = "NONE"
  try { $orphan = Stop-OrphanBatch } catch { $orphan = "RECORD_UNREADABLE" }
  if ($orphan -ne "NONE" -and $orphan -ne "NOT_RUNNING") {
    [Console]::Error.WriteLine((Now-Iso) + " ORPHAN_BATCH " + $orphan)
  }
  # Segunda camada, independente do registro. Lista desconhecida (WMI negado
  # ou falhando) NAO trava o leitor: fica declarada no heartbeat e a primeira
  # camada (registro do filho) continua valendo.
  $hunt = "LIST_UNKNOWN"
  try { $hunt = Stop-UnrecordedBatches } catch { $hunt = "LIST_UNKNOWN" }
  $state.startup.child_record = $orphan
  $state.startup.command_line_hunt = $hunt
  if ($hunt -ne "NONE") { [Console]::Error.WriteLine((Now-Iso) + " UNRECORDED_BATCH " + $hunt) }
  if ($hunt -eq "UNRECORDED_ALIVE" -and $orphan -ne "RECORD_UNREADABLE" -and $orphan -ne "ORPHAN_ALIVE") { $orphan = "ORPHAN_ALIVE" }
  if ($orphan -eq "RECORD_UNREADABLE" -or $orphan -eq "ORPHAN_ALIVE") {
    # Nao da para provar que o lote anterior acabou: espera o tempo maximo
    # de vida de um lote antes de comecar outro.
    $state.status = "WAITING_UNKNOWN_ORPHAN"
    $state.blocked = "ORPHAN_" + $orphan
    Write-Heartbeat
    Wait-WithHeartbeat ($cfg.orphan_quarantine_seconds * 1000)
    $state.blocked = $null
  }
  Remove-ChildRecord
  Write-Heartbeat
  $batchSeq = 0
  $missing = 0
  while ($true) {
    if ($MaxBatches -gt 0 -and $batchSeq -ge $MaxBatches) { break }
    $waitMs = 0
    try {
      Wait-ChildGone

      # Codigo instalado = codigo auditado, a cada lote. Ausente ou ilegivel
      # (antivirus, troca de arquivo) e transitorio; diferente e adulteracao.
      $actual = $null
      $unreadable = $false
      $unreadableClass = $null
      if (-not [IO.File]::Exists($cfg.watcher_path)) {
        $missing++
        if ($missing -ge $cfg.watcher_missing_fatal_after) { Stop-Fatal "WATCHER_MISSING" }
      } else {
        $missing = 0
        # A CLASSE da excecao vai junto (nunca a mensagem): IOException de
        # antivirus e CommandNotFoundException de ambiente quebrado sao
        # problemas diferentes, e o heartbeat tem de dizer qual.
        try { $actual = Get-Sha256Hex $cfg.watcher_path } catch { $unreadable = $true; $unreadableClass = Get-ExceptionClass $_ }
      }
      if ($null -ne $actual -and $actual -ne $cfg.watcher_sha256) {
        $state.watcher_sha256_verified = $false
        Stop-Fatal "WATCHER_HASH_MISMATCH"
      }
      $batchSeq++
      if ($null -eq $actual) {
        $b = New-Batch $batchSeq (Now-Iso)
        $b.finished_at = Now-Iso
        $b.outcome = if ($unreadable) { "WATCHER_UNREADABLE" } else { "WATCHER_MISSING" }
        $b.error_class = if ($unreadable -and $unreadableClass) { "WATCHER_UNREADABLE:" + $unreadableClass } else { $b.outcome }
        $state.last_batch = $b
        $state.totals.batches++
        [Console]::Error.WriteLine((Now-Iso) + " BATCH_FAILED seq=" + $batchSeq + " outcome=" + $b.outcome)
        $waitMs = Register-Failure $b
      } else {
        $state.watcher_sha256_verified = $true
        $state.next_attempt_at = $null

        $batch = Invoke-Batch $batchSeq
        $state.current_batch = $null
        $state.last_batch = $batch
        $state.totals.batches++
        if ($null -ne $batch.polls) { $state.totals.polls += [int]$batch.polls }
        if ($null -ne $batch.events_emitted) { $state.totals.events_emitted += [int]$batch.events_emitted }
        if ($null -ne $batch.duplicates_suppressed) { $state.totals.duplicates_suppressed += [int]$batch.duplicates_suppressed }

        if ($batch.outcome -eq "EFFECT_VIOLATION" -or $batch.outcome -eq "EFFECTS_UNDECLARED") {
          $state.totals.failed++
          Stop-Fatal $batch.error_class
        }
        if ($batch.outcome -eq "OK") {
          $state.totals.ok++
          $state.consecutive_failures = 0
          $state.last_success_at = $batch.finished_at
          $state.status = "RUNNING"
          Write-Heartbeat
        } else {
          $waitMs = Register-Failure $batch
        }
      }
    } catch {
      # Nada fora do previsto derruba o supervisor: o lote vira falha interna,
      # com a CLASSE do erro (nunca a mensagem) no heartbeat, e backoff.
      $cls = Get-ExceptionClass $_
      [Console]::Error.WriteLine((Now-Iso) + " SUPERVISOR_INTERNAL_ERROR " + $cls)
      $state.current_batch = $null
      $b = New-Batch $batchSeq (Now-Iso)
      $b.finished_at = Now-Iso
      $b.outcome = "SUPERVISOR_INTERNAL_ERROR"
      $b.error_class = "SUPERVISOR_INTERNAL_ERROR:" + $cls
      $state.last_batch = $b
      $state.totals.batches++
      try { $waitMs = Register-Failure $b } catch { $waitMs = $cfg.max_backoff_seconds * 1000 }
    }
    if ($waitMs -gt 0) {
      if ($MaxBatches -gt 0 -and $batchSeq -ge $MaxBatches) { break }
      Wait-WithHeartbeat $waitMs
    }
  }
  if ($null -ne $script:child) { [void](Stop-AndConfirm $script:child) }
  $state.status = "STOPPED"
  $state.next_attempt_at = $null
  Write-Heartbeat
} catch {
  [Console]::Error.WriteLine((Now-Iso) + " SUPERVISOR_UNHANDLED " + (Get-ExceptionClass $_))
  $exitCode = $ExitInternal
} finally {
  if ($null -ne $lockStream) { try { $lockStream.Dispose() } catch { } }
}
exit $exitCode

<#
  TATA Comanda Reader — supervisor de lotes do watcher (v1)
  =========================================================
  POR QUE EXISTE. Em 05/10/2026 o servico TataComandaReader ficou RUNNING com
  os processos vivos e a sessao SQL "sleeping", mas sem nenhuma leitura nova
  desde 21:55:51. Reproduzido contra SQL Server 2022 real com o watcher v1
  byte-identico (so a identidade/conexao trocadas pelo harness): uma unica
  espera de lock acima do LOCK_TIMEOUT dentro de Read() deixa o SqlDataReader
  ABERTO; toda leitura seguinte falha no proprio cliente ("There is already an
  open DataReader...") e o modo continuo engole o erro para sempre.

  O QUE ESTE SUPERVISOR FAZ. Roda o watcher AUDITADO, sem alterar um byte dele,
  no modo em que ele foi provado — lotes limitados (-MaxPolls N). Cada lote e um
  processo novo com conexao nova: um erro encerra o lote em voz alta, nunca
  envenena o seguinte. Entre lotes:
    - confere o SHA-256 do watcher contra o valor fixado (codigo instalado =
      codigo auditado, a cada lote, nao so na instalacao);
    - valida o resultado JSON do lote (schema, status, polls, poll_errors e
      efeitos — qualquer efeito proibido PARA o supervisor);
    - mata lote sem progresso (checkpoint parado) ou acima do tempo maximo;
    - aplica backoff exponencial limitado depois de falha;
    - escreve um heartbeat atomico, sem PII e sem texto bruto de erro.

  Ele NAO le o banco, NAO escreve no banco, NAO imprime, NAO toca Odhen, fiscal
  ou SEFAZ. Os unicos efeitos proprios sao arquivos locais de estado (heartbeat,
  lock e registro do lote filho).

  COMPATIBILIDADE. Aceita a mesma linha de comando que o host do servico ja
  passa ao watcher (-MaxPolls 0 -PollSeconds -StablePolls -TopOrders
  -CheckpointPath -EventDir), para poder ser instalado no caminho fixo do host
  sem recompilar o host. O resto vem do arquivo de configuracao ao lado do
  script (tata_reader_supervisor_v1.config.json), validado fail-closed.

  Compativel com Windows PowerShell 5.1 (CAIXA) e PowerShell 7 (testes).
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
$SupervisorVersion = "tata-reader-supervisor@1"
$HeartbeatSchema = "deliveryos.tata-reader-heartbeat.v1"
$ConfigSchema = "deliveryos.tata-reader-supervisor-config.v1"
$RunSchema = "deliveryos.tata-reader-continuous-watch-run.v1"
$ExitConfig = 78
$ExitLocked = 75

# Efeitos que o resultado de um lote pode declarar como verdadeiros. Qualquer
# outro efeito verdadeiro e violacao: o supervisor para (fail-closed).
$AllowedTrueEffects = @("database_read", "local_checkpoint_write", "local_event_write")

function Get-Sha256Hex([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
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
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    # $null vira "" ao atravessar para .NET; o backup explicito e o mesmo
    # padrao do watcher auditado, e e removido logo em seguida.
    $bak = $Path + ".bak"
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
    [IO.File]::Replace($tmp, $Path, $bak, $true)
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
  } else {
    [IO.File]::Move($tmp, $Path)
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
  $ints = @{ batch_polls = 60; min_backoff_seconds = 3; max_backoff_seconds = 60; progress_stall_seconds = 0; batch_timeout_seconds = 0; heartbeat_every_seconds = 5 }
  foreach ($k in @($ints.Keys)) {
    $v = $raw.$k
    if ($null -eq $v) { $cfg[$k] = [int]$ints[$k] } else { $cfg[$k] = [int]$v }
  }
  if ($cfg.batch_polls -lt 2 -or $cfg.batch_polls -gt 1000) { throw "CONFIG_BATCH_POLLS_OUT_OF_RANGE" }
  if ($cfg.min_backoff_seconds -lt 1 -or $cfg.max_backoff_seconds -lt $cfg.min_backoff_seconds) { throw "CONFIG_BACKOFF_INVALID" }
  if ($cfg.heartbeat_every_seconds -lt 1) { throw "CONFIG_HEARTBEAT_INVALID" }
  # Progresso: o watcher salva o checkpoint a cada poll bem-sucedido. Sem
  # checkpoint novo por este tempo, o lote esta parado e e encerrado.
  if ($cfg.progress_stall_seconds -le 0) { $cfg.progress_stall_seconds = (3 * $PollSeconds) + 30 }
  if ($cfg.batch_timeout_seconds -le 0) { $cfg.batch_timeout_seconds = ($cfg.batch_polls * ($PollSeconds + 20)) + 60 }
  return $cfg
}

# ---------------------------------------------------------------- validacao --
if ($MaxPolls -ne 0) { throw "SUPERVISOR_REQUIRES_CONTINUOUS_HOST_MODE_MAXPOLLS_0" }
if ($StablePolls -lt 2) { throw "STABLE_POLLS_MUST_BE_AT_LEAST_2" }
if ($PollSeconds -lt 1) { throw "POLL_SECONDS_MUST_BE_AT_LEAST_1" }
if ($TopOrders -lt 1 -or $TopOrders -gt 100) { throw "TOP_ORDERS_OUT_OF_RANGE" }

$cfg = $null
try { $cfg = Read-Config } catch {
  [Console]::Error.WriteLine("SUPERVISOR_FATAL " + $_.Exception.Message)
  exit $ExitConfig
}

$runId = [Guid]::NewGuid().ToString()
$startedAt = Now-Iso
$selfSha = Get-Sha256Hex $PSCommandPath
$hbSeq = 0
$state = [ordered]@{
  status = "STARTING"
  last_batch = $null
  current_batch = $null
  last_success_at = $null
  consecutive_failures = 0
  next_attempt_at = $null
  fatal = $null
  totals = [ordered]@{ batches = 0; ok = 0; failed = 0; polls = 0; events_emitted = 0; duplicates_suppressed = 0 }
  watcher_sha256_verified = $false
}

function Write-Heartbeat {
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
    }
    current_batch = $state.current_batch
    last_batch = $state.last_batch
    last_success_at = $state.last_success_at
    consecutive_failures = $state.consecutive_failures
    next_attempt_at = $state.next_attempt_at
    fatal = $state.fatal
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
  try { Write-Heartbeat } catch { }
  [Console]::Error.WriteLine("SUPERVISOR_FATAL " + $Code)
  exit $ExitConfig
}

# ----------------------------------------------------- instancia unica (lock) --
$lockDir = [IO.Path]::GetDirectoryName($cfg.lock_path)
if (-not (Test-Path -LiteralPath $lockDir -PathType Container)) { New-Item -ItemType Directory -Force -Path $lockDir | Out-Null }
$lockStream = $null
try {
  $lockStream = [IO.File]::Open($cfg.lock_path, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
} catch {
  [Console]::Error.WriteLine("SUPERVISOR_ALREADY_RUNNING")
  exit $ExitLocked
}

# -------------------------------------------- lote orfao de execucao anterior --
# O host mata o supervisor sem sinal; o lote filho pode sobreviver ate terminar
# o proprio limite de polls. Antes de comecar, ele e encerrado — dois watchers
# escrevendo o mesmo checkpoint nunca rodam juntos.
function Stop-OrphanBatch {
  if (-not (Test-Path -LiteralPath $cfg.child_record_path -PathType Leaf)) { return "NONE" }
  $rec = $null
  try { $rec = Get-Content -LiteralPath $cfg.child_record_path -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return "RECORD_UNREADABLE" }
  $p = $null
  try { $p = Get-Process -Id ([int]$rec.pid) -ErrorAction Stop } catch { return "NOT_RUNNING" }
  # PID sozinho nao identifica processo (o Windows reutiliza PID): so e o
  # mesmo lote se a hora de inicio bater com a registrada, com tolerancia de
  # 1 s para a diferenca de arredondamento entre leituras do sistema.
  $same = $false
  try {
    # PowerShell 7 converte texto ISO em [datetime] no ConvertFrom-Json; o 5.1
    # nao. Os dois caminhos chegam ao mesmo instante UTC.
    $v = $rec.process_start_utc
    if ($v -is [datetime]) {
      $recorded = $v.ToUniversalTime()
    } else {
      $recorded = [datetime]::ParseExact([string]$v, "yyyy-MM-ddTHH:mm:ss.fffZ", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal)
    }
    $delta = [Math]::Abs(($p.StartTime.ToUniversalTime() - $recorded).TotalMilliseconds)
    $same = ($delta -le 1000)
  } catch { $same = $false }
  if (-not $same) { return "PID_REUSED_NOT_TOUCHED" }
  try { $p.Kill(); [void]$p.WaitForExit(10000) } catch { }
  return "ORPHAN_STOPPED"
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

function Get-ProgressStamp {
  if (Test-Path -LiteralPath $CheckpointPath -PathType Leaf) {
    return (Get-Item -LiteralPath $CheckpointPath).LastWriteTimeUtc.Ticks
  }
  return [long]0
}

function Invoke-Batch([int]$BatchSeq) {
  $batchStarted = Now-Iso
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

  $proc = [Diagnostics.Process]::Start($psi)
  try { Save-ChildRecord $proc } catch { }
  $outTask = $proc.StandardOutput.ReadToEndAsync()
  $errTask = $proc.StandardError.ReadToEndAsync()

  $sw = [Diagnostics.Stopwatch]::StartNew()
  $lastStamp = Get-ProgressStamp
  $lastProgressMs = [long]0
  $lastHbMs = [long]0
  $killed = $null
  while (-not $proc.WaitForExit(500)) {
    $now = $sw.ElapsedMilliseconds
    $stamp = Get-ProgressStamp
    if ($stamp -ne $lastStamp) {
      $lastStamp = $stamp
      $lastProgressMs = $now
      $state.current_batch.last_progress_at = Now-Iso
    }
    if (($now - $lastProgressMs) -gt ([long]$cfg.progress_stall_seconds * 1000)) { $killed = "PROGRESS_STALL" }
    elseif ($now -gt ([long]$cfg.batch_timeout_seconds * 1000)) { $killed = "BATCH_TIMEOUT" }
    if ($null -ne $killed) {
      try { $proc.Kill() } catch { }
      [void]$proc.WaitForExit(10000)
      break
    }
    if (($now - $lastHbMs) -ge ([long]$cfg.heartbeat_every_seconds * 1000)) {
      $lastHbMs = $now
      try { Write-Heartbeat } catch { }
    }
  }
  $proc.WaitForExit()
  $stdout = ""
  $stderr = ""
  try { $stdout = $outTask.Result } catch { }
  try { $stderr = $errTask.Result } catch { }
  $exitCode = -1
  try { $exitCode = $proc.ExitCode } catch { }
  $proc.Dispose()
  try { Remove-Item -LiteralPath $cfg.child_record_path -Force -ErrorAction SilentlyContinue } catch { }

  $batch = [ordered]@{
    seq = $BatchSeq
    started_at = $batchStarted
    finished_at = Now-Iso
    duration_ms = $sw.ElapsedMilliseconds
    exit_code = $exitCode
    outcome = $null
    error_class = $null
    sql_error_number = $null
    polls = $null
    poll_errors = $null
    snapshots_observed = $null
    events_emitted = $null
    duplicates_suppressed = $null
    changed_snapshots = $null
    baseline_suppressed = $null
  }

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
      if ($jsonStart -lt 0) { throw "NO_JSON" }
      $run = $stdout.Substring($jsonStart) | ConvertFrom-Json
    } catch { $run = $null }
    if ($null -eq $run) {
      $batch.outcome = "RESULT_UNPARSEABLE"
      $batch.error_class = "RESULT_UNPARSEABLE"
    } else {
      $violations = @()
      foreach ($p in @($run.effects.PSObject.Properties)) {
        if ($p.Value -eq $true -and ($AllowedTrueEffects -notcontains $p.Name)) { $violations += $p.Name }
      }
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

# ------------------------------------------------------------------- laço --
try {
  $orphan = Stop-OrphanBatch
  if ($orphan -ne "NONE" -and $orphan -ne "NOT_RUNNING") {
    [Console]::Error.WriteLine((Now-Iso) + " ORPHAN_BATCH " + $orphan)
  }
  Write-Heartbeat
  $batchSeq = 0
  while ($true) {
    if ($MaxBatches -gt 0 -and $batchSeq -ge $MaxBatches) { break }

    if (-not (Test-Path -LiteralPath $cfg.watcher_path -PathType Leaf)) { Stop-Fatal "WATCHER_MISSING" }
    $actual = Get-Sha256Hex $cfg.watcher_path
    if ($actual -ne $cfg.watcher_sha256) {
      $state.watcher_sha256_verified = $false
      Stop-Fatal "WATCHER_HASH_MISMATCH"
    }
    $state.watcher_sha256_verified = $true
    $state.next_attempt_at = $null

    $batchSeq++
    $batch = Invoke-Batch $batchSeq
    $state.current_batch = $null
    $state.last_batch = $batch
    $state.totals.batches++
    if ($null -ne $batch.polls) { $state.totals.polls += [int]$batch.polls }
    if ($null -ne $batch.events_emitted) { $state.totals.events_emitted += [int]$batch.events_emitted }
    if ($null -ne $batch.duplicates_suppressed) { $state.totals.duplicates_suppressed += [int]$batch.duplicates_suppressed }

    if ($batch.outcome -eq "EFFECT_VIOLATION") {
      $state.totals.failed++
      Stop-Fatal $batch.error_class
    }

    if ($batch.outcome -eq "OK") {
      $state.totals.ok++
      $state.consecutive_failures = 0
      $state.last_success_at = $batch.finished_at
      $state.status = "RUNNING"
      Write-Heartbeat
      continue
    }

    $state.totals.failed++
    $state.consecutive_failures++
    $exp = [Math]::Min(16, $state.consecutive_failures - 1)
    $wait = [Math]::Min([double]$cfg.max_backoff_seconds, [double]$cfg.min_backoff_seconds * [Math]::Pow(2, $exp))
    $state.status = "BACKOFF"
    $state.next_attempt_at = (Get-Date).AddSeconds($wait).ToString("o")
    Write-Heartbeat
    if ($MaxBatches -gt 0 -and $batchSeq -ge $MaxBatches) { break }
    $waitMs = [int]($wait * 1000)
    $slept = 0
    while ($slept -lt $waitMs) {
      $step = [Math]::Min(5000, $waitMs - $slept)
      Start-Sleep -Milliseconds $step
      $slept += $step
      try { Write-Heartbeat } catch { }
    }
  }
  $state.status = "STOPPED"
  $state.next_attempt_at = $null
  Write-Heartbeat
  exit 0
} finally {
  if ($null -ne $lockStream) { $lockStream.Dispose() }
}

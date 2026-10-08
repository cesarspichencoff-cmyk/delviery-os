<#
  TATA Comanda Reader — cutover do supervisor com rollback automatico (v1)
  ========================================================================
  Executa, NA CAIXA_MOOCA, a troca autorizada por Cesar: backup -> instalar o
  watcher candidato (v2) SOB o supervisor -> restart controlado do servico
  TataComandaReader -> provar saude REAL -> se qualquer gate falhar, restaurar
  o watcher e o checkpoint anteriores, reiniciar e provar o rollback.

  MODOS
    -Mode Plan      (padrao) so le e confere; nenhuma escrita, nenhum restart.
    -Mode Apply     backup + instalacao + restart + gates + rollback automatico.
    -Mode Rollback  restaura um backup anterior (-BackupDir) e prova.

  FRONTEIRA (o que este script NUNCA faz): escrita no SQL Server, grant ou
  revogacao de permissao, impressao/spooler, Odhen, fiscal/SEFAZ, rede,
  qualquer servico alem de TataComandaReader. O unico efeito no SQL Server e,
  com -SqlSessionCheck, uma CONSULTA a sys.dm_exec_sessions como o operador.

  RECIBO: todo modo grava um JSON sanitizado (sem PII, sem texto livre, sem
  identificador de pedido) com SHA-256 de cada arquivo, horarios, gates e
  veredito — e e esse recibo que vira evidencia no Git depois de revisado.

  Funcoes puras (decisao de gate, plano, configuracao) ficam acima do bloco
  principal e sao testaveis por dot-source: carregar o script com ". arquivo"
  NAO executa nada.

  Compativel com Windows PowerShell 5.1.
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
  [string]$RepoRuntimeDir = "",
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe",
  [string]$PowerShellExe = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
  [int]$BatchPolls = 60,
  [int]$HealthWaitSeconds = 480,
  [int]$MinOkBatches = 2,
  [switch]$SqlSessionCheck,
  [string]$SqlServer = "(local)\SQLEXPRESS",
  [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"
$CutoverSchema = "deliveryos.tata-reader-supervisor-cutover-receipt.v1"
$CheckpointSchemaV1 = "deliveryos.tata-reader-continuous-checkpoint.v1"

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

# Decide se o servico esta saudavel DEPOIS do restart. Recebe um retrato ja
# coletado; nao toca em nada. Todo gate obrigatorio tem que ser $true — UNKNOWN
# nao passa. Os opcionais (sessao SQL, evento novo) so reprovam se FALHAREM;
# ausencia vira UNKNOWN registrado no recibo.
function Test-CutoverGate($Snap) {
  $g = [ordered]@{}
  $g.scm_running = ($Snap.scm_state -eq "Running")
  $g.host_running_after_restart = ($Snap.host_state -eq "RUNNING" -and $Snap.host_updated_after_restart -eq $true)
  $g.heartbeat_after_restart = ($Snap.heartbeat_after_restart -eq $true)
  $g.supervisor_sha_matches = ($Snap.heartbeat_supervisor_sha256 -eq $Snap.expected_supervisor_sha256 -and $Snap.expected_supervisor_sha256)
  $g.watcher_sha_pinned_and_verified = ($Snap.heartbeat_watcher_expected_sha256 -eq $Snap.expected_watcher_sha256 -and $Snap.heartbeat_watcher_verified -eq $true)
  $g.ok_batches = ($Snap.heartbeat_ok_batches -ge $Snap.min_ok_batches)
  $g.no_consecutive_failures = ($Snap.heartbeat_consecutive_failures -eq 0)
  $g.last_batch_ok = ($Snap.heartbeat_last_batch_outcome -eq "OK")
  $g.checkpoint_advanced = ($Snap.checkpoint_advanced -eq $true)
  $g.health_verdict_healthy = ($Snap.health_verdict -eq "HEALTHY")
  $g.no_forbidden_effect = ($Snap.heartbeat_database_write -eq $false)
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

# A auditoria estatica do candidato decide se ele pode rodar sob o supervisor.
function Test-AuditAllowsSupervisor($Audit) {
  if ($null -eq $Audit) { return $false }
  return ($Audit.recommendation -eq "INSTALL_ONLY_UNDER_SUPERVISOR" -or $Audit.recommendation -eq "SAFE_CONTINUOUS_AND_SUPERVISABLE")
}

# O candidato precisa ler o checkpoint ATUAL. Se ele declara outro schema de
# checkpoint, instalar exigiria migracao de estado — decisao humana, nao deste
# script.
function Test-CheckpointCompatible([string]$CandidateText, [string]$CurrentCheckpointSchema) {
  if ([string]::IsNullOrWhiteSpace($CurrentCheckpointSchema)) { return "NO_CHECKPOINT_YET" }
  if ($CandidateText.Contains('"' + $CurrentCheckpointSchema + '"')) { return "COMPATIBLE" }
  return "INCOMPATIBLE"
}

# ======================================================= efeitos (Windows) ==

function Get-Sha([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Read-JsonOrNull([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

function Write-Json([string]$Path, $Object) {
  $dir = [IO.Path]::GetDirectoryName($Path)
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $tmp = $Path + ".tmp." + $PID
  [IO.File]::WriteAllText($tmp, ($Object | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
  if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force }
  [IO.File]::Move($tmp, $Path)
}

function Copy-Verified([string]$From, [string]$To, [string]$ExpectedSha) {
  $dir = [IO.Path]::GetDirectoryName($To)
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Copy-Item -LiteralPath $From -Destination $To -Force
  $got = Get-Sha $To
  if ($got -ne $ExpectedSha.ToUpperInvariant()) { throw ("COPY_SHA_MISMATCH:" + [IO.Path]::GetFileName($To)) }
  return $got
}

function Invoke-NodeJson([string]$Script, [string[]]$Arguments) {
  $all = @($Script) + $Arguments
  $out = & $NodeExe @all 2>$null
  $code = $LASTEXITCODE
  $text = ($out -join "`n")
  $obj = $null
  try { $obj = $text | ConvertFrom-Json } catch { $obj = $null }
  return @{ code = $code; json = $obj }
}

function Get-ScmState {
  $s = Get-Service -Name $ServiceName -ErrorAction Stop
  return [string]$s.Status
}

function Get-ServiceInfo {
  $w = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $ServiceName + "'")
  return [ordered]@{ state = [string]$w.State; start_name = [string]$w.StartName; path_name = [string]$w.PathName; start_mode = [string]$w.StartMode }
}

function Wait-Scm([string]$Want, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if ((Get-ScmState) -eq $Want) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
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

function Get-NewEventPrivacy($Layout, [datetime]$Since) {
  if (-not (Test-Path -LiteralPath $Layout.events -PathType Container)) { return "UNKNOWN" }
  $files = @(Get-ChildItem -LiteralPath $Layout.events -Filter "*.json" | Where-Object { $_.LastWriteTime -gt $Since })
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
}

function Get-Snapshot($Layout, [datetime]$RestartAt, [long]$CheckpointTicksBefore, [string]$ExpectedSupSha, [string]$ExpectedWatcherSha, [string]$HealthCli, [switch]$Light) {
  $hb = Read-JsonOrNull $Layout.heartbeat
  $hs = Read-JsonOrNull $Layout.host_status
  $cs = Read-JsonOrNull $Layout.consumer_status
  $ckTicks = [long]0
  if (Test-Path -LiteralPath $Layout.checkpoint -PathType Leaf) { $ckTicks = (Get-Item -LiteralPath $Layout.checkpoint).LastWriteTimeUtc.Ticks }
  $health = Invoke-NodeJson $HealthCli @("--heartbeat", $Layout.heartbeat, "--host-status", $Layout.host_status, "--consumer-status", $Layout.consumer_status, "--checkpoint", $Layout.checkpoint)
  $hostAfter = $false
  if ($null -ne $hs -and $hs.updated_at) { try { $hostAfter = ([datetime]$hs.updated_at) -gt $RestartAt } catch { $hostAfter = $false } }
  $hbAfter = $false
  if ($null -ne $hb -and $hb.supervisor.started_at) { try { $hbAfter = ([datetime]$hb.supervisor.started_at) -gt $RestartAt } catch { $hbAfter = $false } }
  return [ordered]@{
    taken_at = (Get-Date).ToString("o")
    scm_state = Get-ScmState
    host_state = if ($hs) { [string]$hs.state } else { $null }
    host_updated_after_restart = $hostAfter
    heartbeat_after_restart = $hbAfter
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
    heartbeat_database_write = if ($hb) { [bool]$hb.effects.database_write } else { $null }
    checkpoint_advanced = ($ckTicks -gt $CheckpointTicksBefore)
    consumer_state = if ($cs) { [string]$cs.state } else { $null }
    health_verdict = if ($health.json) { [string]$health.json.verdict } else { "UNKNOWN" }
    health_reasons = if ($health.json) { @($health.json.reasons) } else { @("HEALTH_CLI_FAILED") }
    sql_session_after_restart = if ($Light) { "NOT_EVALUATED" } elseif ($SqlSessionCheck) { Get-SqlSessionAfter $RestartAt } else { "NOT_REQUESTED" }
    new_event_privacy = if ($Light) { "NOT_EVALUATED" } else { Get-NewEventPrivacy $Layout $RestartAt }
  }
}

function Assert-Admin {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "ADMINISTRATOR_REQUIRED" }
}

# ================================================================ principal ==
function Invoke-Main {
  if ([string]::IsNullOrWhiteSpace($RepoRuntimeDir)) { $script:RepoRuntimeDir = $PSScriptRoot }
  if ([string]::IsNullOrWhiteSpace($SupervisorSourcePath)) { $script:SupervisorSourcePath = Join-Path $RepoRuntimeDir "tata_reader_supervisor_v1.ps1" }
  $L = Get-Layout $InstallRoot
  $audit = Join-Path $RepoRuntimeDir "tata_reader_watch_static_audit_v1.cjs"
  $healthCli = Join-Path $RepoRuntimeDir "tata_reader_health_v1.cjs"
  $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
  $receipt = [ordered]@{
    schema = $CutoverSchema
    mode = $Mode
    started_at = (Get-Date).ToString("o")
    machine_clock_note = "horarios no relogio local desta maquina; nao comparar com outro relogio"
    service = $ServiceName
    checks = [ordered]@{}
    files = [ordered]@{}
    decision = $null
    effects = [ordered]@{ database_write = $false; permission_change = $false; print = $false; spooler_write = $false; odhen_write = $false; fiscal_action = $false; sefaz_call = $false; network_call = $false; service_restart = $false; file_install = $false; rollback = $false }
    privacy = [ordered]@{ customer_pii = $false; order_identifiers = $false; raw_error_text = $false }
  }

  # ---------------------------------------------------------- preflight --
  $info = Get-ServiceInfo
  $receipt.checks.service = $info
  $receipt.checks.service_identity_ok = ($info.start_name -eq "NT SERVICE\TataComandaReader")
  $receipt.files.installed_watcher_sha256 = Get-Sha $L.host_fixed_watcher
  $receipt.files.candidate_sha256 = Get-Sha $CandidateWatcherPath
  $receipt.files.candidate_expected_sha256 = $CandidateWatcherSha256.ToUpperInvariant()
  $receipt.files.supervisor_sha256 = Get-Sha $SupervisorSourcePath
  $receipt.files.checkpoint_sha256 = Get-Sha $L.checkpoint
  $ck = Read-JsonOrNull $L.checkpoint
  $receipt.checks.checkpoint_schema = if ($ck) { [string]$ck.schema } else { $null }
  $receipt.checks.node_present = (Test-Path -LiteralPath $NodeExe -PathType Leaf)
  $receipt.checks.candidate_sha_ok = ($receipt.files.candidate_sha256 -eq $receipt.files.candidate_expected_sha256)
  $receipt.checks.supervisor_sha_ok = ([string]::IsNullOrWhiteSpace($SupervisorSha256) -or $receipt.files.supervisor_sha256 -eq $SupervisorSha256.ToUpperInvariant())
  $receipt.checks.installed_sha_confirmed = (-not [string]::IsNullOrWhiteSpace($ExpectedInstalledWatcherSha256) -and $receipt.files.installed_watcher_sha256 -eq $ExpectedInstalledWatcherSha256.ToUpperInvariant())
  if ($receipt.checks.node_present -and $receipt.files.candidate_sha256) {
    $a = Invoke-NodeJson $audit @($CandidateWatcherPath)
    $receipt.checks.candidate_audit = if ($a.json) { [ordered]@{ recommendation = [string]$a.json.recommendation; findings = @($a.json.findings | ForEach-Object { [string]$_.code }) } } else { $null }
    $receipt.checks.candidate_audit_allows_supervisor = Test-AuditAllowsSupervisor $a.json
    $candText = [IO.File]::ReadAllText($CandidateWatcherPath)
    $receipt.checks.candidate_checkpoint = Test-CheckpointCompatible $candText $receipt.checks.checkpoint_schema
  }
  $before = Get-Snapshot $L (Get-Date).AddYears(-10) ([long]0) $receipt.files.supervisor_sha256 $receipt.files.candidate_expected_sha256 $healthCli -Light
  $receipt.checks.health_before = [ordered]@{ verdict = $before.health_verdict; reasons = $before.health_reasons; scm = $before.scm_state; host = $before.host_state }

  $preflightOk = $receipt.checks.service_identity_ok -and $receipt.checks.node_present -and $receipt.checks.candidate_sha_ok -and
    $receipt.checks.supervisor_sha_ok -and $receipt.checks.candidate_audit_allows_supervisor -and
    ($receipt.checks.candidate_checkpoint -eq "COMPATIBLE" -or $receipt.checks.candidate_checkpoint -eq "NO_CHECKPOINT_YET")
  $receipt.checks.preflight_ok = [bool]$preflightOk

  if ($Mode -eq "Plan") {
    $receipt.decision = if ($preflightOk) { "PLAN_OK_APPLY_REQUIRES_-ExpectedInstalledWatcherSha256 " + $receipt.files.installed_watcher_sha256 } else { "PLAN_BLOCKED" }
    $receipt.plan = @(
      "backup: watcher instalado, checkpoint, config, status do host -> " + $L.backups + "\<carimbo>",
      "instalar: candidato -> " + $L.candidate_target + " (SHA conferido apos copia)",
      "instalar: config do supervisor -> " + $L.supervisor_config,
      "instalar: supervisor -> " + $L.host_fixed_watcher + " (caminho fixo do host; SHA conferido)",
      "Restart-Service " + $ServiceName,
      "gates ate " + $HealthWaitSeconds + " s: SCM, host, heartbeat novo, SHAs, >= " + $MinOkBatches + " lotes OK, checkpoint andando, saude HEALTHY, sem efeito proibido",
      "falhou -> parar, restaurar watcher+checkpoint, iniciar, provar checkpoint andando"
    )
    return $receipt
  }

  Assert-Admin

  if ($Mode -eq "Apply") {
    if (-not $preflightOk) { $receipt.decision = "ABORTED_PREFLIGHT"; return $receipt }
    if (-not $receipt.checks.installed_sha_confirmed) { $receipt.decision = "ABORTED_INSTALLED_SHA_NOT_CONFIRMED"; return $receipt }

    # ------------------------------------------------------------- backup --
    $bk = Join-Path $L.backups $stamp
    New-Item -ItemType Directory -Force -Path $bk | Out-Null
    $manifest = [ordered]@{ created_at = (Get-Date).ToString("o"); items = @() }
    foreach ($pair in @(@($L.host_fixed_watcher, "installed_watcher.ps1"), @($L.checkpoint, "checkpoint.json"), @($L.supervisor_config, "supervisor_config.json"), @($L.host_status, "host_status.json"))) {
      if (Test-Path -LiteralPath $pair[0] -PathType Leaf) {
        $dst = Join-Path $bk $pair[1]
        Copy-Item -LiteralPath $pair[0] -Destination $dst -Force
        $manifest.items += [ordered]@{ original = $pair[0]; backup = $pair[1]; sha256 = Get-Sha $dst }
      }
    }
    if ((Get-Sha (Join-Path $bk "installed_watcher.ps1")) -ne $receipt.files.installed_watcher_sha256) { throw "BACKUP_WATCHER_SHA_MISMATCH" }
    Write-Json (Join-Path $bk "manifest.json") $manifest
    $receipt.backup_dir = $bk

    # ------------------------------------------------------------ instalar --
    $ckTicksBefore = [long]0
    if (Test-Path -LiteralPath $L.checkpoint -PathType Leaf) { $ckTicksBefore = (Get-Item -LiteralPath $L.checkpoint).LastWriteTimeUtc.Ticks }
    [void](Copy-Verified $CandidateWatcherPath $L.candidate_target $receipt.files.candidate_expected_sha256)
    Write-Json $L.supervisor_config (New-SupervisorConfig $L $receipt.files.candidate_expected_sha256 $PowerShellExe $BatchPolls)
    [void](Copy-Verified $SupervisorSourcePath $L.host_fixed_watcher $receipt.files.supervisor_sha256)
    $receipt.effects.file_install = $true

    # ------------------------------------------------- restart controlado --
    $restartAt = Get-Date
    Restart-Service -Name $ServiceName -Force
    $receipt.effects.service_restart = $true
    $receipt.restart_at = $restartAt.ToString("o")

    $deadline = $restartAt.AddSeconds($HealthWaitSeconds)
    $last = $null
    $gate = $null
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 10
      $last = Get-Snapshot $L $restartAt $ckTicksBefore $receipt.files.supervisor_sha256 $receipt.files.candidate_expected_sha256 $healthCli
      $gate = Test-CutoverGate $last
      if ($gate.pass) { break }
    }
    $receipt.after = $last
    $receipt.gate = $gate
    if ($null -ne $gate -and $gate.pass) {
      $receipt.decision = "APPLIED_HEALTHY"
      $receipt.finished_at = (Get-Date).ToString("o")
      Write-Json (Join-Path $bk "receipt.json") $receipt
      return $receipt
    }
    $receipt.decision = "GATE_FAILED_ROLLING_BACK"
    $script:BackupDir = $bk
  }

  # ------------------------------------------------------------- rollback --
  if ([string]::IsNullOrWhiteSpace($BackupDir) -or -not (Test-Path -LiteralPath (Join-Path $BackupDir "manifest.json"))) { throw "ROLLBACK_BACKUP_DIR_REQUIRED" }
  $man = Read-JsonOrNull (Join-Path $BackupDir "manifest.json")
  $receipt.effects.rollback = $true
  Stop-Service -Name $ServiceName -Force
  if (-not (Wait-Scm "Stopped" 60)) { $receipt.decision = "ROLLBACK_STOP_FAILED_HUMAN_REQUIRED"; Write-Json (Join-Path $BackupDir "receipt-rollback.json") $receipt; return $receipt }
  foreach ($it in @($man.items)) {
    if ($it.backup -eq "host_status.json") { continue }
    $src = Join-Path $BackupDir $it.backup
    if ((Get-Sha $src) -ne [string]$it.sha256) { throw ("ROLLBACK_BACKUP_CORRUPT:" + $it.backup) }
    [void](Copy-Verified $src ([string]$it.original) ([string]$it.sha256))
  }
  if (-not (@($man.items | Where-Object { $_.backup -eq "supervisor_config.json" }).Count)) {
    if (Test-Path -LiteralPath $L.supervisor_config) { Move-Item -LiteralPath $L.supervisor_config -Destination (Join-Path $BackupDir "supervisor_config.rolled_back.json") -Force }
  }
  $rbAt = Get-Date
  $ckTicksRb = [long]0
  if (Test-Path -LiteralPath $L.checkpoint -PathType Leaf) { $ckTicksRb = (Get-Item -LiteralPath $L.checkpoint).LastWriteTimeUtc.Ticks }
  Start-Service -Name $ServiceName
  $running = Wait-Scm "Running" 60
  $advanced = $false
  $rbDeadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $rbDeadline) {
    Start-Sleep -Seconds 5
    if ((Test-Path -LiteralPath $L.checkpoint) -and (Get-Item -LiteralPath $L.checkpoint).LastWriteTimeUtc.Ticks -gt $ckTicksRb) { $advanced = $true; break }
  }
  $receipt.rollback = [ordered]@{
    at = $rbAt.ToString("o")
    scm_running = $running
    checkpoint_advanced_after_rollback = $advanced
    restored_watcher_sha256 = Get-Sha $L.host_fixed_watcher
  }
  $receipt.decision = if ($running -and $advanced) { $receipt.decision + "_ROLLBACK_PROVEN" } else { $receipt.decision + "_ROLLBACK_UNPROVEN_HUMAN_REQUIRED" }
  $receipt.finished_at = (Get-Date).ToString("o")
  Write-Json (Join-Path $BackupDir "receipt-rollback.json") $receipt
  return $receipt
}

if ($MyInvocation.InvocationName -ne ".") {
  $r = Invoke-Main
  $r | ConvertTo-Json -Depth 12
  switch -Wildcard ($r.decision) {
    "PLAN_OK*" { exit 0 }
    "APPLIED_HEALTHY" { exit 0 }
    "*_ROLLBACK_PROVEN" { exit 3 }
    default { exit 2 }
  }
}

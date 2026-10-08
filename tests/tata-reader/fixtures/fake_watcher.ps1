param(
  [int]$MaxPolls = 0,
  [int]$PollSeconds = 1,
  [int]$StablePolls = 2,
  [int]$TopOrders = 50,
  [string]$CheckpointPath,
  [string]$EventDir
)
# Watcher FALSO, so para testar o supervisor sem SQL Server. Aceita a mesma
# linha de comando do watcher real. O comportamento de cada invocacao vem de
# fake-behavior.json, ao lado do checkpoint: uma lista consumida em ordem
# (a ultima entrada se repete).
$ErrorActionPreference = "Stop"
$dir = [IO.Path]::GetDirectoryName($CheckpointPath)
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$plan = Get-Content -LiteralPath (Join-Path $dir "fake-behavior.json") -Raw | ConvertFrom-Json
$counterPath = Join-Path $dir "fake-invocations.txt"
$n = 0
if (Test-Path -LiteralPath $counterPath) { $n = [int](Get-Content -LiteralPath $counterPath -Raw) }
[IO.File]::WriteAllText($counterPath, [string]($n + 1))
$list = @($plan.invocations)
$behavior = [string]$list[[Math]::Min($n, $list.Count - 1)]

function Touch-Checkpoint { [IO.File]::WriteAllText($CheckpointPath, '{"schema":"fake","t":"' + (Get-Date).ToString("o") + '"}') }
function Print-Run([int]$Polls, [int]$Errors, [bool]$DbWrite) {
  [ordered]@{
    schema = "deliveryos.tata-reader-continuous-watch-run.v1"
    mode = "BOUNDED_PROOF"
    polls = $Polls
    poll_errors = $Errors
    snapshots_observed = $Polls * 10
    events_emitted = 1
    duplicates_suppressed = 2
    changed_snapshots = 0
    baseline_suppressed = 0
    effects = [ordered]@{
      database_read = $true; database_write = $DbWrite; local_checkpoint_write = $true; local_event_write = $true
      network_call = $false; odhen_write = $false; print = $false; spooler_write = $false
      fiscal_action = $false; sefaz_call = $false; cutover = $false
    }
    status = "COMPLETED"
  } | ConvertTo-Json -Depth 5
}

switch ($behavior) {
  "ok" {
    for ($i = 1; $i -le $MaxPolls; $i++) { Touch-Checkpoint; if ($i -lt $MaxPolls) { Start-Sleep -Milliseconds 200 } }
    Print-Run $MaxPolls 0 $false
    exit 0
  }
  "fail_lock" {
    Touch-Checkpoint
    [Console]::Error.WriteLine('Exception calling "Read" with "0" argument(s): "Lock request time out period exceeded." order 0000348932 cliente Fulano')
    exit 1
  }
  "hang" { Start-Sleep -Seconds 3600; exit 0 }
  "progress_forever" { while ($true) { Touch-Checkpoint; Start-Sleep -Milliseconds 300 } }
  "effect_violation" { Touch-Checkpoint; Print-Run $MaxPolls 0 $true; exit 0 }
  "garbage" { Touch-Checkpoint; "nao e json"; exit 0 }
  "poll_errors" { Touch-Checkpoint; Print-Run $MaxPolls 1 $false; exit 0 }
  "short" { Touch-Checkpoint; Print-Run ($MaxPolls - 1) 0 $false; exit 0 }
  "ok_trailing_warning" {
    for ($i = 1; $i -le $MaxPolls; $i++) { Touch-Checkpoint }
    Print-Run $MaxPolls 0 $false
    "WARNING: linha depois do JSON (aviso do host)"
    exit 0
  }
  "flap_checkpoint" {
    # O checkpoint some e volta sem parar, como no File.Replace do watcher real
    # (duas renomeacoes no NTFS: ha um instante em que o caminho nao existe).
    $fim = (Get-Date).AddSeconds([int]$plan.flap_seconds)
    while ((Get-Date) -lt $fim) {
      if (Test-Path -LiteralPath $CheckpointPath) { [IO.File]::Delete($CheckpointPath) }
      Start-Sleep -Milliseconds 1
      [IO.File]::WriteAllText($CheckpointPath, "{}")
    }
    Print-Run $MaxPolls 0 $false
    exit 0
  }
  "ok_no_effects" {
    for ($i = 1; $i -le $MaxPolls; $i++) { Touch-Checkpoint }
    [ordered]@{
      schema = "deliveryos.tata-reader-continuous-watch-run.v1"; mode = "BOUNDED_PROOF"
      polls = $MaxPolls; poll_errors = 0; snapshots_observed = 1; events_emitted = 0
      duplicates_suppressed = 0; changed_snapshots = 0; baseline_suppressed = 0; status = "COMPLETED"
    } | ConvertTo-Json -Depth 5
    exit 0
  }
  default { throw ("FAKE_BEHAVIOR_UNKNOWN:" + $behavior) }
}

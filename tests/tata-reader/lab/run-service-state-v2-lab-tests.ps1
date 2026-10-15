# Teste de LABORATORIO com dados sinteticos, sem operacao real nem atualizacao de turnos.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$writer = Join-Path $PSScriptRoot "write-service-state-v2-fixture.ps1"
$passed = 0
function Check([bool]$condition,[string]$name) {
  if (-not $condition) { throw ("G1_LAB_ASSERT_FAILED:" + $name) }
  $script:passed++
  Write-Output ("ok G1-" + $script:passed + " " + $name)
}
function Expect-Refusal([hashtable]$par,[string]$code) {
  $failed = $false
  try {
    & $writer @par | Out-Null
  } catch {
    if (-not $_.Exception.Message.Contains($code)) { throw }
    $failed = $true
  }
  Check $failed ("recusa " + $code)
}
function Parse-Time([string]$t) {
  return [DateTime]::ParseExact($t,"yyyy-MM-ddTHH:mm:ss",[Globalization.CultureInfo]::InvariantCulture)
}
# Representacao independente das verificacoes temporais do watcher v2 observado.
# Nao substitui teste do binario instalado ou autorizacao de turno real.
function Watcher-Window($s,[string]$opened) {
  try {
    $from = Parse-Time $s.valid_from_local
    $until = Parse-Time $s.valid_until_local
    $order = Parse-Time $opened
    return $s.schema -ceq "deliveryos.production-service-shift-state.v2" -and
      $s.store_id -ceq "0001" -and
      $s.service -cin @("LUNCH","DINNER") -and
      $s.evidence -cin @("HUMAN_CONFIRMED_RULE","REAL_OBSERVED") -and
      $s.source_ref -ne "" -and
      $s.clock_inference_used -eq $false -and
      $from -lt $until -and
      $from.ToString("yyyy-MM-dd") -ceq $s.operational_date -and
      $until.ToString("yyyy-MM-dd") -ceq $s.operational_date -and
      $order.ToString("yyyy-MM-dd") -ceq $s.operational_date -and
      $order -ge $from -and $order -lt $until
  } catch { return $false }
}
$root = Join-Path ([IO.Path]::GetTempPath()) ("deliveryos_g1_lab_" + [guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($root) | Out-Null
[IO.File]::WriteAllText((Join-Path $root ".deliveryos-g1-lab"),
  "DELIVERYOS_G1_LAB_V2_ONLY", (New-Object Text.UTF8Encoding($false)))
$base = @{
  LabRoot=$root; Service="LUNCH"; OperationalDate="2026-10-15"
  ValidFromLocal="2026-10-15T11:00:00"; ValidUntilLocal="2026-10-15T15:00:00"
  SourceRef="LAB_SYNTHETIC:operator-fixture"
}
try {
  $v1 = [pscustomobject]@{
    schema="deliveryos.production-service-shift-state.v2"
    store_id="0001";operational_date="2026-10-15";service="LUNCH"
    evidence="HUMAN_CONFIRMED_RULE";source_ref="LAB_SYNTHETIC:old-writer"
    clock_inference_used=$false;valid_until_local="2026-10-15T15:00:00"
  }
  Check (-not (Watcher-Window $v1 "2026-10-15T12:00:00")) "gravador v1 sem valid_from_local recusado"
  $noMarker = Join-Path ([IO.Path]::GetTempPath()) ("deliveryos_g1_lab_" + [guid]::NewGuid().ToString("N"))
  [IO.Directory]::CreateDirectory($noMarker) | Out-Null
  try {
    $p=$base.Clone();$p.LabRoot=$noMarker
    Expect-Refusal $p "LAB_MARKER_MISSING_OR_INVALID"
  } finally { [IO.Directory]::Delete($noMarker,$true) }
  $p=$base.Clone();$p.LabRoot=Join-Path ([IO.Path]::GetTempPath()) ("not_a_lab_" + [guid]::NewGuid().ToString("N"))
  Expect-Refusal $p "LAB_ROOT_MUST_BE_DIRECT_TEMP_CHILD"
  foreach ($row in @(
    @("2026-10-15","2026-10-15Tbad","2026-10-15T15:00:00","LAB_SYNTHETIC:operator-fixture","VALID_FROM_FORMAT_INVALID"),
    @("2026-10-15","2026-10-15T11:00:00","n/a","LAB_SYNTHETIC:operator-fixture","VALID_UNTIL_FORMAT_INVALID"),
    @("2026-10-15","2026-10-15T15:00:00","2026-10-15T15:00:00","LAB_SYNTHETIC:operator-fixture","SERVICE_WINDOW_EMPTY_OR_REVERSED"),
    @("2026-10-15","2026-10-15T22:00:00","2026-10-15T17:00:00","LAB_SYNTHETIC:operator-fixture","SERVICE_WINDOW_EMPTY_OR_REVERSED"),
    @("2026-10-15","2026-10-14T11:00:00","2026-10-15T15:00:00","LAB_SYNTHETIC:operator-fixture","SERVICE_WINDOW_DATE_MISMATCH"),
    @("2026-10-15","2026-10-15T22:00:00","2026-10-16T01:00:00","LAB_SYNTHETIC:operator-fixture","SERVICE_WINDOW_DATE_MISMATCH"),
    @("2026-10-14","2026-10-15T11:00:00","2026-10-15T15:00:00","LAB_SYNTHETIC:operator-fixture","SERVICE_WINDOW_DATE_MISMATCH"),
    @("2026-10-15","2026-10-15T11:00:00","2026-10-15T15:00:00","live-operator","LAB_SYNTHETIC_SOURCE_REQUIRED")
  )) {
    $p=$base.Clone();$p.OperationalDate=$row[0];$p.ValidFromLocal=$row[1]
    $p.ValidUntilLocal=$row[2];$p.SourceRef=$row[3]
    Expect-Refusal $p $row[4]
  }
  Check (-not (Test-Path -LiteralPath (Join-Path $root "state\production-service-state.json"))) "negativos nao publicaram estado"
  Check (-not (Test-Path -LiteralPath (Join-Path $root "production-service-history.jsonl"))) "negativos nao criaram historico"
  $out=& $writer @base
  Check ([string]$out -match '^LAB_V2_COMMITTED') "almoço sintetico gravado"
  $stateFile=Join-Path $root "state\production-service-state.json"
  $histFile=Join-Path $root "production-service-history.jsonl"
  $lunch=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
  Check ($lunch.lab_only -eq $true -and $lunch.store_id -ceq "0001") "marcacao lab e unidade fixadas"
  Check (Watcher-Window $lunch "2026-10-15T11:00:00") "limite inicial incluso"
  Check (Watcher-Window $lunch "2026-10-15T14:59:59") "dentro do almoço"
  Check (-not (Watcher-Window $lunch "2026-10-15T15:00:00")) "limite final exclusivo"
  Check (-not (Watcher-Window $lunch "2026-10-14T12:00:00")) "data anterior nao validada"
  $p=$base.Clone();$p.Service="DINNER";$p.ValidFromLocal="2026-10-15T17:00:00";$p.ValidUntilLocal="2026-10-15T22:00:00"
  & $writer @p | Out-Null
  $dinner=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $history=@(Get-Content -LiteralPath $histFile -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json })
  Check ($history.Count -eq 4) "duas transacoes journaling PREPARED e COMMITTED"
  Check ($history[0].phase -ceq "PREPARED" -and $history[1].phase -ceq "COMMITTED" -and
         $history[2].phase -ceq "PREPARED" -and $history[3].phase -ceq "COMMITTED") "ordem de fases auditavel"
  Check ($history[2].previous_revision_id -ceq $lunch.revision_id -and
         $history[3].revision_id -ceq $dinner.revision_id) "ligacao de revisoes"
  Check (Watcher-Window $dinner "2026-10-15T20:00:00") "jantar agora valido"
  Check (-not (Watcher-Window $dinner "2026-10-15T12:00:00")) "estado corrente jantar nao requalifica almoço antigo"
  Check ($dinner.source_ref -ceq "LAB_SYNTHETIC:operator-fixture") "procedencia jamais se torna operacional"
  $p=$base.Clone();$p.ValidFromLocal="2026-10-15T19:00:00";$p.ValidUntilLocal="2026-10-15T19:00:00"
  Expect-Refusal $p "SERVICE_WINDOW_EMPTY_OR_REVERSED"
  Check ((Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8|ConvertFrom-Json).revision_id -ceq $dinner.revision_id) "falha de validacao conserva estado anterior"
  Check (@(Get-Content -LiteralPath $histFile).Count -eq 4) "falha de validacao conserva journal"
  $broken=Join-Path ([IO.Path]::GetTempPath()) ("deliveryos_g1_lab_" + [guid]::NewGuid().ToString("N"))
  [IO.Directory]::CreateDirectory($broken) | Out-Null
  [IO.File]::WriteAllText((Join-Path $broken ".deliveryos-g1-lab"),"DELIVERYOS_G1_LAB_V2_ONLY")
  try {
    $p=$base.Clone();$p.LabRoot=$broken;$p.FailurePoint="AfterPrepared"
    Expect-Refusal $p "INJECTED_AFTER_PREPARED"
    Check (-not (Test-Path -LiteralPath (Join-Path $broken "state\production-service-state.json"))) "falha injetada nao publica estado"
    $p=$base.Clone();$p.LabRoot=$broken
    Expect-Refusal $p "JOURNAL_PENDING_AUDIT_REQUIRED"
    Check (@(Get-Content -LiteralPath (Join-Path $broken "production-service-history.jsonl")).Count -eq 1) "intencao pendente preservada para auditoria"
  } finally { [IO.Directory]::Delete($broken,$true) }
  Write-Output ("G1_SERVICE_STATE_V2_OFFLINE_LAB: " + $passed + "/" + $passed + " PASS")
} finally {
  if (Test-Path -LiteralPath $root -PathType Container) {
    [IO.Directory]::Delete($root,$true)
  }
}

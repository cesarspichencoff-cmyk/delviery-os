# REVIEW ONLY - NOT APPROVED FOR INSTALLATION / SERVICE RESTART.
# Based on actual V2 source READ-ONLY from CAIXA_MOOCA on 2026-11-04.
# It is a candidate replacement for the EXISTING watcher, not another watcher.
# Old checkpoints intentionally FAIL CLOSED until a separate authorized,
# verified migration ensures no duplicate re-emission of historical orders.
# Zero SQL/prints/services executed while preparing this GitHub candidate.
param(
  [int]$MaxPolls = 0,
  [int]$PollSeconds = 3,
  [int]$StablePolls = 2,
  [int]$TopOrders = 50,
  [string]$CheckpointPath = "C:\ProgramData\TataComandaReader\state\reader-watch-checkpoint-v1.json",
  [string]$EventDir = "C:\ProgramData\TataComandaReader\state\reader-events-v1",
  [switch]$EmitExistingOnBootstrap
)

if ($env:COMPUTERNAME -eq 'CAIXA_MOOCA') { throw 'REVIEW_ONLY_CANDIDATE_CANNOT_RUN_ON_CASHIER' }

$ErrorActionPreference = "Stop"
$ExpectedLogin = "NT SERVICE\TataComandaReader"
$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"
$ServiceStatePath = "C:\ProgramData\TataComandaReader\state\production-service-state.json"

# The Node/PowerShell canonical serializer has been exercised independently
# in PR #135 (64/64 offline checks). It must travel as a signed, pinned member
# of this ONE Reader installation; this is NOT a second observer.
$CanonicalSerializerPath = Join-Path $PSScriptRoot 'comandas_reader_canonical_json_v1_REVIEW_ONLY.ps1'
if (-not (Test-Path -LiteralPath $CanonicalSerializerPath -PathType Leaf)) {
  throw "CANONICAL_SERIALIZER_NOT_INSTALLED"
}
. $CanonicalSerializerPath

function Write-AtomicJson([string]$Path, $Object) {
  $dir = [IO.Path]::GetDirectoryName($Path)
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $tmp = $Path + ".tmp." + $PID + "." + [Guid]::NewGuid().ToString("N")
  $bak = $Path + ".bak"
  $json = $Object | ConvertTo-Json -Depth 20
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)
  $fs = [IO.File]::Open($tmp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $fs.Write($bytes,0,$bytes.Length); $fs.Flush($true) } finally { $fs.Dispose() }
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
    [IO.File]::Replace($tmp,$Path,$bak,$true)
    if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
  } else {
    [IO.File]::Move($tmp,$Path)
  }
}

# Strict content validation for an already-present event in the REVIEW ONLY
# candidate. It never creates or repairs a file and is not source attestation.
# The fast path where checkpoint.emitted_hash already equals the current hash
# remains an INDEPENDENT unproven boundary (not solved by this function).
function Assert-TataPersistedEventContentReview {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)]$ExpectedEvent
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw 'EXISTING_EVENT_FILE_MISSING'
  }
  $before=Get-Item -LiteralPath $Path -Force
  if (($before.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      $before.Length -lt 2 -or $before.Length -gt 4194304) {
    throw 'EXISTING_EVENT_FILE_UNSAFE_METADATA'
  }
  try {
    [byte[]]$bytes=[IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ne $before.Length -or
        ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and
         $bytes[1] -eq 187 -and $bytes[2] -eq 191)) {
      throw 'EXISTING_EVENT_FILE_BYTES_INVALID'
    }
    $utf8=New-Object Text.UTF8Encoding($false,$true)
    $raw=$utf8.GetString($bytes)
    $stored=$raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw 'EXISTING_EVENT_FILE_UNREADABLE'
  }
  if ($null -eq $stored -or
      $stored.schema -cne 'deliveryos.tata-reader-stable-order-event.v1' -or
      $stored.order_key -cne [string]$ExpectedEvent.order_key -or
      $stored.snapshot_hash -cne [string]$ExpectedEvent.snapshot_hash -or
      $null -eq $stored.order -or $null -eq $stored.observed_at) {
    throw 'EXISTING_EVENT_FILE_IDENTITY_MISMATCH'
  }
  # ConvertFrom-Json in PS 5.1/7 can coerce native date-like strings into
  # DateTime, erasing meaningful BYTE differences in DTHRABERMESA (which is
  # part of the hashed source basis). Never compare two converted dates here.
  # The producer writes ConvertTo-Json -Depth 20, UTF-8 without BOM. Require
  # that exact serializer envelope, including notes, dates, items, effects,
  # field order and whitespace; exempt ONLY the historical observed_at text.
  # This check is fail-closed on cross-version serializer differences.
  $obsPattern='"observed_at"\s*:\s*"(?<stamp>[^"\\]*)"'
  $observations=[regex]::Matches($raw,$obsPattern)
  if ($observations.Count -ne 1) { throw 'EXISTING_EVENT_OBSERVED_AT_INVALID' }
  $timestamp=$observations[0].Groups['stamp'].Value
  $stampPattern = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,7})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  if ($timestamp -cnotmatch $stampPattern) { throw 'EXISTING_EVENT_OBSERVED_AT_INVALID' }
  if ($ExpectedEvent -isnot [System.Collections.IDictionary] -or
      -not $ExpectedEvent.Contains('observed_at')) {
    throw 'EXISTING_EVENT_EXPECTED_ENVELOPE_INVALID'
  }
  $comparison=[ordered]@{}
  foreach ($name in @($ExpectedEvent.Keys)) {
    if ($name -ceq 'observed_at') { $comparison[$name]=$timestamp }
    else { $comparison[$name]=$ExpectedEvent[$name] }
  }
  try {
    $expectedRaw=$comparison | ConvertTo-Json -Depth 20 -ErrorAction Stop
  } catch { throw 'EXISTING_EVENT_FILE_COMPARISON_INVALID' }
  if ($expectedRaw -cne $raw) {
    throw 'EXISTING_EVENT_FILE_CONTENT_MISMATCH'
  }
  $after=Get-Item -LiteralPath $Path -Force
  if (($after.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      $after.Length -ne $before.Length -or
      $after.LastWriteTimeUtc.Ticks -ne $before.LastWriteTimeUtc.Ticks) {
    throw 'EXISTING_EVENT_FILE_CHANGED_DURING_READ'
  }
  return $true
}

function Load-Checkpoint {
  if (-not (Test-Path -LiteralPath $CheckpointPath -PathType Leaf)) {
    return @{
      schema = "deliveryos.tata-reader-continuous-checkpoint.v1"
      hash_contract_version = "NODE_CANONICAL_JSON_SHA256_V1"
      # Structural origin marker; NOT independent migration attestation.
      checkpoint_origin = "FRESH_NODE_CANONICAL_V2"
      checkpoint_generation = [Guid]::NewGuid().ToString("N")
      bootstrap_complete = $false
      seen = @{}
    }
  }
  $raw = Get-Content -LiteralPath $CheckpointPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($raw.schema -ne "deliveryos.tata-reader-continuous-checkpoint.v1") { throw "CHECKPOINT_SCHEMA_MISMATCH" }
  # CRITICAL: historical SHA-256 uppercase -> canonical lowercase changes the
  # watcher identity. Fail BEFORE SQL, events or checkpoint writes. Explicit
  # supervised migration + complete backup/replay is a different release gate.
  if ($raw.hash_contract_version -cne "NODE_CANONICAL_JSON_SHA256_V1") { throw "CHECKPOINT_HASH_MIGRATION_REQUIRED" }
  # A marker-only edit must never pass for migration of old hashes.
  # Fresh-origin fields are structural and do not attest legacy migration.
  if ($raw.checkpoint_origin -cne "FRESH_NODE_CANONICAL_V2") { throw "CHECKPOINT_ORIGIN_NOT_VERIFIED" }
  if ([string]$raw.checkpoint_generation -cnotmatch '^[0-9a-f]{32}$') { throw "CHECKPOINT_GENERATION_ID_INVALID" }
  $seen = @{}
  if (@($raw.entries).Count -gt 250) { throw "CHECKPOINT_ENTRY_COUNT_EXCEEDED" }
  foreach ($entry in @($raw.entries)) {
    $key = [string]$entry.order_key
    if ([string]::IsNullOrWhiteSpace($key)) { throw "CHECKPOINT_ORDER_KEY_INVALID" }
    if ($seen.ContainsKey($key)) { throw "CHECKPOINT_DUPLICATE_ORDER_KEY" }
    if ([string]$entry.snapshot_hash -cnotmatch '^[0-9a-f]{64}$') { throw "CHECKPOINT_SNAPSHOT_HASH_NOT_CANONICAL" }
    if ($null -ne $entry.emitted_hash -and [string]$entry.emitted_hash -cnotmatch '^[0-9a-f]{64}$') {
      throw "CHECKPOINT_EMITTED_HASH_NOT_CANONICAL"
    }
    $seen[$key] = $entry
  }
  return @{ schema=$raw.schema; hash_contract_version=[string]$raw.hash_contract_version;
    checkpoint_origin=[string]$raw.checkpoint_origin; checkpoint_generation=[string]$raw.checkpoint_generation;
    bootstrap_complete=[bool]$raw.bootstrap_complete; seen=$seen }
}

function Save-Checkpoint($checkpoint) {
  $entries = @($checkpoint.seen.Values | Sort-Object { [string]$_.last_seen_order_time } -Descending | Select-Object -First 250)
  $out = [ordered]@{
    schema = "deliveryos.tata-reader-continuous-checkpoint.v1"
    hash_contract_version = "NODE_CANONICAL_JSON_SHA256_V1"
    checkpoint_origin = [string]$checkpoint.checkpoint_origin
    checkpoint_generation = [string]$checkpoint.checkpoint_generation
    bootstrap_complete = [bool]$checkpoint.bootstrap_complete
    entries = $entries
  }
  Write-AtomicJson $CheckpointPath $out
}

# Embedded into the installed watcher; no clock-based shift renewal or SQL effects.
function Read-ServiceState([datetime]$OrderOpenedAt) {
  $denied = [ordered]@{service=$null;evidence='UNKNOWN';source_ref=$null;blockers=@('SERVICE_WEEKLY_POLICY_INVALID')}
  try {
    $installRoot = [IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($ServiceStatePath))
    $policyPath = Join-Path $installRoot 'bin\production-service-weekly-policy.json'
    if (-not (Test-Path -LiteralPath $policyPath -PathType Leaf)) {
      $denied.blockers=@('SERVICE_WEEKLY_POLICY_MISSING');return $denied
    }
    $info=Get-Item -LiteralPath $policyPath
    if ($info.Length -gt 65536 -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)) {return $denied}
    $p=Get-Content -LiteralPath $policyPath -Raw -Encoding UTF8|ConvertFrom-Json
    if ($p.schema -cne 'deliveryos.production-service-weekly-policy.v1' -or
        $p.enabled -isnot [bool] -or -not $p.enabled -or
        $p.clock_inference_used -isnot [bool] -or $p.clock_inference_used -or
        $p.unit_id -cne 'ITAIM' -or $p.source_unit_id -cne '0001' -or $p.source_store_id -cne '01' -or
        $p.host_name -cne $env:COMPUTERNAME -or $p.timezone -cne 'America/Sao_Paulo' -or
        $p.order_time_basis -cne 'NATIVE_DTHRABERMESA_LOCAL' -or
        $p.boundary -cne 'START_INCLUSIVE_END_EXCLUSIVE' -or
        $p.evidence -cne 'HUMAN_CONFIRMED_RULE' -or
        [string]::IsNullOrWhiteSpace([string]$p.source_ref) -or
        [string]::IsNullOrWhiteSpace([string]$p.policy_version) -or @($p.week).Count -ne 7) {return $denied}
    $from=[datetime]::MinValue
    if (-not [datetime]::TryParseExact([string]$p.effective_from,'yyyy-MM-dd',
        [Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$from)) {return $denied}
    if ($null -ne $p.effective_until) {return $denied}
    # Native SQL wall time is compared without converting it with the consumer's clock/zone.
    if ($OrderOpenedAt.Kind -ne [DateTimeKind]::Unspecified) {
      $denied.blockers=@('SERVICE_NATIVE_LOCAL_TIME_REQUIRED');return $denied
    }
    if ($OrderOpenedAt.Date -lt $from.Date) {
      $denied.blockers=@('SERVICE_WEEKLY_POLICY_NOT_EFFECTIVE');return $denied
    }
    $seen=@{};$selected=$null
    foreach ($day in @($p.week)) {
      if ($day.day_of_week -isnot [int] -or $day.day_of_week -lt 0 -or $day.day_of_week -gt 6 -or
          $seen.ContainsKey($day.day_of_week) -or @($day.windows).Count -ne 2) {return $denied}
      $seen[$day.day_of_week]=$true;$previousEnd=-1;$services=@{}
      foreach ($w in @($day.windows)) {
        if ($w.service -cnotin @('LUNCH','DINNER') -or $services.ContainsKey([string]$w.service) -or
            [string]$w.start -cnotmatch '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' -or
            [string]$w.end -cnotmatch '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$') {return $denied}
        $start=[timespan]::ParseExact([string]$w.start,'hh\:mm',[Globalization.CultureInfo]::InvariantCulture)
        $end=[timespan]::ParseExact([string]$w.end,'hh\:mm',[Globalization.CultureInfo]::InvariantCulture)
        if ($start -ge $end -or $start.TotalSeconds -lt $previousEnd) {return $denied}
        $previousEnd=$end.TotalSeconds;$services[[string]$w.service]=$true
        if ($day.day_of_week -eq [int]$OrderOpenedAt.DayOfWeek -and
            $OrderOpenedAt.TimeOfDay -ge $start -and $OrderOpenedAt.TimeOfDay -lt $end) {
          if ($null -ne $selected) {return $denied}
          $selected=[ordered]@{service=[string]$w.service;evidence=[string]$p.evidence;source_ref=[string]$p.source_ref;
            policy_version=[string]$p.policy_version;operational_date=$OrderOpenedAt.ToString('yyyy-MM-dd');
            valid_from_local=$OrderOpenedAt.Date.Add($start).ToString('yyyy-MM-ddTHH:mm:ss');
            valid_until_local=$OrderOpenedAt.Date.Add($end).ToString('yyyy-MM-ddTHH:mm:ss');
            clock_inference_used=$false;blockers=@()}
        }
      }
    }
    if ($null -ne $selected) {return $selected}
    $denied.blockers=@('SERVICE_HOURS_OUTSIDE_WINDOW');return $denied
  } catch {return $denied}
}


$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not [string]::Equals($identity,$ExpectedLogin,[StringComparison]::OrdinalIgnoreCase)) {
  throw ("UNEXPECTED_SERVICE_IDENTITY:" + $identity)
}
if ($StablePolls -lt 2) { throw "STABLE_POLLS_MUST_BE_AT_LEAST_2" }
if ($PollSeconds -lt 1) { throw "POLL_SECONDS_MUST_BE_AT_LEAST_1" }
if ($TopOrders -lt 1 -or $TopOrders -gt 100) { throw "TOP_ORDERS_OUT_OF_RANGE" }

New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($CheckpointPath)) | Out-Null
New-Item -ItemType Directory -Force -Path $EventDir | Out-Null

$checkpoint = Load-Checkpoint
$conn = New-Object Data.SqlClient.SqlConnection (
  "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;" +
  "Application Name=TataReaderContinuousWatchV1;Connect Timeout=5;Encrypt=False;TrustServerCertificate=True"
)

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
  checkpoint_path = $CheckpointPath
  event_dir = $EventDir
  bootstrap_was_complete = [bool]$checkpoint.bootstrap_complete
  effects = [ordered]@{
    database_read = $false
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

try {
  $conn.Open()
  $id = $conn.CreateCommand()
  $id.CommandTimeout = 5
  $id.CommandText = "SELECT SUSER_SNAME() AS current_login, DB_NAME() AS database_name;"
  $rd = $id.ExecuteReader()
  if (-not $rd.Read()) { throw "IDENTITY_ROW_NOT_RETURNED" }
  $sqlLogin = [string]$rd["current_login"]
  $dbName = [string]$rd["database_name"]
  $rd.Close()
  if (-not [string]::Equals($sqlLogin,$ExpectedLogin,[StringComparison]::OrdinalIgnoreCase)) { throw ("UNEXPECTED_SQL_LOGIN:" + $sqlLogin) }
  if (-not [string]::Equals($dbName,$Database,[StringComparison]::OrdinalIgnoreCase)) { throw ("DATABASE_MISMATCH:" + $dbName) }

  while ($true) {
    if ($MaxPolls -gt 0 -and $result.polls -ge $MaxPolls) { break }
    $result.polls++

    try {
      $cmd = $conn.CreateCommand()
      $cmd.CommandTimeout = 5
      $cmd.CommandText = @"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;
WITH recent AS (
  SELECT TOP (@top)
    c.CDFILIAL,c.CDLOJA,c.NRVENDAREST,c.NRCOMANDA,c.NRCOMANDAEXT,
    c.IDORGCMDVENDA,c.IDSTCOMANDA,c.DSOBSCOMANDA,v.DTHRABERMESA
  FROM TEKNISA.COMANDAVEN c
  JOIN TEKNISA.VENDAREST v
    ON v.CDFILIAL=c.CDFILIAL AND v.NRVENDAREST=c.NRVENDAREST
  WHERE c.CDFILIAL='0001' AND c.CDLOJA='01'
    AND CONVERT(nvarchar(64),c.IDORGCMDVENDA) = N'DLV_IFO'
  ORDER BY v.DTHRABERMESA DESC,c.NRVENDAREST DESC
)
SELECT
  r.CDFILIAL,r.CDLOJA,r.NRVENDAREST,r.NRCOMANDA,r.NRCOMANDAEXT,
  r.IDORGCMDVENDA,r.IDSTCOMANDA,r.DSOBSCOMANDA,r.DTHRABERMESA,
  i.NRPRODCOMVEN,i.CDPRODUTO,p.CDARVPROD,i.QTPRODCOMVEN,i.IDSTPRCOMVEN,
  i.DSOBSDESCIT,i.DSOBSPEDDIGCMD,i.TXPRODCOMVEN
FROM recent r
LEFT JOIN TEKNISA.ITCOMANDAVEN i
  ON i.CDFILIAL=r.CDFILIAL AND i.NRVENDAREST=r.NRVENDAREST AND i.NRCOMANDA=r.NRCOMANDA
LEFT JOIN TEKNISA.PRODUTO p
  ON p.CDPRODUTO=i.CDPRODUTO
ORDER BY r.DTHRABERMESA DESC,r.NRVENDAREST DESC,i.NRPRODCOMVEN;
"@
      $null=$cmd.Parameters.Add("@top",[Data.SqlDbType]::Int)
      $cmd.Parameters["@top"].Value=$TopOrders

      $orders=@{}
      $reader=$cmd.ExecuteReader()
      while($reader.Read()){
        $key=([string]$reader["CDFILIAL"])+"|"+([string]$reader["CDLOJA"])+"|"+([string]$reader["NRVENDAREST"])+"|"+([string]$reader["NRCOMANDA"])
        if(-not $orders.ContainsKey($key)){
          $orders[$key]=[ordered]@{
            CDFILIAL=[string]$reader["CDFILIAL"]
            CDLOJA=[string]$reader["CDLOJA"]
            NRVENDAREST=[string]$reader["NRVENDAREST"]
            NRCOMANDA=[string]$reader["NRCOMANDA"]
            NRCOMANDAEXT=if($reader["NRCOMANDAEXT"] -is [DBNull]){$null}else{[string]$reader["NRCOMANDAEXT"]}
            IDORGCMDVENDA=[string]$reader["IDORGCMDVENDA"]
            IDSTCOMANDA=[string]$reader["IDSTCOMANDA"]
            DSOBSCOMANDA=if($reader["DSOBSCOMANDA"] -is [DBNull]){$null}else{[string]$reader["DSOBSCOMANDA"]}
            DTHRABERMESA=([datetime]$reader["DTHRABERMESA"]).ToString("o")
            items=@()
          }
        }
        if(-not ($reader["NRPRODCOMVEN"] -is [DBNull])){
          $orders[$key].items += [ordered]@{
            NRPRODCOMVEN=[string]$reader["NRPRODCOMVEN"]
            CDPRODUTO=[string]$reader["CDPRODUTO"]
            CDARVPROD=if($reader["CDARVPROD"] -is [DBNull]){$null}else{[string]$reader["CDARVPROD"]}
            QTPRODCOMVEN=[string]$reader["QTPRODCOMVEN"]
            IDSTPRCOMVEN=[string]$reader["IDSTPRCOMVEN"]
            DSOBSDESCIT=if($reader["DSOBSDESCIT"] -is [DBNull]){$null}else{[string]$reader["DSOBSDESCIT"]}
            DSOBSPEDDIGCMD=if($reader["DSOBSPEDDIGCMD"] -is [DBNull]){$null}else{[string]$reader["DSOBSPEDDIGCMD"]}
            TXPRODCOMVEN=if($reader["TXPRODCOMVEN"] -is [DBNull]){$null}else{[string]$reader["TXPRODCOMVEN"]}
          }
        }
      }
      $reader.Close()
      $result.effects.database_read=$true

      foreach($key in $orders.Keys){
        $order=$orders[$key]
        $observationRows=@()
        $orderObs=[string]$order.DSOBSCOMANDA
        if(-not [string]::IsNullOrWhiteSpace($orderObs)){
          $observationRows += [ordered]@{
            source_field="DSOBSCOMANDA";value=$orderObs.Trim()
            scope_hint="order";join_proven=$true
          }
        }
        $cleanItems=@()
        for($itemIndex=0;$itemIndex -lt @($order.items).Count;$itemIndex++){
          $rawItem=$order.items[$itemIndex]
          $cleanItems += [ordered]@{
            NRPRODCOMVEN=$rawItem.NRPRODCOMVEN
            CDPRODUTO=$rawItem.CDPRODUTO
            CDARVPROD=$rawItem.CDARVPROD
            QTPRODCOMVEN=$rawItem.QTPRODCOMVEN
            IDSTPRCOMVEN=$rawItem.IDSTPRCOMVEN
          }
          foreach($field in @("DSOBSDESCIT","DSOBSPEDDIGCMD","TXPRODCOMVEN")){
            # Explicit field access; preserve V1 item note order exactly.
            switch($field){
              "DSOBSDESCIT"    {$value=[string]$rawItem.DSOBSDESCIT}
              "DSOBSPEDDIGCMD" {$value=[string]$rawItem.DSOBSPEDDIGCMD}
              "TXPRODCOMVEN"   {$value=[string]$rawItem.TXPRODCOMVEN}
              default {throw "UNSUPPORTED_OBSERVATION_SOURCE"}
            }
            if(-not [string]::IsNullOrWhiteSpace($value)){
              $observationRows += [ordered]@{
                source_field=$field;value=$value.Trim();item_index=$itemIndex
                CDPRODUTO=$rawItem.CDPRODUTO;scope_hint="item";join_proven=$true
              }
            }
          }
        }
        $basis=[ordered]@{
          CDFILIAL=$order.CDFILIAL;CDLOJA=$order.CDLOJA;NRVENDAREST=$order.NRVENDAREST
          NRCOMANDA=$order.NRCOMANDA;NRCOMANDAEXT=$order.NRCOMANDAEXT
          IDORGCMDVENDA=$order.IDORGCMDVENDA;IDSTCOMANDA=$order.IDSTCOMANDA
          DTHRABERMESA=$order.DTHRABERMESA;items=@($cleanItems)
          observation_scan_complete=$true
          observation_rows=@($observationRows)
        }
        $hashBasis=[ordered]@{
          CDFILIAL=$basis.CDFILIAL;CDLOJA=$basis.CDLOJA;NRVENDAREST=$basis.NRVENDAREST
          NRCOMANDA=$basis.NRCOMANDA;NRCOMANDAEXT=$basis.NRCOMANDAEXT
          IDORGCMDVENDA=$basis.IDORGCMDVENDA;IDSTCOMANDA=$basis.IDSTCOMANDA
          DTHRABERMESA=$basis.DTHRABERMESA;items=@($basis.items)
        }
        if(@($observationRows).Count -gt 0){
          $hashBasis["observation_rows"]=@($observationRows)
        }
        $hash=Get-TataCanonicalSha256V1 -Value $hashBasis
        $result.snapshots_observed++
        $entry=$checkpoint.seen[$key]
        $isNewEntry = ($null -eq $entry)
        if($isNewEntry){
          $baselineHash = if((-not [bool]$checkpoint.bootstrap_complete) -and (-not $EmitExistingOnBootstrap.IsPresent)){$hash}else{$null}
          $entry=[pscustomobject]@{
            order_key=$key;snapshot_hash=$hash;stable_count=1;emitted_hash=$baselineHash
            last_seen_order_time=$order.DTHRABERMESA
          }
          $checkpoint.seen[$key]=$entry
          if($null -ne $baselineHash){$result.baseline_suppressed++}
        } elseif([string]$entry.snapshot_hash -eq $hash){
          $entry.stable_count=[int]$entry.stable_count+1
          $entry.last_seen_order_time=$order.DTHRABERMESA
        } else {
          $result.changed_snapshots++
          $entry.snapshot_hash=$hash
          $entry.stable_count=1
          $entry.last_seen_order_time=$order.DTHRABERMESA
        }

        $eligibleBootstrap = [bool]$checkpoint.bootstrap_complete -or $EmitExistingOnBootstrap.IsPresent
        if($eligibleBootstrap -and [int]$entry.stable_count -ge $StablePolls){
          if([string]$entry.emitted_hash -eq $hash){
            $result.duplicates_suppressed++
          } else {
            $service=Read-ServiceState ([datetime]$order.DTHRABERMESA)
            $event=[ordered]@{
              schema="deliveryos.tata-reader-stable-order-event.v1"
              order_key=$key
              snapshot_hash=$hash
              observed_at=(Get-Date).ToString("o")
              order=$basis
              service_resolution=$service
              ready_for_downstream_shadow=(@($service.blockers).Count -eq 0)
              blockers=@($service.blockers)
              effects=[ordered]@{
                database_read=$true;database_write=$false;local_event_write=$true
                network_call=$false;odhen_write=$false;print=$false;spooler_write=$false
                fiscal_action=$false;sefaz_call=$false;cutover=$false
              }
            }
            $safeOrder=([string]$order.NRCOMANDA) -replace '[^0-9A-Za-z_-]','_'
            $eventPath=Join-Path $EventDir ($safeOrder+"_"+$hash+".json")
            if(-not (Test-Path -LiteralPath $eventPath -PathType Leaf)){
              Write-AtomicJson $eventPath $event
              $result.events_emitted++
            } else {
              # Prior crash may have persisted event bytes but not checkpoint.
              # Never dedupe a corrupted/foreign event by Test-Path alone.
              Assert-TataPersistedEventContentReview -Path $eventPath -ExpectedEvent $event | Out-Null
              $result.duplicates_suppressed++
            }
            $entry.emitted_hash=$hash
          }
        }
      }

      if(-not [bool]$checkpoint.bootstrap_complete){$checkpoint.bootstrap_complete=$true}
      Save-Checkpoint $checkpoint
    } catch {
      $result.poll_errors++
      if($MaxPolls -gt 0){throw}
    }

    if($MaxPolls -eq 0 -or $result.polls -lt $MaxPolls){Start-Sleep -Seconds $PollSeconds}
  }

  $result.status="COMPLETED"
  $result["checkpoint_sha256"]=(Get-FileHash -LiteralPath $CheckpointPath -Algorithm SHA256).Hash.ToUpperInvariant()
  $result | ConvertTo-Json -Depth 12
} finally {
  if($conn.State -ne [Data.ConnectionState]::Closed){$conn.Close()}
}
param(
  [int]$MaxPolls = 0,
  [int]$PollSeconds = 3,
  [int]$StablePolls = 2,
  [int]$TopOrders = 50,
  [string]$CheckpointPath = "C:\ProgramData\TataComandaReader\state\reader-watch-checkpoint-v1.json",
  [string]$EventDir = "C:\ProgramData\TataComandaReader\state\reader-events-v1",
  [switch]$EmitExistingOnBootstrap
)

$ErrorActionPreference = "Stop"
$ExpectedLogin = "NT SERVICE\TataComandaReader"
$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"
$ServiceStatePath = "C:\ProgramData\TataComandaReader\state\production-service-state.json"

function Hash-Text([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-","")
  } finally { $sha.Dispose() }
}

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

function Load-Checkpoint {
  if (-not (Test-Path -LiteralPath $CheckpointPath -PathType Leaf)) {
    return @{
      schema = "deliveryos.tata-reader-continuous-checkpoint.v1"
      bootstrap_complete = $false
      seen = @{}
    }
  }
  $raw = Get-Content -LiteralPath $CheckpointPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($raw.schema -ne "deliveryos.tata-reader-continuous-checkpoint.v1") { throw "CHECKPOINT_SCHEMA_MISMATCH" }
  $seen = @{}
  foreach ($entry in @($raw.entries)) { $seen[[string]$entry.order_key] = $entry }
  return @{ schema=$raw.schema; bootstrap_complete=[bool]$raw.bootstrap_complete; seen=$seen }
}

function Save-Checkpoint($checkpoint) {
  $entries = @($checkpoint.seen.Values | Sort-Object { [string]$_.last_seen_order_time } -Descending | Select-Object -First 250)
  $out = [ordered]@{
    schema = "deliveryos.tata-reader-continuous-checkpoint.v1"
    bootstrap_complete = [bool]$checkpoint.bootstrap_complete
    entries = $entries
  }
  Write-AtomicJson $CheckpointPath $out
}

function Read-ServiceState([datetime]$OrderOpenedAt) {
  $blockers = @()
  if (-not (Test-Path -LiteralPath $ServiceStatePath -PathType Leaf)) {
    return [ordered]@{ service=$null; evidence="UNKNOWN"; source_ref=$null; blockers=@("SERVICE_STATE_MISSING") }
  }
  try {
    $state = Get-Content -LiteralPath $ServiceStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.schema -ne "deliveryos.production-service-shift-state.v2") { $blockers += "SERVICE_STATE_SCHEMA_MISMATCH" }
    if ([bool]$state.clock_inference_used) { $blockers += "SERVICE_STATE_CLOCK_INFERENCE_FORBIDDEN" }
    $orderDate = $OrderOpenedAt.ToString("yyyy-MM-dd")
    if ([string]$state.operational_date -ne $orderDate) { $blockers += "SERVICE_STATE_DATE_MISMATCH_ORDER_DATE" }
    if ([string]$state.store_id -ne "0001") { $blockers += "SERVICE_STATE_STORE_MISMATCH" }
    if ([string]$state.service -notin @("LUNCH","DINNER")) { $blockers += "SERVICE_STATE_SERVICE_INVALID" }
    if ([string]$state.evidence -notin @("HUMAN_CONFIRMED_RULE","REAL_OBSERVED")) { $blockers += "SERVICE_STATE_EVIDENCE_REQUIRED" }
    if ([string]::IsNullOrWhiteSpace([string]$state.source_ref)) { $blockers += "SERVICE_STATE_SOURCE_REF_REQUIRED" }
    $validUntilRaw = [string]$state.valid_until_local
    $validUntil = [datetime]::MinValue
    if (
      [string]::IsNullOrWhiteSpace($validUntilRaw) -or
      -not [datetime]::TryParseExact(
        $validUntilRaw,
        "yyyy-MM-ddTHH:mm:ss",
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::None,
        [ref]$validUntil
      )
    ) {
      $blockers += "SERVICE_STATE_VALID_UNTIL_REQUIRED"
    } elseif ($OrderOpenedAt -gt $validUntil) {
      $blockers += "SERVICE_STATE_EXPIRED_FOR_ORDER"
    }
    if ($blockers.Count -gt 0) {
      return [ordered]@{ service=$null; evidence="UNKNOWN"; source_ref=$null; blockers=$blockers }
    }
    return [ordered]@{ service=[string]$state.service; evidence=[string]$state.evidence; source_ref=[string]$state.source_ref; blockers=@() }
  } catch {
    return [ordered]@{ service=$null; evidence="UNKNOWN"; source_ref=$null; blockers=@("SERVICE_STATE_READ_FAILED") }
  }
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
    c.IDORGCMDVENDA,c.IDSTCOMANDA,v.DTHRABERMESA
  FROM TEKNISA.COMANDAVEN c
  JOIN TEKNISA.VENDAREST v
    ON v.CDFILIAL=c.CDFILIAL AND v.NRVENDAREST=c.NRVENDAREST
  WHERE c.CDFILIAL='0001' AND c.CDLOJA='01'
    AND CONVERT(nvarchar(64),c.IDORGCMDVENDA) LIKE N'DLV[_]%'
  ORDER BY v.DTHRABERMESA DESC,c.NRVENDAREST DESC
)
SELECT
  r.CDFILIAL,r.CDLOJA,r.NRVENDAREST,r.NRCOMANDA,r.NRCOMANDAEXT,
  r.IDORGCMDVENDA,r.IDSTCOMANDA,r.DTHRABERMESA,
  i.NRPRODCOMVEN,i.CDPRODUTO,p.CDARVPROD,i.QTPRODCOMVEN,i.IDSTPRCOMVEN
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
          }
        }
      }
      $reader.Close()
      $result.effects.database_read=$true

      foreach($key in $orders.Keys){
        $order=$orders[$key]
        $basis=[ordered]@{
          CDFILIAL=$order.CDFILIAL;CDLOJA=$order.CDLOJA;NRVENDAREST=$order.NRVENDAREST
          NRCOMANDA=$order.NRCOMANDA;NRCOMANDAEXT=$order.NRCOMANDAEXT
          IDORGCMDVENDA=$order.IDORGCMDVENDA;IDSTCOMANDA=$order.IDSTCOMANDA
          DTHRABERMESA=$order.DTHRABERMESA;items=@($order.items)
        }
        $hash=Hash-Text ($basis|ConvertTo-Json -Depth 12 -Compress)
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

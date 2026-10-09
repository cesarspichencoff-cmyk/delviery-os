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
  r.CDFILIAL,r.CDLOJA,r.NRVENDAREST,r.NRCOMANDA,
  hp.KDS_STARTED_AT,hp.KDS_FINISHED_AT,
  il.ITEM_REVISION_FIRST_AT,il.ITEM_REVISION_LAST_AT,
  il.ITEM_LOG_GROSS_BRL,il.ITEM_LOG_DISCOUNT_BRL,il.ITEM_LOG_SURCHARGE_BRL,il.ITEM_LOG_NET_BRL,
  mv.MONEY_FIRST_AT,mv.MONEY_LAST_AT,mv.MOVEMENT_TOTAL_BRL,
  vv.SALE_CLOSED_AT,vv.SALE_TOTAL_BRL,vv.ORDER_SERVICE_FEE_BRL,vv.SALE_DISCOUNT_BRL,vv.SALE_SURCHARGE_BRL
FROM recent r
OUTER APPLY (
  SELECT
    MIN(CASE WHEN h.IDHISTPEDCONS='P' THEN h.DTHRHISTPEDCONS END) AS KDS_STARTED_AT,
    MIN(CASE WHEN h.IDHISTPEDCONS='F' THEN h.DTHRHISTPEDCONS END) AS KDS_FINISHED_AT
  FROM TEKNISA.HISTPEDCONS h
  WHERE h.CDFILIAL=r.CDFILIAL AND h.NRVENDAREST=r.NRVENDAREST AND h.NRCOMANDA=r.NRCOMANDA
) hp
OUTER APPLY (
  SELECT
    MIN(i.DTHRINCOMVEN) AS ITEM_REVISION_FIRST_AT,
    MAX(i.DTHRINCOMVEN) AS ITEM_REVISION_LAST_AT,
    CAST(SUM(COALESCE(i.QTPRODCOMVEN,0)*COALESCE(i.VRPRECCOMVEN,0)) AS decimal(18,3)) AS ITEM_LOG_GROSS_BRL,
    CAST(SUM(COALESCE(i.VRDESCCOMVEN,0)) AS decimal(18,3)) AS ITEM_LOG_DISCOUNT_BRL,
    CAST(SUM(COALESCE(i.VRACRCOMVEN,0)) AS decimal(18,3)) AS ITEM_LOG_SURCHARGE_BRL,
    CAST(SUM(COALESCE(i.QTPRODCOMVEN,0)*COALESCE(i.VRPRECCOMVEN,0))-SUM(COALESCE(i.VRDESCCOMVEN,0))+SUM(COALESCE(i.VRACRCOMVEN,0)) AS decimal(18,3)) AS ITEM_LOG_NET_BRL
  FROM TEKNISA.ITCMD_LOG i
  WHERE i.CDFILIAL=r.CDFILIAL AND i.NRVENDAREST=r.NRVENDAREST AND i.NRCOMANDA=r.NRCOMANDA
) il
OUTER APPLY (
  SELECT
    MIN(m.DTINCLUSAO) AS MONEY_FIRST_AT,
    MAX(m.DTINCLUSAO) AS MONEY_LAST_AT,
    CAST(SUM(COALESCE(m.VRMOVIVENDDLV,0)) AS decimal(18,3)) AS MOVEMENT_TOTAL_BRL
  FROM TEKNISA.MOVCAIXADLV m
  WHERE m.CDFILIAL=r.CDFILIAL AND m.NRVENDAREST=r.NRVENDAREST
) mv
OUTER APPLY (
  SELECT TOP (1)
    v.DTFECHAVENDA AS SALE_CLOSED_AT,
    CAST(v.VRTOTVENDA AS decimal(18,3)) AS SALE_TOTAL_BRL,
    CAST(v.VRTXSEVENDA AS decimal(18,3)) AS ORDER_SERVICE_FEE_BRL,
    CAST(v.VRDESCVENDA AS decimal(18,3)) AS SALE_DISCOUNT_BRL,
    CAST(v.VRACREVENDA AS decimal(18,3)) AS SALE_SURCHARGE_BRL
  FROM TEKNISA.VENDA v
  WHERE v.CDFILIAL=r.CDFILIAL AND v.NRVENDAREST=r.NRVENDAREST
  ORDER BY CASE WHEN v.DTFECHAVENDA IS NULL THEN 1 ELSE 0 END,v.DTFECHAVENDA DESC
) vv
ORDER BY r.DTHRABERMESA DESC,r.NRVENDAREST DESC;

WITH recent AS (
  SELECT TOP (@top)
    c.CDFILIAL,c.CDLOJA,c.NRVENDAREST,c.NRCOMANDA,v.DTHRABERMESA
  FROM TEKNISA.COMANDAVEN c
  JOIN TEKNISA.VENDAREST v
    ON v.CDFILIAL=c.CDFILIAL AND v.NRVENDAREST=c.NRVENDAREST
  WHERE c.CDFILIAL='0001' AND c.CDLOJA='01'
    AND CONVERT(nvarchar(64),c.IDORGCMDVENDA) LIKE N'DLV[_]%'
  ORDER BY v.DTHRABERMESA DESC,c.NRVENDAREST DESC
)
SELECT
  r.CDFILIAL,r.CDLOJA,r.NRVENDAREST,r.NRCOMANDA,
  m.CDTIPORECE,tr.NMTIPORECE,
  CAST(SUM(COALESCE(m.VRMOVIVENDDLV,0)) AS decimal(18,3)) AS RECEIPT_AMOUNT_BRL
FROM recent r
JOIN TEKNISA.MOVCAIXADLV m
  ON m.CDFILIAL=r.CDFILIAL AND m.NRVENDAREST=r.NRVENDAREST
LEFT JOIN TEKNISA.TIPORECE tr ON tr.CDTIPORECE=m.CDTIPORECE
GROUP BY r.CDFILIAL,r.CDLOJA,r.NRVENDAREST,r.NRCOMANDA,m.CDTIPORECE,tr.NMTIPORECE
ORDER BY r.NRVENDAREST DESC,m.CDTIPORECE;
"@
      $null=$cmd.Parameters.Add("@top",[Data.SqlDbType]::Int)
      $cmd.Parameters["@top"].Value=$TopOrders

      $orders=@{}
      $truthByKey=@{}
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

      if($reader.NextResult()){
        while($reader.Read()){
          $key=([string]$reader["CDFILIAL"])+"|"+([string]$reader["CDLOJA"])+"|"+([string]$reader["NRVENDAREST"])+"|"+([string]$reader["NRCOMANDA"])
          $truthByKey[$key]=[ordered]@{
            schema="deliveryos.tata-comanda-live-order-truth.v1"
            lifecycle=[ordered]@{
              kds_cycle=[ordered]@{
                started_at=if($reader["KDS_STARTED_AT"] -is [DBNull]){$null}else{([datetime]$reader["KDS_STARTED_AT"]).ToString("o")}
                finished_at=if($reader["KDS_FINISHED_AT"] -is [DBNull]){$null}else{([datetime]$reader["KDS_FINISHED_AT"]).ToString("o")}
                semantics="LOCAL_KDS_CYCLE"
                production_time_claim=$false
                delivery_time_claim=$false
              }
              item_revision_first_at=if($reader["ITEM_REVISION_FIRST_AT"] -is [DBNull]){$null}else{([datetime]$reader["ITEM_REVISION_FIRST_AT"]).ToString("o")}
              item_revision_last_at=if($reader["ITEM_REVISION_LAST_AT"] -is [DBNull]){$null}else{([datetime]$reader["ITEM_REVISION_LAST_AT"]).ToString("o")}
              money_first_at=if($reader["MONEY_FIRST_AT"] -is [DBNull]){$null}else{([datetime]$reader["MONEY_FIRST_AT"]).ToString("o")}
              money_last_at=if($reader["MONEY_LAST_AT"] -is [DBNull]){$null}else{([datetime]$reader["MONEY_LAST_AT"]).ToString("o")}
              sale_closed_at=if($reader["SALE_CLOSED_AT"] -is [DBNull]){$null}else{([datetime]$reader["SALE_CLOSED_AT"]).ToString("o")}
              production_time_minutes=$null
              delivery_time_minutes=$null
              production_time_status="UNKNOWN_NO_AUTHORITATIVE_PRODUCTION_TIMESTAMP"
              delivery_time_status="UNKNOWN_NO_AUTHORITATIVE_CUSTOMER_DELIVERY_TIMESTAMP"
            }
            financial=[ordered]@{
              item_log_gross_brl=if($reader["ITEM_LOG_GROSS_BRL"] -is [DBNull]){$null}else{[decimal]$reader["ITEM_LOG_GROSS_BRL"]}
              item_log_discount_brl=if($reader["ITEM_LOG_DISCOUNT_BRL"] -is [DBNull]){$null}else{[decimal]$reader["ITEM_LOG_DISCOUNT_BRL"]}
              item_log_surcharge_brl=if($reader["ITEM_LOG_SURCHARGE_BRL"] -is [DBNull]){$null}else{[decimal]$reader["ITEM_LOG_SURCHARGE_BRL"]}
              item_log_net_brl=if($reader["ITEM_LOG_NET_BRL"] -is [DBNull]){$null}else{[decimal]$reader["ITEM_LOG_NET_BRL"]}
              movement_total_brl=if($reader["MOVEMENT_TOTAL_BRL"] -is [DBNull]){$null}else{[decimal]$reader["MOVEMENT_TOTAL_BRL"]}
              sale_total_brl=if($reader["SALE_TOTAL_BRL"] -is [DBNull]){$null}else{[decimal]$reader["SALE_TOTAL_BRL"]}
              order_service_fee_brl=if($reader["ORDER_SERVICE_FEE_BRL"] -is [DBNull]){$null}else{[decimal]$reader["ORDER_SERVICE_FEE_BRL"]}
              sale_discount_brl=if($reader["SALE_DISCOUNT_BRL"] -is [DBNull]){$null}else{[decimal]$reader["SALE_DISCOUNT_BRL"]}
              sale_surcharge_brl=if($reader["SALE_SURCHARGE_BRL"] -is [DBNull]){$null}else{[decimal]$reader["SALE_SURCHARGE_BRL"]}
              item_plus_service_brl=$null
              receipt_total_brl=$null
              state="PARTIAL_OR_UNKNOWN"
              reconciled=$false
              receipts=@()
            }
            source_lineage=[ordered]@{
              current_order="TEKNISA.COMANDAVEN+VENDAREST"
              current_items="TEKNISA.ITCOMANDAVEN"
              item_revision_history="TEKNISA.ITCMD_LOG"
              kds_cycle="TEKNISA.HISTPEDCONS"
              financial_movement="TEKNISA.MOVCAIXADLV"
              sale_financial_close="TEKNISA.VENDA"
              receipt_dictionary="TEKNISA.TIPORECE"
            }
            privacy=[ordered]@{
              customer_pii_required=$false
              customer_pii_persisted=$false
              raw_observation_text_persisted=$false
              coordinates_persisted=$false
              raw_customer_payload_persisted=$false
            }
          }
        }
      }

      if($reader.NextResult()){
        while($reader.Read()){
          $key=([string]$reader["CDFILIAL"])+"|"+([string]$reader["CDLOJA"])+"|"+([string]$reader["NRVENDAREST"])+"|"+([string]$reader["NRCOMANDA"])
          if($truthByKey.ContainsKey($key)){
            $truthByKey[$key].financial.receipts += [ordered]@{
              code=[string]$reader["CDTIPORECE"]
              label=if($reader["NMTIPORECE"] -is [DBNull]){$null}else{[string]$reader["NMTIPORECE"]}
              amount_brl=[decimal]$reader["RECEIPT_AMOUNT_BRL"]
            }
          }
        }
      }
      $reader.Close()

      foreach($truthKey in @($truthByKey.Keys)){
        $f=$truthByKey[$truthKey].financial
        if($null -ne $f.item_log_net_brl -and $null -ne $f.order_service_fee_brl){
          $f.item_plus_service_brl=[decimal]$f.item_log_net_brl+[decimal]$f.order_service_fee_brl
        }
        if(@($f.receipts).Count -gt 0){
          $sum=[decimal]0
          foreach($receipt in @($f.receipts)){$sum += [decimal]$receipt.amount_brl}
          $f.receipt_total_brl=$sum
        }
        $matches=$false
        if($null -ne $f.item_plus_service_brl -and $null -ne $f.sale_total_brl -and $null -ne $f.movement_total_brl){
          $matches=(
            [Math]::Abs([double]([decimal]$f.item_plus_service_brl-[decimal]$f.sale_total_brl)) -le 0.01 -and
            [Math]::Abs([double]([decimal]$f.sale_total_brl-[decimal]$f.movement_total_brl)) -le 0.01 -and
            ($null -eq $f.receipt_total_brl -or [Math]::Abs([double]([decimal]$f.receipt_total_brl-[decimal]$f.movement_total_brl)) -le 0.01)
          )
        }
        $f.reconciled=[bool]$matches
        $f.state=if($matches){"RECONCILED"}else{"PARTIAL_OR_UNKNOWN"}
      }
      $result.effects.database_read=$true

      foreach($key in $orders.Keys){
        $order=$orders[$key]
        $truth=if($truthByKey.ContainsKey($key)){$truthByKey[$key]}else{[ordered]@{
          schema="deliveryos.tata-comanda-live-order-truth.v1"
          status="UNKNOWN_NO_TRUTH_ROW"
          lifecycle=[ordered]@{production_time_minutes=$null;delivery_time_minutes=$null;production_time_status="UNKNOWN";delivery_time_status="UNKNOWN"}
          financial=[ordered]@{state="PARTIAL_OR_UNKNOWN";reconciled=$false;receipts=@()}
          privacy=[ordered]@{customer_pii_persisted=$false;raw_observation_text_persisted=$false;coordinates_persisted=$false;raw_customer_payload_persisted=$false}
        }}
        $basis=[ordered]@{
          CDFILIAL=$order.CDFILIAL;CDLOJA=$order.CDLOJA;NRVENDAREST=$order.NRVENDAREST
          NRCOMANDA=$order.NRCOMANDA;NRCOMANDAEXT=$order.NRCOMANDAEXT
          IDORGCMDVENDA=$order.IDORGCMDVENDA;IDSTCOMANDA=$order.IDSTCOMANDA
          DTHRABERMESA=$order.DTHRABERMESA;items=@($order.items);truth=$truth
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
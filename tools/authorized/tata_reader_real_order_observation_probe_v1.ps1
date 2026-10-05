$ErrorActionPreference = "Stop"

$ExpectedLogin = "NT SERVICE\TataComandaReader"
$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"
$CDFILIAL = "0001"
$CDLOJA = "01"
$NRVENDAREST = "0000349281"
$NRCOMANDA = "0000348850"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-real-order-observation-probe.v1"
  mode = "READ_ONLY_EXACT_ORDER_OBSERVATION_FIELDS"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  current_login = $null
  current_user = $null
  database = $null
  order = [ordered]@{
    CDFILIAL = $CDFILIAL
    CDLOJA = $CDLOJA
    NRVENDAREST = $NRVENDAREST
    NRCOMANDA = $NRCOMANDA
  }
  order_observation = $null
  items = @()
  rows_read = 0
  free_text_read = $true
  pii_presence_unknown = $true
  effects = [ordered]@{
    observation_row_read = $false
    database_write = $false
    permission_change = $false
    odhen_write = $false
    network_call = $false
    print = $false
    spooler_write = $false
    fiscal_action = $false
    sefaz_call = $false
    cutover = $false
  }
  error = $null
}

function TextOrNull($v) {
  if ($v -is [DBNull] -or $null -eq $v) { return $null }
  $s = [string]$v
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  return $s
}

$conn = $null
try {
  $conn = New-Object System.Data.SqlClient.SqlConnection (
    "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;" +
    "Application Name=TataReaderObservationProbeV1;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  )
  $conn.Open()

  $identityCmd = $conn.CreateCommand()
  $identityCmd.CommandTimeout = 5
  $identityCmd.CommandText = @"
SET NOCOUNT ON;
SELECT SUSER_SNAME() AS [current_login], USER_NAME() AS [current_user], DB_NAME() AS [database_name];
"@
  $ir = $identityCmd.ExecuteReader()
  if (-not $ir.Read()) { throw "IDENTITY_ROW_NOT_RETURNED" }
  $result.current_login = [string]$ir["current_login"]
  $result.current_user = [string]$ir["current_user"]
  $result.database = [string]$ir["database_name"]
  $ir.Close()

  if (-not [string]::Equals($result.current_login,$ExpectedLogin,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("UNEXPECTED_SQL_LOGIN:" + $result.current_login)
  }
  if (-not [string]::Equals($result.database,$Database,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw ("DATABASE_MISMATCH:" + $result.database)
  }

  $orderCmd = $conn.CreateCommand()
  $orderCmd.CommandTimeout = 5
  $orderCmd.CommandText = @"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;
SELECT DSOBSCOMANDA
FROM TEKNISA.COMANDAVEN
WHERE CDFILIAL=@cdfilial
  AND CDLOJA=@cdloja
  AND NRVENDAREST=@nrvendarest
  AND NRCOMANDA=@nrcomanda;
"@
  foreach($p in @(
    @("cdfilial",$CDFILIAL,4),
    @("cdloja",$CDLOJA,4),
    @("nrvendarest",$NRVENDAREST,10),
    @("nrcomanda",$NRCOMANDA,10)
  )){
    $null=$orderCmd.Parameters.Add("@"+$p[0],[System.Data.SqlDbType]::VarChar,[int]$p[2])
    $orderCmd.Parameters["@"+$p[0]].Value=$p[1]
  }
  $or = $orderCmd.ExecuteReader()
  if (-not $or.Read()) { $or.Close(); throw "ORDER_NOT_FOUND" }
  $result.order_observation = TextOrNull $or["DSOBSCOMANDA"]
  $result.rows_read++
  $or.Close()

  $itemCmd = $conn.CreateCommand()
  $itemCmd.CommandTimeout = 5
  $itemCmd.CommandText = @"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;
SELECT NRPRODCOMVEN, CDPRODUTO, DSOBSDESCIT, DSOBSPEDDIGCMD, TXPRODCOMVEN
FROM TEKNISA.ITCOMANDAVEN
WHERE CDFILIAL=@cdfilial
  AND NRVENDAREST=@nrvendarest
  AND NRCOMANDA=@nrcomanda
ORDER BY NRPRODCOMVEN;
"@
  foreach($p in @(
    @("cdfilial",$CDFILIAL,4),
    @("nrvendarest",$NRVENDAREST,10),
    @("nrcomanda",$NRCOMANDA,10)
  )){
    $null=$itemCmd.Parameters.Add("@"+$p[0],[System.Data.SqlDbType]::VarChar,[int]$p[2])
    $itemCmd.Parameters["@"+$p[0]].Value=$p[1]
  }
  $rr=$itemCmd.ExecuteReader()
  while($rr.Read()){
    $result.items += [ordered]@{
      NRPRODCOMVEN = [string]$rr["NRPRODCOMVEN"]
      CDPRODUTO = [string]$rr["CDPRODUTO"]
      DSOBSDESCIT = TextOrNull $rr["DSOBSDESCIT"]
      DSOBSPEDDIGCMD = TextOrNull $rr["DSOBSPEDDIGCMD"]
      TXPRODCOMVEN = TextOrNull $rr["TXPRODCOMVEN"]
    }
    $result.rows_read++
  }
  $rr.Close()

  $result.effects.observation_row_read = $true
  $result.status = "PROVEN_EXACT_ORDER_OBSERVATION_READ"
  $result | ConvertTo-Json -Depth 10
  exit 0
}
catch {
  $result.status = "OBSERVATION_READ_FAILED"
  $result.error = [string]$_.Exception.Message
  $result | ConvertTo-Json -Depth 10
  exit 6
}
finally {
  if ($null -ne $conn -and $conn.State -ne [System.Data.ConnectionState]::Closed) { $conn.Close() }
}

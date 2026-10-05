$ErrorActionPreference = "Stop"

$ExpectedLogin = "NT SERVICE\TataComandaReader"
$SqlServer = "(local)\SQLEXPRESS"
$Database = "teknisa"

$result = [ordered]@{
  schema = "deliveryos.tata-reader-passive-log-candidate-orders.v1"
  mode = "READ_ONLY_INTEGRATED_ORDER_IDS_BEFORE_LOG_STOP"
  captured_at = (Get-Date).ToString("o")
  status = "STARTED"
  current_login = $null
  current_user = $null
  database = $null
  orders = @()
  rows_read = 0
  effects = [ordered]@{
    order_metadata_read = $false
    database_write = $false
    permission_change = $false
    print = $false
    spooler_write = $false
    fiscal_action = $false
    sefaz_call = $false
    cutover = $false
  }
  error = $null
}

$conn=$null
try {
  $conn = New-Object System.Data.SqlClient.SqlConnection (
    "Server=$SqlServer;Database=$Database;Integrated Security=SSPI;" +
    "Application Name=TataReaderPassiveLogCandidateOrdersV1;Connect Timeout=5;" +
    "Encrypt=False;TrustServerCertificate=True"
  )
  $conn.Open()

  $id=$conn.CreateCommand()
  $id.CommandTimeout=5
  $id.CommandText="SELECT SUSER_SNAME() AS [current_login], USER_NAME() AS [current_user], DB_NAME() AS [database_name];"
  $rd=$id.ExecuteReader()
  if(-not $rd.Read()){throw "IDENTITY_ROW_NOT_RETURNED"}
  $result.current_login=[string]$rd["current_login"]
  $result.current_user=[string]$rd["current_user"]
  $result.database=[string]$rd["database_name"]
  $rd.Close()

  if(-not [string]::Equals($result.current_login,$ExpectedLogin,[System.StringComparison]::OrdinalIgnoreCase)){
    throw ("UNEXPECTED_SQL_LOGIN:"+$result.current_login)
  }
  if(-not [string]::Equals($result.database,$Database,[System.StringComparison]::OrdinalIgnoreCase)){
    throw ("DATABASE_MISMATCH:"+$result.database)
  }

  $cmd=$conn.CreateCommand()
  $cmd.CommandTimeout=5
  $cmd.CommandText=@"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;

SELECT TOP (5)
  c.CDFILIAL,
  c.CDLOJA,
  c.NRVENDAREST,
  c.NRCOMANDA,
  c.NRCOMANDAEXT,
  c.IDORGCMDVENDA,
  v.DTHRABERMESA
FROM TEKNISA.COMANDAVEN c
JOIN TEKNISA.VENDAREST v
  ON v.CDFILIAL = c.CDFILIAL
 AND v.NRVENDAREST = c.NRVENDAREST
WHERE c.CDFILIAL = '0001'
  AND c.CDLOJA = '01'
  AND c.NRCOMANDAEXT IS NOT NULL
  AND LTRIM(RTRIM(CONVERT(nvarchar(128),c.NRCOMANDAEXT))) <> N''
  AND CONVERT(nvarchar(64),c.IDORGCMDVENDA) LIKE N'DLV[_]%'
  AND v.DTHRABERMESA >= '2026-10-04T20:00:00'
  AND v.DTHRABERMESA <  '2026-10-04T22:00:00'
ORDER BY v.DTHRABERMESA DESC, c.NRVENDAREST DESC;
"@
  $r=$cmd.ExecuteReader()
  while($r.Read()){
    $result.orders += [ordered]@{
      CDFILIAL=[string]$r["CDFILIAL"]
      CDLOJA=[string]$r["CDLOJA"]
      NRVENDAREST=[string]$r["NRVENDAREST"]
      NRCOMANDA=[string]$r["NRCOMANDA"]
      NRCOMANDAEXT=[string]$r["NRCOMANDAEXT"]
      IDORGCMDVENDA=[string]$r["IDORGCMDVENDA"]
      DTHRABERMESA=([datetime]$r["DTHRABERMESA"]).ToString("o")
    }
  }
  $r.Close()
  $result.rows_read=$result.orders.Count
  $result.effects.order_metadata_read=$true
  $result.status=if($result.orders.Count -gt 0){"CANDIDATE_ORDERS_READ"}else{"NO_CANDIDATE_ORDERS"}
  $result|ConvertTo-Json -Depth 8
  exit 0
}
catch{
  $result.status="READ_FAILED"
  $result.error=[string]$_.Exception.Message
  $result|ConvertTo-Json -Depth 8
  exit 6
}
finally{
  if($null-ne$conn -and $conn.State-ne[System.Data.ConnectionState]::Closed){$conn.Close()}
}

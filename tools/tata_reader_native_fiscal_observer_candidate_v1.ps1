$ErrorActionPreference="Stop"

param(
  [Parameter(Mandatory=$true)][string]$NrVendaRest
)

$ExpectedLogin="NT SERVICE\TataComandaReader"
$conn=New-Object Data.SqlClient.SqlConnection "Server=(local)\SQLEXPRESS;Database=teknisa;Integrated Security=SSPI;Application Name=TataNativeFiscalObserverV1;Connect Timeout=5;Encrypt=False;TrustServerCertificate=True"

try {
  $conn.Open()

  $id=$conn.CreateCommand()
  $id.CommandText="SELECT SUSER_SNAME() AS login_name;"
  $login=[string]$id.ExecuteScalar()
  if(-not [string]::Equals($login,$ExpectedLogin,[StringComparison]::OrdinalIgnoreCase)){
    throw ("UNEXPECTED_SQL_LOGIN:"+$login)
  }

  $cmd=$conn.CreateCommand()
  $cmd.CommandTimeout=5
  $cmd.CommandText=@"
SET NOCOUNT ON;
SET LOCK_TIMEOUT 2000;
SELECT
  CDFILIAL,
  NRVENDAREST,
  NRSEQVENDA,
  NRNOTAFISCALCE,
  IDSTATUSNFCE,
  DTEMISSAONFCE,
  NRPROTOCOLONFCE,
  CASE
    WHEN DSQRCODENFCE IS NOT NULL
     AND LEN(LTRIM(RTRIM(DSQRCODENFCE))) > 0
    THEN 1 ELSE 0
  END AS QR_PRESENT
FROM TEKNISA.VENDA
WHERE CDFILIAL='0001'
  AND NRVENDAREST=@nrvendarest
ORDER BY NRSEQVENDA;
"@
  $null=$cmd.Parameters.Add("@nrvendarest",[Data.SqlDbType]::VarChar,20)
  $cmd.Parameters["@nrvendarest"].Value=$NrVendaRest

  $r=$cmd.ExecuteReader()
  $rows=@()
  while($r.Read()){
    $rows += [ordered]@{
      CDFILIAL=[string]$r["CDFILIAL"]
      NRVENDAREST=[string]$r["NRVENDAREST"]
      NRSEQVENDA=if($r["NRSEQVENDA"]-is[DBNull]){$null}else{[string]$r["NRSEQVENDA"]}
      NRNOTAFISCALCE=if($r["NRNOTAFISCALCE"]-is[DBNull]){$null}else{[string]$r["NRNOTAFISCALCE"]}
      IDSTATUSNFCE=if($r["IDSTATUSNFCE"]-is[DBNull]){$null}else{[string]$r["IDSTATUSNFCE"]}
      DTEMISSAONFCE=if($r["DTEMISSAONFCE"]-is[DBNull]){$null}else{([datetime]$r["DTEMISSAONFCE"]).ToString("o")}
      NRPROTOCOLONFCE=if($r["NRPROTOCOLONFCE"]-is[DBNull]){$null}else{[string]$r["NRPROTOCOLONFCE"]}
      QR_PRESENT=([int]$r["QR_PRESENT"] -eq 1)
    }
  }
  $r.Close()

  [ordered]@{
    schema="deliveryos.native-fiscal-observer.v1"
    order_id=$NrVendaRest
    rows=$rows
    raw_qr_read=$false
    effects=[ordered]@{database_read=$true;database_write=$false;fiscal_action=$false;sefaz_call=$false;danfe_print=$false}
  }|ConvertTo-Json -Depth 8
}
finally {
  if($conn.State-ne[Data.ConnectionState]::Closed){$conn.Close()}
}

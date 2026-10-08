<#
  Operacoes de laboratorio do harness, como administrador do banco SINTETICO:
    sessions  -> sessoes do leitor (status, ultimo request) em JSON
    lock      -> segura lock X nos itens de UM pedido por -Seconds e desfaz
                 (ROLLBACK): e a espera que o PDV causa no horario de pico
    insert    -> cria um pedido novo (sintetico) para provar emissao de evento
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet("sessions","lock","insert")][string]$Op,
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][string]$SaPassword,
  [string]$ProgramLike = "TataReaderContinuousWatchV1",
  [string]$Order = "0000340030",
  [int]$Seconds = 5
)
$ErrorActionPreference = "Stop"
$c = New-Object System.Data.SqlClient.SqlConnection("Server=$Server;Database=teknisa;User ID=sa;Password=$SaPassword;Encrypt=False;TrustServerCertificate=True;Connect Timeout=10")
$c.Open()
try {
  switch ($Op) {
    "sessions" {
      $cmd = $c.CreateCommand()
      $cmd.CommandText = "SELECT session_id, status, CONVERT(varchar(33), last_request_start_time, 126) AS s, CONVERT(varchar(33), last_request_end_time, 126) AS e FROM sys.dm_exec_sessions WHERE program_name LIKE @p ORDER BY session_id"
      [void]$cmd.Parameters.AddWithValue("@p", $ProgramLike + "%")
      $r = $cmd.ExecuteReader()
      $rows = @()
      try { while ($r.Read()) { $rows += [ordered]@{ session_id = [int]$r.GetInt16(0); status = $r.GetString(1); last_request_start = $r.GetString(2); last_request_end = $r.GetString(3) } } } finally { $r.Dispose() }
      ConvertTo-Json -InputObject @($rows) -Depth 4 -Compress
    }
    "lock" {
      $tx = $c.BeginTransaction()
      $cmd = $c.CreateCommand(); $cmd.Transaction = $tx
      $cmd.CommandText = "UPDATE TEKNISA.ITCOMANDAVEN SET IDSTPRCOMVEN='X' WHERE NRVENDAREST=@o"
      [void]$cmd.Parameters.AddWithValue("@o", $Order)
      $n = $cmd.ExecuteNonQuery()
      "LOCK_HELD rows=$n"
      Start-Sleep -Seconds $Seconds
      $tx.Rollback()
      "LOCK_RELEASED"
    }
    "insert" {
      $cmd = $c.CreateCommand()
      $cmd.CommandText = @"
DECLARE @nv char(10) = @order, @nc char(10) = RIGHT('0000000000' + CAST(CAST(@order AS bigint) + 500000 AS varchar(10)), 10);
INSERT INTO TEKNISA.VENDAREST VALUES ('0001', @nv, DATEADD(minute, 1, (SELECT MAX(DTHRABERMESA) FROM TEKNISA.VENDAREST)));
INSERT INTO TEKNISA.COMANDAVEN VALUES ('0001','01', @nv, @nc, NULL, 'DLV_IFO', 'A');
INSERT INTO TEKNISA.ITCOMANDAVEN VALUES ('0001', @nv, @nc, '000001', 'P00000000003', 2, 'P');
"@
      [void]$cmd.Parameters.AddWithValue("@order", $Order)
      [void]$cmd.ExecuteNonQuery()
      "INSERTED $Order"
    }
  }
} finally { $c.Dispose() }

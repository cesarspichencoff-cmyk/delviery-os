<#
  Banco SINTETICO do harness do TATA Comanda Reader (SQL Server real, dados
  inventados). Recria o banco `teknisa` com as colunas que o watcher v1 le e
  um login de leitura com SELECT apenas nas quatro tabelas — o mesmo desenho
  de menor privilegio do leitor real. Nenhum dado real entra aqui.
#>
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][string]$SaPassword,
  [Parameter(Mandatory = $true)][string]$ReaderPassword,
  [int]$Orders = 60
)
$ErrorActionPreference = "Stop"
function Invoke-Sql([string]$Db, [string]$Sql) {
  $c = New-Object System.Data.SqlClient.SqlConnection("Server=$Server;Database=$Db;User ID=sa;Password=$SaPassword;Encrypt=False;TrustServerCertificate=True;Connect Timeout=10")
  $c.Open()
  try { $cmd = $c.CreateCommand(); $cmd.CommandTimeout = 120; $cmd.CommandText = $Sql; [void]$cmd.ExecuteNonQuery() } finally { $c.Dispose() }
}
Invoke-Sql "master" "IF DB_ID('teknisa') IS NOT NULL BEGIN ALTER DATABASE teknisa SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE teknisa; END; CREATE DATABASE teknisa;"
Invoke-Sql "master" "IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name='tata_reader_harness') DROP LOGIN tata_reader_harness; CREATE LOGIN tata_reader_harness WITH PASSWORD='$ReaderPassword', CHECK_POLICY=OFF, DEFAULT_DATABASE=teknisa;"
Invoke-Sql "teknisa" "CREATE SCHEMA TEKNISA;"
Invoke-Sql "teknisa" @"
CREATE TABLE TEKNISA.VENDAREST (CDFILIAL char(4) NOT NULL, NRVENDAREST char(10) NOT NULL, DTHRABERMESA datetime NULL, CONSTRAINT PK_VENDAREST PRIMARY KEY (CDFILIAL, NRVENDAREST));
CREATE TABLE TEKNISA.COMANDAVEN (CDFILIAL char(4) NOT NULL, CDLOJA char(2) NOT NULL, NRVENDAREST char(10) NOT NULL, NRCOMANDA char(10) NOT NULL, NRCOMANDAEXT varchar(30) NULL, IDORGCMDVENDA varchar(10) NOT NULL, IDSTCOMANDA char(1) NOT NULL, CONSTRAINT PK_COMANDAVEN PRIMARY KEY (CDFILIAL, NRVENDAREST, NRCOMANDA));
CREATE TABLE TEKNISA.ITCOMANDAVEN (CDFILIAL char(4) NOT NULL, NRVENDAREST char(10) NOT NULL, NRCOMANDA char(10) NOT NULL, NRPRODCOMVEN char(6) NOT NULL, CDPRODUTO char(12) NOT NULL, QTPRODCOMVEN decimal(12,3) NOT NULL, IDSTPRCOMVEN char(1) NOT NULL, CONSTRAINT PK_ITCOMANDAVEN PRIMARY KEY (CDFILIAL, NRVENDAREST, NRCOMANDA, NRPRODCOMVEN));
CREATE TABLE TEKNISA.PRODUTO (CDPRODUTO char(12) NOT NULL PRIMARY KEY, CDARVPROD varchar(16) NULL);
"@
$sb = New-Object System.Text.StringBuilder
for ($p = 1; $p -le 20; $p++) { [void]$sb.AppendLine(("INSERT INTO TEKNISA.PRODUTO VALUES ('{0}','{1}');" -f ("P" + $p.ToString("00000000000")), ("1000000" + $p.ToString("000")))) }
$base = [datetime]"2026-10-05T18:00:00"
for ($o = 1; $o -le $Orders; $o++) {
  $nv = (340000 + $o).ToString("0000000000"); $nc = (900000 + $o).ToString("0000000000")
  $org = @("DLV_IFO","DLV_IFO","DLV_IFO","DLV_NMO","DLV_FOS")[$o % 5]
  [void]$sb.AppendLine(("INSERT INTO TEKNISA.VENDAREST VALUES ('0001','{0}','{1}');" -f $nv, $base.AddMinutes($o).ToString("yyyy-MM-ddTHH:mm:ss")))
  [void]$sb.AppendLine(("INSERT INTO TEKNISA.COMANDAVEN VALUES ('0001','01','{0}','{1}',NULL,'{2}','A');" -f $nv, $nc, $org))
  for ($i = 1; $i -le 3; $i++) { [void]$sb.AppendLine(("INSERT INTO TEKNISA.ITCOMANDAVEN VALUES ('0001','{0}','{1}','{2}','{3}',{4},'P');" -f $nv, $nc, $i.ToString("000000"), ("P" + ((($o + $i) % 20) + 1).ToString("00000000000")), $i)) }
}
Invoke-Sql "teknisa" $sb.ToString()
Invoke-Sql "teknisa" @"
CREATE USER tata_reader_harness FOR LOGIN tata_reader_harness;
GRANT SELECT ON TEKNISA.VENDAREST TO tata_reader_harness;
GRANT SELECT ON TEKNISA.COMANDAVEN TO tata_reader_harness;
GRANT SELECT ON TEKNISA.ITCOMANDAVEN TO tata_reader_harness;
GRANT SELECT ON TEKNISA.PRODUTO TO tata_reader_harness;
"@
"SETUP_OK orders=$Orders"

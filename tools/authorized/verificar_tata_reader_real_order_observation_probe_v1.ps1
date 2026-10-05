param([string]$ProbePath)
$ErrorActionPreference="Stop"
if(-not (Test-Path -LiteralPath $ProbePath -PathType Leaf)){throw "PROBE_MISSING"}
$c=Get-Content -LiteralPath $ProbePath -Raw -Encoding UTF8
$t=$null;$e=$null
[System.Management.Automation.Language.Parser]::ParseInput($c,[ref]$t,[ref]$e)|Out-Null
if($e.Count -ne 0){throw ("SYNTAX:"+($e -join " | "))}
foreach($token in @(
  'READ_ONLY_EXACT_ORDER_OBSERVATION_FIELDS',
  'NT SERVICE\TataComandaReader',
  'CDFILIAL = "0001"',
  'CDLOJA = "01"',
  'NRVENDAREST = "0000349281"',
  'NRCOMANDA = "0000348850"',
  'DSOBSCOMANDA','DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN',
  'PROVEN_EXACT_ORDER_OBSERVATION_READ',
  'database_write = $false',
  'print = $false','fiscal_action = $false','cutover = $false'
)){if(-not $c.Contains($token)){throw ("REQUIRED_TOKEN:"+$token)}}
foreach($forbidden in @(
  'NMPRODUTO','NMCONSUMIDOR','NRTELEFONE','DSTELEFONE','DSENDERECO','NRCEP','CDCEP','PAGAMENTO',
  'INSERT ','UPDATE ','DELETE ','MERGE ','CREATE ','ALTER ','DROP ','GRANT ','DENY ','REVOKE ',
  'EXEC ','EXECUTE ','TRUNCATE ','DBCC ','sp_configure','xp_cmdshell',
  'Invoke-WebRequest','Invoke-RestMethod','System.Net.Http','Out-Printer','WritePrinter','StartDocPrinter','/print'
)){if($c.ToUpperInvariant().Contains($forbidden.ToUpperInvariant())){throw ("FORBIDDEN_SURFACE:"+$forbidden)}}
Write-Output "TATA_READER_OBSERVATION_PROBE_STATIC_PASS"

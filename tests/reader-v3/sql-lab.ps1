# Disposable loopback SQL lab ONLY. Never accepts a commercial endpoint or database.
param([string]$Fixture,[ValidateSet('setup','lock','remove','restore','deny-write')][string]$Op='setup')
$ErrorActionPreference='Stop'
if($env:TATA_HARNESS_SQLSERVER -notmatch '^127\.0\.0\.1,\d{4,5}$'){throw 'LOOPBACK_LAB_REQUIRED'}
$sa=$env:TATA_HARNESS_SA_PASSWORD
$reader=$env:READER_V3_LAB_PASSWORD
function Open([string]$db,[bool]$asReader=$false){
 $user=if($asReader){'reader_v3_lab'}else{'sa'};$pw=if($asReader){$reader}else{$sa}
 $c=New-Object Data.SqlClient.SqlConnection("Server=$env:TATA_HARNESS_SQLSERVER;Database=$db;User ID=$user;Password=$pw;Encrypt=False;TrustServerCertificate=True;Connect Timeout=5")
 $c.Open();return $c
}
function Execute($c,[string]$text){$q=$c.CreateCommand();try{$q.CommandTimeout=20;$q.CommandText=$text;[void]$q.ExecuteNonQuery()}finally{$q.Dispose()}}
if($Op -eq 'setup'){
 if($reader -notmatch '^[A-Za-z0-9!_-]{12,80}$'){throw 'LAB_PASSWORD_FORMAT'}
 $deadline=(Get-Date).AddSeconds(90);while($true){try{$c=Open 'master';break}catch{if((Get-Date)-gt $deadline){throw 'SQL_LAB_UNAVAILABLE'};Start-Sleep -Seconds 2}}
 try{Execute $c "IF DB_ID('reader_v3_lab') IS NOT NULL THROW 51000,'LAB_ALREADY_EXISTS',1; CREATE DATABASE reader_v3_lab;"
 Execute $c "CREATE LOGIN reader_v3_lab WITH PASSWORD='$reader',CHECK_POLICY=OFF,DEFAULT_DATABASE=reader_v3_lab;"}finally{$c.Dispose()}
 $c=Open 'reader_v3_lab'
 try{
  Execute $c 'CREATE SCHEMA TEKNISA;'
  $data=Get-Content -LiteralPath $Fixture -Raw|ConvertFrom-Json
  foreach($table in $data.PSObject.Properties){
   $rows=@($table.Value);$columns=@($rows[0].PSObject.Properties.Name)
   $defs=@($columns|ForEach-Object{if($_ -eq 'DTHRABERMESA'){"[$_] datetime NOT NULL"}else{"[$_] varchar(2000) NULL"}})
   Execute $c ('CREATE TABLE TEKNISA.['+$table.Name+'] ('+($defs -join ',')+');')
   foreach($row in $rows){$cmd=$c.CreateCommand();try{
    $params=@();$i=0;foreach($name in $columns){$pn='@p'+$i;$params+=$pn;$v=$row.$name
     $type=if($name -eq 'DTHRABERMESA'){[Data.SqlDbType]::DateTime}else{[Data.SqlDbType]::VarChar}
     [void]$cmd.Parameters.Add($pn,$type,2000);$cmd.Parameters[$pn].Value=if($null -eq $v){[DBNull]::Value}elseif($name -eq 'DTHRABERMESA'){[datetime]$v}else{[string]$v};$i++}
    $cmd.CommandText='INSERT INTO TEKNISA.['+$table.Name+'] VALUES ('+($params -join ',')+');';[void]$cmd.ExecuteNonQuery()
   }finally{$cmd.Dispose()}}
  }
  Execute $c 'CREATE USER reader_v3_lab FOR LOGIN reader_v3_lab; GRANT SELECT ON SCHEMA::TEKNISA TO reader_v3_lab;'
 }finally{$c.Dispose()}
 'LAB_SETUP_OK';exit
}
$c=Open 'reader_v3_lab' ($Op -eq 'deny-write')
try{
 switch($Op){
  'lock' {Execute $c "BEGIN TRAN; UPDATE TEKNISA.ITCOMANDAVEN SET IDSTPRCOMVEN=IDSTPRCOMVEN; WAITFOR DELAY '00:00:05'; ROLLBACK;"}
  'remove' {Execute $c "UPDATE TEKNISA.OCORRENCIA SET CDOCORR='HIDDEN' WHERE CDOCORR='O2';"}
  'restore' {Execute $c "UPDATE TEKNISA.OCORRENCIA SET CDOCORR='O2' WHERE CDOCORR='HIDDEN';"}
  'deny-write' {try{Execute $c "UPDATE TEKNISA.COMANDAVEN SET IDSTCOMANDA='P';";throw 'WRITE_WAS_ALLOWED'}catch{if($_.Exception.Message -like '*WRITE_WAS_ALLOWED*'){throw};'WRITE_DENIED'}}
 }
}finally{$c.Dispose()}

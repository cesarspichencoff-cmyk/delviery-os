# Persistent JSON-lines SQL read adapter; starts only under the existing service identity.
# No arbitrary SQL, connection string, user/password or endpoint from requests.
param()
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
if($identity -ine 'NT SERVICE\TataComandaReader'){throw 'SERVICE_IDENTITY_REQUIRED'}
$connectionString='Server=(local)\SQLEXPRESS;Database=teknisa;Integrated Security=SSPI;Application Name=TataReaderV3Shadow;Connect Timeout=5;Encrypt=False;TrustServerCertificate=True'
$conn=New-Object Data.SqlClient.SqlConnection($connectionString)
function Rows($cmd){
 $r=$cmd.ExecuteReader();$all=New-Object 'System.Collections.Generic.List[object]'
 try{do{$rows=New-Object 'System.Collections.Generic.List[object]';while($r.Read()){
  $o=[ordered]@{};for($i=0;$i -lt $r.FieldCount;$i++){$v=$r.GetValue($i)
   $o[$r.GetName($i)]=if($v -is [DBNull]){$null}elseif($v -is [datetime]){$v.ToString('yyyy-MM-ddTHH:mm:ss.fff',[Globalization.CultureInfo]::InvariantCulture)}else{[Convert]::ToString($v,[Globalization.CultureInfo]::InvariantCulture).TrimEnd()}
  };$rows.Add($o)
 };$all.Add(@($rows.ToArray()))}while($r.NextResult())}finally{$r.Close();$r.Dispose()};return ,$all.ToArray()
}
try{
 $conn.Open();$identityCmd=$conn.CreateCommand();$identityCmd.CommandText='SELECT ORIGINAL_LOGIN() AS login_name,DB_NAME() AS db_name;';$identityCmd.CommandTimeout=3
 $ir=Rows $identityCmd;$identityCmd.Dispose()
 if($ir[0][0].login_name -ine 'NT SERVICE\TataComandaReader' -or $ir[0][0].db_name -ine 'teknisa'){throw 'SQL_IDENTITY_REQUIRED'}
 while($null -ne ($line=[Console]::ReadLine())){
  $cmd=$null
  try{
   if($line.Length -gt 8192){throw 'REQUEST_BOUNDS'};$q=$line|ConvertFrom-Json
   $cmd=$conn.CreateCommand();$cmd.CommandTimeout=3
   if($q.op -eq 'discover'){
    $cmd.CommandText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'discover.sql'))
    foreach($n in @('after','until')){[void]$cmd.Parameters.Add('@'+$n,[Data.SqlDbType]::DateTime);$cmd.Parameters['@'+$n].Value=[datetime]::ParseExact([string]$q.$n,[string[]]@('yyyy-MM-ddTHH:mm:ss','yyyy-MM-ddTHH:mm:ss.fff'),[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None)}
    foreach($n in @('sale','order')){if([string]$q.$n -notmatch '^[A-Za-z0-9_-]{0,10}$'){throw 'KEY_INVALID'};[void]$cmd.Parameters.Add('@'+$n,[Data.SqlDbType]::VarChar,10);$cmd.Parameters['@'+$n].Value=[string]$q.$n}
    $sets=Rows $cmd;$answer=@($sets[0])
   }elseif($q.op -eq 'capture'){
    $cmd.CommandText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'capture.sql'))
    foreach($n in @('sale','order')){if([string]$q.$n -notmatch '^[A-Za-z0-9_-]{1,10}$'){throw 'KEY_INVALID'};[void]$cmd.Parameters.Add('@'+$n,[Data.SqlDbType]::VarChar,10);$cmd.Parameters['@'+$n].Value=[string]$q.$n}
    $sets=Rows $cmd;if($sets.Count -ne 8){throw 'ROWSET_COUNT'}
    $children=[ordered]@{};$names=@('ITCOMANDAVEN_COMBO','ITCOMANDAEST','OBSITCOMANDAVEN','OBSITCOMANDAEST','OCORRENCIA','PRODUTO')
    for($i=0;$i -lt 6;$i++){$rs=@($sets[$i+2]);$children[$names[$i]]=@{rows=$rs;totalRows=$rs.Count;readExhausted=$true}}
    $answer=@{headerRows=@($sets[0]);itemRows=@($sets[1]);readExhausted=$true;childRows=$children}
   }else{throw 'OP_FORBIDDEN'}
   [Console]::WriteLine((@{ok=$true;value=$answer}|ConvertTo-Json -Compress -Depth 30))
  }catch{
   $ex=$_.Exception;while($null -ne $ex.InnerException){$ex=$ex.InnerException};$code='SQL_CAPTURE_FAILED';if($ex.Number -eq 1222){$code='LOCK_TIMEOUT'}elseif($ex.Number -eq -2){$code='QUERY_TIMEOUT'}
   # Never return SQL text, identifiers, customer observations or driver messages.
   [Console]::WriteLine((@{ok=$false;code=$code}|ConvertTo-Json -Compress))
  }finally{if($null -ne $cmd){$cmd.Dispose()}}
 }
}finally{$conn.Dispose()}

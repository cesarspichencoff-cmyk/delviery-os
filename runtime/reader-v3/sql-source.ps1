# Persistent JSON-lines SQL read adapter; starts only under the existing service identity.
# No arbitrary SQL, connection string, user/password or endpoint from requests.
param()
$ErrorActionPreference='Stop'
function Rows($cmd){
 $r=$cmd.ExecuteReader();$all=New-Object 'System.Collections.Generic.List[object]'
 try{do{$rows=New-Object 'System.Collections.Generic.List[object]';while($r.Read()){
  $o=[ordered]@{};for($i=0;$i -lt $r.FieldCount;$i++){$v=$r.GetValue($i)
   $o[$r.GetName($i)]=if($v -is [DBNull]){$null}elseif($v -is [datetime]){$v.ToString('yyyy-MM-ddTHH:mm:ss.fff',[Globalization.CultureInfo]::InvariantCulture)}else{[Convert]::ToString($v,[Globalization.CultureInfo]::InvariantCulture).TrimEnd()}
  };$rows.Add($o)
 };$all.Add(@($rows.ToArray()))}while($r.NextResult())}catch{$failure=$_;try{$cmd.Cancel()}catch{};try{$r.Dispose()}catch{};throw $failure}finally{if(-not $r.IsClosed){$r.Dispose()}};return ,$all.ToArray()
}
$startup='SQL_BOOT_STDIO_FAILED'
$conn=$null
try{
 [Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
 [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
 $startup='SQL_BOOT_WINDOWS_IDENTITY_FAILED'
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
 if($identity -ine 'NT SERVICE\TataComandaReader'){throw 'SERVICE_IDENTITY_REQUIRED'}
 $startup='SQL_BOOT_CONNECT_FAILED'
 $connectionString='Server=(local)\SQLEXPRESS;Database=teknisa;Integrated Security=SSPI;Application Name=TataReaderV3Shadow;Connect Timeout=5;Encrypt=False;TrustServerCertificate=True'
 $conn=New-Object Data.SqlClient.SqlConnection($connectionString)
 $conn.Open()
 $startup='SQL_BOOT_LOGIN_CHECK_FAILED'
 $identityCmd=$conn.CreateCommand();$identityCmd.CommandText='SELECT ORIGINAL_LOGIN() AS login_name,DB_NAME() AS db_name;';$identityCmd.CommandTimeout=3
 $ir=Rows $identityCmd;$identityCmd.Dispose()
 $startup='SQL_BOOT_LOGIN_MISMATCH'
 if($ir[0][0].login_name -ine 'NT SERVICE\TataComandaReader' -or $ir[0][0].db_name -ine 'teknisa'){throw 'SQL_IDENTITY_REQUIRED'}
 $startup='SQL_PROTOCOL_STOPPED'
 while($null -ne ($line=[Console]::ReadLine())){
  $cmd=$null
  try{
   if($line.Length -gt 8192){throw 'REQUEST_BOUNDS'};$q=$line|ConvertFrom-Json
   $cmd=$conn.CreateCommand();$cmd.CommandTimeout=3
   if($q.op -eq 'discover'){
    $cmd.CommandText=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'discover.sql'))
    foreach($n in @('after','until')){[void]$cmd.Parameters.Add('@'+$n,[Data.SqlDbType]::DateTime);$dateText=if($q.$n -is [datetime]){$q.$n.ToString('yyyy-MM-ddTHH:mm:ss.fff',[Globalization.CultureInfo]::InvariantCulture)}else{[string]$q.$n};$cmd.Parameters['@'+$n].Value=[datetime]::ParseExact($dateText,[string[]]@('yyyy-MM-ddTHH:mm:ss','yyyy-MM-ddTHH:mm:ss.fff'),[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None)}
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
   $ex=$_.Exception;$code='SQL_CAPTURE_FAILED';while($null -ne $ex){if($ex.Number -eq 1222){$code='LOCK_TIMEOUT';break}elseif($ex.Number -eq -2){$code='QUERY_TIMEOUT';break};$ex=$ex.InnerException}
   # Never return SQL text, identifiers, customer observations or driver messages.
   [Console]::WriteLine((@{ok=$false;code=$code}|ConvertTo-Json -Compress))
  }finally{if($null -ne $cmd){$cmd.Dispose()}}
 }
}catch{
 # Static classifications only. Driver strings can contain private paths or connection details.
 [Console]::Error.WriteLine('READER_V3_STARTUP '+$startup)
 exit 1
}finally{if($null -ne $conn){$conn.Dispose()}}

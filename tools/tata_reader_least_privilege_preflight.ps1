param(
  [string]$Server = "192.168.0.24\SQLEXPRESS",
  [string]$Database = "teknisa",
  [string]$ExpectedPrincipal = "NT SERVICE\TataComandaReader",
  [switch]$AllowDsComanda
)

$ErrorActionPreference = "Stop"

# Metadata/permission checks only.
# No order rows, no writes, no EXECUTE, no HTTP.
# Designed for column-level SELECT grants.

$allowed = [ordered]@{
  COMANDAVEN = @("CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA","NRCOMANDAEXT","IDORGCMDVENDA","IDSTCOMANDA","DSOBSCOMANDA")
  ITCOMANDAVEN = @("CDFILIAL","NRVENDAREST","NRCOMANDA","NRPRODCOMVEN","CDPRODUTO","QTPRODCOMVEN","IDSTPRCOMVEN","DSOBSDESCIT","DSOBSPEDDIGCMD","TXPRODCOMVEN")
  PRODUTO = @("CDPRODUTO","NMPRODUTO")
  VENDAREST = @("CDFILIAL","NRVENDAREST","DTHRABERMESA")
}
if ($AllowDsComanda) { $allowed.COMANDAVEN += "DSCOMANDA" }

$result = [ordered]@{
  schema = "deliveryos.tata-reader-least-privilege-preflight.v1"
  mode = "WINDOWS_INTEGRATED_AUTH_COLUMN_LEVEL_METADATA_ONLY"
  server = $Server
  database = $Database
  expected_principal = $ExpectedPrincipal
  current_login = $null
  original_login = $null
  current_user = $null
  database_matches = $false
  server_roles = [ordered]@{}
  database_roles = [ordered]@{}
  database_permissions = [ordered]@{}
  executable_procedure_count = $null
  objects = @()
  safe_for_minimized_order_read = $false
  blocker = $null
  effects = [ordered]@{
    order_row_read = $false
    database_write = $false
    ddl = $false
    execute = $false
    http = $false
    print = $false
    file_write = $false
  }
}

$cs = "Server=$Server;Database=$Database;Integrated Security=SSPI;Application Name=TataReaderLeastPrivilegePreflight;Connect Timeout=5;Encrypt=False;TrustServerCertificate=True"
$conn = New-Object System.Data.SqlClient.SqlConnection $cs

function BoolFromReader($r,[string]$name) {
  if ($r[$name] -is [DBNull]) { return $null }
  return ([int]$r[$name] -eq 1)
}

try {
  $conn.Open()

  $idCmd=$conn.CreateCommand()
  $idCmd.CommandText = @"
SET NOCOUNT ON;
SELECT
  SUSER_SNAME() AS current_login,
  ORIGINAL_LOGIN() AS original_login,
  USER_NAME() AS current_user,
  CASE WHEN DB_NAME()=@expected_db THEN 1 ELSE 0 END AS database_matches;
"@
  $null=$idCmd.Parameters.Add("@expected_db",[System.Data.SqlDbType]::NVarChar,128)
  $idCmd.Parameters["@expected_db"].Value=$Database
  $r=$idCmd.ExecuteReader()
  $null=$r.Read()
  $result.current_login=[string]$r["current_login"]
  $result.original_login=[string]$r["original_login"]
  $result.current_user=[string]$r["current_user"]
  $result.database_matches=BoolFromReader $r "database_matches"
  $r.Close()

  foreach($role in @("sysadmin","securityadmin","serveradmin","setupadmin","processadmin","diskadmin","dbcreator","bulkadmin")) {
    $c=$conn.CreateCommand()
    $c.CommandText="SELECT IS_SRVROLEMEMBER(@role)"
    $null=$c.Parameters.Add("@role",[System.Data.SqlDbType]::NVarChar,128)
    $c.Parameters["@role"].Value=$role
    $v=$c.ExecuteScalar()
    $result.server_roles[$role]=if($v -is [DBNull]){$null}else{([int]$v -eq 1)}
  }

  foreach($role in @("db_owner","db_datareader","db_datawriter","db_ddladmin","db_securityadmin","db_accessadmin","db_backupoperator")) {
    $c=$conn.CreateCommand()
    $c.CommandText="SELECT IS_MEMBER(@role)"
    $null=$c.Parameters.Add("@role",[System.Data.SqlDbType]::NVarChar,128)
    $c.Parameters["@role"].Value=$role
    $v=$c.ExecuteScalar()
    $result.database_roles[$role]=if($v -is [DBNull]){$null}else{([int]$v -eq 1)}
  }

  foreach($perm in @("SELECT","INSERT","UPDATE","DELETE","EXECUTE","ALTER","CONTROL","VIEW DEFINITION","VIEW DATABASE STATE")) {
    $c=$conn.CreateCommand()
    $c.CommandText="SELECT HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE',@perm)"
    $null=$c.Parameters.Add("@perm",[System.Data.SqlDbType]::NVarChar,128)
    $c.Parameters["@perm"].Value=$perm
    $v=$c.ExecuteScalar()
    $result.database_permissions[$perm]=if($v -is [DBNull]){$null}else{([int]$v -eq 1)}
  }

  $pc=$conn.CreateCommand()
  $pc.CommandText = @"
SELECT COUNT_BIG(*)
FROM sys.procedures p
JOIN sys.schemas s ON s.schema_id=p.schema_id
WHERE HAS_PERMS_BY_NAME(s.name+'.'+p.name,'OBJECT','EXECUTE')=1;
"@
  $result.executable_procedure_count=[int64]$pc.ExecuteScalar()

  foreach($objectName in $allowed.Keys) {
    $oc=$conn.CreateCommand()
    $oc.CommandText = @"
SELECT s.name AS schema_name,o.name AS object_name,o.type_desc,
  HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','SELECT') AS object_select,
  HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','INSERT') AS object_insert,
  HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','UPDATE') AS object_update,
  HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','DELETE') AS object_delete,
  HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','ALTER') AS object_alter,
  HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','CONTROL') AS object_control,
  HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','TAKE OWNERSHIP') AS object_take_ownership
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id=o.schema_id
WHERE o.name=@object_name AND o.type IN ('U','V')
ORDER BY s.name;
"@
    $null=$oc.Parameters.Add("@object_name",[System.Data.SqlDbType]::NVarChar,128)
    $oc.Parameters["@object_name"].Value=$objectName

    $rows=@()
    $rr=$oc.ExecuteReader()
    while($rr.Read()){
      $rows += [ordered]@{
        schema=[string]$rr["schema_name"]
        name=[string]$rr["object_name"]
        type=[string]$rr["type_desc"]
        object_select=BoolFromReader $rr "object_select"
        object_insert=BoolFromReader $rr "object_insert"
        object_update=BoolFromReader $rr "object_update"
        object_delete=BoolFromReader $rr "object_delete"
        object_alter=BoolFromReader $rr "object_alter"
        object_control=BoolFromReader $rr "object_control"
        object_take_ownership=BoolFromReader $rr "object_take_ownership"
      }
    }
    $rr.Close()

    if($rows.Count -ne 1){
      $result.objects += [ordered]@{
        requested_name=$objectName
        resolved=$false
        match_count=$rows.Count
        safe=$false
      }
      continue
    }

    $obj=$rows[0]
    $cc=$conn.CreateCommand()
    $cc.CommandText = @"
SELECT c.name AS column_name,
  HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','SELECT',c.name,'COLUMN') AS can_select,
  HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','UPDATE',c.name,'COLUMN') AS can_update
FROM sys.columns c
JOIN sys.objects o ON o.object_id=c.object_id
JOIN sys.schemas s ON s.schema_id=o.schema_id
WHERE s.name=@schema_name AND o.name=@object_name
ORDER BY c.column_id;
"@
    $null=$cc.Parameters.Add("@schema_name",[System.Data.SqlDbType]::NVarChar,128)
    $cc.Parameters["@schema_name"].Value=$obj.schema
    $null=$cc.Parameters.Add("@object_name",[System.Data.SqlDbType]::NVarChar,128)
    $cc.Parameters["@object_name"].Value=$obj.name

    $cr=$cc.ExecuteReader()
    $columns=@()
    while($cr.Read()){
      $columns += [ordered]@{
        name=[string]$cr["column_name"]
        select=BoolFromReader $cr "can_select"
        update=BoolFromReader $cr "can_update"
      }
    }
    $cr.Close()

    $required=@($allowed[$objectName])
    $allNames=@($columns | ForEach-Object {$_.name})
    $missingRequired=@($required | Where-Object { $_ -notin $allNames })
    $requiredWithoutSelect=@($columns | Where-Object { $_.name -in $required -and $_.select -ne $true } | ForEach-Object {$_.name})
    $extraReadable=@($columns | Where-Object { $_.name -notin $required -and $_.select -eq $true } | ForEach-Object {$_.name})
    $writableColumns=@($columns | Where-Object { $_.update -eq $true } | ForEach-Object {$_.name})

    $objectWrite =
      $obj.object_insert -or
      $obj.object_update -or
      $obj.object_delete -or
      $obj.object_alter -or
      $obj.object_control -or
      $obj.object_take_ownership

    $safe =
      (-not $obj.object_select) -and
      (-not $objectWrite) -and
      $missingRequired.Count -eq 0 -and
      $requiredWithoutSelect.Count -eq 0 -and
      $extraReadable.Count -eq 0 -and
      $writableColumns.Count -eq 0

    $result.objects += [ordered]@{
      requested_name=$objectName
      resolved=$true
      schema=$obj.schema
      name=$obj.name
      type=$obj.type
      object_permissions=[ordered]@{
        select=$obj.object_select
        insert=$obj.object_insert
        update=$obj.object_update
        delete=$obj.object_delete
        alter=$obj.object_alter
        control=$obj.object_control
        take_ownership=$obj.object_take_ownership
      }
      required_columns=$required
      missing_required_columns=$missingRequired
      required_without_select=$requiredWithoutSelect
      extra_readable_columns=$extraReadable
      writable_columns=$writableColumns
      safe=$safe
    }
  }

  $anyServerRole=@($result.server_roles.Values | Where-Object { $_ -eq $true }).Count -gt 0
  $anyDbRole=@($result.database_roles.Values | Where-Object { $_ -eq $true }).Count -gt 0
  $broadDbPerm=@($result.database_permissions.GetEnumerator() | Where-Object { $_.Value -eq $true }).Count -gt 0
  $allObjectsSafe=
    $result.objects.Count -eq $allowed.Keys.Count -and
    @($result.objects | Where-Object { -not $_.safe }).Count -eq 0

  if(-not $result.database_matches){$result.blocker="DATABASE_MISMATCH"}
  elseif($result.current_login -ne $ExpectedPrincipal){$result.blocker="UNEXPECTED_WINDOWS_PRINCIPAL"}
  elseif($anyServerRole){$result.blocker="SERVER_ROLE_PRESENT"}
  elseif($anyDbRole){$result.blocker="DATABASE_ROLE_PRESENT"}
  elseif($broadDbPerm){$result.blocker="BROAD_DATABASE_PERMISSION_PRESENT"}
  elseif($result.executable_procedure_count -gt 0){$result.blocker="EXECUTABLE_PROCEDURE_PRESENT"}
  elseif(-not $allObjectsSafe){$result.blocker="COLUMN_SURFACE_NOT_EXACT"}
  else{$result.safe_for_minimized_order_read=$true}
}
catch {
  $result.blocker="CONNECTION_OR_METADATA_FAILED"
  $result.error=$_.Exception.Message
}
finally {
  if($conn.State -ne [System.Data.ConnectionState]::Closed){$conn.Close()}
}

$result | ConvertTo-Json -Depth 12
if(-not $result.safe_for_minimized_order_read){exit 3}
exit 0

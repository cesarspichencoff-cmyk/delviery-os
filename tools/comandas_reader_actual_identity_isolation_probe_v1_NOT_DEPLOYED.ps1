#requires -Version 5.1
<#
  TATÁ ITAIM Reader SQL metadata - NOT DEPLOYED.
  Read-only, one-shot; never run in the cashier's interactive user session.
  Requires an approved way to execute from the EXISTING authorised Reader
  service process or its explicitly verified service account.
  Do not change ACL, service control, Task Scheduler, RCSI, credentials or SQL.
  This code is only a candidate for separate change control.
#>
param([ValidateSet('ReadOnlyMetadata')][string]$Mode='ReadOnlyMetadata')
$ErrorActionPreference='Stop'
function Fail([string]$Code,[int]$ExitCode) {
  [pscustomobject]@{
    schema='tata.reader.sql-isolation-actual-identity-proof.v1'
    status='HOLD'
    reason=$Code
    sqlExecuted=$false
    ordersRead=0
    sourceIdentityProven=$false
    printAuthorized=$false
  } | ConvertTo-Json -Compress
  exit $ExitCode
}
# Validate everything before even constructing the connection.
if($env:COMPUTERNAME -cne 'CAIXA_MOOCA') { Fail 'WRONG_HOST_NO_SQL' 61 }
$actual=[Security.Principal.WindowsIdentity]::GetCurrent().Name
if(-not [string]::Equals($actual,'NT SERVICE\TataComandaReader',
      [StringComparison]::OrdinalIgnoreCase)) {
  Fail 'WRONG_PROCESS_IDENTITY_NO_SQL' 62
}
if($Mode -ne 'ReadOnlyMetadata') { Fail 'INVALID_MODE_NO_SQL' 63 }
$conn=$null
try {
  $connectionString='Server=(local)\SQLEXPRESS;Database=TEKNISA;Integrated Security=SSPI;Application Name=TataReaderIsolationOneShotV1;Connect Timeout=3;Encrypt=False;TrustServerCertificate=True;ApplicationIntent=ReadOnly;Pooling=False'
  $conn=New-Object System.Data.SqlClient.SqlConnection($connectionString)
  $conn.Open()
  # Metadata ONLY: no order SELECT, no DML/DDL, no option change, no transaction.
  $command=$conn.CreateCommand()
  $command.CommandTimeout=4
  $command.CommandText=@'
SELECT
 DB_NAME() AS current_database,
 SUSER_SNAME() AS current_login,
 d.is_read_committed_snapshot_on AS rcsi_on,
 d.snapshot_isolation_state_desc AS snapshot_state
FROM sys.databases AS d
WHERE d.database_id=DB_ID()
'@
  $reader=$command.ExecuteReader([Data.CommandBehavior]::SingleRow)
  if(-not $reader.Read()) { throw 'NO_DATABASE_METADATA' }
  $db=[string]$reader['current_database']
  $login=[string]$reader['current_login']
  $rcsi=[int]$reader['rcsi_on']
  $snapshot=[string]$reader['snapshot_state']
  if($reader.Read()) { throw 'MULTIPLE_METADATA_ROWS' }
  $reader.Close()
  if(-not [string]::Equals($db,'TEKNISA',[StringComparison]::OrdinalIgnoreCase) -or
     -not [string]::Equals($login,'NT SERVICE\TataComandaReader',
         [StringComparison]::OrdinalIgnoreCase) -or
     $rcsi -notin @(0,1) -or
     $snapshot -notin @('ON','OFF','IN_TRANSITION_TO_ON','IN_TRANSITION_TO_OFF')){
    throw 'SQL_IDENTITY_OR_METADATA_MISMATCH'
  }
  [pscustomobject]@{
    schema='tata.reader.sql-isolation-actual-identity-proof.v1'
    status='METADATA_OBSERVED_NOT_LIVE_ORDER_PROOF'
    host='CAIXA_MOOCA'
    scope='ITAIM'
    databaseMatchesExpected=$true
    sqlIntegratedLoginMatchesExpected=$true
    windowsIdentityMatchesExpected=$true
    rcsiOn=($rcsi -eq 1)
    snapshotIsolationState=$snapshot
    observedAtUtc=[DateTime]::UtcNow.ToString('o')
    sqlReadOnly=$true
    metadataStatementCount=1
    ordersRead=0
    sourceRevisionAuthenticated=$false
    orderObservationsProven=$false
    independentIfoodIdentityProven=$false
    printAuthorized=$false
  } | ConvertTo-Json -Compress
} catch {
  # Fail closed, no raw exception messages / server details exported.
  [pscustomobject]@{
    schema='tata.reader.sql-isolation-actual-identity-proof.v1'
    status='HOLD'
    reason='SQL_METADATA_PROBE_FAILED'
    sqlExecutionAttempted=($null -ne $conn)
    ordersRead=0
    printAuthorized=$false
  } | ConvertTo-Json -Compress
  exit 64
} finally {
  if($null -ne $conn){
    try {$conn.Close();$conn.Dispose()}catch {}
  }
}

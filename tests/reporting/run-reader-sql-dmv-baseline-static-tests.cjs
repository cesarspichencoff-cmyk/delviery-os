'use strict';
// Static adversarial source audit. It does not run PowerShell, SQL, or Windows.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const script=fs.readFileSync(path.join(__dirname,'../../labs/reader-proof/ReaderSqlDmvBaselineReviewOnly.ps1'),'utf8');
function inspect(s){
 const faults=[];
 const requireText=(text,key)=>{if(!s.includes(text))faults.push(key)};
 requireText("$env:COMPUTERNAME -cne 'CAIXA_MOOCA'",'HOST_REQUIRED');
 requireText("FindSystemTimeZoneById('E. South America Standard Time')",'BRT_TIMEZONE_REQUIRED');
 requireText('$minutes -ge 660 -and $minutes -lt $lunchEnd','LUNCH_GATE_REQUIRED');
 requireText('$minutes -ge 1080 -and $minutes -lt 1380','DINNER_GATE_REQUIRED');
 requireText('if($isWeekend){$lunchEnd=990}','WEEKEND_CLOSING_REQUIRED');
 requireText("Emit-Hold 'OUTSIDE_SERVICE_WINDOW'",'OUTSIDE_HOLD_REQUIRED');
 requireText('reader-heartbeat-v1.json','HEARTBEAT_REQUIRED');
 requireText("$hb.state -cne 'RUNNING'",'READER_STATE_REQUIRED');
 requireText('$hb.watcher.sha256_verified -ne $true','WATCHER_PIN_REQUIRED');
 requireText('$age -gt 60','HEARTBEAT_FRESHNESS_REQUIRED');
 requireText('Application Name=DeliveryOSL1DmvOnly;Pooling=False','NONPOOLED_REQUIRED');
 requireText('Integrated Security=SSPI','WINDOWS_SQL_IDENTITY_REQUIRED');
 requireText('$cmd.CommandTimeout=4','COMMAND_TIMEOUT_REQUIRED');
 requireText('SET LOCK_TIMEOUT 300;','LOCK_TIMEOUT_REQUIRED');
 requireText('SET DEADLOCK_PRIORITY LOW;','LOW_DEADLOCK_PRIORITY_REQUIRED');
 requireText("CAIXA_MOOCA\\Tata'","EXACT_AUDITOR_IDENTITY_REQUIRED");
 requireText("Emit-Hold 'BLOCKING_OR_LOCK_WAIT_OBSERVED'",'ABORT_ON_WAIT_REQUIRED');
 requireText('for($i=0;$i -lt 3;$i++)','THREE_SAMPLES_REQUIRED');
 requireText('[Threading.Thread]::Sleep(300)','SAMPLING_CADENCE_REQUIRED');
 requireText("Emit-Hold 'SERVICE_WINDOW_DMV_BASELINE_COLLECTED_NOT_PILOT_AUTHORIZED'",'NO_PILOT_REQUIRED');
 for(const gate of ['sqlOrderRowsRead=0','databaseWrites=0',
  'serializablePilotExecuted=$false','printingExecuted=$false',
  'homePublishAuthorized=$false','atomicityProven=$false',
  'orderEventsPublishable=0'])requireText(gate,'MISSING_HOLD_'+gate);
 const scope=s.match(/# SQL_SCOPE_BEGIN[\s\S]*?\$cmd\.CommandText=@'\s*\n([\s\S]*?)\n'@\s*\n\s*# SQL_SCOPE_END/);
 if(!scope)faults.push('SQL_SCOPE_MISSING');
 else{
  const sql=scope[1];
  for(const source of ['sys.dm_exec_sessions','sys.dm_exec_requests',
  'sys.dm_os_waiting_tasks','sys.dm_tran_locks'])
   if(!sql.includes(source))faults.push('DMV_SOURCE_MISSING_'+source);
  if(/(?:FROM|JOIN)\s+(?:\[?TEKNISA\[?\]?\.|\[?dbo\]?\.)/i.test(sql))
   faults.push('BUSINESS_TABLE_SOURCE_FORBIDDEN');
  if(/\b(?:INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|MERGE\s+INTO|ALTER\s+(?:DATABASE|TABLE)|CREATE\s+TABLE|EXEC(?:UTE)?\s+|DROP\s+TABLE)\b/i.test(sql))
   faults.push('SQL_MUTATION_OR_EXECUTION_FORBIDDEN');
  if(/SET\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+SERIALIZABLE/i.test(sql))
   faults.push('SERIALIZABLE_FORBIDDEN');
  if(/\b(?:NOLOCK|HOLDLOCK|UPDLOCK|TABLOCK|XLOCK)\b/i.test(sql))
   faults.push('LOCKING_HINT_FORBIDDEN');
  if(!sql.includes("r.session_id<>@@SPID"))
   faults.push('SELF_EXCLUSION_REQUIRED');
 }
 if((s.match(/\$cmd\.CommandText=/g)||[]).length!==1)faults.push('ONE_SQL_BATCH_ONLY');
 if(/\b(?:Set-Content|Add-Content|Out-File|New-Item|Start-Process|Invoke-WebRequest|Register-ScheduledTask|Start-Service|Stop-Service|Remove-Item|Start-Transcript)\b/i.test(s))
  faults.push('SIDE_EFFECT_COMMAND_FORBIDDEN');
 return faults;
}
let n=0;function test(label,fn){fn();n++;console.log('PASS '+label)}
test('source has complete fail-closed metadata-only scope',()=>{
 assert.deepEqual(inspect(script),[]);
});
function wrong(label,a,b,expected){
 test(label,()=>{
  assert.ok(script.includes(a),'test mutation must match original source: '+label);
  const faults=inspect(script.replace(a,b));
  assert.ok(faults.includes(expected),label+' '+JSON.stringify(faults));
 });
}
wrong('not allowed to run outside Itaim cashier',"$env:COMPUTERNAME -cne 'CAIXA_MOOCA'","$env:COMPUTERNAME -cne 'ANYWHERE'",'HOST_REQUIRED');
wrong('not allowed to skip BRT service window',"Emit-Hold 'OUTSIDE_SERVICE_WINDOW'","Write-Output 'NO_GATE'",'OUTSIDE_HOLD_REQUIRED');
wrong('not allowed to widen weekend hours to overnight','if($isWeekend){$lunchEnd=990}','if($isWeekend){$lunchEnd=1439}','WEEKEND_CLOSING_REQUIRED');
wrong('not allowed to ignore stale Reader heartbeat','$age -gt 60','$age -gt 99999','HEARTBEAT_FRESHNESS_REQUIRED');
wrong('not allowed to skip watcher integrity check','$hb.watcher.sha256_verified -ne $true','$false','WATCHER_PIN_REQUIRED');
wrong('not allowed to use connection pooling','Application Name=DeliveryOSL1DmvOnly;Pooling=False','Application Name=DeliveryOSL1DmvOnly;Pooling=True','NONPOOLED_REQUIRED');
wrong('not allowed to read the orders table', 'FROM sys.dm_exec_requests r','FROM TEKNISA.COMANDAVEN r','BUSINESS_TABLE_SOURCE_FORBIDDEN');
wrong('not allowed to start explicit serializable isolation','SET NOCOUNT ON;','SET NOCOUNT ON;\nSET TRANSACTION ISOLATION LEVEL SERIALIZABLE;','SERIALIZABLE_FORBIDDEN');
wrong('not allowed to execute DML','SET NOCOUNT ON;','INSERT INTO TEKNISA.COMANDAVEN VALUES(1);\nSET NOCOUNT ON;','SQL_MUTATION_OR_EXECUTION_FORBIDDEN');
wrong('not allowed to acquire HOLDLOCK','SET NOCOUNT ON;','SET NOCOUNT ON;\nSELECT * FROM TEKNISA.COMANDAVEN WITH (HOLDLOCK);','BUSINESS_TABLE_SOURCE_FORBIDDEN');
wrong('not allowed to sample 30 times','for($i=0;$i -lt 3;$i++)','for($i=0;$i -lt 30;$i++)','THREE_SAMPLES_REQUIRED');
wrong('not allowed to hide blocking waits',"Emit-Hold 'BLOCKING_OR_LOCK_WAIT_OBSERVED'","Emit-Hold 'ALL_OK'",'ABORT_ON_WAIT_REQUIRED');
wrong('not allowed to remove Home publication hold','homePublishAuthorized=$false','homePublishAuthorized=$true','MISSING_HOLD_homePublishAuthorized=$false');
wrong('not allowed to install tasks','if($i -lt 2){[Threading.Thread]::Sleep(300)}',
 "Register-ScheduledTask -TaskName 'Danger'; if($i -lt 2){[Threading.Thread]::Sleep(300)}",'SIDE_EFFECT_COMMAND_FORBIDDEN');
wrong('not allowed to expand command timeout','$cmd.CommandTimeout=4','$cmd.CommandTimeout=120','COMMAND_TIMEOUT_REQUIRED');
console.log('READER_SQL_DMV_BASELINE_STATIC_PASS '+n+'/'+n+' NO_SQL_NO_HOST');

'use strict';
// Pure, offline gate of the NOT-DEPLOYED Reader SQL metadata probe.
// The child script MUST refuse Foxxy before constructing SqlConnection.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const script=path.join(__dirname,'comandas_reader_actual_identity_isolation_probe_v1_NOT_DEPLOYED.ps1');
assert.notEqual(os.hostname().toUpperCase(),'CAIXA_MOOCA','CASHIER_EXECUTION_FORBIDDEN');
const code=fs.readFileSync(script,'utf8');
const lines=code.split(/\r?\n/);
const beforeConnection=code.indexOf("New-Object System.Data.SqlClient.SqlConnection");
const guardHost=code.indexOf("if($env:COMPUTERNAME -cne 'CAIXA_MOOCA')");
const guardUser=code.indexOf("WindowsIdentity]::GetCurrent()");
const sql=code.indexOf('SELECT\n DB_NAME()');
assert.ok(guardHost>=0&&guardUser>guardHost&&beforeConnection>guardUser);
assert.ok(sql>beforeConnection);
assert.ok(!/\b(ALTER DATABASE|CREATE LOGIN|GRANT|REVOKE|DENY|DROP TABLE|UPDATE TEKNISA|DELETE FROM TEKNISA)\b/i.test(code));
assert.ok(code.includes("ApplicationIntent=ReadOnly"));
assert.ok(code.includes("metadataStatementCount=1"));
assert.ok(code.includes("ordersRead=0"));
assert.ok(code.includes("printAuthorized=$false"));
const run=spawnSync('powershell.exe',[
 '-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass',
 '-File',script,'-Mode','ReadOnlyMetadata'
],{encoding:'utf8',timeout:10000,windowsHide:true});
assert.equal(run.status,61,'FOXYY_WRONG_HOST_EXIT_CODE_EXPECTED '+String(run.stderr).slice(0,300));
const response=JSON.parse(run.stdout.trim());
assert.equal(response.status,'HOLD');
assert.equal(response.reason,'WRONG_HOST_NO_SQL');
assert.equal(response.sqlExecuted,false);
assert.equal(response.ordersRead,0);
assert.equal(response.sourceIdentityProven,false);
assert.equal(response.printAuthorized,false);
assert.equal(run.stderr.trim(),'');
// Adversarial host-name spoof in the CHILD process only, never on the machine.
const spoof=spawnSync('powershell.exe',[
 '-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass',
 '-File',script,'-Mode','ReadOnlyMetadata'
],{encoding:'utf8',timeout:10000,windowsHide:true,
 env:{...process.env,COMPUTERNAME:'CAIXA_MOOCA'}});
assert.equal(spoof.status,62,'SPOOFED_HOST_MUST_NOT_PASS_ACTUAL_WINDOWS_IDENTITY');
const spoofed=JSON.parse(spoof.stdout.trim());
assert.equal(spoofed.reason,'WRONG_PROCESS_IDENTITY_NO_SQL');
assert.equal(spoofed.sqlExecuted,false);
assert.equal(spoofed.printAuthorized,false);
assert.equal(spoof.stderr.trim(),'');
let t=0;
const ok=(k,v)=>{assert.ok(v,k);t++};
ok('host check happens before connection',guardHost<beforeConnection);
ok('identity check happens before connection',guardUser<beforeConnection);
ok('SQL command only after checks',sql>beforeConnection);
ok('attempt protected by read-only application intent',code.includes('ApplicationIntent=ReadOnly'));
ok('only SQL metadata fields queried',code.includes('d.is_read_committed_snapshot_on')&&code.includes('d.snapshot_isolation_state_desc'));
ok('operational data forbidden',!code.includes('FROM TEKNISA.COMANDAVEN'));
ok('no DML/DDL',!/\b(ALTER DATABASE|CREATE LOGIN|GRANT|UPDATE TEKNISA|DELETE FROM)\b/i.test(code));
ok('fails safely on Foxxy',response.reason==='WRONG_HOST_NO_SQL');
ok('no SQL attempted',response.sqlExecuted===false);
ok('no new print authorization',response.printAuthorized===false);
ok('host spoof cannot bypass actual Windows identity',spoofed.reason==='WRONG_PROCESS_IDENTITY_NO_SQL');
ok('spoofed host never opens SQL',spoofed.sqlExecuted===false);
console.log('READER_EXISTING_IDENTITY_METADATA_PROBE_OFFLINE_PASS '+t+'/'+t+
 ' FOXYY_REFUSED_BEFORE_SQL NO_CASHIER_TERMINAL');

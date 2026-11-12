'use strict';
// Offline only: validates candidate version of EXISTING Reader V2 and runs an
// extracted PowerShell checkpoint function fixture. NEVER run on CAIXA_MOOCA.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
assert.notEqual(os.hostname().toUpperCase(),'CAIXA_MOOCA','CASHIER_HOST_FORBIDDEN');
const here=__dirname;
const candidate=fs.readFileSync(path.join(here,'tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1'),'utf8');
const moduleFile=path.join(here,'comandas_reader_canonical_json_v1_REVIEW_ONLY.ps1');
assert.ok(fs.existsSync(moduleFile),'EXISTING_TESTED_SERIALIZER_REQUIRED');
let cases=0;function test(n,f){f();cases++;console.log('PASS',n);}
test('PowerShell params first and cashier review guard before any setup',()=>{
 const start=candidate.slice(0,1200);
 assert.match(start,/^\s*# REVIEW ONLY/m);
 assert.ok(start.indexOf('param(')>-1);
 assert.ok(start.indexOf('param(')<start.indexOf("if ($env:COMPUTERNAME -eq 'CAIXA_MOOCA')"));
 assert.ok(candidate.indexOf("if ($env:COMPUTERNAME -eq 'CAIXA_MOOCA')")<candidate.indexOf('New-Item -ItemType Directory'));
});
test('reuses PR135 canonical SHA-256 module, not old uppercase ConvertTo-Json hashing',()=>{
 assert.match(candidate,/comandas_reader_canonical_json_v1_REVIEW_ONLY\.ps1/);
 assert.match(candidate,/\$hash=Get-TataCanonicalSha256V1 -Value \$hashBasis/);
 assert.doesNotMatch(candidate,/function Hash-Text\(/);
 assert.doesNotMatch(candidate,/\$hash=Hash-Text/);
 assert.match(fs.readFileSync(moduleFile,'utf8'),/function Get-TataCanonicalSha256V1/);
});
test('checkpoint version gate is before SQL connection and all snapshots',()=>{
 const load=candidate.indexOf('$checkpoint = Load-Checkpoint');
 const login=candidate.indexOf('$conn.Open()');
 assert.ok(load>0&&login>load);
 assert.match(candidate,/CHECKPOINT_HASH_MIGRATION_REQUIRED/);
 assert.match(candidate,/\$raw\.hash_contract_version -cne "NODE_CANONICAL_JSON_SHA256_V1"/);
 assert.match(candidate,/hash_contract_version = "NODE_CANONICAL_JSON_SHA256_V1"/);
});
test('safety boundary, original identity checks and no new SQL/write effects',()=>{
 for(const term of [
  '$ExpectedLogin = "NT SERVICE\\TataComandaReader"',
  'UNEXPECTED_SERVICE_IDENTITY',
  'UNEXPECTED_SQL_LOGIN',
  'DATABASE_MISMATCH',
  'TEKNISA.COMANDAVEN',
  'CONVERT(nvarchar(64),c.IDORGCMDVENDA) = N\'DLV_IFO\'',
  'DSOBSCOMANDA',
  'DSOBSDESCIT',
  'DSOBSPEDDIGCMD',
  'TXPRODCOMVEN',
  'observation_scan_complete=$true',
  'SERVICE_WEEKLY_POLICY'
 ])assert.ok(candidate.includes(term),'PRESERVATION_MISSING_'+term);
 assert.doesNotMatch(candidate,/IDORGCMDVENDA\) LIKE N'DLV\[_\]%'/);
 assert.ok(!/\b(?:ALTER DATABASE|UPDATE TEKNISA|DELETE FROM TEKNISA|INSERT INTO TEKNISA|Invoke-WebRequest|Start-Process)\b/i.test(candidate));
 assert.match(candidate,/print=\$false;spooler_write=\$false/);
});
test('extracted original Load-Checkpoint function blocks legacy state dynamically',()=>{
 const fixture=path.join(here,'verificar_reader_v2_checkpoint_migration_REVIEW_ONLY.ps1');
 assert.ok(fs.existsSync(fixture));
 const child=spawnSync('powershell.exe',
  ['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',fixture],
  {encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:1024*1024});
 assert.equal(child.status,0,'OFFLINE_PS_GATE_FAILED exit='+child.status+
    ' signal='+String(child.signal||'none')+
    ' error='+String(child.error?.message||'none')+
    ' stderr='+String(child.stderr||'').slice(0,360)+
    ' stdout='+String(child.stdout||'').slice(-240));
 assert.match(child.stdout,/READER_V2_CHECKPOINT_MIGRATION_GATE_PASS 10\/10 SYNTHETIC_ONLY_NO_MIGRATION/);
});
console.log('READER_V2_CANONICAL_CANDIDATE_GATE_PASS '+cases+'/'+cases+' SYNTHETIC_ONLY');

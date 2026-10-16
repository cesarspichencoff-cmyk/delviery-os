'use strict';
/**
 * V8.12 sandbox-only validation. Linux checks negative-effect static contract;
 * Windows additionally invokes PowerShell with synthetic shift-window inputs.
 * No installed script, host service, database, printer, or state file accessed.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.join(__dirname,'comandas_shift_writer_v812_preview_only.ps1');
const src=fs.readFileSync(script,'utf8');
let checks=0;
const check=(title,fn)=>{fn();checks++};
check('explicit complete shift interval required',()=>{
 for(const key of ['$OperationalDate','$ValidFromLocal','$ValidUntilLocal','$Service'])
  assert.ok(src.includes(key),key);
});
check('candidate never forged as installed v2 state',()=>{
 assert.ok(src.includes('deliveryos.comandas.shift-window-draft.v812'));
 assert.ok(src.includes('UNAUTHENTICATED_DRAFT'));
 assert.ok(src.includes('operational_shift_authorized = $false'));
 assert.ok(src.includes('human_identity_authenticated = $false'));
});
check('effects permanently disabled',()=>{
 for(const key of ['file_read','file_write','history_append','windows_service',
   'sql','printer','spooler','deployment'])
  assert.ok(new RegExp('(^|\\n)\\s*'+key+' = \\$false\\b','m').test(src),key);
});
check('source has no path to installed state nor file IO primitives',()=>{
 const body=src.split(/\r?\n/).filter(x=>!x.trimStart().startsWith('#')).join('\n');
 for(const pattern of [/ProgramData/i,/TataComandaReader/i,/\bGet-Content\b/i,
   /\bSet-Content\b/i,/\bOut-File\b/i,/\bNew-Item\b/i,/\bCopy-Item\b/i,
   /\bMove-Item\b/i,/\bRemove-Item\b/i,/\bInvoke-Expression\b/i,
   /\bStart-Process\b/i,/\bRestart-Service\b/i,/\bStart-Service\b/i,
   /\bGet-Printer\b/i,/\[IO\.File\]/i,/\[System\.IO\.File\]/i])
  assert.equal(pattern.test(body),false,pattern.source);
});
check('PowerShell script always returns review-only or HOLD',()=>{
 assert.ok(src.includes('REVIEW_REQUIRED_NO_AUTHORITY'));
 assert.ok(src.includes("'HOLD'"));
 assert.ok(src.includes('installed_writer_compatible = $false'));
 assert.ok(src.includes('current_window_freshness_verified = $false'));
});
if(process.platform==='win32'){
 const base=['-Service','LUNCH','-OperationalDate','2026-10-16',
  '-ValidFromLocal','2026-10-16T11:00:00','-ValidUntilLocal','2026-10-16T15:00:00'];
 const run=(args)=>{
  const r=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',script,...args],
    {encoding:'utf8',timeout:15000,env:{...process.env,POWERSHELL_TELEMETRY_OPTOUT:'1'}});
  assert.equal(r.error,undefined,String(r.error||''));
  const stdout=r.stdout.trim();
  assert.ok(stdout,'expected sanitized JSON preview: '+r.stderr.slice(0,400));
  return {code:r.status,output:JSON.parse(stdout)};
 };
 const replace=(key,value)=>{const a=[...base];a[a.indexOf(key)+1]=value;return a};
 check('valid lunch emits proposal but never operational authority',()=>{
  const x=run(base);
  assert.equal(x.code,0);
  assert.equal(x.output.status,'REVIEW_REQUIRED_NO_AUTHORITY');
  assert.equal(x.output.candidate.valid_from_local,'2026-10-16T11:00:00');
  assert.equal(x.output.candidate.valid_until_local,'2026-10-16T15:00:00');
  assert.equal(x.output.candidate.evidence,'UNAUTHENTICATED_DRAFT');
  assert.equal(x.output.candidate.source_ref,null);
  assert.equal(x.output.operational_shift_authorized,false);
  assert.equal(x.output.effects.file_write,false);
  assert.equal(x.output.effects.printer,false);
  assert.equal(x.output.current_window_freshness_verified,false);
 });
 check('valid dinner is still review-only',()=>{
  const x=run(replace('-Service','DINNER'));
  assert.equal(x.code,0);
  assert.equal(x.output.status,'REVIEW_REQUIRED_NO_AUTHORITY');
 });
 const negatives=[
  ['impossible operational date','-OperationalDate','2026-02-30','OPERATIONAL_DATE_INVALID'],
  ['invalid 25h clock','-ValidFromLocal','2026-10-16T25:00:00','VALID_FROM_LOCAL_INVALID'],
  ['invalid minute','-ValidUntilLocal','2026-10-16T15:61:00','VALID_UNTIL_LOCAL_INVALID'],
  ['offset cannot be coerced','-ValidFromLocal','2026-10-16T11:00:00-03:00','VALID_FROM_LOCAL_INVALID'],
  ['Zulu timestamp rejected','-ValidFromLocal','2026-10-16T11:00:00Z','VALID_FROM_LOCAL_INVALID'],
  ['fractional seconds require exact contract','-ValidFromLocal','2026-10-16T11:00:00.1','VALID_FROM_LOCAL_INVALID'],
  ['unsupported alternate store','-StoreId','0002','STORE_NOT_PINNED'],
  ['unsupported meal','-Service','BREAKFAST','SERVICE_INVALID'],
  ['same start and end','-ValidUntilLocal','2026-10-16T11:00:00','WINDOW_NOT_INCREASING'],
  ['end before start','-ValidUntilLocal','2026-10-16T10:59:59','WINDOW_NOT_INCREASING'],
  ['cross-midnight rejected','-ValidUntilLocal','2026-10-17T00:10:00','WINDOW_NOT_SAME_OPERATIONAL_DATE'],
  ['day mismatch of start','-ValidFromLocal','2026-10-15T11:00:00','WINDOW_NOT_SAME_OPERATIONAL_DATE'],
 ];
 for(const [title,key,value,reason] of negatives){
  check(title,()=>{
   const args=key==='-StoreId'?[...base,'-StoreId',value]:replace(key,value);
   const x=run(args);
   assert.equal(x.code,2);
   assert.equal(x.output.status,'HOLD');
   assert.ok(x.output.blockers.includes(reason),JSON.stringify(x.output.blockers));
   assert.equal(x.output.candidate,null);
   assert.equal(x.output.effects.file_write,false);
  });
 }
 check('invalid unknown authorization parameter never creates proof',()=>{
  const r=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',script,
   ...base,'-SourceRef','FORGED_APPROVAL'],{encoding:'utf8',timeout:15000});
  assert.notEqual(r.status,0);
  assert.ok(!r.stdout.includes('REVIEW_REQUIRED_NO_AUTHORITY'));
 });
}
console.log(JSON.stringify({schema:'deliveryos.shift-writer-v812-sandbox-tests',
  result:'PASS',checks,platform:process.platform,
  windows_powershell_invoked:process.platform==='win32',synthetic_only:true,
  installed_state_written:false,operator_authenticated:false,print_authorized:false}));

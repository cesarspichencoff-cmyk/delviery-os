'use strict';
const assert=require('node:assert/strict');
const {transform,previewPinned,safeReport,SHA,SOURCE_SHA,SOURCE_BYTES,
  MAIN,LOOP,LEGACY,OLD,STAGED}=require('./comandas_supervisor_guard_v820_offline.cjs');
const nl='\n';
const srcText=[
 '# V820 fixture only: nothing executed',
 'param([int]$MaxBatches=0)',
 '$state=@{blocked=$null}',
 'function Stop-Fatal([string]$Reason) { throw $Reason }',
 'function Stop-UnrecordedBatches {',
 "  if ($cl.IndexOf($cfg.watcher_path, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return 'UNRECORDED_ALIVE' }",
 '}',
 MAIN,
 '$exitCode = 0',
 'try {',
 LOOP,
 '  $hunt = "NONE"',
 '} catch { throw }',
 ...Array.from({length:90},(_,i)=>'# benign fixture padding '+i)
].join(nl)+nl;
const buf=Buffer.from(srcText,'utf8'),pins={sha:SHA(buf),size:buf.length};
let count=0;
function check(name,callback){try{callback();count++}catch(e){e.message=name+': '+e.message;throw e}}
const result=transform(buf,pins);
check('real origin hash and exact size pinned',()=>{
 assert.equal(SOURCE_SHA,'2B6DC012918F317C8D244531B3CCB2FD33E33B226C6E6E668BEE4B698936BEF5');
 assert.equal(SOURCE_BYTES,34708);
});
check('pure preview constructs single startup function and guard',()=>{
 assert.equal(result.status,'REVIEW_ONLY_UNINSTALLED',JSON.stringify(safeReport(result)));
 assert.equal(result.new_function_count,1);
 assert.equal(result.new_startup_guard_count,1);
 assert.equal(result.old_and_staged_paths_checked,true);
 assert.equal(result.unknown_inventory_blocks,true);
});
check('both generation paths included in guard',()=>{
 assert.ok(result.proposed_supervisor_text.includes(OLD));
 assert.ok(result.proposed_supervisor_text.includes(STAGED));
});
check('preserves prior startup and recovery huntexactly',()=>{
 assert.ok(result.proposed_supervisor_text.includes(LEGACY));
 assert.ok(result.proposed_supervisor_text.includes('function Stop-UnrecordedBatches {'));
 assert.ok(result.proposed_supervisor_text.includes(LOOP));
});
check('never installs nor changes service and is not approval',()=>{
 assert.equal(result.host_effects,false);
 assert.equal(result.real_supervisor_executed,false);
 assert.equal(result.operational_deployment_authorized,false);
 assert.equal(result.atomic_cutover_proven,false);
 assert.equal(result.does_not_terminate_other_processes,true);
});
check('mutated host source checksum fails',()=>{
 const wrong=Buffer.from(buf);wrong[wrong.length-10]^=1;
 assert.equal(transform(wrong,pins).reason,'ORIGINAL_SUPERVISOR_SHA_OR_SIZE_DRIFT');
});
check('pinned origin rejects synthetic replica',()=>{
 assert.equal(previewPinned(buf).reason,'ORIGINAL_SUPERVISOR_SHA_OR_SIZE_DRIFT');
});
check('repatch prohibited even with new origin pin',()=>{
 const b=Buffer.from(result.proposed_supervisor_text,'utf8');
 assert.equal(transform(b,{sha:SHA(b),size:b.length}).reason,'ALREADY_PATCHED');
});
check('missing function anchor rejected',()=>{
 const b=Buffer.from(srcText.replace('function Stop-UnrecordedBatches {','function Ghost {'));
 assert.equal(transform(b,{sha:SHA(b),size:b.length}).reason,'SOURCE_ANCHORS_CHANGED');
});
check('duplicate main loop anchor rejected',()=>{
 const b=Buffer.from(srcText+MAIN+'\n');
 assert.equal(transform(b,{sha:SHA(b),size:b.length}).reason,'SOURCE_ANCHORS_CHANGED');
});
check('duplicate legacy filter anchor rejected',()=>{
 const b=Buffer.from(srcText+LEGACY+'\n');
 assert.equal(transform(b,{sha:SHA(b),size:b.length}).reason,'SOURCE_ANCHORS_CHANGED');
});
check('duplicate startup anchor rejected',()=>{
 const b=Buffer.from(srcText+'try {\n'+LOOP+'\n');
 assert.equal(transform(b,{sha:SHA(b),size:b.length}).reason,'SOURCE_ANCHORS_CHANGED');
});
check('binary invalid utf8 rejected',()=>{
 const b=Buffer.concat([buf,Buffer.from([0xff])]);
 assert.equal(transform(b,{sha:SHA(b),size:b.length}).reason,'UTF8_NOT_EXACT');
});
check('bounds reject tiny file',()=>{
 const b=Buffer.from('a');
 assert.equal(transform(b,{sha:SHA(b),size:b.length}).reason,'SOURCE_BYTES_BOUNDED');
});
check('safe report never exports preview source',()=>{
 const clean=safeReport(result);
 assert.equal(Object.hasOwn(clean,'proposed_supervisor_text'),false);
 assert.equal(clean.status,'REVIEW_ONLY_UNINSTALLED');
});
check('byte-level preview hash matches actual bytes',()=>{
 assert.equal(result.preview_sha256,SHA(Buffer.from(result.proposed_supervisor_text,'utf8')));
});
check('must refuse without a matching baseline hash',()=>{
 assert.equal(transform(buf,{sha:'A'.repeat(64),size:buf.length}).status,'HOLD');
});
console.log(JSON.stringify({schema:'deliveryos.comandas.v820.supervisor-startup-preview-tests',
 status:'PASS',checks:count,synthetic_fixture_only:true,
 no_host_source_checked_in:true,real_supervisor_not_launched:true,
 wmi_unknown_fails_closed_by_review_contract:true,
 no_printer_sql_or_service_effects:true}));

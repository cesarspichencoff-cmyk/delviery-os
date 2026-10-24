'use strict';
const assert=require('node:assert/strict');
const {SHA,MAIN,LOOP,RECOVERY,LEGACY}=require('./comandas_supervisor_guard_v820_offline.cjs');
const {preview,safeReport,SOURCE_SHA,SOURCE_BYTES,LAUNCH,INJECT}=require('./comandas_supervisor_prelaunch_v822_offline.cjs');
const fixture=[
 '# synthetic NO SERVICE fixture', 'param([int]$MaxBatches=0)',
 '$state=@{blocked=$null}','function Stop-Fatal([string]$Reason) { throw $Reason }',
 'function Stop-UnrecordedBatches {',
 '  '+LEGACY+' { return "ALIVE" }',
 '}',
 MAIN,
 '$exitCode = 0',
 'try {',
 LOOP,
 '  $hunt = "NONE"',
 '  try { $hunt = Stop-UnrecordedBatches } catch { $hunt = "LIST_UNKNOWN" }',
 ...RECOVERY,
 '} catch { throw }',
 'function Invoke-Batch([int]$BatchSeq) {',
 '  $proc = $null',
 '  try {',
 LAUNCH,
 '  } catch { return $null }',
 '}',
 ...Array.from({length:80},(_,i)=>'# synthetically padded supervisor fixture '+i)
].join('\n')+'\n';
const input=Buffer.from(fixture,'utf8');
const pins={sha:SHA(input),size:input.length};
let checks=0;const check=(name,cb)=>{try{cb();checks++}catch(e){e.message=name+': '+e.message;throw e}};
const good=preview(input,pins);
check('synthetic fixture generates review only',()=>assert.equal(good.status,'REVIEW_ONLY_UNINSTALLED',JSON.stringify(safeReport(good))));
check('no runtime or authorization inferred',()=>{assert.equal(good.runtime_supervisor_tested,false);assert.equal(good.atomic_cutover_proven,false);assert.equal(good.operational_activation_allowed,false);assert.equal(good.host_effects,false)});
check('source pinned digest is real observed supervisor',()=>{assert.equal(SOURCE_SHA,'2B6DC012918F317C8D244531B3CCB2FD33E33B226C6E6E668BEE4B698936BEF5');assert.equal(SOURCE_BYTES,34708)});
check('preview pinned rejects synthetic replacement',()=>assert.equal(preview(input).reason,'SOURCE_V820_ORIGINAL_SUPERVISOR_SHA_OR_SIZE_DRIFT'));
check('post-recovery startup check maintained',()=>{
 const s=good.candidate_supervisor_text;
 assert.ok(s.includes('Stop-Fatal "CUTOVER_QUIESCENCE_NOT_PROVEN"'));
 assert.ok(s.indexOf('  try { $hunt = Stop-UnrecordedBatches }')<s.indexOf('Stop-Fatal "CUTOVER_QUIESCENCE_NOT_PROVEN"'));
 assert.ok(s.indexOf('Stop-Fatal "CUTOVER_QUIESCENCE_NOT_PROVEN"')<s.indexOf(RECOVERY.join('\n')));
});
check('pre-launch check exists exactly once',()=>assert.equal(good.candidate_supervisor_text.split('CUTOVER_PRELAUNCH_NOT_QUIET').length,2));
check('new gate executes before child process startup',()=>assert.ok(good.candidate_supervisor_text.indexOf('CUTOVER_PRELAUNCH_NOT_QUIET')<good.candidate_supervisor_text.indexOf(LAUNCH)));
check('function defined only once with 2 gate invocations',()=>assert.equal(good.candidate_supervisor_text.split('Test-CutoverGenerationsQuiet').length,4));
check('no automatic kill injected',()=>assert.equal(good.no_existing_process_termination_added,true));
check('old orphan logic untouched',()=>assert.ok(good.candidate_supervisor_text.includes(LEGACY)));
check('checksum covers real preview bytes',()=>assert.equal(SHA(Buffer.from(good.candidate_supervisor_text)),good.candidate_sha256));
check('safe report never exports candidate executable text',()=>assert.equal(Object.hasOwn(safeReport(good),'candidate_supervisor_text'),false));
check('one-byte drift fails',()=>{const changed=Buffer.from(input);changed[changed.length-2]^=1;assert.equal(preview(changed,pins).reason,'SOURCE_V820_ORIGINAL_SUPERVISOR_SHA_OR_SIZE_DRIFT')});
check('double process start anchor is rejected',()=>{const modified=Buffer.from(fixture+'\n'+LAUNCH+'\n');assert.equal(preview(modified,{sha:SHA(modified),size:modified.length}).reason,'PRELAUNCH_ANCHOR_NOT_UNIQUE')});
check('missing start anchor rejected',()=>{const modified=Buffer.from(fixture.replace(LAUNCH,'  $proc = Start-FictionalProcess'));assert.equal(preview(modified,{sha:SHA(modified),size:modified.length}).reason,'PRELAUNCH_ANCHOR_NOT_UNIQUE')});
check('reapplying guard forbidden',()=>{const changed=Buffer.from(good.candidate_supervisor_text);assert.equal(preview(changed,{sha:SHA(changed),size:changed.length}).reason,'SOURCE_V820_ALREADY_PATCHED')});
check('unknown value fail-closed in proposed launch gate',()=>{assert.ok(INJECT.join('\n').includes('$preLaunchGenerations -ne "CLEAN"'));assert.ok(INJECT.join('\n').includes('Stop-Fatal "CUTOVER_PRELAUNCH_NOT_QUIET"'))});
console.log(JSON.stringify({schema:'deliveryos.comandas.v822.dual-gate-offline-tests',
 status:'PASS',checks,synthetic_fixture_only:true,
 real_source_byte_pin_embedded:true,production_rollback_tested:false,
 actual_supervisor_executed:false,race_eliminated:false,
 host_write:false,sql:false,printer:false,deploy:false}));

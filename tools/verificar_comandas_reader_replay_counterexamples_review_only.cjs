'use strict';
// Offline-only execution of the reviewed Reader branch model, NO operational effects.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {model,key,observe,persist,checkpointCopy,restart,deleteFile,audit,h}=require('./comandas_reader_replay_model_review_only.cjs');
const A=h('A'),B=h('B'),C=h('C');
let n=0;
function test(label,fn){fn();n++;console.log('PASS '+label)}
function safe(m){const r=audit(m);
 assert.equal(r.status,'HOLD');assert.equal(r.noLossProven,false);
 assert.equal(r.noReemitProven,false);assert.equal(r.migrationAuthorized,false);
 assert.equal(r.printAuthorized,false);
 assert.ok(Object.values(r.effects).every(x=>x===false));return r;
}
function bootstrap(){const m=model();observe(m,{id:1,hash:A,revision:'r1'});persist(m);return m}
function stable(m,hash,revision,id=1){
 observe(m,{id,hash,revision});observe(m,{id,hash,revision});
}
function fillAcrossBoundedPolls(m,total){
 const batches=[];
 for(let first=1;first<=total;first+=50){
  const last=Math.min(total,first+49),count=last-first+1;
  if(count>50)throw Error('TOP_50_CONTRACT_VIOLATION');
  batches.push(count);
  for(let i=first;i<=last;i++)observe(m,{id:i,hash:A,revision:'r1',orderTime:i});
  persist(m);
 }
 return batches;
}
test('bootstrap suppresses A without writing an event file',()=>{
 const m=bootstrap();assert.equal(m.files.size,0);
 assert.equal(m.seen.get(key(1)).emitted_hash,A);safe(m);
});
test('second unchanged A poll suppresses by emitted_hash with zero file',()=>{
 const m=bootstrap();observe(m,{id:1,hash:A,revision:'r1'});
 assert.equal(m.suppressions.at(-1).reason,'EMITTED_HASH_EQUAL');
 assert.equal(m.files.size,0);safe(m);
});
test('first eligible B after bootstrap only sets stable count one',()=>{
 const m=bootstrap();observe(m,{id:1,hash:B,revision:'r2'});
 assert.equal(m.writes.length,0);assert.equal(m.seen.get(key(1)).stable_count,1);safe(m);
});
test('second B poll stores exactly one event file for revision r2',()=>{
 const m=bootstrap();stable(m,B,'r2');assert.equal(m.writes.length,1);
 assert.equal(m.writes[0].revision,'r2');safe(m);
});
test('A-B-A-B contains three post-bootstrap revisions but only two files',()=>{
 const m=bootstrap();stable(m,B,'r2');stable(m,A,'r3');stable(m,B,'r4');
 assert.deepEqual(m.writes.map(w=>w.revision),['r2','r3']);
 assert.ok(m.suppressions.some(s=>s.revision==='r4'&&s.reason==='EXISTING_FILENAME'));
 assert.equal(m.files.size,2);safe(m);
});
test('A-B-A-B-A returns to existing file and hides distinct r5',()=>{
 const m=bootstrap();stable(m,B,'r2');stable(m,A,'r3');
 stable(m,B,'r4');stable(m,A,'r5');
 assert.deepEqual(m.writes.map(w=>w.revision),['r2','r3']);
 assert.ok(m.suppressions.some(s=>s.revision==='r5'&&s.reason==='EXISTING_FILENAME'));
 safe(m);
});
test('source A-B-A occurring between polls cannot be observed from only A',()=>{
 const m=bootstrap();observe(m,{id:1,hash:A,revision:'r3-after-unobserved-B'});
 assert.equal(m.writes.length,0);assert.equal(m.observations.length,2);safe(m);
});
test('crash after B file but before checkpoint retains ambiguous durable file',()=>{
 const m=bootstrap();observe(m,{id:1,hash:B,revision:'r2'});
 assert.throws(()=>observe(m,{id:1,hash:B,revision:'r2',failAfterEventWrite:true}),/SYNTHETIC_CRASH/);
 assert.equal(m.files.size,1);assert.equal(m.persisted.entries[0].snapshot_hash,A);
 restart(m);stable(m,B,'r2-recovered');
 assert.equal(m.writes.length,1);
 assert.equal(m.suppressions.at(-1).reason,'EXISTING_FILENAME');safe(m);
});
test('crash before B event write: B can be recorded after restart',()=>{
 const m=bootstrap();observe(m,{id:1,hash:B,revision:'r2'});
 restart(m);stable(m,B,'r2-again');assert.equal(m.writes.length,1);safe(m);
});
test('missing B file after persisted checkpoint is suppressed without a check',()=>{
 const m=bootstrap();stable(m,B,'r2');persist(m);
 assert.equal(deleteFile(m,1,B),true);restart(m);
 observe(m,{id:1,hash:B,revision:'r2'});
 assert.equal(m.files.size,0);
 assert.equal(m.suppressions.at(-1).reason,'EMITTED_HASH_EQUAL');safe(m);
});
test('exact 250 entries survive persisted checkpoint boundary',()=>{
 const m=model();const batches=fillAcrossBoundedPolls(m,250);
 assert.deepEqual(batches,[50,50,50,50,50]);assert.equal(m.persisted.entries.length,250);
 restart(m);assert.equal(m.seen.size,250);safe(m);
});
test('251st entry silently drops oldest checkpoint row, not RAM row',()=>{
 const m=model();const batches=fillAcrossBoundedPolls(m,251);
 assert.deepEqual(batches,[50,50,50,50,50,1]);assert.equal(m.seen.size,251);
 assert.equal(m.persisted.entries.length,250);
 assert.ok(!m.persisted.entries.some(e=>e.key===key(1)));safe(m);
});
test('CONDITIONAL resurfacing of evicted bootstrap A after 251 across batches emits unexpectedly',()=>{
 const m=model();const batches=fillAcrossBoundedPolls(m,251);
 assert.deepEqual(batches,[50,50,50,50,50,1]);restart(m);assert.equal(m.seen.has(key(1)),false);
 stable(m,A,'r1-old',1);assert.equal(m.writes.length,1);
 assert.equal(m.writes[0].revision,'r1-old');safe(m);
});
test('reboot changes outcome IF evicted baseline returns to recent query after source turnover',()=>{
 const m=model();const batches=fillAcrossBoundedPolls(m,251);
 assert.deepEqual(batches,[50,50,50,50,50,1]);observe(m,{id:1,hash:A,revision:'r1-old'});
 assert.equal(m.writes.length,0);restart(m);stable(m,A,'r1-old',1);
 assert.equal(m.writes.length,1);safe(m);
});
test('restored old checkpoint plus newer B file is insufficient source proof',()=>{
 const m=bootstrap(),old=checkpointCopy(m);
 stable(m,B,'r2');persist(m);restart(m,old);stable(m,B,'r2-after-rollback');
 assert.equal(m.writes.length,1);
 assert.equal(m.suppressions.at(-1).reason,'EXISTING_FILENAME');safe(m);
});
test('B file does not authenticate current C revision',()=>{
 const m=bootstrap();stable(m,B,'r2');persist(m);
 observe(m,{id:1,hash:C,revision:'r3'});
 assert.equal(m.writes.length,1);safe(m);
});
test('two distinct A-B-A-B histories yield observationally identical persisted state',()=>{
 const short=bootstrap();stable(short,B,'r2');stable(short,A,'r3');
 stable(short,B,'r4');persist(short);
 const longer=bootstrap();stable(longer,B,'r2');stable(longer,A,'r3');
 stable(longer,B,'r4');stable(longer,A,'r5');stable(longer,B,'r6');persist(longer);
 const visible=m=>JSON.stringify({cp:m.persisted,files:[...m.files.entries()].sort()});
 assert.equal(visible(short),visible(longer));
 assert.notEqual(short.observations.length,longer.observations.length);
 assert.deepEqual(short.writes.map(x=>x.revision),longer.writes.map(x=>x.revision));
 safe(short);safe(longer);
});
test('unobserved A-B-A and unchanged A yield same visible checkpoint and files',()=>{
 const plain=bootstrap(),hidden=bootstrap();
 observe(plain,{id:1,hash:A,revision:'r1'});
 observe(hidden,{id:1,hash:A,revision:'r3-after-unobserved-B'});
 persist(plain);persist(hidden);
 assert.deepEqual(plain.persisted,hidden.persisted);
 assert.deepEqual([...plain.files.keys()],[...hidden.files.keys()]);
 safe(plain);safe(hidden);
});
test('checkpoint records hashes but lacks durable emission disposition',()=>{
 const m=bootstrap(),e=m.persisted.entries[0];
 assert.deepEqual(Object.keys(e).sort(),
 ['emitted_hash','key','last_seen_order_time','snapshot_hash','stable_count'].sort());
 safe(m);
});
test('source code anchors match inspected candidate, without running it',()=>{
 const c=fs.readFileSync(path.join(__dirname,
 'tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1'),'utf8');
 assert.match(c,/\$baselineHash = if\(\(-not \[bool\]\$checkpoint\.bootstrap_complete\)/);
 assert.match(c,/\[string\]\$entry\.emitted_hash -eq \$hash/);
 assert.match(c,/\$safeOrder\+"_"\+\$hash\+"\.json"/);
 assert.match(c,/Select-Object -First 250/);
 assert.match(c,/\$entry\.emitted_hash=\$hash/);
 safe(bootstrap());
});
if(n!==20)throw Error('UNEXPECTED_CASE_COUNT_'+n);
console.log('READER_REPLAY_COUNTEREXAMPLE_PASS '+n+'/'+n+
 ' SYNTHETIC_MODEL ONLY_HOLD NO_SQL_NO_PRINT_NO_MIGRATION');

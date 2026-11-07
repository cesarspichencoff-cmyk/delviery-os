'use strict';
// REVIEW ONLY. Synthetic crash boundaries, not a real service/restart test.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {review,SCHEMA}=require('./comandas_reader_restart_boundary_review_only.cjs');
const sha=s=>createHash('sha256').update(s).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const H1='A'.repeat(64),H2='B'.repeat(64),H3='C'.repeat(64);
function order(i){return {CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'LABSALE'+i,
 NRCOMANDA:'LABCMD'+i,IDORGCMDVENDA:'DLV_IFO',items:[{CDPRODUTO:'LAB1'}]};}
function file(i,hash=H1){const o=order(i),key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|');
 const event={schema:'deliveryos.tata-reader-stable-order-event.v1',order_key:key,snapshot_hash:hash,order:o};
 const text=JSON.stringify(event);return {name:o.NRCOMANDA+'_'+hash+'.json',json_utf8:text,raw_sha256:sha(text)};}
function entry(i,hash=H1){const o=order(i);return {order_key:[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|'),snapshot_hash:hash,emitted_hash:hash};}
function state(entries=[],files=[]){return {checkpoint:{bootstrap_complete:true,entries},event_files:files};}
const baseline=()=>({schema:SCHEMA,before:state([entry(1)],[file(1)]),after:state([entry(1)],[file(1)])});
let n=0;function test(name,fn){fn();n++;console.log('PASS',name)}
function hold(input,reason){const r=review(input);assert.equal(r.state,'HOLD');assert.equal(r.reason,reason);
 assert.equal(r.source_revision_proven,false);assert.equal(r.legacy_migration_authorized,false);
 assert.equal(r.no_reemit_proven,false);assert.equal(r.no_loss_proven,false);
 assert.equal(r.operational_print_authorized,false);assert.equal(r.artifacts,null);
 assert.deepEqual(Object.values(r.effects),Array(7).fill(false));return r;}
const good='MATCHED_SHAPE_WITHOUT_EXTERNAL_SOURCE_OR_ATOMICITY_PROOF';
test('identical persisted checkpoint + event file remains HOLD',()=>{assert.equal(hold(baseline(),good).inspected_revision_count,1)});
test('250 invented stable records remain HOLD, no replay authorization',()=>{const x=baseline(),e=[],f=[];
 for(let i=0;i<250;i++){e.push(entry(i+1));f.push(file(i+1))}x.before=state(e,f);x.after=state(clone(e),clone(f));
 assert.equal(hold(x,good).inspected_revision_count,250)});
test('new event durable before checkpoint is ambiguous after a crash',()=>{const x=baseline();x.after.event_files.push(file(1,H2));hold(x,'EVENT_FILE_AHEAD_OF_CHECKPOINT')});
test('checkpoint advanced but event B missing is unsafe',()=>{const x=baseline();x.after.checkpoint.entries[0]=entry(1,H2);hold(x,'CHECKPOINT_AHEAD_OF_EVENT_FILE')});
test('checkpoint changed and both revisions present still cannot attest transitions',()=>{const x=baseline();x.after.event_files.push(file(1,H2));x.after.checkpoint.entries[0]=entry(1,H2);hold(x,'HASH_TRANSITION_HAS_NO_NATIVE_REVISION_ATTESTATION')});
test('checkpoint rollback from B to A is not assumed to be safe ABA',()=>{const x=baseline();x.before.checkpoint.entries[0]=entry(1,H2);x.before.event_files.push(file(1,H2));x.after.event_files.push(file(1,H2));hold(x,'HASH_TRANSITION_HAS_NO_NATIVE_REVISION_ATTESTATION')});
test('event deleted after restart is HOLD',()=>{const x=baseline();x.after.event_files=[];hold(x,'PERSISTED_EVENT_FILE_DISAPPEARED')});
test('same filename with modified bytes and recomputed self hash is HOLD',()=>{const x=baseline();const e=JSON.parse(x.after.event_files[0].json_utf8);e.order.items[0].CDPRODUTO='ALTERADO';const t=JSON.stringify(e);x.after.event_files[0].json_utf8=t;x.after.event_files[0].raw_sha256=sha(t);hold(x,'PERSISTED_EVENT_FILE_CHANGED')});
test('bad self-supplied file digest is rejected',()=>{const x=baseline();x.after.event_files[0].raw_sha256='0'.repeat(64);hold(x,'EVENT_FILE_BYTES_UNVERIFIED')});
test('checkpoint entry eviction not treated as absence of future reemit',()=>{const x=baseline();x.after.checkpoint.entries=[];hold(x,'CHECKPOINT_ENTRY_EVICTED_OR_LOST')});
test('checkpoint 251 entries cannot become an admissible new baseline',()=>{const x=baseline();x.after.checkpoint.entries=Array.from({length:251},(_,i)=>entry(i+1));hold(x,'SNAPSHOT_SHAPE_INVALID')});
test('new active order without previous baseline remains unverified',()=>{const x=baseline();x.after.checkpoint.entries.push(entry(2));x.after.event_files.push(file(2));hold(x,'NEW_CHECKPOINT_ENTRY_WITHOUT_PREVIOUS_BASELINE')});
test('duplicate case-insensitive event filename fails',()=>{const x=baseline();x.after.event_files.push({...file(1),name:file(1).name.toLowerCase()});hold(x,'DUPLICATE_EVENT_FILENAME')});
test('duplicate case-insensitive checkpoint identity fails',()=>{const x=baseline();x.after.checkpoint.entries.push({...entry(1),order_key:entry(1).order_key.toLowerCase()});hold(x,'DUPLICATE_CHECKPOINT_KEY')});
test('uncommitted temporary JSON never counts as proof of file completion',()=>{const x=baseline();x.after.event_files.push({...file(2),name:'LABCMD2_'+H1+'.json.tmp.22.abcd'});hold(x,'UNCOMMITTED_TEMP_EVENT_FILE')});
test('checkpoint says snapshot B but emitted A is blocked',()=>{const x=baseline();x.after.checkpoint.entries[0].snapshot_hash=H2;hold(x,'CHECKPOINT_SNAPSHOT_EMITTED_HASH_DIFFER')});
test('old checkpoint pending mismatch cannot authenticate predecessor',()=>{const x=baseline();x.before.checkpoint.entries[0].snapshot_hash=H3;hold(x,'PREVIOUS_CHECKPOINT_REVISION_MISMATCH')});
test('crash with missing checkpoint file cannot be called a successful restart',()=>{const x=baseline();x.after.checkpoint={bootstrap_complete:false,entries:[]};hold(x,'SNAPSHOT_SHAPE_INVALID')});
test('even a counterfactual valid raw SHA is self-attested, not source receipt',()=>{const x=baseline();const r=hold(x,good);assert.equal(r.source_revision_proven,false)});
test('detect original Test-Path file-existence shortcut; must not claim bytes verified',()=>{
 const source=fs.readFileSync(path.join(__dirname,'tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1'),'utf8');
 assert.match(source,/if\(-not \(Test-Path -LiteralPath \$eventPath -PathType Leaf\)\)/);
 assert.match(source,/\$entry\.emitted_hash=\$hash/);
 // Known unproven boundary, NOT proof that writing to files is safe.
});
console.log('READER_RESTART_BOUNDARY_REVIEW_PASS '+n+'/'+n+' SYNTHETIC_ONLY HOLD_NO_SERVICE_NO_SQL_NO_PRINT');

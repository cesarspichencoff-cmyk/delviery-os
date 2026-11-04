'use strict';
// Synthetic-only audit of FUTURE disposition markers; every result HOLD.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {snapshotHash}=require('./tata_comanda_reader_native_essentials_v857_offline.cjs');
const {review,SCHEMA}=require('./comandas_reader_emission_disposition_review_only.cjs');
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const copy=x=>JSON.parse(JSON.stringify(x));
function source(i){
 return {CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'LABSALE'+i,
  NRCOMANDA:'LABCMD'+i,NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',
  IDSTCOMANDA:'3',DTHRABERMESA:'2026-11-04T12:20:00.0000000',
  items:[{NRPRODCOMVEN:'LINE1',CDPRODUTO:'LABPROD1',
   CDARVPROD:'9200001000',QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4'}],
  observation_scan_complete:true,observation_rows:[{
   source_field:'DSOBSPEDDIGCMD',value:"FICTICIO L'IMITADO",
   scope_hint:'item',join_proven:true,item_index:0,CDPRODUTO:'LABPROD1'}]};
}
function pair(i,disposition='BOOTSTRAP_SUPPRESSED'){
 const o=source(i),h=snapshotHash(o);
 assert.match(h,/^[a-f0-9]{64}$/);
 const key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|');
 const event={schema:'deliveryos.tata-reader-stable-order-event.v1',
  order_key:key,snapshot_hash:h,order:o};
 const raw=JSON.stringify(event),byteHash=sha(raw);
 const entry={order_key:key,snapshot_hash:h,
  emitted_hash:disposition==='NOT_EMITTED'?null:h,
  emission_disposition:disposition,
  disposition_hash:disposition==='NOT_EMITTED'?null:h,
  receipt_sha256:disposition==='EVENT_PERSISTED'?byteHash:null};
 const witness={name:o.NRCOMANDA+'_'+h+'.json',json_utf8:raw,raw_sha256:byteHash};
 return {entry,witness};
}
function input(n=1,state='BOOTSTRAP_SUPPRESSED'){
 const list=Array.from({length:n},(_,i)=>pair(i+1,state));
 return {schema:SCHEMA,checkpoint:{
  schema:'deliveryos.tata-reader-continuous-checkpoint.v1',
  hash_contract_version:'NODE_CANONICAL_JSON_SHA256_V1',
  checkpoint_origin:'FRESH_NODE_CANONICAL_V2',
  checkpoint_generation:'a'.repeat(32),
  bootstrap_complete:true,entries:list.map(x=>x.entry)},
 event_witnesses:state==='EVENT_PERSISTED'?list.map(x=>x.witness):[]};
}
let n=0;
function test(name,fn){fn();n++;console.log('PASS '+name)}
function hold(x,why){
 const r=review(x);
 assert.equal(r.state,'HOLD');assert.equal(r.reason,why);
 assert.equal(r.migration_authorized,false);
 assert.equal(r.source_authenticated,false);
 assert.equal(r.transaction_atomic,false);
 assert.equal(r.bootstrap_history_proven,false);
 assert.equal(r.persistence_durable_proven,false);
 assert.equal(r.no_reemit_proven,false);
 assert.equal(r.no_loss_proven,false);
 assert.equal(r.returnable_events,null);
 assert.equal(r.operational_print_authorized,false);
 assert.ok(Object.values(r.effects).every(v=>v===false));
 return r;
}
const structural='STRUCTURAL_DISPOSITION_ONLY_NOT_EXTERNAL_PROOF';
test('fresh suppressed marker is structural HOLD, not evidence of receipt',()=>{
 const r=hold(input(),structural);assert.equal(r.counts.bootstrap_suppressed,1);
});
test('matching event receipt remains HOLD without independent origin',()=>{
 const r=hold(input(1,'EVENT_PERSISTED'),structural);
 assert.equal(r.counts.event_persisted,1);
});
test('non-emitted pending record remains HOLD',()=>{
 const r=hold(input(1,'NOT_EMITTED'),structural);
 assert.equal(r.counts.not_emitted,1);
});
test('legacy checkpoint without canonical contract is not upgraded',()=>{
 const x=input();delete x.checkpoint.hash_contract_version;
 hold(x,'FRESH_CHECKPOINT_CONTRACT_UNVERIFIED');
});
test('marker-only version rewrite without origin is not migration',()=>{
 const x=input();delete x.checkpoint.checkpoint_origin;
 hold(x,'FRESH_CHECKPOINT_CONTRACT_UNVERIFIED');
});
test('checkpoint entry without disposition cannot be guessed',()=>{
 const x=input();delete x.checkpoint.entries[0].emission_disposition;
 hold(x,'DISPOSITION_MISSING_OR_UNRECOGNIZED');
});
test('baseline suppression with event witness is contradictory',()=>{
 const x=input();x.event_witnesses.push(pair(1).witness);
 hold(x,'BOOTSTRAP_SUPPRESSED_BUT_EVENT_EXISTS');
});
test('persisted marker without event file witness cannot deduplicate',()=>{
 const x=input(1,'EVENT_PERSISTED');x.event_witnesses=[];
 hold(x,'PERSISTED_EVENT_WITNESS_MISSING');
});
test('self-reported receipt digest mismatch is HOLD',()=>{
 const x=input(1,'EVENT_PERSISTED');x.checkpoint.entries[0].receipt_sha256='0'.repeat(64);
 hold(x,'PERSISTED_RECEIPT_DIGEST_INVALID');
});
test('corrupted bytes rejected before source interpretation',()=>{
 const x=input(1,'EVENT_PERSISTED');x.event_witnesses[0].json_utf8+=' ';
 hold(x,'EVENT_WITNESS_BYTES_INVALID');
});
test('edited item with new outer SHA but stale canonical snapshot rejected',()=>{
 const x=input(1,'EVENT_PERSISTED');
 const w=x.event_witnesses[0],e=JSON.parse(w.json_utf8);
 e.order.items[0].CDPRODUTO='LABPROD2';
 w.json_utf8=JSON.stringify(e);w.raw_sha256=sha(w.json_utf8);
 x.checkpoint.entries[0].receipt_sha256=w.raw_sha256;
 hold(x,'EVENT_SOURCE_OR_CANONICAL_HASH_INVALID');
});
test('case insensitive duplicate checkpoint order rejected',()=>{
 const x=input(2);x.checkpoint.entries[1].order_key=x.checkpoint.entries[0].order_key.toLowerCase();
 hold(x,'CHECKPOINT_DUPLICATE_IDENTITY');
});
test('case insensitive duplicate Windows filename rejected',()=>{
 const x=input(1,'EVENT_PERSISTED');
 const duplicate=copy(x.event_witnesses[0]);
 duplicate.name=duplicate.name.toLowerCase();x.event_witnesses.push(duplicate);
 hold(x,'EVENT_FILENAME_DUPLICATED');
});
test('pending marker carrying old emitted hash is contradictory',()=>{
 const x=input(1,'NOT_EMITTED');
 x.checkpoint.entries[0].emitted_hash=x.checkpoint.entries[0].snapshot_hash;
 hold(x,'PENDING_ENTRY_HAS_EMITTED_HASH');
});
test('pending status with event file cannot be silently adopted',()=>{
 const x=input(1,'NOT_EMITTED');x.event_witnesses.push(pair(1).witness);
 hold(x,'PENDING_ENTRY_HAS_EVENT_WITNESS');
});
test('wrong native origin not accepted regardless of matching raw SHA',()=>{
 const x=input(1,'EVENT_PERSISTED'),w=x.event_witnesses[0],e=JSON.parse(w.json_utf8);
 e.order.IDORGCMDVENDA='DLV_OTHER';
 w.json_utf8=JSON.stringify(e);w.raw_sha256=sha(w.json_utf8);
 hold(x,'EVENT_SOURCE_OR_CANONICAL_HASH_INVALID');
});
test('changed current revision preserves old status but never authorizes replay',()=>{
 const x=input();x.checkpoint.entries[0].snapshot_hash='b'.repeat(64);
 const r=hold(x,structural);assert.equal(r.counts.changed_revision_pending,1);
});
test('250 fabricated suppressed baselines do not turn into emitted orders',()=>{
 const r=hold(input(250),structural);
 assert.equal(r.counts.bootstrap_suppressed,250);
});
test('checkpoint beyond bound is HOLD',()=>{
 hold(input(251),'CHECKPOINT_OR_WITNESS_BOUND_INVALID');
});
test('orphan event file is HOLD, even if its event hash self-matches',()=>{
 const x=input(0);x.event_witnesses.push(pair(1).witness);
 hold(x,'ORPHAN_EVENT_WITNESS');
});
test('forged fresh markers and matching raw bytes never prove real source',()=>{
 const x=input(1,'EVENT_PERSISTED');
 const r=hold(x,structural);assert.equal(r.counts.event_persisted,1);
});
if(n!==21)throw Error('UNEXPECTED_TEST_COUNT_'+n);
console.log('READER_EMISSION_DISPOSITION_REVIEW_PASS '+n+'/'+n+
 ' SYNTHETIC_ONLY ALWAYS_HOLD NO_SQL_NO_PRINT_NO_MIGRATION');

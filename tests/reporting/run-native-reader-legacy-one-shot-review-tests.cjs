'use strict';
// Synthetic-only contract for a one-off historical Reader V2 review.
// Never reads real checkpoint/event files, SQL, browser or customer details.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {makeEvent}=require('./build-reader-one-shot-lab-fixture.cjs');
const {selectOneLegacy,reviewOneLegacy}=require(
 '../../runtime/reporting/native_reader_legacy_one_shot_review_v1.cjs');
const {selectOne:selectCanonicalV2}=require(
 '../../runtime/reporting/native_reader_existing_event_binding_v1.cjs');
let count=0;function check(label,fn){fn();count++;console.log('PASS '+label);}
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const event=makeEvent();event.snapshot_hash=event.snapshot_hash.toUpperCase();
 const checkpoint={
  schema:'deliveryos.tata-reader-continuous-checkpoint.v1',
  bootstrap_complete:true,entries:[{
   order_key:event.order_key,snapshot_hash:event.snapshot_hash,
   emitted_hash:event.snapshot_hash,stable_count:3,
   last_seen_order_time:'2026-11-05T12:04:00.0000000'
  }]
 };
 return {checkpoint,event};
}
function safe(r){
 const s=JSON.stringify(r);
 for(const token of ['FICT_COMMAND','FICT_SALE','FICT_PRODUCT',
   'FICT_PRIVATE_SENTINEL',"L'ação",'9200001000','reader-events-v1'])
  assert.equal(s.includes(token),false,'LEAK_'+token);
 assert.equal(r.ordersPublishable,0);
 assert.equal(r.homePublishAuthorized,false);
 assert.equal(r.customerDataExported,false);
 assert.equal(r.rawHashExported,false);
 assert.equal(r.rawOrderIdsExported,0);
 assert.equal(r.sourceVerified,false);
 assert.equal(r.privateDescriptor,null);
 assert.equal(r.legacyDiagnosticOnly,true);
}
check('legacy checkpoint selects a private filename, never a field permission',()=>{
 const {checkpoint,event}=fixture();
 const s=selectOneLegacy(checkpoint);
 assert.equal(s.state,'PRIVATE_LEGACY_CANDIDATE_UNVERIFIED');
 assert.equal(s.privateDescriptor.event_filename,
  'FICT_COMMAND_'+event.snapshot_hash+'.json');
 assert.equal(s.ordersPublishable,0);
 assert.equal(s.sourceVerified,false);
});
check('private legacy file and SHA never appear in generic JSON',()=>{
 const {checkpoint,event}=fixture();
 const r=selectOneLegacy(checkpoint);
 assert.equal(Object.keys(r).includes('privateDescriptor'),false);
 assert.equal(Object.getOwnPropertyDescriptor(r,'privateDescriptor').enumerable,false);
 assert.equal(JSON.stringify(r).includes(event.snapshot_hash),false);
 assert.equal(JSON.stringify(r).includes('FICT_COMMAND'),false);
});
check('uppercase legacy event is self-consistent but returns only HOLD receipt',()=>{
 const {checkpoint,event}=fixture(),before=JSON.stringify({checkpoint,event});
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.state,'HOLD');
 assert.equal(r.reason,'N2_N3_SELF_CONSISTENT_SOURCE_UNATTESTED');
 assert.equal(r.checkpointBound,true);
 assert.equal(r.n2StructureSelfConsistent,true);
 assert.equal(r.n3CanonicalHashSelfConsistent,true);
 assert.equal(r.legacyUppercaseNormalized,true);
 assert.equal(r.completeSqlReadVerified,false);
 assert.equal(r.sourceFreshnessVerified,false);
 assert.equal(JSON.stringify({checkpoint,event}),before);
 safe(r);
});
check('canonical V2 selector STILL refuses the historical checkpoint',()=>{
 const {checkpoint}=fixture(),r=selectCanonicalV2(checkpoint);
 assert.equal(r.state,'HOLD');
 assert.equal(r.reason,'CHECKPOINT_V2_FORMAT_OR_ORIGIN_UNVERIFIED');
 assert.equal(r.privateDescriptor,null);
});
check('adding V2 markers to legacy checkpoint never becomes migration',()=>{
 const {checkpoint,event}=fixture();
 checkpoint.hash_contract_version='NODE_CANONICAL_JSON_SHA256_V1';
 checkpoint.checkpoint_origin='FRESH_NODE_CANONICAL_V2';
 checkpoint.checkpoint_generation='abcdef0123456789abcdef0123456789';
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'LEGACY_CHECKPOINT_SHAPE_UNVERIFIED');safe(r);
});
check('lowercase hash belongs to canonical path, not legacy one-shot',()=>{
 const {checkpoint,event}=fixture();
 checkpoint.entries[0].snapshot_hash=event.snapshot_hash.toLowerCase();
 checkpoint.entries[0].emitted_hash=event.snapshot_hash.toLowerCase();
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'LEGACY_HASH_OR_STABILITY_INVALID');safe(r);
});
check('same-key changed event digest cannot bind to checkpoint',()=>{
 const {checkpoint,event}=fixture();
 event.snapshot_hash='A'.repeat(64);
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'LEGACY_EVENT_CHECKPOINT_MISMATCH');safe(r);
});
check('changing quantity with original uppercase hash fails SHA recomputation',()=>{
 const {checkpoint,event}=fixture();event.order.items[0].QTPRODCOMVEN='9.000';
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'N3_HASH_BYTES_NOT_CANONICAL');
 assert.equal(r.checkpointBound,false);safe(r);
});
check('PowerShell apostrophe escaping cannot pass by uppercase comparison',()=>{
 const {checkpoint,event}=fixture(),o=event.order;
 const keys=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
  'NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
 const basis=Object.fromEntries(keys.map(k=>[k,o[k]]));
 basis.items=o.items.map(i=>Object.fromEntries(
  ['NRPRODCOMVEN','CDPRODUTO','CDARVPROD',
   'QTPRODCOMVEN','IDSTPRCOMVEN'].map(k=>[k,i[k]])));
 basis.observation_rows=o.observation_rows;
 const json=JSON.stringify(basis);
 const ps=json.replace("L'ação",'L\\u0027ação');
 assert.notEqual(ps,json);
 event.snapshot_hash=createHash('sha256').update(ps).digest('hex').toUpperCase();
 checkpoint.entries[0].snapshot_hash=event.snapshot_hash;
 checkpoint.entries[0].emitted_hash=event.snapshot_hash;
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'N3_HASH_BYTES_NOT_CANONICAL');safe(r);
});
check('tampered item-note relationship fails even if digest is recomputed',()=>{
 const {checkpoint,event}=fixture();
 event.order.observation_rows[0].CDPRODUTO='ANOTHER_PRODUCT';
 const {snapshotHash}=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
 event.snapshot_hash=snapshotHash(event.order).toUpperCase();
 checkpoint.entries[0].snapshot_hash=event.snapshot_hash;
 checkpoint.entries[0].emitted_hash=event.snapshot_hash;
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.n2StructureSelfConsistent,false);
 assert.equal(r.detailCode,'ITEM_OBSERVATION_JOIN_MISMATCH');safe(r);
});
check('forged source certification and ready flags do not grant field authority',()=>{
 const {checkpoint,event}=fixture();
 Object.assign(event,{sourceAuthenticated:true,ready_for_downstream_shadow:true,
   customer_name:'FICT_PRIVATE_SENTINEL'});
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.sourceVerified,false);assert.equal(r.ordersPublishable,0);
 safe(r);
});
check('no emitted candidate keeps the one-order read unavailable',()=>{
 const {checkpoint,event}=fixture();
 checkpoint.entries[0].emitted_hash=null;
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'NO_LEGACY_STABLE_CANDIDATE');safe(r);
});
check('unstable candidate cannot be taken as an emitted revision',()=>{
 const {checkpoint,event}=fixture();
 checkpoint.entries[0].stable_count=1;
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'NO_LEGACY_STABLE_CANDIDATE');safe(r);
});
check('duplicate key poisons entire checkpoint before selection',()=>{
 const {checkpoint,event}=fixture();
 checkpoint.entries.push(clone(checkpoint.entries[0]));
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'LEGACY_ITAIM_KEY_INVALID');safe(r);
});
check('all entries validated, not only first eligible record',()=>{
 const {checkpoint,event}=fixture();
 checkpoint.entries.push({...checkpoint.entries[0],order_key:'0001|01|OLD|OTHER',
   last_seen_order_time:'2026-11-04T11:00:00.0000000',
   emitted_hash:'NOT_SHA'});
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'LEGACY_HASH_OR_STABILITY_INVALID');safe(r);
});
check('out-of-order source wall time cannot select a private file',()=>{
 const {checkpoint,event}=fixture();
 checkpoint.entries.push({...checkpoint.entries[0],order_key:'0001|01|OLD|OTHER',
  last_seen_order_time:'2026-11-06T10:00:00.0000000'});
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'LEGACY_CHECKPOINT_ORDER_INVALID');safe(r);
});
check('invalid native date including leap overflow is rejected',()=>{
 const {checkpoint,event}=fixture();
 checkpoint.entries[0].last_seen_order_time='2026-02-30T12:04:00';
 const r=reviewOneLegacy(checkpoint,event);
 assert.equal(r.reason,'LEGACY_WALL_TIME_UNVERIFIED');safe(r);
});
check('wrong store and path characters are blocked',()=>{
 for(const key of ['0002|01|FICT_SALE|FICT_COMMAND',
   '0001|02|FICT_SALE|FICT_COMMAND',
   '0001|01|FICT_SALE|../secret']){
  const {checkpoint,event}=fixture();checkpoint.entries[0].order_key=key;
  const r=reviewOneLegacy(checkpoint,event);
  assert.equal(r.reason,'LEGACY_ITAIM_KEY_INVALID');safe(r);
 }
});
check('malformed or oversized checkpoint never enters review',()=>{
 for(const cp of [null,[],{},{
   schema:'deliveryos.tata-reader-continuous-checkpoint.v1',
   bootstrap_complete:true,entries:Array(251).fill(fixture().checkpoint.entries[0])
 }]){
  const r=reviewOneLegacy(cp,fixture().event);
  assert.equal(r.state,'HOLD');safe(r);
 }
});
check('historical file existence is never asserted by a pure selector',()=>{
 const {checkpoint}=fixture(),r=selectOneLegacy(checkpoint);
 assert.equal(r.state,'PRIVATE_LEGACY_CANDIDATE_UNVERIFIED');
 assert.equal('persistedFileVerified' in r,false);
 assert.equal('fieldReadExecuted' in r,false);
});
console.log('NATIVE_READER_LEGACY_ONE_SHOT_REVIEW_PASS '+count+'/'+count+
 ' SYNTHETIC_ONLY NO_CAIXA_NO_MIGRATION');

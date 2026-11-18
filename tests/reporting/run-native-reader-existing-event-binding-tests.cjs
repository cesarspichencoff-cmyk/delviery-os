'use strict';
// Fictitious native event; never read Windows data or actual customer notes.
const assert=require('node:assert/strict');
const {makeEvent}=require('./build-reader-one-shot-lab-fixture.cjs');
const {selectOne,reviewOne}=require('../../runtime/reporting/native_reader_existing_event_binding_v1.cjs');
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
function prepare(){
 const event=makeEvent(),h=event.snapshot_hash;
 return {event,checkpoint:{
  schema:'deliveryos.tata-reader-continuous-checkpoint.v1',
  hash_contract_version:'NODE_CANONICAL_JSON_SHA256_V1',
  checkpoint_origin:'FRESH_NODE_CANONICAL_V2',
  checkpoint_generation:'abcdef0123456789abcdef0123456789',
  bootstrap_complete:true,entries:[{
   order_key:event.order_key,stable_count:3,snapshot_hash:h,emitted_hash:h,
   last_seen_order_time:'2026-11-05T11:59:00.0000000'
  }]
 }};
}
function safe(result){
 const s=JSON.stringify(result);
 for(const word of ['FICT_SALE','FICT_COMMAND','FICT_PRODUCT','FICT_PRIVATE_SENTINEL',
  "L'ação",'9200001000','reader-events-v1'])assert(!s.includes(word),'LEAK:'+word);
 assert.equal(result.ordersPublishable,0);
 assert.equal(result.homePublishAuthorized,false);
 assert.equal(result.sourceVerified,false);
 assert.equal('order' in result,false);
 assert.equal('snapshot_hash' in result,false);
}
check('selects one stable emitted V2 filename privately, with no field claim',()=>{
 const {event,checkpoint}=prepare();
 const r=selectOne(checkpoint);
 assert.equal(r.state,'CANDIDATE_PRIVATE_UNVERIFIED');
 assert.equal(r.privateDescriptor.event_filename,
  'FICT_COMMAND_'+event.snapshot_hash+'.json');
 assert.equal(r.sourceVerified,false);assert.equal(r.checkpointBound,false);
});
check('private descriptor never appears in generic JSON logs',()=>{
 const {event,checkpoint}=prepare();
 const candidate=selectOne(checkpoint);
 const json=JSON.stringify(candidate);
 assert.equal(candidate.privateDescriptor.event_filename,
  'FICT_COMMAND_'+event.snapshot_hash+'.json');
 assert.equal(Object.keys(candidate).includes('privateDescriptor'),false);
 assert.equal(Object.getOwnPropertyDescriptor(candidate,'privateDescriptor').enumerable,false);
 for(const secret of ['FICT_SALE','FICT_COMMAND',event.snapshot_hash])
  assert.equal(json.includes(secret),false);
 assert.equal(candidate.ordersPublishable,0);
});
check('sanitized result remains without a private descriptor after binding',()=>{
 const {checkpoint,event}=prepare();
 const r=reviewOne(checkpoint,event);
 assert.equal(r.privateDescriptor,null);
 assert.equal(JSON.stringify(r).includes('FICT_COMMAND'),false);
 assert.equal(JSON.stringify(r).includes(event.snapshot_hash),false);
});
check('V2-shaped but synthetic event gets sanitized checkpoint binding',()=>{
 const {checkpoint,event}=prepare(),raw=JSON.stringify(event);
 const r=reviewOne(checkpoint,event);
 assert.equal(r.state,'HOLD');assert.equal(r.checkpointBound,true);
 assert.equal(r.n2StructureSelfConsistent,true);
 assert.equal(r.n3CanonicalHashSelfConsistent,true);
 assert.equal(r.sourceFreshnessVerified,false);
 assert.equal(r.completeSqlReadVerified,false);
 assert.equal(r.legacyUppercaseNormalized,false);
 assert.equal(JSON.stringify(event),raw);
 safe(r);
});
check('checkpoint binding is not permission to publish or prove source',()=>{
 const {checkpoint,event}=prepare();
 Object.assign(event,{sourceAuthenticated:true,sourceMode:'real',
  ready_for_downstream_shadow:true,proof:'FICT_PRIVATE_SENTINEL'});
 const r=reviewOne(checkpoint,event);
 assert.equal(r.state,'HOLD');assert.equal(r.sourceVerified,false);safe(r);
});
check('replaced file with same key different hash is blocked',()=>{
 const {checkpoint,event}=prepare();event.snapshot_hash='A'.repeat(64);
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'CHECKPOINT_EVENT_IDENTITY_OR_HASH_MISMATCH');safe(r);
});
check('modified payload under original hash cannot be accepted',()=>{
 const {checkpoint,event}=prepare();event.order.items[0].QTPRODCOMVEN='9.000';
 const r=reviewOne(checkpoint,event);
 assert.equal(r.checkpointBound,false);
 assert.equal(r.reason,'N3_HASH_BYTES_NOT_CANONICAL');safe(r);
});
check('different order key cannot use another checkpoint entry',()=>{
 const {checkpoint,event}=prepare();event.order_key='0001|01|FICT_OTHER|FICT_COMMAND';
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'CHECKPOINT_EVENT_IDENTITY_OR_HASH_MISMATCH');safe(r);
});
check('duplicates in checkpoint prevent selecting arbitrary revision',()=>{
 const {checkpoint,event}=prepare();checkpoint.entries.push({...checkpoint.entries[0]});
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'CHECKPOINT_SCOPE_KEY_OR_DUPLICATE_INVALID');safe(r);
});
check('path traversal is rejected before constructing a file path',()=>{
 const {checkpoint}=prepare();checkpoint.entries[0].order_key='0001|01|X|../private';
 const r=selectOne(checkpoint);
 assert.equal(r.state,'HOLD');assert.equal(r.privateDescriptor,null);
});
check('non-Itaim key cannot be selected even if stable',()=>{
 const {checkpoint,event}=prepare();checkpoint.entries[0].order_key='0002|01|X|Y';
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'CHECKPOINT_SCOPE_KEY_OR_DUPLICATE_INVALID');safe(r);
});
check('not yet emitted means no eligible candidate',()=>{
 const {checkpoint,event}=prepare();checkpoint.entries[0].emitted_hash=null;
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'NO_STABLE_EMITTED_REVISION');safe(r);
});
check('unstable same-hash entry is not proof of emission stability',()=>{
 const {checkpoint,event}=prepare();checkpoint.entries[0].stable_count=1;
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'NO_STABLE_EMITTED_REVISION');safe(r);
});
check('more than 250 checkpoint entries is bounded out',()=>{
 const {checkpoint,event}=prepare();checkpoint.entries=Array(251).fill(checkpoint.entries[0]);
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'CHECKPOINT_ENVELOPE_INVALID');safe(r);
});
check('checkpoint order must preserve descending source wall clock text',()=>{
 const {checkpoint,event}=prepare();
 const older={...checkpoint.entries[0],order_key:'0001|01|OLD|C2',
  last_seen_order_time:'2026-11-05T12:01:00.0000000'};
 checkpoint.entries.push(older);
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'CHECKPOINT_ORDER_NOT_DESCENDING');safe(r);
});
check('timestamp without source format fails closed',()=>{
 const {checkpoint,event}=prepare();
 checkpoint.entries[0].last_seen_order_time='05/11 12:00';
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'SOURCE_TIME_UNVERIFIED');safe(r);
});
check('legacy event quantity change cannot be mistaken for a migration-only change',()=>{
 const {checkpoint,event}=prepare();
 event.order.items[0].QTPRODCOMVEN='14.000';
 const r=reviewOne(checkpoint,event);
 assert.equal(r.checkpointBound,false);assert.equal(r.ordersPublishable,0);safe(r);
});
check('corrupted legacy emitted hash in other entry blocks entire checkpoint',()=>{
 const {checkpoint,event}=prepare();
 checkpoint.entries.push({...checkpoint.entries[0],
  order_key:'0001|01|FICT_OLD|FICT_OLD_COMMAND',
  last_seen_order_time:'2026-11-04T11:00:00.0000000',
  emitted_hash:'NOT_A_DIGEST'});
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'CHECKPOINT_HASH_OR_STABILITY_INVALID');
 safe(r);
});
check('impossible SQL wall date must not count as validated source time',()=>{
 const {checkpoint,event}=prepare();
 checkpoint.entries[0].last_seen_order_time='2026-02-30T11:59:00.0000000';
 const r=reviewOne(checkpoint,event);
 assert.equal(r.reason,'SOURCE_TIME_UNVERIFIED');safe(r);
});
check('invalid checkpoint is consistently HOLD',()=>{
 for(const cp of [null,{},[],{schema:'unknown',entries:[]}]){
  const r=selectOne(cp);assert.equal(r.state,'HOLD');
  assert.equal(r.privateDescriptor,null);
 }
});
check('legacy uppercase checkpoint is NEVER silently migrated to V2',()=>{
 const {checkpoint,event}=prepare();
 checkpoint.entries[0].snapshot_hash=event.snapshot_hash.toUpperCase();
 checkpoint.entries[0].emitted_hash=event.snapshot_hash.toUpperCase();
 const r=selectOne(checkpoint);
 assert.equal(r.reason,'CHECKPOINT_HASH_OR_STABILITY_INVALID');
 assert.equal(r.privateDescriptor,null);safe(r);
});
check('old checkpoint missing origin/generation cannot select private filename',()=>{
 const {checkpoint}=prepare();delete checkpoint.hash_contract_version;
 const r=selectOne(checkpoint);
 assert.equal(r.reason,'CHECKPOINT_V2_FORMAT_OR_ORIGIN_UNVERIFIED');
 assert.equal(r.privateDescriptor,null);
});
check('spoofed old checkpoint with marker but missing V2 generation stays HOLD',()=>{
 const {checkpoint}=prepare();delete checkpoint.checkpoint_generation;
 const r=selectOne(checkpoint);
 assert.equal(r.reason,'CHECKPOINT_V2_FORMAT_OR_ORIGIN_UNVERIFIED');
 assert.equal(r.privateDescriptor,null);
});
check('origin, hash contract and generation must all match canonical V2',()=>{
 for(const [field,value] of [
  ['hash_contract_version','LEGACY_SHA256_UPPERCASE'],
  ['checkpoint_origin','LEGACY_MARKER_ONLY'],
  ['checkpoint_generation','A'.repeat(32)],
  ['checkpoint_generation','not-a-generation'],
 ]) {
  const {checkpoint}=prepare();
  checkpoint[field]=value;
  const r=selectOne(checkpoint);
  assert.equal(r.state,'HOLD',field);
  assert.equal(r.reason,'CHECKPOINT_V2_FORMAT_OR_ORIGIN_UNVERIFIED',field);
 }
});
check('even a V2-marked checkpoint rejects a second entry in legacy hash case',()=>{
 const {checkpoint,event}=prepare();
 checkpoint.entries.push({...checkpoint.entries[0],
  order_key:'0001|01|OLDER|S2',
  last_seen_order_time:'2026-11-04T11:00:00.0000000',
  snapshot_hash:event.snapshot_hash.toUpperCase(),
  emitted_hash:event.snapshot_hash.toUpperCase()});
 const r=selectOne(checkpoint);
 assert.equal(r.reason,'CHECKPOINT_HASH_OR_STABILITY_INVALID');
 assert.equal(r.privateDescriptor,null);
});
console.log('NATIVE_READER_EXISTING_EVENT_BINDING_PASS '+count+'/'+count+' SYNTHETIC_ONLY');

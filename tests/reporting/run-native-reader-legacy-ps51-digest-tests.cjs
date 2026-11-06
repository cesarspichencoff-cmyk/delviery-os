'use strict';
// Offline synthetic N2/N3 regression. Never reads installed Reader or orders.
const assert=require('node:assert/strict');
const {makeEvent}=require('./build-reader-one-shot-lab-fixture.cjs');
const {snapshotHash}=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const dig=require('../../runtime/reporting/native_reader_legacy_ps51_digest_v1.cjs');
const {review}=require('../../runtime/reporting/native_reader_n2n3_sanitized_receipt_v2.cjs');
const {reviewOne}=require('../../runtime/reporting/native_reader_existing_event_binding_v2.cjs');
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
const mk=()=>makeEvent();
const compare=e=>JSON.stringify(e);
function receiptSafe(r,event){
 const s=JSON.stringify(r);
 for(const secret of ['FICT_SALE','FICT_COMMAND','FICT_PRODUCT',
   'FICT_PRIVATE_SENTINEL','reader-events-v1',event.snapshot_hash,
   'L\\u0027a','L\'ação']){
  assert(!s.includes(secret),'RAW DATA LEAK:'+secret);
 }
 assert(Buffer.byteLength(s,'utf8')<=2048,'receipt too large');
 assert.equal(r.state,'HOLD');assert.equal(r.ordersPublishable,0);
 assert.equal(r.homePublishAuthorized,false);assert.equal(r.actionsExecuted,0);
 assert.equal(r.sourceIdentityVerified,false);assert.equal(r.sourceFreshnessVerified,false);
 assert.equal(r.n2ObservationReadIndependentlyComplete,false);
 assert.equal(r.customerDataExported,false);assert.equal(r.rawHashExported,false);
 assert.equal(r.rawOrderIdsExported,0);
}
test('basis is canonical and pristine',()=>{
 const e=mk(),before=compare(e),b=dig.hashBasis(e.order);
 assert(dig.checkBasisGuard(e.order));
 assert.equal(snapshotHash(e.order),
  require('node:crypto').createHash('sha256').update(JSON.stringify(b)).digest('hex'));
 assert.equal(compare(e),before);
});
test('PS5.1 apostrophe digest differs from JS canonical digest',()=>{
 const e=mk(),p=dig.legacyDigestUpper(e.order);
 assert.match(p,/^[0-9A-F]{64}$/);
 assert.notEqual(p.toLowerCase(),snapshotHash(e.order));
 assert.equal(dig.divergentClasses(e.order).apostrophe,true);
 assert(dig.ps51CompactJson(dig.hashBasis(e.order)).includes('\\u0027'));
});
test('canonical digest and legitimate legacy digest both bind to exact content',()=>{
 const e=mk(),canonical=review(e);
 assert.equal(canonical.n3CanonicalDigestMatch,true);
 assert.equal(canonical.n3LegacyPs51DigestMatch,false);
 assert.equal(canonical.n2StructureSelfConsistent,true);
 assert.equal(canonical.n3DigestBoundToContent,true);
 receiptSafe(canonical,e);
 e.snapshot_hash=dig.legacyDigestUpper(e.order);
 const legacy=review(e);
 assert.equal(legacy.n3LegacyPs51DigestMatch,true);
 assert.equal(legacy.n3CanonicalDigestMatch,false);
 assert.equal(legacy.n3DivergenceExplainedByLegacyEscaping,true);
 assert.equal(legacy.n2StructureSelfConsistent,true);
 assert.equal(legacy.reason,'N2_N3_SELF_CONSISTENT_SOURCE_UNATTESTED');
 receiptSafe(legacy,e);
});
test('tampered quantity under a legitimate legacy digest is rejected',()=>{
 const e=mk();e.snapshot_hash=dig.legacyDigestUpper(e.order);
 e.order.items[0].QTPRODCOMVEN='9.000';
 const r=review(e);assert.equal(r.n3DigestBoundToContent,false);
 assert.equal(r.reason,'N3_DIGEST_NOT_BOUND_TO_CONTENT');
 assert.equal(r.n2StructureSelfConsistent,true);receiptSafe(r,e);
});
test('tampered observation under a legitimate legacy digest is rejected',()=>{
 const e=mk();e.snapshot_hash=dig.legacyDigestUpper(e.order);
 e.order.observation_rows[0].value+='TAMPERED';
 const r=review(e);assert.equal(r.n3DigestBoundToContent,false);receiptSafe(r,e);
});
test('order/item note drift and valid digest are separately visible',()=>{
 const e=mk();e.order.observation_rows[0].CDPRODUTO='OTHER';
 e.snapshot_hash=dig.legacyDigestUpper(e.order);
 const r=review(e);assert.equal(r.n3DigestBoundToContent,true);
 assert.equal(r.n2StructureSelfConsistent,false);
 assert.equal(r.n2StructureDetailCode,'ITEM_OBSERVATION_JOIN_MISMATCH');
 receiptSafe(r,e);
});
test('both tampered digest and structural break appear together',()=>{
 const e=mk();e.snapshot_hash=dig.legacyDigestUpper(e.order);
 e.order.observation_rows[0].CDPRODUTO='OTHER';
 const r=review(e);assert.equal(r.n3DigestBoundToContent,false);
 assert.equal(r.n2StructureSelfConsistent,false);
 assert.equal(r.n2StructureDetailCode,'ITEM_OBSERVATION_JOIN_MISMATCH');
 receiptSafe(r,e);
});
test('source-completeness claim never becomes independent proof',()=>{
 const e=mk();e.snapshot_hash=dig.legacyDigestUpper(e.order);
 const r=review(e);assert.equal(r.n2ObservationReadIndependentlyComplete,false);
 assert.equal(r.sourceIdentityVerified,false);receiptSafe(r,e);
});
test('stable emitted checkpoint binds LEGACY digest without native ID leak',()=>{
 const e=mk();e.snapshot_hash=dig.legacyDigestUpper(e.order);
 const cp={schema:'deliveryos.tata-reader-continuous-checkpoint.v1',
  bootstrap_complete:true,entries:[{order_key:e.order_key,
   stable_count:7,snapshot_hash:e.snapshot_hash,emitted_hash:e.snapshot_hash,
   last_seen_order_time:'2026-11-05T12:04:00.0000000'}]};
 const r=reviewOne(cp,e);
 assert.equal(r.checkpointBound,true);assert.equal(r.stabilityBucket,'3-9');
 assert.equal(r.n3LegacyPs51DigestMatch,true);
 receiptSafe(r,e);
});
test('changed event hash cannot bind to checkpoint',()=>{
 const e=mk();const saved=e.snapshot_hash,cp={
  schema:'deliveryos.tata-reader-continuous-checkpoint.v1',bootstrap_complete:true,
  entries:[{order_key:e.order_key,stable_count:2,snapshot_hash:saved,
   emitted_hash:saved,last_seen_order_time:'2026-11-05T12:04:00.0000000'}]};
 e.snapshot_hash='A'.repeat(64);
 const r=reviewOne(cp,e);assert.equal(r.checkpointBound,false);
 assert.equal(r.reason,'CHECKPOINT_EVENT_IDENTITY_OR_HASH_MISMATCH');
 receiptSafe(r,e);
});
test('unknown numbers and odd input never accept PS5.1 digest',()=>{
 const e=mk();e.order.items[0].QTPRODCOMVEN=Number.POSITIVE_INFINITY;
 assert.equal(dig.legacyDigestUpper(e.order),null);
 const r=review(e);assert.equal(r.n3LegacyPs51DigestMatch,false);
 receiptSafe(r,e);
});
test('no action on unbounded input or invalid envelope',()=>{
 const e=mk();e.order.items=Array(201).fill(e.order.items[0]);
 const r=review(e);assert.equal(r.n3DigestBoundToContent,false);
 receiptSafe(r,e);
 for(const bad of [null,{},[],{order:'FICT_PRIVATE_SENTINEL'}]){
  const out=review(bad);assert.equal(out.n3DigestBoundToContent,false);
  assert.equal(out.ordersPublishable,0);
 }
});
console.log('NATIVE_READER_LEGACY_PS51_DIGEST_PASS '+passed+'/'+passed+' SYNTHETIC_ONLY');

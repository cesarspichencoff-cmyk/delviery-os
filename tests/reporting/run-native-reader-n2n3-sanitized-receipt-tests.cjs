'use strict';
// Fully synthetic; tests NEVER use real order IDs, customers or notes.
const assert=require('node:assert/strict');
const {review}=require('../../runtime/reporting/native_reader_n2n3_sanitized_receipt_v1.cjs');
const {snapshotHash}=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
let passed=0;
const check=(label,fn)=>{fn();passed++;console.log('PASS '+label)};
function base(){
 const order={
  CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'FICTSALE1',NRCOMANDA:'FICTCMD1',
  NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'3',
  DTHRABERMESA:'2026-11-05T12:01:00.0000000',
  items:[
   {NRPRODCOMVEN:'LINE1',CDPRODUTO:'PROD1',CDARVPROD:'9200001000',QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4'},
   {NRPRODCOMVEN:'LINE2',CDPRODUTO:'PROD2',CDARVPROD:'9200002000',QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4'}
  ],
  observation_scan_complete:true,observation_rows:[
   {source_field:'DSOBSPEDDIGCMD',scope_hint:'item',item_index:0,CDPRODUTO:'PROD1',
    join_proven:true,value:"PRIVATE_SENTINEL L'IMITADO com açafrão"},
   {source_field:'DSOBSCOMANDA',scope_hint:'order',
    join_proven:true,value:'PRIVATE_SENTINEL geral'}
  ]
 };
 return {schema:'deliveryos.tata-reader-stable-order-event.v1',
   order_key:'0001|01|FICTSALE1|FICTCMD1',
   snapshot_hash:snapshotHash(order).toUpperCase(),order};
}
const serialize=x=>JSON.stringify(x);
function assertNoRaw(r){
 const text=serialize(r);
 for(const secret of ['PRIVATE_SENTINEL','FICTSALE1','FICTCMD1','PROD1','L\\u0027IMITADO','açafrão']){
  assert.equal(text.includes(secret),false,secret+' leak');
 }
 assert.equal('event' in r,false);
 assert.equal('order' in r,false);
 assert.equal('snapshot_hash' in r,false);
 assert.equal(r.customerDataExported,false);
 assert.equal(r.rawHashExported,false);
 assert.equal(r.rawOrderIdsExported,0);
 assert.equal(r.ordersPublishable,0);
 assert.equal(r.homePublishAuthorized,false);
 assert.equal(r.actionsExecuted,0);
 assert.equal(r.sourceIdentityVerified,false);
 assert.equal(r.sourceFreshnessVerified,false);
 assert.equal(r.n2ObservationReadIndependentlyComplete,false);
}
check('uppercase legacy digest can be rechecked without exposing payload',()=>{
 const e=base(), before=serialize(e), r=review(e);
 assert.equal(r.state,'HOLD');
 assert.equal(r.reason,'N2_N3_SELF_CONSISTENT_SOURCE_UNATTESTED');
 assert.equal(r.n2StructureSelfConsistent,true);
 assert.equal(r.n3CanonicalHashSelfConsistent,true);
 assert.equal(r.legacyUppercaseNormalized,true);
 assert.equal(r.itemRows,2);assert.equal(r.noteRows,2);
 assert.equal(serialize(e),before);
 assertNoRaw(r);
});
check('canonical lowercase digest also remains HOLD',()=>{
 const e=base();e.snapshot_hash=e.snapshot_hash.toLowerCase();
 const r=review(e);
 assert.equal(r.n3CanonicalHashSelfConsistent,true);
 assert.equal(r.legacyUppercaseNormalized,false);
 assertNoRaw(r);
});
check('item count is not enough when legacy hash differs',()=>{
 const e=base();e.order.items[0].QTPRODCOMVEN='3.000';
 const r=review(e);
 assert.equal(r.reason,'N3_HASH_BYTES_NOT_CANONICAL');assertNoRaw(r);
});
check('PowerShell apostrophe escape hash is NOT a casing fix',()=>{
 const e=base();
 const o=e.order, keys=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT',
  'IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
 const basis=Object.fromEntries(keys.map(k=>[k,o[k]]));
 basis.items=o.items.map(x=>Object.fromEntries(
  ['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'].map(k=>[k,x[k]])));
 basis.observation_rows=o.observation_rows;
 const psJson=JSON.stringify(basis).replace("L'IMITADO",'L\\u0027IMITADO');
 assert.notEqual(psJson,JSON.stringify(basis));
 e.snapshot_hash=require('node:crypto').createHash('sha256').update(psJson).digest('hex').toUpperCase();
 const r=review(e);
 assert.equal(r.reason,'N3_HASH_BYTES_NOT_CANONICAL');assertNoRaw(r);
});
check('incorrect item observation join blocks even after recomputed digest',()=>{
 const e=base();e.order.observation_rows[0].CDPRODUTO='WRONG';
 e.snapshot_hash=snapshotHash(e.order).toUpperCase();
 const r=review(e);
 assert.equal(r.detailCode,'ITEM_OBSERVATION_JOIN_MISMATCH');
 assertNoRaw(r);
});
check('claiming scan incomplete blocks even if hashing remains unchanged',()=>{
 const e=base();e.order.observation_scan_complete=false;
 const r=review(e);
 assert.equal(r.detailCode,'OBSERVATION_COMPLETENESS_MISSING_OR_UNATTESTED');
 assertNoRaw(r);
});
check('different DLV origin cannot masquerade as DLV_IFO',()=>{
 const e=base();e.order.IDORGCMDVENDA='DLV_OTHER';
 e.snapshot_hash=snapshotHash(e.order).toUpperCase();
 const r=review(e);assert.equal(r.n2StructureSelfConsistent,false);
 assert.equal(r.detailCode,'NATIVE_ITAIM_SCOPE_OR_REQUIRED_FIELDS_INVALID');assertNoRaw(r);
});
check('missing notes array is rejected and not silently assumed empty',()=>{
 const e=base();delete e.order.observation_rows;
 const r=review(e);
 assert.equal(r.reason,'REVIEW_ENVELOPE_OR_BOUNDS_INVALID');assertNoRaw(r);
});
check('excessive event input does not run hash conversion',()=>{
 const e=base();e.order.items=Array(201).fill(e.order.items[0]);
 const r=review(e);assert.equal(r.reason,'REVIEW_ENVELOPE_OR_BOUNDS_INVALID');assertNoRaw(r);
});
check('malformed input fails closed without echoing values',()=>{
 for(const e of [null,'PRIVATE_SENTINEL',{}, {order:{observation_rows:[]}}]){
  const r=review(e);assert.equal(r.state,'HOLD');assertNoRaw(r);
 }
});
check('no false source authority is created by event-provided claims',()=>{
 const e=base();
 e.sourceAuthenticated=true;e.ready_for_downstream_shadow=true;
 e.observation_read_exhausted=true;e.sourceMode='real';e.customer_name='PRIVATE_SENTINEL';
 const r=review(e);
 assert.equal(r.n2StructureSelfConsistent,true);
 assert.equal(r.sourceIdentityVerified,false);
 assert.equal(r.n2ObservationReadIndependentlyComplete,false);
 assertNoRaw(r);
});
console.log('NATIVE_READER_N2N3_SANITIZED_RECEIPT_PASS '+passed+'/'+passed+' SYNTHETIC_ONLY');
// Reuse this existing CI contract entrypoint; do not change workflow permissions.
require('./run-native-reader-existing-event-binding-tests.cjs');

'use strict';
// Invented, local-only evidence. No SQL, files, personal data, printer or service.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {snapshotHash}=require('./tata_comanda_reader_native_essentials_v857_offline.cjs');
const {review,SCHEMA}=require('./comandas_reader_legacy_event_reconciliation_review_only.cjs');
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
function order(i){
 return {
  CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'LABSALE'+i,NRCOMANDA:'LABCMD'+i,
  NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'3',
  DTHRABERMESA:'2026-11-04T12:20:00.0000000',
  items:[{NRPRODCOMVEN:'LINE1',CDPRODUTO:'LABPROD1',
   CDARVPROD:'9200001000',QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4'}],
  observation_scan_complete:true,
  observation_rows:[{source_field:'DSOBSPEDDIGCMD',value:'FICTICIO SEM MOLHO',
   scope_hint:'item',item_index:0,CDPRODUTO:'LABPROD1',join_proven:true}]
 };
}
function pair(i){
 const o=order(i),h=snapshotHash(o).toUpperCase();
 const k=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|');
 const event={schema:'deliveryos.tata-reader-stable-order-event.v1',order_key:k,
  snapshot_hash:h,order:o};
 const raw=JSON.stringify(event);
 return {
  entry:{order_key:k,snapshot_hash:h,emitted_hash:h,stable_count:2,
   last_seen_order_time:'2026-11-04T12:20:00.0000000'},
  witness:{name:o.NRCOMANDA+'_'+h+'.json',json_utf8:raw,raw_sha256:sha(raw)}
 };
}
function input(count=1){
 const p=Array.from({length:count},(_,i)=>pair(i+1));
 return {
  schema:SCHEMA,
  checkpoint:{schema:'deliveryos.tata-reader-continuous-checkpoint.v1',
   bootstrap_complete:true,entries:p.map(x=>x.entry)},
  event_witnesses:p.map(x=>x.witness)
 };
}
function rehash(w,event){
 w.json_utf8=JSON.stringify(event);w.raw_sha256=sha(w.json_utf8);
}
let n=0;
function test(name,fn){fn();n++;console.log('PASS '+name)}
const hold=(value,reason)=>{const r=review(value);assert.equal(r.state,'HOLD');
 assert.equal(r.reason,reason);assert.equal(r.converted_checkpoint,null);
 assert.equal(r.events,null);assert.equal(r.migration_authorized,false);
 assert.equal(r.orders_publishable,0);assert.equal(r.print_authorized,false);
 assert.deepEqual(Object.values(r.effects),Array(7).fill(false));return r;};
test('matching fabricated legacy record STILL HOLD without source provenance',()=>{
 const r=hold(input(),'SOURCE_PROVENANCE_AND_SQL_COMPLETENESS_NOT_ATTESTED');
 assert.equal(r.matched_shape_count,1);assert.equal(r.original_bytes_hash_checked,true);
 assert.equal(r.source_provenance_authenticated,false);assert.equal(r.sql_revision_atomicity_proven,false);
});
test('250 fabricated fingerprints are assessed, never converted or reemitted',()=>{
 const r=hold(input(250),'SOURCE_PROVENANCE_AND_SQL_COMPLETENESS_NOT_ATTESTED');
 assert.equal(r.matched_shape_count,250);assert.equal(r.converted_checkpoint,null);
});
test('empty checkpoint does not become a migration',()=>hold(input(0),'LEGACY_CHECKPOINT_OR_WITNESS_COVERAGE_INVALID'));
test('missing witness is HOLD',()=>{
 const x=input(2);x.event_witnesses.pop();
 hold(x,'LEGACY_CHECKPOINT_OR_WITNESS_COVERAGE_INVALID');
});
test('duplicate checkpoint key is HOLD',()=>{
 const x=input(2);x.checkpoint.entries[1]=clone(x.checkpoint.entries[0]);
 hold(x,'CHECKPOINT_ENTRY_UNSAFE');
});
test('duplicate witness key is HOLD',()=>{
 const x=input(2);x.event_witnesses[1]=clone(x.event_witnesses[0]);
 hold(x,'EVENT_ENVELOPE_OR_DUPLICATE_INVALID');
});
test('lowercase legacy fingerprint is HOLD',()=>{
 const x=input();x.checkpoint.entries[0].snapshot_hash=x.checkpoint.entries[0].snapshot_hash.toLowerCase();
 hold(x,'CHECKPOINT_ENTRY_UNSAFE');
});
test('version-only rebranding is HOLD',()=>{
 const x=input();x.checkpoint.hash_contract_version='NODE_CANONICAL_JSON_SHA256_V1';
 hold(x,'LEGACY_CHECKPOINT_OR_WITNESS_COVERAGE_INVALID');
});
test('emitted fingerprint absent is HOLD',()=>{
 const x=input();x.checkpoint.entries[0].emitted_hash=null;
 hold(x,'CHECKPOINT_ENTRY_UNSAFE');
});
test('stale raw bytes digest is HOLD before parsing',()=>{
 const x=input();x.event_witnesses[0].json_utf8+=' ';
 hold(x,'EVENT_BYTES_UNVERIFIED');
});
test('altered event note with fresh outer file SHA but stale native hash is HOLD',()=>{
 const x=input(),w=x.event_witnesses[0],e=JSON.parse(w.json_utf8);
 e.order.observation_rows[0].value='LAB NOTE EDITED';rehash(w,e);
 hold(x,'LEGACY_HASH_NOT_CANONICAL_EQUIVALENT');
});
test('origin outside exact DLV_IFO is HOLD despite matching new hash',()=>{
 const x=input(),w=x.event_witnesses[0],e=JSON.parse(w.json_utf8);
 e.order.IDORGCMDVENDA='DLV_OTHER';
 const h=snapshotHash(e.order).toUpperCase();
 e.snapshot_hash=h;x.checkpoint.entries[0].snapshot_hash=h;
 x.checkpoint.entries[0].emitted_hash=h;w.name=e.order.NRCOMANDA+'_'+h+'.json';
 rehash(w,e);hold(x,'SOURCE_SCOPE_OR_OBSERVATION_SHAPE_INVALID');
});
test('missing observation completeness claim is HOLD',()=>{
 const x=input(),w=x.event_witnesses[0],e=JSON.parse(w.json_utf8);
 e.order.observation_scan_complete=false;rehash(w,e);
 hold(x,'SOURCE_SCOPE_OR_OBSERVATION_SHAPE_INVALID');
});
test('checkpoint and event identity mismatch is HOLD',()=>{
 const x=input();x.event_witnesses[0].name='ANY.json';
 hold(x,'LEGACY_CHECKPOINT_EVENT_IDENTITY_MISMATCH');
});
test('UTF-8 apostrophe escaping disparity never coerces false equality',()=>{
 const x=input(),w=x.event_witnesses[0],e=JSON.parse(w.json_utf8);
 e.order.observation_rows[0].value="FICTICIO L'IMITADO";
 const o=e.order,core={};
 for(const f of ['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT',
  'IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'])core[f]=o[f];
 core.items=o.items;
 core.observation_rows=o.observation_rows;
 const psLike=sha(JSON.stringify(core).replaceAll("'",'\\u0027')).toUpperCase();
 assert.notEqual(psLike,snapshotHash(o).toUpperCase());
 e.snapshot_hash=psLike;
 x.checkpoint.entries[0].snapshot_hash=psLike;
 x.checkpoint.entries[0].emitted_hash=psLike;
 w.name=o.NRCOMANDA+'_'+psLike+'.json';rehash(w,e);
 hold(x,'LEGACY_HASH_NOT_CANONICAL_EQUIVALENT');
});
test('forged raw SHA and matching event can only yield advisory HOLD',()=>{
 const x=input(),w=x.event_witnesses[0],e=JSON.parse(w.json_utf8);
 e.order.observation_rows[0].value='FICTICIO MODIFICADO';
 const h=snapshotHash(e.order).toUpperCase();
 e.snapshot_hash=h;x.checkpoint.entries[0].snapshot_hash=h;
 x.checkpoint.entries[0].emitted_hash=h;w.name=e.order.NRCOMANDA+'_'+h+'.json';
 rehash(w,e);
 const r=hold(x,'SOURCE_PROVENANCE_AND_SQL_COMPLETENESS_NOT_ATTESTED');
 assert.equal(r.matched_shape_count,1);
});
test('case-only duplicate checkpoint identity is HOLD under POS comparison',()=>{
 const x=input(2);x.checkpoint.entries[1].order_key=
   x.checkpoint.entries[0].order_key.toLowerCase();
 hold(x,'CHECKPOINT_ENTRY_UNSAFE');
});
test('case-only duplicate event identity is HOLD',()=>{
 const x=input(2),w=x.event_witnesses[1],e=JSON.parse(w.json_utf8);
 e.order_key=x.checkpoint.entries[0].order_key.toLowerCase();
 rehash(w,e);
 hold(x,'EVENT_ENVELOPE_OR_DUPLICATE_INVALID');
});
test('case-only duplicate Windows event filename is HOLD',()=>{
 const x=input(2);
 x.event_witnesses[1].name=x.event_witnesses[0].name.toLowerCase();
 hold(x,'EVENT_ENVELOPE_OR_DUPLICATE_INVALID');
});
console.log('READER_LEGACY_EVENT_RECONCILIATION_REVIEW_PASS '+n+'/'+n+
 ' SYNTHETIC_ONLY NO_MIGRATION_NO_SQL_NO_PRINT');

'use strict';
// Entirely invented events and base-table rows. NEVER SQL or customer records.
const assert=require('node:assert/strict');
const {makeEvent}=require('./build-reader-one-shot-lab-fixture.cjs');
const {snapshotHash}=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const {INPUT,review}=require('../../runtime/reporting/native_reader_n2_base_tables_review_v1.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const H=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT',
 'IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
const I=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
const NF=['DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN'];
function fixture(){
 const event=makeEvent(),o=event.order;
 const header=Object.fromEntries(H.map(k=>[k,o[k]]));
 const sale=Object.fromEntries(
  ['CDFILIAL','CDLOJA','NRVENDAREST','DTHRABERMESA'].map(k=>[k,o[k]]));
 const general=o.observation_rows.find(n=>n.scope_hint==='order');
 header.DSOBSCOMANDA=general?.value||null;
 const itemRows=o.items.map((x,i)=>{
  const row={CDFILIAL:o.CDFILIAL,CDLOJA:o.CDLOJA,
   NRVENDAREST:o.NRVENDAREST,NRCOMANDA:o.NRCOMANDA};
  for(const k of I)row[k]=x[k];
  for(const k of NF)row[k]=o.observation_rows.find(n=>
   n.scope_hint==='item'&&n.item_index===i&&n.source_field===k)?.value||null;
  return row;
 });
 return {schema:INPUT,event,base:{headerRows:[header],
  vendaRows:[sale],itemRows,readExhausted:true}};
}
function reh(x){x.event.snapshot_hash=snapshotHash(x.event.order).toUpperCase();return x;}
function safety(r){
 assert.equal(r.state,'HOLD');
 for(const [k,v] of Object.entries({ordersPublishable:0,homePublishAuthorized:false,
  printAuthorized:false,atomicityProven:false,sourceSqlSessionAuthenticated:false,
  sourceRowsetIndependentlyExhausted:false,independentIfoodIdentityProven:false,
  actionsExecuted:0,customerDataExported:false,rawOrderIdsExported:0,
  rawHashExported:false}))assert.deepEqual(r[k],v,k);
 const s=JSON.stringify(r);
 for(const token of ['FICT_COMMAND','FICT_SALE','FICT_PRODUCT',
  'FICT_PRIVATE_SENTINEL','9200001000','L\'ação','hash']) {
  if(token==='hash')continue;
  assert.equal(s.includes(token),false,'LEAK_'+token);
 }
 return r;
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function denied(label,change,reason){
 test(label,()=>{const x=fixture();change(x);
  const r=safety(review(x));assert.equal(r.reason,reason);
  assert.equal(r.headMatching,false);assert.equal(r.itemsMatching,false);
 });
}
test('matching independent shaped base rows are HOLD not historical atomicity',()=>{
 const x=fixture(),original=JSON.stringify(x),r=safety(review(x));
 assert.equal(r.reason,'ONE_ORDER_BASE_TABLE_FIELDS_MATCH_NOT_ATOMIC');
 assert.equal(r.headMatching,true);assert.equal(r.itemsMatching,true);
 assert.equal(r.notesMatching,true);assert.equal(r.eventHashRecomputed,true);
 assert.equal(r.itemRows,1);assert.equal(r.observationRows,1);
 assert.equal(JSON.stringify(x),original);
});
denied('wrong item CDLOJA is rejected even with same sale/command',
 x=>{x.base.itemRows[0].CDLOJA='02'},
 'ITEM_NATIVE_SHOP_OR_ORDER_SCOPE_MISMATCH');
denied('missing native item shop is not inferred from header',
 x=>{delete x.base.itemRows[0].CDLOJA},
 'ITEM_NATIVE_SHOP_OR_ORDER_SCOPE_MISMATCH');
denied('wrong sale table shop is rejected',
 x=>{x.base.vendaRows[0].CDLOJA='02'},
 'BASE_HEADER_SCOPE_OR_SALE_MISMATCH');
denied('wrong Itaim origin is rejected even if hash is updated',
 x=>{x.event.order.IDORGCMDVENDA='DLV_OTHER';x.base.headerRows[0].IDORGCMDVENDA='DLV_OTHER';reh(x)},
 'BASE_HEADER_SCOPE_OR_SALE_MISMATCH');
denied('duplicate base header is not a single native order',
 x=>{x.base.headerRows.push(copy(x.base.headerRows[0]))},
 'BASE_HEADER_OR_SALE_NOT_UNIQUE');
denied('missing sale table row is not a confirmed join',
 x=>{x.base.vendaRows=[]},
 'BASE_HEADER_OR_SALE_NOT_UNIQUE');
denied('base item count mismatch is not silently accepted',
 x=>{x.base.itemRows=[]},
 'BASE_ITEM_ROW_COUNT_MISMATCH');
denied('quantity drift in base row is detected',
 x=>{x.base.itemRows[0].QTPRODCOMVEN='3.000'},
 'BASE_ITEM_FIELD_OR_LINE_MISMATCH');
denied('note changed at source is detected without leaking note',
 x=>{x.base.itemRows[0].DSOBSPEDDIGCMD='FICT_CHANGED_SECRET'},
 'BASE_NOTE_FIELDS_OR_ITEM_LINK_MISMATCH');
denied('note not present at source cannot be invented from prior event',
 x=>{x.base.itemRows[0].DSOBSPEDDIGCMD=null},
 'BASE_NOTE_ROW_COUNT_MISMATCH');
denied('same event key with digest tampered is blocked',
 x=>{x.event.snapshot_hash='A'.repeat(64)},
 'EVENT_DIGEST_NOT_CANONICAL');
denied('missing exhaustion assertion is a hard hold',
 x=>{x.base.readExhausted=false},
 'READER_SUPPLIED_EXHAUSTION_MISSING');
denied('201st row sentinel is held rather than sliced',
 x=>{x.base.itemRows=Array.from({length:201},(_,i)=>({
  ...x.base.itemRows[0],NRPRODCOMVEN:'FICTLINE'+i}))},
 'SOURCE_ROWSET_LIMIT_REACHED');
denied('duplicated native line identity cannot masquerade as second item',
 x=>{const row=copy(x.base.itemRows[0]);x.base.itemRows.push(row);
  const it=copy(x.event.order.items[0]);it.NRPRODCOMVEN='LINE_2';x.event.order.items.push(it);reh(x)},
 'BASE_ITEM_LINE_DUPLICATE_OR_INVALID');
test('duplicated EVENT native line cannot reuse one source line and skip another',()=>{
 const x=fixture();
 // The source has distinct native lines; a malformed event repeats the first.
 // With only a count check, this falsely matched before the bijection gate.
 const old=copy(x.event.order.items[0]);
 x.event.order.items.push(old);
 x.event.order.observation_rows=[];
 x.base.itemRows[0].DSOBSPEDDIGCMD=null;
 x.base.itemRows.push({...x.base.itemRows[0],NRPRODCOMVEN:'LINE_2'});
 reh(x);
 const r=safety(review(x));
 assert.equal(r.reason,'EVENT_NATIVE_LINE_DUPLICATE_OR_UNMATCHED');
 assert.equal(r.itemsMatching,false);
});
test('repeated product code with item note is rejected independent of item index',()=>{
 const x=fixture(),more=copy(x.event.order.items[0]);more.NRPRODCOMVEN='LINE_2';
 x.event.order.items.push(more);
 x.base.itemRows.push({...x.base.itemRows[0],NRPRODCOMVEN:'LINE_2',
  DSOBSPEDDIGCMD:null});
 reh(x);const r=safety(review(x));
 assert.equal(r.reason,'DUPLICATE_SKU_ITEM_NOTE_LINE_UNPROVEN');
});
test('repeated product without item notes can match but never prove SQL atomicity',()=>{
 const x=fixture(),more=copy(x.event.order.items[0]);more.NRPRODCOMVEN='LINE_2';
 x.event.order.items.push(more);
 x.event.order.observation_rows=[];
 x.base.itemRows[0].DSOBSPEDDIGCMD=null;
 x.base.itemRows.push({...x.base.itemRows[0],NRPRODCOMVEN:'LINE_2'});
 reh(x);
 const r=safety(review(x));
 assert.equal(r.reason,'ONE_ORDER_BASE_TABLE_FIELDS_MATCH_NOT_ATOMIC');
});
test('order note and item note in canonical source order match only as review',()=>{
 const x=fixture();
 x.event.order.observation_rows.unshift({
  source_field:'DSOBSCOMANDA',scope_hint:'order',join_proven:true,
  value:'FICT_ORDER_NOTE'});
 x.base.headerRows[0].DSOBSCOMANDA='FICT_ORDER_NOTE';
 reh(x);
 const r=safety(review(x));
 assert.equal(r.reason,'ONE_ORDER_BASE_TABLE_FIELDS_MATCH_NOT_ATOMIC');
 assert.equal(r.observationRows,2);
});
test('wrong note-to-line index is never repaired by matching SKU',()=>{
 const x=fixture();const more=copy(x.event.order.items[0]);
 more.NRPRODCOMVEN='LINE_2';more.CDPRODUTO='OTHER_PRODUCT';
 x.event.order.items.push(more);
 x.base.itemRows.push({...x.base.itemRows[0],NRPRODCOMVEN:'LINE_2',
  CDPRODUTO:'OTHER_PRODUCT',DSOBSPEDDIGCMD:null});
 x.event.order.observation_rows[0].item_index=1;
 x.event.order.observation_rows[0].CDPRODUTO='OTHER_PRODUCT';reh(x);
 const r=safety(review(x));
 assert.equal(r.reason,'BASE_NOTE_FIELDS_OR_ITEM_LINK_MISMATCH');
});
test('caller can claim independent SQL or stable double read but result remains HOLD',()=>{
 const x=fixture();x.base.independentSqlAttested=true;
 x.base.twoMatchingPolls=true;x.base.atomicityProven=true;
 const r=safety(review(x));
 assert.equal(r.reason,'ONE_ORDER_BASE_TABLE_FIELDS_MATCH_NOT_ATOMIC');
});
test('bad inputs never leak identifiers or enable Home',()=>{
 for(const x of [null,{},[],{schema:INPUT},{schema:INPUT,event:{order:{}}}]){
  safety(review(x));
 }
});
console.log('NATIVE_READER_N2_BASE_TABLES_REVIEW_PASS '+count+'/'+count+' SYNTHETIC_ONLY');

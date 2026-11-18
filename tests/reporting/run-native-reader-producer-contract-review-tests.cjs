'use strict';
// Strict RED/GREEN gate: the shipped PowerShell watcher event shape lacks
// observation scan completeness and emits uppercase SHA-256 hex. Never accept
// those as an authenticated Reader snapshot. All data below is invented.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {review}=require('../../runtime/reporting/native_reader_producer_contract_review_v1.cjs');
const {snapshotHash}=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const base=()=>{
 const order={
  CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'FICTSALE1',NRCOMANDA:'FICTCMD1',
  NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'3',
  DTHRABERMESA:'2026-11-03T18:20:00.0000000',
  items:[
   {NRPRODCOMVEN:'LINE01',CDPRODUTO:'PROD01',CDARVPROD:'9200001000',QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4'},
   {NRPRODCOMVEN:'LINE02',CDPRODUTO:'PROD02',CDARVPROD:'9200002000',QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4'}
  ],observation_scan_complete:true,observation_rows:[]
 };
 return {schema:'deliveryos.tata-reader-stable-order-event.v1',
  order_key:'0001|01|FICTSALE1|FICTCMD1',snapshot_hash:snapshotHash(order),order};
};
function refresh(p){p.snapshot_hash=snapshotHash(p.order);return p;}
function run(mutate,rehash=false){
 const p=base();mutate(p);if(rehash)refresh(p);return review(p);
}
function state(mutate,code,rehash=false){const v=run(mutate,rehash);assert.equal(v.reason,code);assert.equal(v.state,'HOLD');return v;}
let passed=0;const test=(label,fn)=>{fn();passed++;};
test('complete empty-note synthetic envelope is self-consistent but NOT authenticated',()=>{
 const x=review(base());assert.equal(x.reason,'CANONICAL_ENVELOPE_SELF_CONSISTENT_BUT_SOURCE_UNATTESTED');
 assert.equal(x.canonicalContractChecked,true);
 assert.equal(x.actualNativeSourceAuthenticated,false);
 assert.equal(x.observationScanIndependentlyProven,false);
 assert.equal(x.ordersPublishable,0);assert.equal(x.printAuthorized,false);
});
test('PR135 explicit child-table blocker overrides self-signed complete scan',()=>{
 const v=run(p=>{
  p.blockers=['NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ'];
  p.ready_for_downstream_shadow=false;
  p.order.observation_scan_complete=true;
 });
 assert.equal(v.reason,'NATIVE_PRODUCER_DECLARED_CHILD_OR_SOURCE_BLOCKER');
 assert.equal(v.canonicalContractChecked,false);
 assert.equal(v.ordersPublishable,0);
 assert.equal(v.actualNativeSourceAuthenticated,false);
});
test('declared ready false alone rejects synthetic complete snapshot',()=>{
 const v=run(p=>{p.ready_for_downstream_shadow=false;p.blockers=[];});
 assert.equal(v.reason,'NATIVE_PRODUCER_DECLARED_CHILD_OR_SOURCE_BLOCKER');
 assert.equal(v.ordersPublishable,0);
});
test('declared blocker alone cannot be erased by ready true',()=>{
 const v=run(p=>{p.ready_for_downstream_shadow=true;p.blockers=['CHILD_COVERAGE_UNKNOWN'];});
 assert.equal(v.reason,'NATIVE_PRODUCER_DECLARED_CHILD_OR_SOURCE_BLOCKER');
 assert.equal(v.canonicalContractChecked,false);
});
test('legacy watcher emitted shape WITHOUT scan proof is blocked',()=>{
 state(p=>{delete p.order.observation_scan_complete;delete p.order.observation_rows;},
 'OBSERVATION_COMPLETENESS_MISSING_OR_UNATTESTED');
});
test('legacy watcher uppercase SHA-256 is blocked even after adding scan proof',()=>{
 state(p=>{p.snapshot_hash=p.snapshot_hash.toUpperCase();},
 'SNAPSHOT_HASH_UPPERCASE_ONLY');
});
test('legacy watcher can fail on both blockers, first missing notes',()=>{
 state(p=>{delete p.order.observation_rows;delete p.order.observation_scan_complete;p.snapshot_hash=p.snapshot_hash.toUpperCase();},
 'OBSERVATION_COMPLETENESS_MISSING_OR_UNATTESTED');
});
test('PowerShell apostrophe escaping plus uppercase hash is NOT a case-only fix',()=>{
 const p=base();
 p.order.observation_rows=[{source_field:'DSOBSPEDDIGCMD',value:"L'IMITADO",scope_hint:'item',item_index:0,CDPRODUTO:'PROD01',join_proven:true}];
 const o=p.order;
 const fields=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
 const itemFields=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
 const basis={};for(const k of fields)basis[k]=o[k];
 basis.items=o.items.map(x=>{const a={};for(const k of itemFields)a[k]=x[k];return a;});
 basis.observation_rows=o.observation_rows;
 const canonical=JSON.stringify(basis);
 const psJson=canonical.replace("L'IMITADO",'L\\u0027IMITADO');
 assert.notEqual(canonical,psJson);
 p.snapshot_hash=crypto.createHash('sha256').update(psJson).digest('hex').toUpperCase();
 assert.notEqual(p.snapshot_hash.toLowerCase(),snapshotHash(o));
 assert.equal(review(p).reason,'SNAPSHOT_HASH_UPPERCASE_AND_SERIALIZATION_DIVERGENT');
});
test('self-declared scan false blocked',()=>state(p=>{p.order.observation_scan_complete=false;},'OBSERVATION_COMPLETENESS_MISSING_OR_UNATTESTED'));
test('nonarray note rows blocked',()=>state(p=>{p.order.observation_rows=null;},'NATIVE_OBSERVATION_ROWS_MISSING_OR_EXCESSIVE'));
test('native source scope MOOCA blocked',()=>state(p=>{p.order.CDLOJA='02';},'NATIVE_ITAIM_SCOPE_OR_REQUIRED_FIELDS_INVALID',true));
test('wrong origin blocked',()=>state(p=>{p.order.IDORGCMDVENDA='DLV_NMO';},'NATIVE_ITAIM_SCOPE_OR_REQUIRED_FIELDS_INVALID',true));
test('missing item code blocked',()=>state(p=>{delete p.order.items[0].CDARVPROD;},'NATIVE_ITEM_STRUCTURE_INCOMPLETE'));
test('duplicated native line identifier blocked',()=>state(p=>{p.order.items[1].NRPRODCOMVEN='LINE01';},'NATIVE_ITEM_LINE_IDENTITIES_AMBIGUOUS',true));
test('quantity tamper without hash refresh blocked',()=>state(p=>{p.order.items[0].QTPRODCOMVEN='3.000';},'SNAPSHOT_HASH_NOT_BOUND_TO_CANONICAL_FIELDS'));
test('unknown header state held',()=>state(p=>{p.order.IDSTCOMANDA='4';},'NATIVE_STATE_UNSUPPORTED_OR_UNINTERPRETED',true));
test('four-part key mismatch blocked',()=>state(p=>{p.order_key='0001|01|FICTSALE1|FICTCMD9';},'NATIVE_FOUR_PART_KEY_MISMATCH'));
test('item note cannot match wrong CDPRODUTO',()=>state(p=>{p.order.observation_rows=[{source_field:'DSOBSPEDDIGCMD',value:'SEM CEBOLINHA',scope_hint:'item',item_index:0,CDPRODUTO:'WRONG',join_proven:true}];},'ITEM_OBSERVATION_JOIN_MISMATCH'));
test('item note without join evidence blocked',()=>state(p=>{p.order.observation_rows=[{source_field:'DSOBSPEDDIGCMD',value:'SEM CEBOLINHA',scope_hint:'item',item_index:0,CDPRODUTO:'PROD01',join_proven:false}];},'OBSERVATION_ROW_NOT_JOINED'));
test('unknown note field blocked',()=>state(p=>{p.order.observation_rows=[{source_field:'UNKNOWN',value:'BLAH',scope_hint:'item',item_index:0,CDPRODUTO:'PROD01',join_proven:true}];},'ITEM_OBSERVATION_JOIN_MISMATCH'));
test('item note to nonexistent index blocked',()=>state(p=>{p.order.observation_rows=[{source_field:'TXPRODCOMVEN',value:'COZINHAR',scope_hint:'item',item_index:9,CDPRODUTO:'PROD01',join_proven:true}];},'ITEM_OBSERVATION_JOIN_MISMATCH'));
test('duplicate note source for same line blocked',()=>state(p=>{const a={source_field:'DSOBSDESCIT',value:'SEM CEBOLA',scope_hint:'item',item_index:0,CDPRODUTO:'PROD01',join_proven:true};p.order.observation_rows=[a,{...a,value:'OUTRA'}];},'OBSERVATION_NATIVE_FIELD_DUPLICATED'));
test('order note with item code blocked',()=>state(p=>{p.order.observation_rows=[{source_field:'DSOBSCOMANDA',value:'A',scope_hint:'order',CDPRODUTO:'PROD01',join_proven:true}];},'ORDER_OBSERVATION_SCOPE_MISMATCH'));
test('note text tamper fails hash binding',()=>state(p=>{p.order.observation_rows=[{source_field:'DSOBSPEDDIGCMD',value:'SEM CEBOLINHA',scope_hint:'item',item_index:0,CDPRODUTO:'PROD01',join_proven:true}];},'SNAPSHOT_HASH_NOT_BOUND_TO_CANONICAL_FIELDS'));
test('complete item+order notes self-consistent still HOLD',()=>{
 const x=run(p=>{p.order.observation_rows=[
  {source_field:'DSOBSPEDDIGCMD',value:'SEM CEBOLINHA',scope_hint:'item',item_index:0,CDPRODUTO:'PROD01',join_proven:true},
  {source_field:'TXPRODCOMVEN',value:'LIMPAR',scope_hint:'item',item_index:1,CDPRODUTO:'PROD02',join_proven:true},
  {source_field:'DSOBSCOMANDA',value:'NOTA DO PEDIDO FICTICIO',scope_hint:'order',join_proven:true}
 ];},true);
 assert.equal(x.canonicalContractChecked,true);assert.equal(x.noteRows,3);
 assert.equal(x.state,'HOLD');assert.equal(x.actualNativeSourceAuthenticated,false);
});
test('duplicate product code with item note cannot independently prove native line join',()=>{
 const x=run(p=>{p.order.items[1].CDPRODUTO='PROD01';p.order.observation_rows=[
  {source_field:'DSOBSDESCIT',value:'SEM MOLHO',scope_hint:'item',item_index:1,CDPRODUTO:'PROD01',join_proven:true}
 ];},true);
 assert.equal(x.reason,'ITEM_OBSERVATION_NATIVE_LINE_AMBIGUOUS');
 assert.equal(x.canonicalContractChecked,false);
 assert.equal(x.actualNativeSourceAuthenticated,false);
 assert.equal(x.ordersPublishable,0);
});
test('duplicated product code with order-level note is not falsely treated as item join',()=>{
 const x=run(p=>{p.order.items[1].CDPRODUTO='PROD01';p.order.observation_rows=[
  {source_field:'DSOBSCOMANDA',scope_hint:'order',value:'FICT_ORDER_ONLY',join_proven:true}
 ];},true);
 assert.equal(x.canonicalContractChecked,true);
 assert.equal(x.actualNativeSourceAuthenticated,false);
 assert.equal(x.ordersPublishable,0);
});
test('different product line identities do not override a duplicated item product code',()=>{
 const x=run(p=>{p.order.items[1].CDPRODUTO='PROD01';p.order.items[1].CDARVPROD='DIFFERENT_TREE';p.order.observation_rows=[
  {source_field:'TXPRODCOMVEN',scope_hint:'item',item_index:0,CDPRODUTO:'PROD01',value:'FICT_NOTE',join_proven:true}
 ];},true);
 assert.equal(x.reason,'ITEM_OBSERVATION_NATIVE_LINE_AMBIGUOUS');
 assert.equal(x.canonicalContractChecked,false);
 assert.equal(x.ordersPublishable,0);
});
test('empty items are blocked',()=>state(p=>{p.order.items=[];},'NATIVE_ITEM_STRUCTURE_INCOMPLETE'));
test('malformed schema blocked',()=>state(p=>{p.schema='UNKNOWN';},'INVALID_SOURCE_EVENT_ENVELOPE'));
test('output never contains raw IDs or any note contents',()=>{
 const x=run(p=>{p.order.observation_rows=[{source_field:'DSOBSCOMANDA',value:'PII_DO_NOT_OUTPUT',scope_hint:'order',join_proven:true}];},true);
 const text=JSON.stringify(x);
 for(const k of ['FICTSALE1','FICTCMD1','1234','PII_DO_NOT_OUTPUT','PROD01'])
  assert.equal(text.includes(k),false,k);
});
test('never upgrades a self-signed event to a real order',()=>{
 const x=run(p=>{p.actorCertificate='self-asserted';p.merchantVerified=true;});
 assert.equal(x.ordersPublishable,0);assert.equal(x.actualNativeSourceAuthenticated,false);
 assert.equal(x.independentIfoodIdentityProven,false);assert.equal(x.printAuthorized,false);
});
console.log('NATIVE_READER_PRODUCER_CONTRACT_REVIEW_PASS '+passed+'/'+passed+' SYNTHETIC_ONLY');

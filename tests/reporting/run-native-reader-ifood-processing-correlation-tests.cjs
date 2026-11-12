'use strict';
const assert=require('node:assert/strict');
const {INPUT,compare}=require('../../runtime/reporting/native_reader_ifood_processing_correlation_v1.cjs');
function fixture(){
 const event={schema:'deliveryos.tata-reader-stable-order-event.v1',
  order_key:'0001|01|FICT_SALE|FICT_COMMAND',snapshot_hash:'a'.repeat(64),
  order:{CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'FICT_SALE',
   NRCOMANDA:'FICT_COMMAND',NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',
   DTHRABERMESA:'2026-11-11T12:04:09.0000000',items:[
    {NRPRODCOMVEN:'LINE_A',CDPRODUTO:'111',QTPRODCOMVEN:'1.000'},
    {NRPRODCOMVEN:'LINE_B',CDPRODUTO:'222',QTPRODCOMVEN:'2.000'}]}};
 return {schema:INPUT,event,
  processing:{order_key:event.order_key,snapshot_hash:event.snapshot_hash,lines:[
    {NRPRODCOMVEN:'LINE_A',CDPRODUTO:'111',product_name:'Hot Roll',quantity:'1.000'},
    {NRPRODCOMVEN:'LINE_B',CDPRODUTO:'222',product_name:'Tartar de Salmão',quantity:2}]},
  ifood:{store_id:'53069',short_code:'1234',placed_at_local:'2026-11-11T12:04:53',
   uuid:'FICT_UUID_PRIVATE',items:[
    {name:'Tartar de Salmão',quantity:2},{name:'Hot Roll',quantity:'1'}]}};
}
let count=0;
function check(label,mutate,reason,matched=0){
 const data=fixture();if(mutate)mutate(data);
 const before=JSON.stringify(data),r=compare(data);
 assert.equal(r.state,'HOLD');assert.equal(r.reason,reason,label);
 assert.equal(r.matchedProducts,matched);
 assert.equal(r.matchedQuantities,matched);
 assert.equal(JSON.stringify(data),before,'mutated input');
 for(const secret of ['FICT_SALE','FICT_COMMAND','FICT_UUID_PRIVATE','Hot Roll',
  'Tartar de Salmão','1234','111','222','a'.repeat(64)])
  assert.equal(JSON.stringify(r).includes(secret),false,'LEAK:'+secret);
 for(const k of ['nativeUuidLinkProven','observationCoverageProven',
  'childTableCoverageProven','readerEventHashAuthenticated',
  'ifoodDetailAuthenticated','homePublishAuthorized','printAuthorized'])
  assert.equal(r[k],false,k);
 assert.equal(r.ordersPublishable,0);assert.equal(r.actionsExecuted,0);
 count++;console.log('PASS '+label);
}
const ok='PRODUCT_NAMES_AND_QUANTITIES_CORRELATED_NOT_IDENTITY_PROVEN';
check('two existing Reader processing names match iFood, never authorize',null,ok,2);
check('name mismatch blocks',x=>{x.ifood.items[1].name='Outro'},'IFOOD_PRODUCT_NAME_OR_QUANTITY_MISMATCH');
check('quantity mismatch blocks',x=>{x.ifood.items[1].quantity=3},'IFOOD_PRODUCT_NAME_OR_QUANTITY_MISMATCH');
check('duplicate identical names are counted with multiplicity',x=>{
 x.processing.lines[1].product_name='Hot Roll';x.processing.lines[1].quantity='2.000';
 x.ifood.items[0].name='Hot Roll';
},ok,2);
check('processing hash mismatch blocks',x=>{x.processing.snapshot_hash='b'.repeat(64)},'PROCESSING_RECORD_NOT_BOUND_TO_READER_REVISION');
check('processing line code mismatch blocks',x=>{x.processing.lines[0].CDPRODUTO='222'},'PROCESSING_NATIVE_PRODUCT_OR_QUANTITY_MISMATCH');
check('processing quantity mismatch blocks',x=>{x.processing.lines[0].quantity=3},'PROCESSING_NATIVE_PRODUCT_OR_QUANTITY_MISMATCH');
check('processing line reference mismatch blocks',x=>{x.processing.lines[0].NRPRODCOMVEN='UNKNOWN'},'PROCESSING_LINE_OR_NAME_INVALID');
check('same short code different minute is not a match',x=>{x.ifood.placed_at_local='2026-11-11T12:05:00'},'IFOOD_STORE_SHORT_CODE_OR_LOCAL_MINUTE_MISMATCH');
check('different iFood store blocks',x=>{x.ifood.store_id='99999'},'IFOOD_STORE_SHORT_CODE_OR_LOCAL_MINUTE_MISMATCH');
check('different native origin blocks',x=>{x.event.order.IDORGCMDVENDA='DLV_X'},'READER_SCOPE_OR_SHAPE_INVALID');
check('different line count blocks',x=>{x.ifood.items.pop()},'IFOOD_PRODUCT_LINE_COUNT_MISMATCH');
check('identical quantities on duplicated native line blocks',x=>{
 x.event.order.items[1].NRPRODCOMVEN='LINE_A';
},'READER_LINES_AMBIGUOUS_OR_INVALID');
check('bad calendar native time blocks',x=>{x.event.order.DTHRABERMESA='2026-02-30T12:04:09'},'IFOOD_STORE_SHORT_CODE_OR_LOCAL_MINUTE_MISMATCH');
check('no timezone guessing is allowed',x=>{x.ifood.placed_at_local='2026-11-11T15:04:53Z'},'IFOOD_STORE_SHORT_CODE_OR_LOCAL_MINUTE_MISMATCH');
check('self-declared origin not used to certify source',x=>{
 x.processing.source_authenticated=true;x.ifood.authenticated=true;
},ok,2);
check('invalid envelope is fail-closed',x=>{delete x.processing},'ENVELOPE_INVALID');
console.log('READER_IFOOD_EXISTING_PROCESSING_CORRELATION_PASS '+count+'/'+count+' OFFLINE_ONLY_HOLD');

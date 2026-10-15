'use strict';
const assert=require('node:assert/strict');
const {assess}=require('./comandas_senha_item_bridge_v87_offline.cjs');
const note='EM CUBOS, SEM CEBOLINHA E SEM CREMA CHEESE POR FAVOR;';
const e={order_key:'FILIAL|LOJA|FAKE_ORDER',snapshot_hash:'a'.repeat(64),items:[
 {NRPRODCOMVEN:'001',CDPRODUTO:'P001',QTPRODCOMVEN:'1.000',
  source_item_notes:{DSOBSPEDDIGCMD:note,TXPRODCOMVEN:note}},
 {NRPRODCOMVEN:'002',CDPRODUTO:'P002',QTPRODCOMVEN:'2.000'}]};
const fixture=()=>({event:structuredClone(e),provenance:{
 human_authorized_new_sql_column:true,current_effective_grant_verified:true,
 executed_as_service_sid:true,snapshot_hash:e.snapshot_hash,
 order_key:e.order_key,full_senha_collision_scope_covered:true},
 sql_item_rows:[
 {order_key:e.order_key,snapshot_hash:e.snapshot_hash,NRPRODCOMVEN:'001',
  CDPRODUTO:'P001',QTPRODCOMVEN:'1.000',CDSENHAPED:'00042',
  DSOBSPEDDIGCMD:note,TXPRODCOMVEN:note},
 {order_key:e.order_key,snapshot_hash:e.snapshot_hash,NRPRODCOMVEN:'002',
  CDPRODUTO:'P002',QTPRODCOMVEN:'2.000',CDSENHAPED:'00042'}],
 print_blocks:[{log_source:'FAKE_1',line_offset:42,senha:'00042'},
               {log_source:'FAKE_2',line_offset:50,senha:'00042'}],
 collision_evidence:[]});
let count=0;
function check(name,edit,expectedStatus,expectedReason){
 const x=fixture(),initial=JSON.stringify(x);edit(x);
 const y=assess(x);
 assert.equal(y.status,expectedStatus,name);
 if(expectedReason)assert.equal(y.reason,expectedReason,name);
 assert.equal(y.actual_sql_identity_proven,false);
 assert.equal(y.v68_production_source_proven,false);
 assert.equal(y.physical_print_authorized,false);
 assert.ok(Object.values(y.effects).every(v=>v===false));
 if(name==='review candidate')assert.equal(JSON.stringify(x),initial);
 count++;
}
check('review candidate',()=>{},'REVIEW_CANDIDATE_NOT_PROVEN',
 'PAPER_LOG_LACKS_ORDER_ITEM_REVISION_ANCHOR');
check('no grant',x=>x.provenance.current_effective_grant_verified=false,'HOLD','NEW_COLUMN_GRANT_OR_FRESH_READ_NOT_PROVEN');
check('no human authorization',x=>x.provenance.human_authorized_new_sql_column=false,'HOLD','NEW_COLUMN_GRANT_OR_FRESH_READ_NOT_PROVEN');
check('no service authentication',x=>x.provenance.executed_as_service_sid=false,'HOLD','NEW_COLUMN_GRANT_OR_FRESH_READ_NOT_PROVEN');
check('revision mismatch',x=>x.provenance.snapshot_hash='b'.repeat(64),'HOLD','SOURCE_REVISION_NOT_SAME');
check('other order',x=>x.sql_item_rows[0].order_key='OTHER','HOLD','NATIVE_ITEM_SOURCE_ORDER_OR_REVISION_MISMATCH');
check('product mismatch',x=>x.sql_item_rows[0].CDPRODUTO='P999','HOLD','NATIVE_PRODUCT_OR_QUANTITY_MISMATCH');
check('quantity mismatch',x=>x.sql_item_rows[0].QTPRODCOMVEN='5.000','HOLD','NATIVE_PRODUCT_OR_QUANTITY_MISMATCH');
check('item duplicate',x=>x.sql_item_rows[1].NRPRODCOMVEN='001','HOLD','NATIVE_ITEM_AMBIGUOUS');
check('B5 note removed',x=>x.sql_item_rows[0].TXPRODCOMVEN='','HOLD','PREPARATION_NOTE_SOURCE_DIVERGENCE');
check('B5 note modified',x=>x.sql_item_rows[0].DSOBSPEDDIGCMD='SEM CEBOLINHA','HOLD','PREPARATION_NOTE_SOURCE_DIVERGENCE');
check('SENHA not printed',x=>x.print_blocks=[{log_source:'FAKE',line_offset:4,senha:'999'}],'HOLD','NATIVE_SENHA_NOT_FOUND_IN_LOG');
check('duplicated print anchor',x=>x.print_blocks[1]=structuredClone(x.print_blocks[0]),'HOLD','DUPLICATE_LOG_BLOCK_ANCHOR');
check('cross-order reused senha',x=>x.collision_evidence=[{senha:'00042',order_key:'OTHER'}],'HOLD','SENHA_SHARED_WITH_OTHER_ORDER');
check('no collision horizon',x=>x.provenance.full_senha_collision_scope_covered=false,'HOLD','SENHA_UNIQUENESS_SCOPE_NOT_PROVEN');
check('extra SQL item',x=>x.sql_item_rows.push(structuredClone(x.sql_item_rows[0])),'HOLD','ITEM_ROW_COUNT_MISMATCH');
console.log(JSON.stringify({status:'PASS',tests:count,synthetic_only:true,
 external_identity_proof:false,real_order_join_proven:false,
 physical_print_authorized:false,operational_effects:false}));

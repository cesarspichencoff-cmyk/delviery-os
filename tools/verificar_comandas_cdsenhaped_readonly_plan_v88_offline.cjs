'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {makePlan,resolveOrderDay}=require('./comandas_cdsenhaped_readonly_plan_v88_offline.cjs');
const {assess}=require('./comandas_senha_item_bridge_v87_offline.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,
 '../data/tata_reader_permission_manifest_v1.json'),'utf8'));
function fixture(){
 const order={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'0000000123',
  NRCOMANDA:'0000000117',NRCOMANDAEXT:'4321',IDORGCMDVENDA:'DLV_FICTIONAL',
  IDSTCOMANDA:'A',DTHRABERMESA:'2026-10-14T12:52:00.0000000',
  items:[{NRPRODCOMVEN:'000001',CDPRODUTO:'FAKE_ITEM',
   CDARVPROD:'9.60.00.000.00',QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'A'}],
  observation_scan_complete:true,
  observation_rows:[
   {source_field:'DSOBSCOMANDA',value:'PAGO ONLINE (VALOR: 10.00) ID: 123 - COD. P/ CANCELAMENTO: 456',
    scope_hint:'order',join_proven:true},
   {source_field:'DSOBSPEDDIGCMD',value:'SEM CEBOLINHA',item_index:0,
    CDPRODUTO:'FAKE_ITEM',scope_hint:'item',join_proven:true},
   {source_field:'TXPRODCOMVEN',value:'SEM CEBOLINHA',item_index:0,
    CDPRODUTO:'FAKE_ITEM',scope_hint:'item',join_proven:true}
  ]};
 const core=Object.fromEntries(['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
  'NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA']
  .map(k=>[k,order[k]]));
 core.items=order.items.map(i=>Object.fromEntries([
  'NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'
 ].map(k=>[k,i[k]])));
 core.observation_rows=order.observation_rows.map(r=>({...r}));
 return {schema:'deliveryos.tata-reader-stable-order-event.v1',
  order_key:[order.CDFILIAL,order.CDLOJA,order.NRVENDAREST,order.NRCOMANDA].join('|'),
  snapshot_hash:createHash('sha256').update(JSON.stringify(core)).digest('hex'),order};
}
let tests=0;function assertHold(name,change,reason){
 const event=fixture(),past=structuredClone(manifest);
 change(event,past);
 const before=JSON.stringify([event,past]);
 const out=makePlan(event,past);
 assert.equal(out.status,'HOLD',name);
 assert.equal(out.reason,reason,name);
 assert.equal(out.sql_template,null);
 assert.equal(out.sql_execution_allowed,false);
 assert.equal(out.physical_print_authorized,false);
 assert.equal(JSON.stringify([event,past]),before);
 tests++;
}
const e=fixture(),pristine=JSON.stringify(e);
const p=makePlan(e,manifest);
assert.equal(p.status,'OFFLINE_SQL_TEMPLATE_REVIEW_HOLD');
assert.equal(p.reason,'NEW_COLUMN_NOT_IN_LAST_PROVEN_GRANT');
assert.deepEqual(p.missing_historic_grants,['ITCOMANDAVEN.CDSENHAPED']);
assert.equal(p.source_snapshot_hash_self_checked,true);
assert.equal(p.sql_result_contains_watcher_snapshot_hash,false);
assert.equal(p.sql_result_contains_watcher_order_key,false);
assert.equal(p.can_attest_historical_revision_from_this_sql,false);
assert.equal(p.sql_result_directly_satisfies_v87,false);
assert.ok(!p.sql_template.includes('snapshot_hash'));
assert.ok(!p.sql_template.includes('order_key'));

assert.equal(p.row_ceiling,2);
assert.equal(p.expected_exact_item_rows,1);
assert.equal(p.row_limit_parameter_value,2);
assert.equal(p.expected_order_day,'2026-10-14');
assert.deepEqual(p.parameters,['row_limit','cdfilial','cdloja','nrvendarest','nrcomanda','day_start','day_end']);
for(const x of ['TOP (@row_limit)','TEKNISA.ITCOMANDAVEN','TEKNISA.COMANDAVEN',
 'TEKNISA.VENDAREST','I.CDSENHAPED','I.NRPRODCOMVEN',
 'C.CDLOJA=@cdloja','I.NRCOMANDA=@nrcomanda',
 'V.DTHRABERMESA>=@day_start','V.DTHRABERMESA<@day_end'])
 assert.ok(p.sql_template.includes(x),x);
assert.ok(!/\b(?:INSERT|UPDATE|DELETE|MERGE|DROP|EXEC|TRUNCATE)\b/i.test(p.sql_template));
assert.ok(!/SELECT\s+\*/i.test(p.sql_template));
for(const x of ['0000000123','0000000117','FAKE_ITEM','PAGO ONLINE','SEM CEBOLINHA'])
 assert.ok(!p.sql_template.includes(x));
assert.equal(p.sql_execution_allowed,false);
assert.equal(p.new_column_read_authorized,false);
assert.equal(p.independent_print_source_proven,false);
assert.equal(JSON.stringify(e),pristine);tests++;
assertHold('tampered watcher note',e=>{e.order.observation_rows[1].value='COM CEBOLINHA'},
 'WATCHER_HASH_INVALID');
assertHold('different day',e=>{e.order.DTHRABERMESA='2026-10-15T12:52:00.0000000'},'SOURCE_SCOPE_INVALID');
assertHold('wrong branch',e=>{e.order.IDORGCMDVENDA='OTHER_ORDER'},'SOURCE_SCOPE_INVALID');
assertHold('wrong shop',e=>{e.order.CDLOJA='02'},'SOURCE_SCOPE_INVALID');
assertHold('wrong order key',e=>{e.order_key='DIFFERENT'},'SOURCE_SCOPE_INVALID');
assertHold('bad hash',e=>{e.snapshot_hash='0'.repeat(64)},'WATCHER_HASH_INVALID');
assertHold('duplicate source note',e=>{e.order.observation_rows.push(structuredClone(e.order.observation_rows[1]))},'SOURCE_INPUT_MALFORMED');
assertHold('malformed item qty',e=>{e.order.items[0].NRPRODCOMVEN='A'},'SOURCE_INPUT_MALFORMED');
assertHold('no complete observer',e=>{e.order.observation_scan_complete=false},'SOURCE_SCOPE_INVALID');
assertHold('too many items',e=>{e.order.items=Array.from({length:101},(_,i)=>({...e.order.items[0],NRPRODCOMVEN:String(i+1)}))},'SOURCE_SCOPE_INVALID');
assertHold('manifest principal changed',(e,m)=>{m.principal='dbo'},'HISTORIC_GRANT_MANIFEST_INVALID');
assertHold('manifest schema changed',(e,m)=>{m.schema='unknown'},'HISTORIC_GRANT_MANIFEST_INVALID');
assertHold('manifest table missing',(e,m)=>{delete m.effective_columns.ITCOMANDAVEN},'HISTORIC_GRANT_SURFACE_INCOMPLETE');
// V8.10: emulate 3 and 100 *fictitious* item snapshots with consistent hashes.
// A per-order N+1 TOP is an overflow sentinel: fewer rows indicate incomplete
// data, extra rows force hold, and no user data is ever embedded into SQL.
for(const n of [3,100]){
 const event=fixture(),o=event.order;
 o.items=Array.from({length:n},(_,i)=>i===0?{...o.items[0]}:
  {...o.items[0],NRPRODCOMVEN:String(i+1).padStart(6,'0'),
   CDPRODUTO:'FICTIONAL_'+i});
 const canonical=Object.fromEntries(['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
  'NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'].map(k=>[k,o[k]]));
 canonical.items=o.items.map(i=>Object.fromEntries(['NRPRODCOMVEN',
  'CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'].map(k=>[k,i[k]])));
 canonical.observation_rows=o.observation_rows.map(r=>({...r}));
 event.snapshot_hash=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
 const out=makePlan(event,manifest);
 assert.equal(out.status,'OFFLINE_SQL_TEMPLATE_REVIEW_HOLD');
 assert.equal(out.expected_exact_item_rows,n);
 assert.equal(out.row_ceiling,n+1);
 assert.equal(out.row_limit_parameter_value,n+1);
 assert.ok(out.sql_template.includes('TOP (@row_limit)'));
 assert.equal(out.sql_execution_allowed,false);
 tests++;
}
const fakeGrants=structuredClone(manifest);
fakeGrants.effective_columns.ITCOMANDAVEN.push('CDSENHAPED');
const withFake=makePlan(fixture(),fakeGrants);
assert.equal(withFake.status,'OFFLINE_SQL_TEMPLATE_REVIEW_HOLD');
assert.equal(withFake.reason,'HISTORIC_GRANT_NOT_CURRENT_SQL_PROOF');
assert.equal(withFake.sql_execution_allowed,false);
assert.equal(withFake.sql_identity_authenticated,false);
tests++;
// V8.9 inter-contract guard: native V8.8 SELECT does not return per-row
// watcher hash/order_key; V8.7 must REJECT direct handoff even when a
// fictional caller sets all provenance booleans. Never stamp V2 fields
// onto DB rows and call that independent proof.
const nativeSourceOnly={
 CDFILIAL:'0001',CDLOJA:'01',
 NRVENDAREST:e.order.NRVENDAREST,NRCOMANDA:e.order.NRCOMANDA,
 NRPRODCOMVEN:e.order.items[0].NRPRODCOMVEN,
 CDPRODUTO:e.order.items[0].CDPRODUTO,
 QTPRODCOMVEN:e.order.items[0].QTPRODCOMVEN,
 CDSENHAPED:'00042',
 DSOBSDESCIT:null,DSOBSPEDDIGCMD:'SEM CEBOLINHA',
 TXPRODCOMVEN:'SEM CEBOLINHA'};
const attempt=assess({
 event:{order_key:e.order_key,snapshot_hash:e.snapshot_hash,
  items:[{NRPRODCOMVEN:nativeSourceOnly.NRPRODCOMVEN,
   CDPRODUTO:nativeSourceOnly.CDPRODUTO,
   QTPRODCOMVEN:nativeSourceOnly.QTPRODCOMVEN,
   source_item_notes:{DSOBSPEDDIGCMD:'SEM CEBOLINHA',
    TXPRODCOMVEN:'SEM CEBOLINHA'}}]},
 provenance:{human_authorized_new_sql_column:true,
  current_effective_grant_verified:true,executed_as_service_sid:true,
  snapshot_hash:e.snapshot_hash,order_key:e.order_key,
  full_senha_collision_scope_covered:true},
 sql_item_rows:[nativeSourceOnly],
 print_blocks:[{log_source:'FICTIONAL_LOG',line_offset:42,senha:'00042'}],
 collision_evidence:[]});
assert.equal(attempt.status,'HOLD');
assert.equal(attempt.reason,'NATIVE_ITEM_SOURCE_ORDER_OR_REVISION_MISMATCH');
assert.equal(attempt.order_print_identity_proven,false);
assert.equal(attempt.physical_print_authorized,false);
tests++;
// V8.30: a prospective day is an explicitly scoped OFFLINE REVIEW,
// never permission to read SQL, synthesize provenance or print.
assert.equal(resolveOrderDay(),'2026-10-14');
assert.equal(resolveOrderDay({order_day:'2026-10-18'}),'2026-10-18');
for(const bad of [{order_day:'2026-02-30'},{order_day:'2026-10-18',current_grant:true},
 {order_day:'tomorrow'}, {order_day:'2026-10-18T00:00'}, {}, null]){
 assert.equal(resolveOrderDay(bad),null);
 assert.equal(makePlan(fixture(),manifest,bad).reason,'REQUESTED_DAY_SCOPE_INVALID');
 tests++;
}
const recent=fixture();
recent.order.DTHRABERMESA='2026-10-18T12:52:00.0000000';
const recentCore=Object.fromEntries(['CDFILIAL','CDLOJA','NRVENDAREST',
 'NRCOMANDA','NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA',
 'DTHRABERMESA'].map(k=>[k,recent.order[k]]));
recentCore.items=recent.order.items.map(item=>Object.fromEntries([
 'NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'
 ].map(k=>[k,item[k]])));
recentCore.observation_rows=recent.order.observation_rows.map(x=>({...x}));
recent.snapshot_hash=createHash('sha256').update(JSON.stringify(recentCore)).digest('hex');
const recentBefore=JSON.stringify(recent),manifestBefore=JSON.stringify(manifest);
const oldScope=makePlan(recent,manifest);
assert.equal(oldScope.status,'HOLD');
assert.equal(oldScope.reason,'SOURCE_SCOPE_INVALID');
const scoped=makePlan(recent,manifest,{order_day:'2026-10-18'});
assert.equal(scoped.status,'OFFLINE_SQL_TEMPLATE_REVIEW_HOLD');
assert.equal(scoped.reason,'NEW_COLUMN_NOT_IN_LAST_PROVEN_GRANT');
assert.equal(scoped.expected_order_day,'2026-10-18');
assert.equal(scoped.explicit_review_day_scoped,true);
assert.equal(scoped.date_scope_only_not_fresh_grant,true);
assert.equal(scoped.sql_execution_allowed,false);
assert.equal(scoped.sql_executed,false);
assert.equal(scoped.physical_print_authorized,false);
assert.equal(scoped.current_grant_proven,false);
assert.equal(scoped.can_attest_historical_revision_from_this_sql,false);
assert.deepEqual(scoped.missing_historic_grants,['ITCOMANDAVEN.CDSENHAPED']);
assert.equal(scoped.row_limit_parameter_value,recent.order.items.length+1);
assert.ok(!scoped.sql_template.includes('2026-10-18'));
assert.ok(!scoped.sql_template.includes(recent.order.NRCOMANDA));
assert.equal(JSON.stringify(recent),recentBefore);
assert.equal(JSON.stringify(manifest),manifestBefore);
tests++;
const mismatch=makePlan(recent,manifest,{order_day:'2026-10-19'});
assert.equal(mismatch.reason,'SOURCE_SCOPE_INVALID');
assert.equal(mismatch.sql_template,null);
tests++;
const fakeNewGrant=structuredClone(manifest);
fakeNewGrant.effective_columns.ITCOMANDAVEN.push('CDSENHAPED');
const fakeNewGrantOutput=makePlan(recent,fakeNewGrant,{order_day:'2026-10-18'});
assert.equal(fakeNewGrantOutput.reason,'HISTORIC_GRANT_NOT_CURRENT_SQL_PROOF');
assert.equal(fakeNewGrantOutput.sql_execution_allowed,false);
assert.equal(fakeNewGrantOutput.sql_identity_authenticated,false);
tests++;
console.log(JSON.stringify({status:'PASS',tests,
 query_plan_only:true,customer_data_used:false,source_is_fictional:true,
 sql_calls:0,service_effects:0,printer_effects:0,
 old_manifest_cannot_grant_new_column:true}));

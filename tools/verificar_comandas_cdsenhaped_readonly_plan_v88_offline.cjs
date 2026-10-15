'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {makePlan}=require('./comandas_cdsenhaped_readonly_plan_v88_offline.cjs');
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
assert.equal(p.row_ceiling,101);
assert.equal(p.expected_order_day,'2026-10-14');
assert.deepEqual(p.parameters,['cdfilial','cdloja','nrvendarest','nrcomanda','day_start','day_end']);
for(const x of ['TOP (101)','TEKNISA.ITCOMANDAVEN','TEKNISA.COMANDAVEN',
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
const fakeGrants=structuredClone(manifest);
fakeGrants.effective_columns.ITCOMANDAVEN.push('CDSENHAPED');
const withFake=makePlan(fixture(),fakeGrants);
assert.equal(withFake.status,'OFFLINE_SQL_TEMPLATE_REVIEW_HOLD');
assert.equal(withFake.reason,'HISTORIC_GRANT_NOT_CURRENT_SQL_PROOF');
assert.equal(withFake.sql_execution_allowed,false);
assert.equal(withFake.sql_identity_authenticated,false);
tests++;
console.log(JSON.stringify({status:'PASS',tests,
 query_plan_only:true,customer_data_used:false,source_is_fictional:true,
 sql_calls:0,service_effects:0,printer_effects:0,
 old_manifest_cannot_grant_new_column:true}));

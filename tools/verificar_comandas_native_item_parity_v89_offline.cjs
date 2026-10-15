'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {compare,qty}=require('./comandas_native_item_parity_v89_offline.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,
 '../data/tata_reader_permission_manifest_v1.json'),'utf8'));
const NOTE='EM CUBOS, SEM CEBOLINHA E SEM CREMA CHEESE POR FAVOR;';
function watcher(){
 const order={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'0000000123',
  NRCOMANDA:'0000000117',NRCOMANDAEXT:'TEST',IDORGCMDVENDA:'DLV_TEST',
  IDSTCOMANDA:'A',DTHRABERMESA:'2026-10-14T12:52:00.0000000',
  items:[
   {NRPRODCOMVEN:'000001',CDPRODUTO:'A001',CDARVPROD:'9.60.00.000.00',
    QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'A'},
   {NRPRODCOMVEN:'000002',CDPRODUTO:'A002',CDARVPROD:'9.60.00.000.01',
    QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'A'}],
  observation_scan_complete:true,observation_rows:[
   {source_field:'DSOBSCOMANDA',value:'FICTIONAL PAID ONLINE NOTE',
    scope_hint:'order',join_proven:true},
   {source_field:'DSOBSPEDDIGCMD',value:NOTE,item_index:0,
    CDPRODUTO:'A001',scope_hint:'item',join_proven:true},
   {source_field:'TXPRODCOMVEN',value:NOTE,item_index:0,
    CDPRODUTO:'A001',scope_hint:'item',join_proven:true}
  ]};
 const main=Object.fromEntries(['CDFILIAL','CDLOJA','NRVENDAREST',
 'NRCOMANDA','NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA',
 'DTHRABERMESA'].map(k=>[k,order[k]]));
 main.items=order.items.map(it=>Object.fromEntries(['NRPRODCOMVEN',
  'CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'].map(k=>[k,it[k]])));
 main.observation_rows=order.observation_rows.map(x=>({...x}));
 return {schema:'deliveryos.tata-reader-stable-order-event.v1',
  order_key:'0001|01|0000000123|0000000117',
  snapshot_hash:createHash('sha256').update(JSON.stringify(main)).digest('hex'),
  order};
}
function rows(){
 const o=watcher().order;
 return o.items.map((it,i)=>({
  CDFILIAL:o.CDFILIAL,CDLOJA:o.CDLOJA,NRVENDAREST:o.NRVENDAREST,
  NRCOMANDA:o.NRCOMANDA,NRPRODCOMVEN:it.NRPRODCOMVEN,
  CDPRODUTO:it.CDPRODUTO,QTPRODCOMVEN:it.QTPRODCOMVEN,
  IDSTPRCOMVEN:it.IDSTPRCOMVEN,CDSENHAPED:'00042',
  DSOBSDESCIT:null,DSOBSPEDDIGCMD:i===0?NOTE:null,
  TXPRODCOMVEN:i===0?NOTE:null,
  IDORGCMDVENDA:o.IDORGCMDVENDA,DTHRABERMESA:o.DTHRABERMESA}));
}
let checks=0;
function trial(name,edit,expected){
 const event=watcher(),native=rows(),m=structuredClone(manifest);
 edit(native,event,m);
 const before=JSON.stringify([native,event,m]);
 const result=compare(event,m,native);
 assert.equal(result.status,expected,name);
 assert.equal(result.historical_sql_revision_proven,false,name);
 assert.equal(result.sql_row_identity_authenticated,false,name);
 assert.equal(result.database_grant_proven,false,name);
 assert.equal(result.physical_print_authorized,false,name);
 assert.equal(result.three_vias_proven,false,name);
 assert.ok(Object.values(result.source_effects).every(v=>v===false),name);
 assert.equal(JSON.stringify([native,event,m]),before,name);
 checks++;
}
const PASS='NATIVE_ITEM_VALUES_CONSISTENT_HISTORY_NOT_PROVEN';
trial('matching source values only',()=>{},PASS);
trial('quantity equal with different legal scale',(n)=>{n[0].QTPRODCOMVEN='1'},PASS);
trial('missing row',(n)=>{n.pop()},'HOLD');
trial('extra row',(n)=>{n.push(structuredClone(n[1]))},'HOLD');
trial('forged watcher hash',(n)=>{n[0].snapshot_hash='a'.repeat(64)},'HOLD');
trial('forged watcher order_key',(n)=>{n[1].order_key='0001|01|TEST'},'HOLD');
trial('missing native source column',(n)=>{delete n[0].CDSENHAPED},'HOLD');
trial('wrong filial',(n)=>{n[0].CDFILIAL='0002'},'HOLD');
trial('wrong shop',(n)=>{n[0].CDLOJA='02'},'HOLD');
trial('wrong sale',(n)=>{n[0].NRVENDAREST='9999'},'HOLD');
trial('wrong comanda',(n)=>{n[0].NRCOMANDA='9999'},'HOLD');
trial('wrong origin',(n)=>{n[0].IDORGCMDVENDA='OTHER'},'HOLD');
trial('wrong SQL order date',(n)=>{n[0].DTHRABERMESA='2026-10-15T00:00:00'},'HOLD');
trial('unrecognized item id',(n)=>{n[0].NRPRODCOMVEN='404'},'HOLD');
trial('duplicated item id',(n)=>{n[1].NRPRODCOMVEN=n[0].NRPRODCOMVEN},'HOLD');
trial('wrong product',(n)=>{n[0].CDPRODUTO='OTHER'},'HOLD');
trial('wrong item status',(n)=>{n[0].IDSTPRCOMVEN='X'},'HOLD');
trial('wrong quantity',(n)=>{n[1].QTPRODCOMVEN='3.000'},'HOLD');
trial('invalid zero quantity',(n)=>{n[0].QTPRODCOMVEN='0.000'},'HOLD');
trial('overlong senha',(n)=>{n[0].CDSENHAPED='999999'},'HOLD');
trial('zero senha',(n)=>{n[0].CDSENHAPED='00000'},'HOLD');
trial('B5 description removed',(n)=>{n[0].DSOBSPEDDIGCMD=null},'HOLD');
trial('B5 production note modified',(n)=>{n[0].TXPRODCOMVEN='SEM CEBOLINHA'},'HOLD');
trial('extra source note not in watcher',(n)=>{n[1].DSOBSDESCIT='ADD EXTRA'},'HOLD');
trial('unparseable note value',(n)=>{n[1].DSOBSDESCIT=99},'HOLD');
trial('tamper original note',(n,e)=>{e.order.observation_rows[1].value+='XX'},'HOLD');
trial('tamper original order date',(n,e)=>{e.order.DTHRABERMESA='2026-10-15T12:52:00'},'HOLD');
trial('manifest invalid principal',(n,e,m)=>{m.principal='sysadmin'},'HOLD');
assert.equal(qty('2.000'),qty('2'));
assert.notEqual(qty('2.001'),qty('2'));
assert.equal(qty('-1'),null);
assert.equal(qty('0.000'),null);
console.log(JSON.stringify({schema:'tata.native-items-parity.v89.test',
 status:'PASS',checks,synthetic_only:true,actual_sql:false,
 historical_revision_proven:false,print_authorized:false,
 no_operational_effects:true}));

'use strict';
const assert=require('node:assert/strict');
const {buildReportSourceEnvelope}=require('../runtime/reporting/report_source_envelope_v1.cjs');
const {inspect,NEED,V68_SCHEMA}=require('./comandas_v68_envelope_boundary_v82.cjs');
const SNAP='a'.repeat(64),ORIG='SYNTHETIC_ORDER_ONLY',CONTENT='FAKE NOTE WITHOUT PRIVATE DATA';
let checks=0;const ok=(x,y)=>{assert.deepEqual(x,y);checks++};
const rawEvent={schema:'deliveryos.tata-reader-stable-order-event.v1',
 order_key:ORIG,snapshot_hash:SNAP,observed_at:'2026-10-14T12:00:00Z',
 order:{CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'FAKE1',NRCOMANDA:'FAKE2',
 NRCOMANDAEXT:'FAKE3',IDORGCMDVENDA:'DLV_FAKE',IDSTCOMANDA:'A',
 DTHRABERMESA:'2026-10-14T12:00:00',
 items:[{NRPRODCOMVEN:'1',CDPRODUTO:'FAKE',CDARVPROD:'9.60.00.000.00',
 QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'A'}],
 observation_scan_complete:true,
 observation_rows:[
  {scope_hint:'order',source_field:'DSOBSCOMANDA',value:CONTENT,join_proven:true},
  {scope_hint:'item',source_field:'DSOBSPEDDIGCMD',value:'SEM CEBOLINHA',
   item_index:0,CDPRODUTO:'FAKE',join_proven:true},
  {scope_hint:'item',source_field:'TXPRODCOMVEN',value:'SEM CEBOLINHA',
   item_index:0,CDPRODUTO:'FAKE',join_proven:true}
 ]},
 ready_for_downstream_shadow:true,blockers:[],
 service_resolution:{service:'LUNCH',evidence:'REAL_OBSERVED',source_ref:'fake'}};
const shadow={schema:'deliveryos.live-shadow-decision.v1',order_key:ORIG,
 snapshot_hash:SNAP,fingerprint:'b'.repeat(64),ready:false,
 blocking_reasons:['BAG_SIZE_NOT_FACT'],
 order_observations:[{source_field:'DSOBSCOMANDA',value:CONTENT}],
 items:[{item_index:1,observations:[
  {source_field:'DSOBSPEDDIGCMD',value:'SEM CEBOLINHA'},
  {source_field:'TXPRODCOMVEN',value:'SEM CEBOLINHA'}]}],
 effects:{print:false,spooler_write:false,database_write:false}};
const before=JSON.stringify([rawEvent,shadow]);
const envelope=buildReportSourceEnvelope(rawEvent,shadow,{generatedAt:'2026-10-14T12:00:10Z'});
ok(envelope.schema,'tata.delivery-report-source-envelope.v1');
ok(Object.hasOwn(envelope.source_event.order,'observation_rows'),false);
ok(Object.hasOwn(envelope.source_event.order,'observation_scan_complete'),false);
ok(rawEvent.order.observation_rows.length,3);
ok(shadow.items[0].observations.length,2);
ok(JSON.stringify([rawEvent,shadow]),before);
const r=inspect(envelope);
ok(r.status,'READER_ENVELOPE_VALID_ONLY_V68_HOLD');
ok(r.reader_source_only,true);
ok(r.shadow_decision_carries_note_surfaces,true);
ok(r.excluded_from_source_event_observation_rows,true);
ok(r.source_raw_notes_retained_for_v68,false);
ok(r.complete_v68_proof,false);
ok(r.print_authorized,false);
ok(r.source_text_exposed,false);
ok(r.missing_independent_sources,NEED);
ok(Object.keys(envelope).filter(k=>NEED.includes(k)),[]);
ok(JSON.stringify(r).includes(CONTENT),false);
const cases=[
 {...envelope,identity:{...envelope.identity,snapshot_hash:'c'.repeat(64)}},
 {...envelope,source_event:{...envelope.source_event,order_key:'OTHER'}},
 {...envelope,shadow_decision:{...envelope.shadow_decision,snapshot_hash:'d'.repeat(64)}},
 {...envelope,production:{lines:[]}},
 {...envelope,delivery:{items:[]},production:{lines:[]}},
 {...envelope,...Object.fromEntries(NEED.map(k=>[k,{}]))},
 {...envelope,schema:V68_SCHEMA},
 {...envelope,source_event:{...envelope.source_event,order:{...envelope.source_event.order,
 observation_rows:rawEvent.order.observation_rows}}},
 null,{},false
];
for(const bad of cases){
 const result=inspect(bad);
 ok(result.status,'HOLD');
 ok(result.print_authorized,false);
 ok(result.complete_v68_proof,false);
 ok(result.source_text_exposed,false);
}
console.log(JSON.stringify({status:'PASS',checks,synthetic_only:true,
  event_notes_in_source_input:rawEvent.order.observation_rows.length,
  report_source_projection_drops_observation_rows:true,
  source_envelope_not_independent_proof:true,
  prints:0,system_changes:false,operational_authority:false}));

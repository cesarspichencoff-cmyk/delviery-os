'use strict';
const assert = require('node:assert/strict');
const {adaptStableTataOrderV1: adapt} = require('../../runtime/reporting/copiloto_tata_reader_adapter_v1.cjs');
const {projectTataOrdersForCopilotV1: project} = require('../../runtime/reporting/copiloto_tata_orders_v1.cjs');
const scope={unitId:'ITAIM',sourceUnitId:'SOURCE-LAB',sourceStoreId:'STORE-LAB',
  mappingEvidenceRef:'synthetic-approved-mapping',sourceMode:'control'};
function event() {return {
  schema:'deliveryos.tata-reader-stable-order-event.v1',snapshot_hash:'synthetic-source-ref',
  observed_at:'2026-10-26T20:01:00-03:00',ready_for_downstream_shadow:true,blockers:[],
  service_resolution:{service:'DINNER',evidence:'HUMAN_CONFIRMED_RULE',source_ref:'synthetic-ref',blockers:[]},
  effects:{database_read:true,database_write:false,network_call:false,odhen_write:false,
    print:false,spooler_write:false,fiscal_action:false,sefaz_call:false,cutover:false},
  order:{CDFILIAL:'SOURCE-LAB',CDLOJA:'STORE-LAB',NRVENDAREST:'V1',NRCOMANDA:'C1',
    IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'X',DTHRABERMESA:'2026-10-26T20:00:00-03:00',
    customer_name:'PRIVATE_SENTINEL',observation_rows:['PRIVATE_SENTINEL'],
    items:[{NRPRODCOMVEN:'1',CDPRODUTO:'P1',CDARVPROD:'R1',QTPRODCOMVEN:'1.5',
      IDSTPRCOMVEN:'F',observation:'PRIVATE_SENTINEL'}]}};}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
test('native schema -> existing Tata engine -> Copiloto read model',()=>{
  const a=adapt(event(),scope);assert.equal(a.state,'adapted');
  const r=project({unitId:scope.unitId,sourceUnitId:scope.sourceUnitId,revisions:[a.revision],
    now:'2026-10-26T20:02:00-03:00',maxAgeMs:120000});
  assert.equal(r.orders[0].items[0].quantity,1.5);assert.equal(r.orders[0].source_mode,'control');
  assert.equal(r.orders[0].unit_id,'ITAIM');assert.equal(r.live_source_verified,false);
  assert.equal(r.orders[0].ready_for_dispatch,null);assert.equal(r.orders[0].kds_cycle.state,'UNKNOWN');
  assert.equal(JSON.stringify(a).includes('PRIVATE_SENTINEL'),false);
  assert.equal(JSON.stringify(r).includes('PRIVATE_SENTINEL'),false);
});
test('missing mapping cannot infer Itaim from native codes or host',()=>{
  assert.equal(adapt(event(),null).reason,'AUTHORIZED_SOURCE_MAPPING_REQUIRED');
  assert.equal(adapt(event(),{...scope,mappingEvidenceRef:''}).state,'blocked');
  assert.equal(adapt(event(),{...scope,sourceMode:undefined}).state,'blocked');
});
test('different store/unit discarded before decoding payload',()=>{
  const e=event();e.order={CDFILIAL:'OTHER',CDLOJA:'OTHER'};
  assert.equal(adapt(e,scope).state,'out_of_scope');
});
test('installed source blocker signature remains blocked',()=>{
  const e=event();e.ready_for_downstream_shadow=false;
  e.blockers=['SERVICE_STATE_DATE_MISMATCH_ORDER_DATE','SERVICE_STATE_EXPIRED_FOR_ORDER'];
  const a=adapt(e,scope);assert.equal(a.reason,'READER_DOWNSTREAM_BLOCKED');assert.equal(a.revision,null);
});
test('contradictory top-level ready flag cannot override service blockers',()=>{
  const e=event();e.service_resolution.blockers=['EXPIRED'];assert.equal(adapt(e,scope).state,'blocked');
});
test('unknown schema/effects fail closed',()=>{
  const e=event();e.schema='other';assert.equal(adapt(e,scope).state,'blocked');
  const x=event();x.effects.database_write=true;assert.equal(adapt(x,scope).reason,'READER_EFFECT_BOUNDARY_INVALID');
});
test('naive source datetime is not assigned the machine timezone',()=>{
  const e=event();e.order.DTHRABERMESA='2026-10-26T20:00:00';
  assert.equal(adapt(e,scope).reason,'EXPLICIT_SOURCE_TIMEZONE_REQUIRED');
});
test('localized quantity and missing items do not create partial or empty orders',()=>{
  const e=event();e.order.items[0].QTPRODCOMVEN='1,5';assert.equal(adapt(e,scope).state,'blocked');
  e.order.items[0].QTPRODCOMVEN='9'.repeat(400);assert.equal(adapt(e,scope).state,'blocked');
  e.order.items=[];assert.equal(adapt(e,scope).reason,'READER_ITEMS_REQUIRED');
});
test('fresh audit of an old source observation remains stale',()=>{
  const e=event();e.recorded_at='2026-10-27T20:00:00-03:00';const a=adapt(e,scope);
  const r=project({unitId:scope.unitId,sourceUnitId:scope.sourceUnitId,revisions:[a.revision],
    now:e.recorded_at,maxAgeMs:120000});assert.equal(r.orders[0].state,'stale');
});
console.log(`COPILOT_READER_ADAPTER_PASS ${passed}`);

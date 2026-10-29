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
const {resolveNativeOpenedAt:resolve,explicitInstant}=require('../../runtime/reporting/tata_source_time_v1.cjs');
const timed={...scope,sourceTimePolicy:{schema:'deliveryos.source-time-policy.v1',timeZone:'America/Sao_Paulo',
  field:'DTHRABERMESA',basis:'NATIVE_LOCAL_WALL_TIME',unitId:scope.unitId,sourceUnitId:scope.sourceUnitId,
  sourceStoreId:scope.sourceStoreId,evidenceRef:'SYNTHETIC_TIME_POLICY'}};
test('explicit source policy preserves fractions and native payload',()=>{
  const e=event();e.order.DTHRABERMESA='2026-10-26T20:00:00.1234567';const original=JSON.stringify(e);
  const a=adapt(e,timed);assert.equal(a.state,'adapted');
  assert.equal(a.revision.identity.opened_at,'2026-10-26T20:00:00.1234567-03:00');
  assert.equal(a.time_resolution.evidenceRef,'SYNTHETIC_TIME_POLICY');assert.equal(JSON.stringify(e),original);
  const view=project({unitId:scope.unitId,sourceUnitId:scope.sourceUnitId,revisions:[a.revision],now:'2026-10-26T23:02:00Z',maxAgeMs:120000});
  assert.equal(view.orders.length,1);assert.equal(view.live_source_verified,false);
  assert.equal(view.orders[0].ready_for_dispatch,null);
});
test('consumer timezone does not change the resolved instant',()=>{
  const prior=process.env.TZ;
  try{for(const zone of ['UTC','Asia/Tokyo','America/Los_Angeles']){
    process.env.TZ=zone;assert.equal(resolve('2026-10-26T20:00:00',timed).instant,'2026-10-26T20:00:00-03:00');
  }}finally{if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior;}
});
test('source policy must match unit/store and cannot come from event',()=>{
  for(const delta of [{sourceStoreId:'OTHER'},{unitId:'OTHER'},{evidenceRef:''},{timeZone:'UTC'},{basis:'HOST_CLOCK'}]){
    assert.equal(resolve('2026-10-26T20:00:00',{...timed,sourceTimePolicy:{...timed.sourceTimePolicy,...delta}}).state,'blocked');
  }
  const e=event();e.order.DTHRABERMESA='2026-10-26T20:00:00';e.sourceTimePolicy=timed.sourceTimePolicy;
  assert.equal(adapt(e,scope).state,'blocked');
});
test('calendar rollovers, offset errors and unsupported dates rejected',()=>{
  for(const value of ['2026-02-30T12:00:00','2026-13-01T12:00:00','2026-10-26T24:00:00','2026-10-26T12:60:00','2026-10-26T12:00:60','1999-01-01T00:00:00','2100-01-01T00:00:00']){
    assert.equal(resolve(value,timed).state,'blocked');assert.equal(explicitInstant(value+'Z'),false);
  }
  for(const value of ['2026-10-26T12:00:00-00:00','2026-10-26T12:00:00+14:01','2026-10-26T12:00:00-03:60'])assert.equal(explicitInstant(value),false);
  assert.equal(resolve('2024-02-29T12:00:00',timed).state,'resolved');
});
test('historical summer offset, skipped time and repeated time',()=>{
  assert.equal(resolve('2018-12-01T12:00:00',timed).instant,'2018-12-01T12:00:00-02:00');
  assert.equal(resolve('2018-11-04T00:30:00',timed).reason,'SOURCE_LOCAL_TIME_NONEXISTENT');
  assert.equal(resolve('2019-02-16T23:30:00',timed).reason,'SOURCE_LOCAL_TIME_AMBIGUOUS');
});
test('time policy cannot override producer block or unknown provenance',()=>{
  const e=event();e.order.DTHRABERMESA='2026-10-26T20:00:00';e.blockers=['EXPIRED'];
  assert.equal(adapt(e,timed).reason,'READER_DOWNSTREAM_BLOCKED');
  e.blockers=[];assert.equal(adapt(e,{...timed,sourceMode:null}).reason,'AUTHORIZED_SOURCE_MAPPING_REQUIRED');
});
console.log(`COPILOT_READER_ADAPTER_PASS ${passed}`);

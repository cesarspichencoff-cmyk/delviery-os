"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {projectExpectedRouting}=require("../dist/src/shadow/expectedRouting.js");
const {planProductionPrintIntents}=require("../dist/src/production/productionPrintPlan.js");
const {resolveProductionServiceShiftState}=
 require("../dist/src/production/serviceShiftState.js");

function load(relativePath) {
 return JSON.parse(fs.readFileSync(path.join(__dirname,"..",relativePath),"utf8"));
}
const routing=load("data/odhen_product_routing_compact_v1.json");
const printers=load("data/runtime_printer_map_v1.json");
const calibration=load("data/production_printer_calibration_registry_v1.json");
const pairs=[
 {key:"SUSHI_1",a:"00009",b:"00003"},
 {key:"SUSHI_2",a:"00006",b:"00004"}
];
let checked=0,dualRoleProducts=0;
for(const [productCode,codes] of Object.entries(routing.products)){
 const projection=projectExpectedRouting({
  ids:{pedido_interno:"MATRIX-"+productCode},
  items:[{item_index:0,codigo:productCode,nome:productCode,quantidade:1}]
 },routing,printers);
 assert.equal(projection.ready,true,"routing invalid for "+productCode);
 const ambiguous=pairs.filter(pair=>codes.includes(pair.a)&&codes.includes(pair.b));
 if(ambiguous.length)dualRoleProducts++;
 const refused=new Set(ambiguous.flatMap(pair=>[pair.a,pair.b]));
 const independentlyRouted=[...new Set(codes.filter(code=>!refused.has(code)))].sort();
 for(const service of ["LUNCH","DINNER",null]){
  const plan=planProductionPrintIntents(projection,{
   tata_sequence:"001",teknisa_sequence:"MATRIX-"+productCode,
   ifood_sequence:"IFOOD-"+productCode,order_time:null,
   service_resolution:service
    ?{service,evidence:"HUMAN_CONFIRMED_RULE",source_ref:"synthetic:service-matrix"}
    :{service:null,evidence:"UNKNOWN",source_ref:null},
   template_version:"production-ticket-v2-shadow",ticket_items:[]
  },calibration);
  assert.equal(plan.ready_for_physical_print,false);
  assert.equal(plan.effects.print,false);
  assert.equal(plan.ready_for_shadow_payload,ambiguous.length===0,
   "dual role must fail regardless of service: "+productCode);
  for(const pair of ambiguous){
   assert.ok(plan.blocking_reasons.includes(
    pair.key+"_DUAL_PRODUCTION_ROLE_UNPROVEN_ITEM_0"),
    "source ambiguity missing for "+productCode);
  }
  const actual=plan.print_intents.map(x=>x.printer.printer_code).sort();
  assert.deepEqual(actual,independentlyRouted,
   "never select role by meal shift: "+productCode);
  for(const intent of plan.print_intents)
   assert.equal(intent.physical_effect_authorized,false);
 }
 checked++;
}
assert.equal(checked,Object.keys(routing.products).length);
assert.ok(checked>0&&dualRoleProducts>0);
console.log("production-service-matrix-v1: SAFE_NO_SHIFT_ROLE_GATE"+
 " products="+checked+" dual_role_holds="+dualRoleProducts+
 " services=LUNCH,DINNER,NULL no-physical-effect");

// Below: historical service-state parser diagnostics, NOT current human
// authorization to select a physical printer or create daily shift controls.

const validState={
  schema:"deliveryos.production-service-shift-state.v2",
  store_id:"0001",
  operational_date:"2026-10-05",
  service:"LUNCH",
  evidence:"HUMAN_CONFIRMED_RULE",
  source_ref:"human:test:lunch",
  clock_inference_used:false,
  valid_from_local:"2026-10-05T11:00:00",
  valid_until_local:"2026-10-05T18:00:00",
  updated_at:"2026-10-05T13:10:00-03:00"
};
const validResolution=resolveProductionServiceShiftState(validState,{
  store_id:"0001",
  operational_date:"2026-10-05",
  order_opened_at:"2026-10-05T17:59:59.0000000"
});
assert.equal(validResolution.ready,true);
assert.equal(validResolution.service_resolution.service,"LUNCH");

const expiredResolution=resolveProductionServiceShiftState(validState,{
  store_id:"0001",
  operational_date:"2026-10-05",
  order_opened_at:"2026-10-05T18:00:01.0000000"
});
assert.equal(expiredResolution.ready,false);
assert.ok(expiredResolution.blocking_reasons.includes("SERVICE_STATE_EXPIRED_FOR_ORDER"));
assert.equal(expiredResolution.service_resolution.service,null);

const legacyResolution=resolveProductionServiceShiftState(
  {...validState,schema:"deliveryos.production-service-shift-state.v1"},
  {
    store_id:"0001",
    operational_date:"2026-10-05",
    order_opened_at:"2026-10-05T17:00:00.0000000"
  }
);
assert.equal(legacyResolution.ready,false);
assert.ok(legacyResolution.blocking_reasons.includes("SERVICE_STATE_SCHEMA_MISMATCH"));

console.log("service-state-validity-v2: ok valid/expired/legacy");

const shiftCases=[
  ["legacy writer missing valid_from", {valid_from_local:undefined}, "2026-10-05T17:00:00.0000000", "SERVICE_STATE_VALID_FROM_REQUIRED"],
  ["before window", {}, "2026-10-05T10:59:59.9999999", "SERVICE_STATE_NOT_YET_ACTIVE_FOR_ORDER"],
  ["exclusive upper boundary", {}, "2026-10-05T18:00:00.0000000", "SERVICE_STATE_EXPIRED_FOR_ORDER"],
  ["previous day cannot borrow today's shift", {}, "2026-10-04T23:59:59", "SERVICE_STATE_NOT_YET_ACTIVE_FOR_ORDER"],
  ["source provenance required", {source_ref:""}, "2026-10-05T12:00:00", "SERVICE_STATE_SOURCE_REF_REQUIRED"],
  ["clock guessing forbidden", {clock_inference_used:true}, "2026-10-05T12:00:00", "SERVICE_STATE_CLOCK_INFERENCE_FORBIDDEN"],
  ["wrong store must not authorize", {store_id:"0002"}, "2026-10-05T12:00:00", "SERVICE_STATE_STORE_MISMATCH"],
  ["reversed interval", {valid_until_local:"2026-10-05T10:00:00"}, "2026-10-05T12:00:00", "SERVICE_STATE_WINDOW_INVALID"]
];
for(const [label,delta,opened,expectedBlocker] of shiftCases){
 const candidate={...validState,...delta};
 const verdict=resolveProductionServiceShiftState(candidate,{
  store_id:"0001",operational_date:"2026-10-05",order_opened_at:opened
 });
 assert.equal(verdict.ready,false,label);
 assert.ok(verdict.blocking_reasons.includes(expectedBlocker),label+": "+verdict.blocking_reasons.join(","));
 assert.equal(verdict.service_resolution.service,null,label);
}
const before=resolveProductionServiceShiftState(validState,{
 store_id:"0001",operational_date:"2026-10-05",order_opened_at:"2026-10-05T11:00:00"
});
assert.equal(before.ready,true,"inclusive start boundary");
console.log("service-state-writer-reader-contract: PASS positives=2 negatives="+shiftCases.length);

"use strict";
/**
 * Regression for corrected physical destination boundary.
 * The historical 00009/00003 and 00006/00004 pairs are NOT verified shift
 * alternatives. ALL results in this fixture are nonphysical/offline.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {projectExpectedRouting}=
 require("../dist/src/shadow/expectedRouting.js");
const {planProductionPrintIntents}=
 require("../dist/src/production/productionPrintPlan.js");
const {decideProductionPrintSubmission}=
 require("../dist/src/production/productionPrintIdempotency.js");
const load=p=>JSON.parse(fs.readFileSync(path.join(__dirname,"..",p),"utf8"));
const routing=load("data/odhen_product_routing_compact_v1.json");
const printers=load("data/runtime_printer_map_v1.json");
const calibration=load("data/production_printer_calibration_registry_v1.json");
const PAIRS=[
 {key:"SUSHI_1",a:"00009",b:"00003"},
 {key:"SUSHI_2",a:"00006",b:"00004"}
];
let checked=0,ambiguous=0,oneTarget=0,retainedOthers=0;
function plan(targetCodes,service){
 const product="9.99.00.001.00";
 const base={...routing,products:{[product]:targetCodes}};
 const projection=projectExpectedRouting({
  ids:{pedido_interno:"SYNTHETIC_ROUTE_ONLY"},
  items:[{item_index:0,codigo:product,nome:"SYNTHETIC ROUTE",quantidade:1}]
 },base,printers);
 assert.equal(projection.ready,true,"synthetic route must map");
 const context={tata_sequence:"007",teknisa_sequence:"SYNTHETIC_ROUTE_ONLY",
  ifood_sequence:"9627",order_time:"13:42",
  service_resolution:service?{service,evidence:"REAL_OBSERVED",
   source_ref:"SYNTHETIC_SOURCE_ONLY"}:{service:null,evidence:"UNKNOWN",source_ref:null},
  template_version:"production-ticket-v2-shadow",ticket_items:[]};
 return planProductionPrintIntents(projection,context,calibration);
}
function verifyNoPhysical(p){
 assert.equal(p.ready_for_physical_print,false);
 for(const x of p.print_intents){
  assert.equal(x.physical_effect_authorized,false);
  assert.equal(x.evidence,"PLANNED");
 }
}
for(const pair of PAIRS){
 const previous=[];
 for(const service of ["LUNCH","DINNER",null]){
  const output=plan([pair.a,pair.b],service);
  verifyNoPhysical(output);
  assert.equal(output.ready_for_shadow_payload,false);
  assert.ok(output.blocking_reasons.includes(
   pair.key+"_DUAL_PRODUCTION_ROLE_UNPROVEN_ITEM_0"));
  assert.equal(output.print_intents.length,0,
   "unproven pair cannot select lunch or dinner endpoint");
  previous.push(output);
  checked++;
 }
 // Any lone proven logical target remains available as a nonphysical intent:
 for(const code of [pair.a,pair.b]){
  const got=plan([code],null);
  verifyNoPhysical(got);
  assert.equal(got.ready_for_shadow_payload,true,
   "single configured route does not require daily service state");
  assert.deepEqual(got.print_intents.map(x=>x.printer.printer_code),[code]);
  const lunch=plan([code],"LUNCH"),dinner=plan([code],"DINNER");
  verifyNoPhysical(lunch);verifyNoPhysical(dinner);
  assert.equal(lunch.ready_for_shadow_payload,true);
  assert.equal(dinner.ready_for_shadow_payload,true);
  assert.equal(lunch.print_intents[0].intent_fingerprint,got.print_intents[0].intent_fingerprint,
   "meal label must not fork the same production intent");
  assert.equal(dinner.print_intents[0].intent_fingerprint,got.print_intents[0].intent_fingerprint);
  assert.equal(dinner.print_intents[0].semantic_key_material,got.print_intents[0].semantic_key_material);
  oneTarget++;
 }
 const withKitchen=plan([pair.a,pair.b,"00002"],"LUNCH");
 verifyNoPhysical(withKitchen);
 assert.equal(withKitchen.ready_for_shadow_payload,false);
 assert.deepEqual(withKitchen.print_intents.map(x=>x.printer.printer_code),["00002"],
  "unrelated kitchen route remains visible, NEVER ready to print");
 retainedOthers++;
}
const sourceFingerprint=plan(["00009"],"LUNCH").print_intents[0].intent_fingerprint;
const alteredServiceFingerprint=plan(["00009"],"DINNER").print_intents[0].intent_fingerprint;
const noServiceFingerprint=plan(["00009"],null).print_intents[0].intent_fingerprint;
assert.equal(sourceFingerprint,alteredServiceFingerprint);
assert.equal(sourceFingerprint,noServiceFingerprint);
assert.equal(decideProductionPrintSubmission(alteredServiceFingerprint,[{
 intent_fingerprint:sourceFingerprint,attempt_id:"SYNTHETIC_PRIOR_ATTEMPT",
 state:"SUBMISSION_RETURNED_UNOBSERVED"
}]).decision,"BLOCK_RECONCILIATION_REQUIRED",
 "changing only meal label must not turn an ambiguous prior attempt into a fresh submission");
const differentDestinationFingerprint=plan(["00003"],null).print_intents[0].intent_fingerprint;
assert.notEqual(sourceFingerprint,differentDestinationFingerprint,
 "different printer destination must keep a distinct production intent");
const fakeOverride=plan(["00009","00003"],"DINNER");
assert.equal(fakeOverride.ready_for_shadow_payload,false,
 "a human-entered lunch/dinner label cannot independently attest printer roles");
assert.ok(routing.counts?.two_targets>0,"historical source includes dual target entries");
console.log("COMANDAS_NO_SHIFT_PRINTER_ROLE_GATE_V1="+(checked+oneTarget+retainedOthers+1)+"/"+
 (checked+oneTarget+retainedOthers+1)+" DUAL_PAIRS_HOLD SINGLE_ROUTE_PRESERVED NO_PRINT");

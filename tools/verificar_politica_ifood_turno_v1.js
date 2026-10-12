"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {projectExpectedRouting}=require("../dist/src/shadow/expectedRouting.js");
const {planProductionPrintIntents}=require("../dist/src/production/productionPrintPlan.js");
const {evaluate}=require("./avaliar_politica_ifood_turno_v1.cjs");
const load=file=>JSON.parse(fs.readFileSync(path.join(__dirname,"..","data",file),"utf8"));
const routing=load("odhen_product_routing_compact_v1.json");
const printers=load("runtime_printer_map_v1.json");
const calibration=load("production_printer_calibration_registry_v1.json");
let total=0;
function check(label,run){run();total++;console.log("PASS "+total+" "+label);}
function caseFor(sku,station,service,origin="DLV_IFO"){
 const projection=projectExpectedRouting(
   {ids:{pedido_interno:"SYNTHETIC-IFOOD-REVIEW"},
    items:[{item_index:0,codigo:sku,nome:"OFFLINE TEST",quantidade:1}]},
   routing,printers);
 const plan=planProductionPrintIntents(projection,
   {tata_sequence:"SHADOW-001",teknisa_sequence:"SYNTHETIC-IFOOD-REVIEW",
    ifood_sequence:"OFFLINE-001",order_time:null,
    service_resolution:{service,evidence:"HUMAN_CONFIRMED_RULE",
      source_ref:"synthetic:test-shift-not-real-authority"},
    template_version:"offline-test",ticket_items:[]},calibration);
 assert.equal(projection.ready,true,projection.blocking_reasons.join(","));
 assert.equal(plan.ready_for_shadow_payload,true,plan.blocking_reasons.join(","));
 return {store_id:"0001",shop_id:"01",origin,service,projection,plan,
  station_proofs:[{item_index:0,product_code:sku,station,
   source_proof:"CURRENT_MOTOR_PROVEN",source_ref:"synthetic:not-real-attestation"}]};
}
const reasons=(data)=>evaluate(data).reasons.join("|");
const assertBlocked=(data,fragment)=>{
 const result=evaluate(data);
 assert.equal(result.status,"BLOCKED",JSON.stringify(result));
 assert.equal(result.print_authorized,false);
 assert.ok(result.reasons.some(x=>x.includes(fragment)),result.reasons.join(","));
 assert.ok(Object.values(result.effects).every(x=>x===false));
};
const assertReview=(data,targets)=>{
 const result=evaluate(data);
 assert.equal(result.status,"REVIEW_COMPATIBLE_NOT_AUTHORIZED",JSON.stringify(result));
 assert.equal(result.print_authorized,false);
 assert.ok(Object.values(result.effects).every(x=>x===false));
 assert.deepEqual(data.plan.print_intents.map(x=>x.printer.printer_code).sort(),targets.sort());
};
check("Combinado Executivo stays 00009 at lunch without operational authority",()=>{
 assertReview(caseFor("9.05.05.080.00","combinados","LUNCH"),["00009"]);
});
check("Combinado Executivo is blocked at dinner despite native planner keeping 00009",()=>{
 assertBlocked(caseFor("9.05.05.080.00","combinados","DINNER"),
  "LUNCH_ONLY_PRODUCT_DURING_DINNER");
});
check("all four human-confirmed Sushi Quente SKUs stay 00006 in BOTH shifts",()=>{
 for(const sku of ["9.10.05.040.00","9.10.05.050.00",
  "9.10.05.060.00","9.10.05.070.00"])
  for(const service of ["LUNCH","DINNER"])
   assertReview(caseFor(sku,"enrolados_quentes",service),["00006"]);
});
check("Sushi Quente with a documented kitchen dependency keeps 00006+00002",()=>{
 assertReview(caseFor("9.10.05.091.00","enrolados_quentes","DINNER"),
   ["00002","00006"]);
});
check("Sushi 1 with two recorded alternatives selects only 00003 for dinner",()=>{
 assertReview(caseFor("9.10.05.000.00","duplas","DINNER"),["00003"]);
});
check("Sushi 2 with two recorded alternatives selects only 00004 for dinner",()=>{
 assertReview(caseFor("9.50.00.000.00","enrolados","DINNER"),["00004"]);
});
check("non-iFood channel cannot inherit special policy",()=>{
 assertBlocked(caseFor("9.10.05.000.00","duplas","LUNCH","DLV_OWN"),
  "EXACT_IFOOD_ORIGIN_REQUIRED");
 assertBlocked(caseFor("9.10.05.000.00","duplas","LUNCH","SALAO"),
  "EXACT_IFOOD_ORIGIN_REQUIRED");
});
check("other store or shop cannot claim Itaim policy",()=>{
 const p=caseFor("9.10.05.000.00","duplas","LUNCH");p.shop_id="02";
 assertBlocked(p,"STORE_OR_SHOP_NOT_ITAIM");
});
check("missing or self-declared incomplete station proof blocks",()=>{
 const p=caseFor("9.10.05.040.00","enrolados_quentes","DINNER");
 p.station_proofs=[];assertBlocked(p,"CURRENT_STATION_PROOF_COVERAGE_REQUIRED");
 const q=caseFor("9.10.05.040.00","enrolados_quentes","DINNER");
 q.station_proofs[0].source_proof="UNKNOWN";
 assertBlocked(q,"CURRENT_STATION_IDENTITY_NOT_PROVEN");
});
check("wrong SKU in station proof blocks even if route matches",()=>{
 const p=caseFor("9.10.05.040.00","enrolados_quentes","DINNER");
 p.station_proofs[0].product_code="9.10.05.050.00";
 assertBlocked(p,"CURRENT_STATION_IDENTITY_NOT_PROVEN");
});
check("Sushi Quente cannot be labeled Enrolados to redirect it at dinner",()=>{
 assertBlocked(caseFor("9.10.05.040.00","enrolados","DINNER"),
   "SERVICE_TARGET_NOT_IN_ORIGINAL_RETAIL_ROUTE");
});
check("mutated delivery printer 00004 cannot replace Sushi Quente 00006",()=>{
 const p=caseFor("9.10.05.040.00","enrolados_quentes","DINNER");
 p.plan.print_intents[0].printer.printer_code="00004";
 assertBlocked(p,"NATIVE_PLAN_DIFFERS_FROM_STATION_SERVICE_RULE");
});
check("extra target inserted into original route is not silently authorized",()=>{
 const p=caseFor("9.10.05.040.00","enrolados_quentes","DINNER");
 p.projection.items[0].targets.push({printer_code:"00004",printer_name:"FICTITIOUS",
  printer_ip:"127.0.0.1"});
 assertBlocked(p,"ORIGINAL_ROUTE_CONFLICTS_WITH_PROVEN_STATION");
});
check("unpaired lunch-only destination cannot migrate to dinner automatically",()=>{
 assertBlocked(caseFor("9.05.05.050.00","combinados","DINNER"),
  "SERVICE_TARGET_NOT_IN_ORIGINAL_RETAIL_ROUTE");
});
check("stale or contradictory service selection blocks",()=>{
 const p=caseFor("9.10.05.000.00","duplas","LUNCH");
 p.service="DINNER";assertBlocked(p,"PRINT_INTENT_SCHEMA_OR_SERVICE_MISMATCH");
});
check("missing shift evidence blocks even valid route",()=>{
 const p=caseFor("9.10.05.000.00","duplas","LUNCH");
 p.plan.print_intents[0].service_resolution.source_ref=null;
 assertBlocked(p,"PRINT_INTENT_SCHEMA_OR_SERVICE_MISMATCH");
});
check("any physical-effect claim blocks review",()=>{
 const p=caseFor("9.10.05.040.00","enrolados_quentes","LUNCH");
 p.plan.effects.print=true;assertBlocked(p,"EXTERNAL_EFFECT_CLAIM_FORBIDDEN");
 const q=caseFor("9.10.05.040.00","enrolados_quentes","LUNCH");
 q.plan.print_intents[0].physical_effect_authorized=true;
 assertBlocked(q,"PRINT_INTENT_SCHEMA_OR_SERVICE_MISMATCH");
});
check("reused printer intent for same item is blocked",()=>{
 const p=caseFor("9.10.05.040.00","enrolados_quentes","LUNCH");
 p.plan.print_intents[0].lines.push(structuredClone(p.plan.print_intents[0].lines[0]));
 assertBlocked(p,"DUPLICATE_STATION_PRINT_INTENT");
});
check("foreign job ID, renamed line and orphan line are rejected",()=>{
 const p=caseFor("9.10.05.040.00","enrolados_quentes","LUNCH");
 p.plan.order_id="WRONG";assertBlocked(p,"PLAN_ORDER_IDENTITY_MISMATCH");
 const q=caseFor("9.10.05.040.00","enrolados_quentes","LUNCH");
 q.plan.print_intents[0].lines[0].product_name="TAMPERED";
 assertBlocked(q,"PRINT_LINE_PRODUCT_IDENTITY_MISMATCH");
 const z=caseFor("9.10.05.040.00","enrolados_quentes","LUNCH");
 z.plan.print_intents[0].lines[0].item_index=999;
 assertBlocked(z,"ORPHAN_PRINT_LINE");
});
check("unrecognized station or missing source map must never invent route",()=>{
 const p=caseFor("9.10.05.040.00","nao_producao","LUNCH");
 assertBlocked(p,"STATION_NOT_IN_REVIEW_POLICY");
 const q=caseFor("9.10.05.040.00","enrolados_quentes","LUNCH");
 q.projection.ready=false;assertBlocked(q,"SOURCE_ROUTING_PROJECTION_NOT_READY");
});
console.log("IFOOD_SHIFT_REVIEW_V1="+total+"/"+total+
 " OFFLINE_SNAPSHOT_ONLY NO_PRINT NO_RETAIL_WRITE NO_CUTOVER");

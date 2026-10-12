"use strict";
/**
 * Read-only iFood service-routing compatibility check. It reuses existing
 * ExpectedRoutingProjection + ProductionPrintPlan; NO planner or printer.
 * All input attestations must be verified upstream. Even a matching result
 * is NEVER approval to print, install, cut over or mutate Retail.
 */
const LUNCH_ONLY = new Set(["9.05.05.080.00"]);
const STATION_RULES = Object.freeze({
  duplas: {lunch:["00009"],dinner:["00003"],source:["00009","00003"]},
  combinados: {lunch:["00009"],dinner:["00003"],source:["00009","00003"]},
  enrolados: {lunch:["00006"],dinner:["00004"],source:["00006","00004"]},
  enrolados_quentes: {lunch:["00006"],dinner:["00006"],source:["00006","00002"]},
  cozinha_quentes: {lunch:["00002"],dinner:["00002"],source:["00002"]},
  bar_bebidas: {lunch:["00007"],dinner:["00007"],source:["00007"]}
});
const NO_EFFECTS=Object.freeze({print:false,spooler_write:false,
  odhen_write:false,database_write:false,deploy:false,cutover:false});
const text=s=>typeof s==="string"?s.trim():"";
const setEquals=(a,b)=>a.size===b.size&&[...a].every(x=>b.has(x));
function evaluate(input){
  const blockers=new Set();
  const fail=s=>blockers.add(s);
  const finish=()=>({schema:"deliveryos.ifood-shift-review.v1",
    status:blockers.size?"BLOCKED":"REVIEW_COMPATIBLE_NOT_AUTHORIZED",
    reasons:[...blockers].sort(),print_authorized:false,effects:NO_EFFECTS});
  if(!input||typeof input!=="object"||Array.isArray(input)){
    fail("INPUT_INVALID");return finish();
  }
  if(input.store_id!=="0001"||input.shop_id!=="01")
    fail("STORE_OR_SHOP_NOT_ITAIM");
  if(input.origin!=="DLV_IFO")fail("EXACT_IFOOD_ORIGIN_REQUIRED");
  if(!["LUNCH","DINNER"].includes(input.service))
    fail("HUMAN_SERVICE_REQUIRED");
  const projection=input.projection,plan=input.plan,proofs=input.station_proofs;
  if(!projection||projection.schema!=="deliveryos.shadow.expected-routing.v1"||
      projection.ready!==true||!Array.isArray(projection.items)||
      projection.blocking_reasons?.length||projection.items.length===0)
    fail("SOURCE_ROUTING_PROJECTION_NOT_READY");
  if(!plan||plan.schema!=="deliveryos.production-print-plan.v1"||
      plan.ready_for_shadow_payload!==true||plan.ready_for_physical_print!==false||
      !Array.isArray(plan.print_intents)||plan.blocking_reasons?.length||
      plan.print_intents.length===0)
    fail("NATIVE_PRINT_PLAN_NOT_READY");
  const effects=plan?.effects;
  if(!effects||typeof effects!=="object"||Array.isArray(effects)||
      ["print","spooler_write","odhen_write","fiscal_action","cutover"]
       .some(k=>effects[k]!==false))
    fail("EXTERNAL_EFFECT_CLAIM_FORBIDDEN");
  if(!text(projection?.order_id)||projection.order_id!==plan?.order_id)
    fail("PLAN_ORDER_IDENTITY_MISMATCH");
  if(!Array.isArray(proofs)||proofs.length!==projection?.items?.length)
    fail("CURRENT_STATION_PROOF_COVERAGE_REQUIRED");

  const proofByIndex=new Map();
  for(const p of Array.isArray(proofs)?proofs:[]){
    if(!p||!Number.isSafeInteger(p.item_index)||proofByIndex.has(p.item_index)){
      fail("STATION_PROOF_DUPLICATE_OR_INVALID");continue;
    }
    proofByIndex.set(p.item_index,p);
  }
  const plansByItem=new Map();
  for(const intent of Array.isArray(plan?.print_intents)?plan.print_intents:[]){
    const code=intent?.printer?.printer_code;
    if(typeof code!=="string"||!/^\d{5}$/.test(code)||
       intent.physical_effect_authorized!==false||
       intent.evidence!=="PLANNED"||
       intent?.service_resolution?.service!==input.service||
       !["HUMAN_CONFIRMED_RULE","REAL_OBSERVED"].includes(intent?.service_resolution?.evidence)||
       !text(intent?.service_resolution?.source_ref)||
       intent?.identifiers?.teknisa_sequence!==projection?.order_id||
       !Array.isArray(intent.lines)||!intent.lines.length){
      fail("PRINT_INTENT_SCHEMA_OR_SERVICE_MISMATCH");continue;
    }
    for(const line of intent.lines){
      if(!Number.isSafeInteger(line?.item_index)){
        fail("PRINT_LINE_INDEX_INVALID");continue;
      }
      const m=plansByItem.get(line.item_index)??new Set();
      if(m.has(code))fail("DUPLICATE_STATION_PRINT_INTENT");
      m.add(code);plansByItem.set(line.item_index,m);
      const ref=projection?.items?.find(x=>x.item_index===line.item_index);
      if(!ref||ref.product_code!==line.product_code||
          ref.quantity!==line.quantity||ref.product_name!==line.product_name)
        fail("PRINT_LINE_PRODUCT_IDENTITY_MISMATCH");
    }
  }
  const seen=new Set();
  for(const item of Array.isArray(projection?.items)?projection.items:[]){
    if(!Number.isSafeInteger(item?.item_index)||seen.has(item.item_index)){
      fail("ROUTING_ITEM_INDEX_DUPLICATE_OR_INVALID");continue;
    }
    seen.add(item.item_index);
    const p=proofByIndex.get(item.item_index);
    if(!p||p.product_code!==item.product_code||
        p.source_proof!=="CURRENT_MOTOR_PROVEN"||!text(p.source_ref)){
      fail("CURRENT_STATION_IDENTITY_NOT_PROVEN:"+item.item_index);continue;
    }
    const rule=STATION_RULES[p.station];
    if(!rule){fail("STATION_NOT_IN_REVIEW_POLICY:"+item.item_index);continue;}
    if(item.routing_status!=="ROUTED"||!Array.isArray(item.targets)||
       !item.targets.length){
      fail("ITEM_ROUTE_NOT_PROVEN:"+item.item_index);continue;
    }
    if(LUNCH_ONLY.has(item.product_code)&&input.service==="DINNER"){
      fail("LUNCH_ONLY_PRODUCT_DURING_DINNER:"+item.product_code);continue;
    }
    const sourceCodes=item.targets.map(t=>t.printer_code);
    if(new Set(sourceCodes).size!==sourceCodes.length||
       sourceCodes.some(code=>!rule.source.includes(code)))
      fail("ORIGINAL_ROUTE_CONFLICTS_WITH_PROVEN_STATION:"+item.item_index);
    const expected=new Set(input.service==="LUNCH"?rule.lunch:rule.dinner);
    // Sushi Quente can include its independently configured kitchen leg.
    if(p.station==="enrolados_quentes"&&sourceCodes.includes("00002"))
      expected.add("00002");
    if([...expected].some(code=>!sourceCodes.includes(code)))
      fail("SERVICE_TARGET_NOT_IN_ORIGINAL_RETAIL_ROUTE:"+item.item_index);
    if(!setEquals(plansByItem.get(item.item_index)??new Set(),expected))
      fail("NATIVE_PLAN_DIFFERS_FROM_STATION_SERVICE_RULE:"+item.item_index);
  }
  for(const index of plansByItem.keys())if(!seen.has(index))
    fail("ORPHAN_PRINT_LINE:"+index);
  return finish();
}
module.exports={evaluate,STATION_RULES,LUNCH_ONLY,NO_EFFECTS};

"use strict";
/**
 * Offline preflight only. This DOES NOT attest a native timestamp, catalog
 * classification, printer power, or permission to transmit a job.
 * It models the recorded Itaim station/window rule separately from configured
 * route membership; only a validated downstream source may supply proofs.
 */
const {planProductionPrintIntents}=
 require("../dist/src/production/productionPrintPlan.js");
const SCHEMA="tata.comandas.it-window-station-review.v1";
const PAIRS=[
 {a:"00009",d:"00003",category:"COMBINADOS"},
 {a:"00006",d:"00004",category:"ENROLADOS"}
];
const DELIVERY_CODES=new Set(["00003","00004"]);
const validDate=s=>{
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
};
function windowOf(day,hm){
 if(!validDate(day)||typeof hm!=="string"||!/^\d{2}:\d{2}$/.test(hm))return null;
 const [h,m]=hm.split(":").map(Number);
 if(h>23||m>59)return null;
 const t=h*60+m,wd=new Date(day+"T00:00:00Z").getUTCDay();
 const lunchEnd=(wd===0||wd===6)?990:900;
 if(t>=660&&t<lunchEnd)return "LUNCH_CANDIDATE";
 if(t>=1080&&t<1380)return "DINNER_CANDIDATE";
 return "OUTSIDE_REPORTED_WINDOW";
}
function answer(status,reasons,more={}){
 return {schema:SCHEMA,status,reasons:[...new Set(reasons)].sort(),
  shadow_only:true,print_authorized:false,ready_for_operational_print:false,
  event_source_attested_here:false,live_window_verified_here:false,
  current_printer_power_proven:false,first_print_event_proven:false,
  source_catalog_pin_verified_here:false,
  effects:{print:false,spooler_write:false,sql_write:false,sequence_write:false,
   fiscal:false,deploy:false,windows_queue_change:false},
  ...more};
}
function selectWindowStations(projection,windowClaim){
 if(!projection||projection.schema!=="deliveryos.shadow.expected-routing.v1"||
    !projection.ready||!Array.isArray(projection.items))
  return answer("HOLD",["UPSTREAM_ROUTING_NOT_READY"]);
 if(!windowClaim||windowClaim.schema!=="tata.comandas.window-evidence-claim.v1"||
    windowClaim.store_id!=="0001"||windowClaim.store_unit!=="01"||
    windowClaim.timestamp_origin!=="TEKNISA_ORDER_SOURCE_CLAIM"||
    typeof windowClaim.snapshot_sha256!=="string"||
    !/^[a-f0-9]{64}$/i.test(windowClaim.snapshot_sha256)||
    typeof windowClaim.source_ref!=="string"||!windowClaim.source_ref.trim()||
    !Array.isArray(windowClaim.item_roles))
  return answer("HOLD",["NATIVE_WINDOW_SOURCE_CLAIM_MISSING"]);
 const period=windowOf(windowClaim.order_local_day,windowClaim.order_local_hm);
 if(!period)return answer("HOLD",["INVALID_OR_MISSING_LOCAL_ORDER_TIME"]);
 if(period==="OUTSIDE_REPORTED_WINDOW")
  return answer("HOLD",["OUTSIDE_REPORTED_DELIVERY_HOURS"],{period});
 const roles=new Map(),blocked=[],selected=[],suppressed=[];
 for(const role of windowClaim.item_roles){
  if(!role||!Number.isInteger(role.item_index)||role.item_index<0||
     roles.has(role.item_index)||!["COMBINADOS","ENROLADOS","ENROLADOS_QUENTES",
     "INDEPENDENT","COMBINADO_DUPLA_EXCEPTION","UNKNOWN"].includes(role.category)||
     typeof role.rule_ref!=="string"||!role.rule_ref.trim()||
     role.rule_source!=="REVIEWED_CATALOG_RULE_CLAIM")
   return answer("HOLD",["ITEM_ROLE_CLAIM_INVALID_OR_DUPLICATE"],{period});
  if(typeof role.product_code!=="string"||
     !/^[A-Z0-9]\\.[A-Z0-9]{2}\\.[A-Z0-9]{2}\\.[A-Z0-9]{3}\\.[A-Z0-9]{2}$/.test(role.product_code))
   return answer("HOLD",["ITEM_ROLE_SOURCE_PRODUCT_CODE_INVALID"],{period});
  roles.set(role.item_index,role);
 }
 const items=projection.items.map(item=>{
  const result={...item,targets:[...item.targets]};
  if(item.routing_status!=="ROUTED")return result;
  const codes=new Set(item.targets.map(t=>t.printer_code));
  const rule=roles.get(item.item_index);
  if(!rule){blocked.push("MISSING_ITEM_STATION_RULE_"+item.item_index);return result;}
  if(rule.product_code!==item.product_code){
   blocked.push("ITEM_RULE_PRODUCT_IDENTITY_MISMATCH_"+item.item_index);return result;
  }
  const category=rule.category;
  if(["UNKNOWN","COMBINADO_DUPLA_EXCEPTION"].includes(category)){
   blocked.push("PRODUCT_STATION_EXCEPTION_OR_UNKNOWN_"+item.item_index);return result;
  }
  if(category==="ENROLADOS_QUENTES"&&codes.has("00004")){
   blocked.push("HOT_ROLL_ROUTE_CONFLICT_"+item.item_index);return result;
  }
  for(const pair of PAIRS){
   const b=codes.has(pair.a),d=codes.has(pair.d);
   if(!b&&!d)continue;
   if(category==="ENROLADOS_QUENTES"&&pair.a==="00006"){
    if(!b){blocked.push("HOT_ROLL_BALCAO2_ROUTE_ABSENT_"+item.item_index);}
    continue;
   }
   if(category!==pair.category){
    blocked.push("ITEM_ROLE_ROUTE_CONFLICT_"+item.item_index);continue;
   }
   const destination=period==="LUNCH_CANDIDATE"?pair.a:pair.d;
   if(!codes.has(destination)){
    blocked.push("SERVICE_DESTINATION_NOT_CONFIGURED_"+item.item_index);
    continue;
   }
   const skipped=period==="LUNCH_CANDIDATE"?pair.d:pair.a;
   if(codes.has(skipped)){
    suppressed.push({item_index:item.item_index,printer_code:skipped,
      reason:"ALTERNATE_STATION_NOT_IN_ORDER_WINDOW"});
    result.targets=result.targets.filter(t=>t.printer_code!==skipped);
   }
  }
  if(period==="LUNCH_CANDIDATE"&&result.targets.some(t=>DELIVERY_CODES.has(t.printer_code)))
   blocked.push("DELIVERY_SUSHI_DESTINATION_DURING_LUNCH_"+item.item_index);
  for(const target of result.targets)
   selected.push({item_index:item.item_index,printer_code:target.printer_code});
  return result;
 });
 if(roles.size!==projection.items.filter(x=>x.routing_status==="ROUTED").length)
  blocked.push("ITEM_ROLE_COVERAGE_MISMATCH");
 // Never transform an unresolved order into one that could emit a subset.
 if(blocked.length)return answer("HOLD",blocked,{period,
  candidate_suppressed_count:suppressed.length});
 const changed={...projection,items,
  order_targets:[...new Map(items.flatMap(i=>i.targets)
    .map(t=>[t.printer_code,t])).values()]};
 return answer("REVIEW_CANDIDATE_ONLY",
   ["TIME_AND_STATION_CLAIMS_REQUIRE_INDEPENDENT_RUNTIME_ATTESTATION"],{
    period,projection:changed,selected,suppressed});
}
function planWindowReview(projection,windowClaim,context,calibration){
 const source=selectWindowStations(projection,windowClaim);
 if(source.status!=="REVIEW_CANDIDATE_ONLY")return {...source,plan:null};
 // The printed time must be the same time as the candidate selector used;
 // a caller cannot route at lunch and render a different clock time.
 if(!context||context.order_time!==windowClaim.order_local_hm)
  return answer("HOLD",["PREVIEW_TIME_DIFFERS_FROM_NATIVE_ORDER_TIME"],{
   period:source.period,plan:null});
 const plan=planProductionPrintIntents(source.projection,context,calibration);
 return {...source,plan,print_authorized:false,ready_for_operational_print:false};
}
module.exports={windowOf,selectWindowStations,planWindowReview,SCHEMA};

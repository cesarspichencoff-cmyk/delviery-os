"use strict";
/**
 * Read-only KDS/station board view model from an existing Reader-bound shadow
 * review. No live feed, polling, station mutation, external dependencies,
 * order details, customer PII, network, service, sequence or print operation.
 *
 * Do NOT call this an authenticated Reader source, a production-ready KDS,
 * a verified physical route, or a cashier match. In particular, plan
 * fingerprints and a consistent synthetic Reader pair are not proof of paper.
 */
const {reviewNativeBoundWindow}=
  require("./comandas_native_window_revision_binding_v1_offline.cjs");
const SCHEMA="tata.comandas.station-board-shadow.v1.offline";
const CODES=Object.freeze({
 "00002":"COZINHA","00003":"SUSHI_1","00004":"SUSHI_2",
 "00006":"SUSHI_2","00007":"BAR","00009":"SUSHI_1"
});
const EXPECTED_EFFECTS=Object.freeze({
 print:false,spooler_write:false,network:false,sql_read:false,
 sql_write:false,sequence_write:false,fiscal:false,
 service_change:false,deploy:false
});
function answer(status,reason,more={}){
 return {schema:SCHEMA,status,reason,
  station_panels:[],cashier_panel:{
   kind:"CONFERENCIA",state:"INDEPENDENT_IFOOD_CHECK_NOT_ATTESTED",
   source:"IFOOD_CONFERENCE_ONLY",ready:false
  },
  production_panel_count:0,
  source_pair_independently_attested:false,
  reader_live_runtime_attested:false,
  physical_station_route_attested:false,
  physical_ticket_proven:false,
  station_actions_enabled:false,
  order_ready_for_production:false,
  print_authorized:false,
  effects:EXPECTED_EFFECTS,...more};
}
const isObj=x=>x&&typeof x==="object"&&!Array.isArray(x);
const isIndex=x=>Number.isSafeInteger(x)&&x>=0&&x<200;
const validQty=x=>Number.isSafeInteger(x)&&x>0&&x<=1000;
function buildBoardFromBoundReview(review){
 if(!isObj(review)||
   review.status!=="REVIEW_CANDIDATE_ONLY"||
   review.native_projection_claim_bound!==true||
   review.native_pair_self_consistency_checked!==true||
   review.independent_native_source_attested!==false||
   review.print_authorized!==false||
   review.ready_for_operational_print!==false||
   !isObj(review.effects)||
   Object.keys(EXPECTED_EFFECTS).some(k=>review.effects[k]!==false))
  return answer("HOLD","UPSTREAM_BOUND_REVIEW_NOT_ESTABLISHED");
 const plan=review.plan;
 if(!isObj(plan)||plan.schema!=="deliveryos.production-print-plan.v1"||
    plan.ready_for_physical_print!==false||
    !isObj(plan.effects)||plan.effects.print!==false||
    plan.effects.spooler_write!==false||
    !Array.isArray(plan.blocking_reasons)||
    !Array.isArray(plan.print_intents)||
    !Array.isArray(review.selected)||review.selected.length>200||
    !Array.isArray(review.suppressed)||
    !Array.isArray(plan.no_own_production_ticket_items))
  return answer("HOLD","PRODUCTION_PLAN_NOT_BOUNDED_OR_NOT_NO_EFFECT");
 // For a product/order with unresolved packaging or station instructions,
 // never show a partial instruction board that hides the blocked content.
 if(plan.blocking_reasons.length>0||plan.ready_for_shadow_payload!==true)
  return answer("HOLD","SHADOW_TICKET_CONTENT_STILL_BLOCKED");
 if(review.selected.length===0||review.selected.length>100||
    plan.print_intents.length===0||plan.print_intents.length>30)
  return answer("HOLD","NO_BOUNDED_STATION_SELECTION");
 const expected=new Map(), laneCodes=new Map();
 for(const entry of review.selected){
  if(!isObj(entry)||!isIndex(entry.item_index)||
    typeof entry.printer_code!=="string"||
    !Object.hasOwn(CODES,entry.printer_code))
   return answer("HOLD","UNKNOWN_OR_UNSAFE_STATION");
  const key=entry.printer_code+"|"+entry.item_index;
  if(expected.has(key))return answer("HOLD","DUPLICATE_ITEM_IN_STATION");
  expected.set(key,true);
  const lane=CODES[entry.printer_code];
  const previous=laneCodes.get(lane);
  // Opposite lunchtime/dinner devices cannot be selected together.
  if(previous&&previous!==entry.printer_code)
   return answer("HOLD","ALTERNATE_STATION_CODES_IN_ONE_REVISION");
  laneCodes.set(lane,entry.printer_code);
 }
 const actual=new Set(),stations=new Map(),seenCodes=new Set();
 for(const intent of plan.print_intents){
  const code=intent?.printer?.printer_code;
  if(typeof code!=="string"||!Object.hasOwn(CODES,code)||
     seenCodes.has(code)||!Array.isArray(intent.lines)||
     intent.lines.length===0||intent.lines.length>200||
     intent.physical_effect_authorized!==false)
   return answer("HOLD","PRINT_INTENT_STATION_SHAPE_INVALID");
  seenCodes.add(code);
  const lane=CODES[code];
  if(laneCodes.get(lane)!==code)
   return answer("HOLD","PRINT_INTENT_NOT_SELECTED_FOR_WINDOW");
  let count=0,units=0;
  for(const line of intent.lines){
   if(!isIndex(line?.item_index)||!validQty(line.quantity))
    return answer("HOLD","PRINT_INTENT_ITEM_INVALID");
   const key=code+"|"+line.item_index;
   if(actual.has(key)||!expected.has(key))
    return answer("HOLD","PRINT_INTENT_DOES_NOT_MATCH_STATION_SELECTION");
   actual.add(key);count++;units+=line.quantity;
  }
  stations.set(lane,{
   station:lane,configured_code:code,item_lines:count,units,
   state:"SHADOW_REVIEW_ONLY",work_started:false,
   print_status:"NOT_OBSERVED",physical_station_verified:false
  });
 }
 if(actual.size!==expected.size)
  return answer("HOLD","MISSING_STATION_ITEM_COVERAGE");
 // Conference must NEVER be inferred from native production source.
 const station_panels=[...stations.values()].sort((a,b)=>a.station.localeCompare(b.station));
 return answer("SHADOW_BOARD_REVIEW_ONLY","CONFIGURED_STATION_ROUTES_NOT_LIVE",{
  station_panels,production_panel_count:station_panels.length,
  non_production_item_count:plan.no_own_production_ticket_items.length
 });
}
function buildShadowBoardForNativePair(projection,claim,context,calibration,readerPair){
 try{
  return buildBoardFromBoundReview(reviewNativeBoundWindow(
   projection,claim,context,calibration,readerPair));
 }catch{
  return answer("HOLD","BOUND_REVIEW_CANNOT_BE_EVALUATED");
 }
}
module.exports={SCHEMA,CODES,EXPECTED_EFFECTS,
 buildBoardFromBoundReview,buildShadowBoardForNativePair};

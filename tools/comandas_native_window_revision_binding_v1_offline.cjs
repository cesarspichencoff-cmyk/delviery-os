"use strict";
/**
 * OFFLINE native-revision-to-window adapter. Reuses the verified Reader V2
 * event/decision pair to prevent a caller from selecting a different day's
 * station or a different order's revision merely by supplying a plausible
 * timestamp or SHA. It never authenticates independent SQL custody, validates
 * a live printer, allocates TATA numbers, or sends print bytes.
 */
const {assessNativeReaderV2}=
 require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {planWindowReview}=require("./comandas_window_station_select_v1_offline.cjs");
const SCHEMA="tata.comandas.reader-bound-window-review.v1.offline";
const EFFECTS=Object.freeze({print:false,spooler_write:false,network:false,
 sql_read:false,sql_write:false,sequence_write:false,fiscal:false,
 service_change:false,deploy:false});
function hold(reason){
 return {schema:SCHEMA,status:"HOLD",reasons:[reason],plan:null,
  native_pair_self_consistency_checked:false,
  native_projection_claim_bound:false,
  independent_native_source_attested:false,first_native_print_event_proven:false,
  printer_power_proven:false,ready_for_operational_print:false,
  print_authorized:false,effects:EFFECTS};
}
function reviewNativeBoundWindow(projection,claim,context,calibration,readerPair){
 const source=assessNativeReaderV2(readerPair);
 if(source.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY")
  return hold("READER_V2_PAIR_NOT_SELF_CONSISTENT");
 const event=readerPair.event,order=event.order,decision=readerPair.decision;
 // Installed Reader V2 DTHRABERMESA is a wall-clock date/time without TZ;
 // parsing it as UTC would change the business day at the margin.
 const stamp=order.DTHRABERMESA;
 if(typeof stamp!=="string"||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/.test(stamp))
  return hold("NATIVE_WALL_CLOCK_TIMESTAMP_UNSUPPORTED");
 const day=stamp.slice(0,10),hm=stamp.slice(11,16);
 if(!claim||typeof claim!=="object"||
    claim.store_id!==order.CDFILIAL||claim.store_unit!==order.CDLOJA||
    claim.order_local_day!==day||claim.order_local_hm!==hm||
    typeof claim.snapshot_sha256!=="string"||
    claim.snapshot_sha256.toLowerCase()!==event.snapshot_hash.toLowerCase())
  return hold("WINDOW_DAY_TIME_STORE_OR_SNAPSHOT_NOT_BOUND_TO_READER");
 if(!context||context.order_time!==hm||
    context.teknisa_sequence!==order.NRCOMANDA||
    context.ifood_sequence!==order.NRCOMANDAEXT)
  return hold("PREVIEW_VISIBLE_IDENTIFIERS_NOT_BOUND_TO_READER");
 if(!projection||projection.schema!=="deliveryos.shadow.expected-routing.v1"||
    projection.order_id!==order.NRCOMANDA||
    !Array.isArray(projection.items)||
    projection.items.length!==decision.items.length||
    !Array.isArray(claim.item_roles))
  return hold("PROJECTION_ORDER_OR_ITEM_COVERAGE_NOT_BOUND_TO_READER");
 // The planner uses zero-based item indices, while the shadow decision
 // envelope is one-based. Compare exact indices, codes, quantities and
 // names so no other revision is spliced into the preview.
 for(let i=0;i<decision.items.length;i++){
  const native=decision.items[i],candidate=projection.items[i];
  if(!candidate||!native||
     candidate.item_index!==i||native.item_index!==i+1||
     candidate.product_code!==native.canonical_code||
     candidate.product_name!==native.product_name||
     candidate.quantity!==native.quantity)
   return hold("PROJECTION_ITEM_IDENTITY_OR_QUANTITY_NOT_BOUND_TO_READER");
  if(candidate.routing_status==="ROUTED"&&
    !claim.item_roles.some(role=>role?.item_index===i&&
      role.product_code===native.canonical_code))
   return hold("STATION_ROLE_NOT_BOUND_TO_NATIVE_PRODUCT");
 }
 const output=planWindowReview(projection,claim,context,calibration);
 if(output.status!=="REVIEW_CANDIDATE_ONLY")
  return {schema:SCHEMA,status:"HOLD",
   reasons:output.reasons,plan:null,
   native_pair_self_consistency_checked:true,
   native_projection_claim_bound:true,
   independent_native_source_attested:false,
   first_native_print_event_proven:false,printer_power_proven:false,
   ready_for_operational_print:false,print_authorized:false,effects:EFFECTS};
 return {schema:SCHEMA,status:"REVIEW_CANDIDATE_ONLY",
  reasons:["PAIR_IS_SELF_CONSISTENT_NOT_INDEPENDENTLY_ATTESTED",
   "STATION_RULES_AND_PRINT_EFFECT_UNPROVEN"],
  // This is a non-operational candidate only, with the planner's own veto.
  period:output.period,plan:output.plan,
  selected:output.selected,suppressed:output.suppressed,
  native_pair_self_consistency_checked:true,
  native_projection_claim_bound:true,
  independent_native_source_attested:false,
  first_native_print_event_proven:false,printer_power_proven:false,
  ready_for_operational_print:false,print_authorized:false,effects:EFFECTS};
}
module.exports={SCHEMA,EFFECTS,reviewNativeBoundWindow};

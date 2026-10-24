"use strict";
/**
 * V8.49 — Independent iFood Gestor x Teknisa observation comparison.
 * A pure review-only discrepancy detector, NOT a collector, order confirmer,
 * driver, printer transport, spooler adapter, or human-authority proof.
 * Provenance fields, even if well formed, are self-reported; no WORLD_PROVEN.
 * NEVER log or export raw customer fields, names, notes or order numbers.
 */
const {createHash}=require("node:crypto");
const SCHEMA="deliveryos.comandas.gestor-teknisa-contingency.v849.review-only";
const NO_EFFECTS=Object.freeze({
  ifood_api_call:false,ifood_acknowledgment:false,ifood_confirm:false,
  ifood_cancel:false,teknisa_write:false,sql:false,service_change:false,
  print:false,spooler_write:false,automatic_reprint:false,sequence_write:false
});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KEY=/^\d{4}\|\d{2}\|\d{1,12}\|\d{1,12}$/;
const DISPLAY=/^[A-Za-z0-9-]{1,32}$/;
const STATUS=new Set(["PLACED","CONFIRMED","CANCELLED","CONCLUDED"]);
const clean=x=>typeof x==="string"?x.trim():"";
const textNorm=x=>clean(x).normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const digest=x=>createHash("sha256").update(x).digest("hex");
function validItems(items) {
 if(!Array.isArray(items)||items.length===0||items.length>200)return false;
 return items.every(row=>row&&typeof row==="object"&&
   clean(row.name).length>0&&clean(row.name).length<=200&&
   Number.isSafeInteger(row.quantity)&&row.quantity>0&&row.quantity<=999&&
   Array.isArray(row.observations)&&row.observations.length<=20&&
   row.observations.every(x=>typeof x==="string"&&x.length<=2000));
}
function validOrderObservations(notes) {
 return Array.isArray(notes)&&notes.length<=30&&
  notes.every(v=>typeof v==="string"&&v.length<=2000);
}
function compactItems(items) {
 // Exact row multiplicity is retained, including repeated names/quantities.
 // Sorting is only for side-by-side multiset comparison, never for production.
 return items.map(row=>JSON.stringify([
  textNorm(row.name),row.quantity,
  row.observations.map(textNorm).sort()
 ])).sort();
}
function validGestor(g) {
 return g&&g.schema==="deliveryos.ifood-gestor-observation.v1"&&
  clean(g.store_id).length>0&&clean(g.store_id).length<=32&&
  DISPLAY.test(clean(g.display_id))&&
  (g.order_uuid===null||UUID.test(clean(g.order_uuid)))&&
  STATUS.has(g.status)&&
  g.snapshot_complete===true&&
  validOrderObservations(g.order_observations)&&
  validItems(g.items);
}
function validTeknisa(t) {
 return t&&t.schema==="deliveryos.teknisa-order-observation.v1"&&
  clean(t.store_id).length>0&&clean(t.store_id).length<=32&&
  KEY.test(clean(t.order_key))&&
  DISPLAY.test(clean(t.ifood_display_id))&&
  (t.ifood_order_uuid===null||UUID.test(clean(t.ifood_order_uuid)))&&
  t.snapshot_complete===true&&
  validOrderObservations(t.order_observations)&&
  validItems(t.items);
}
function base() {
 return {
  schema:SCHEMA,status:"HOLD",priority:"REVIEW",
  reasons:[],order_digest:null,matched_full_uuid:false,
  items_equal:null,observations_equal:null,
  gestor_paper_claim_observed:false,teknisa_paper_claim_observed:false,
  physical_paper_proven:false,can_activate_gestor_auto_print:false,
  can_reprint:false,can_dispatch:false,can_confirm:false,
  needs_operator_reconciliation:true,
  effects:NO_EFFECTS
 };
}
/** Compare a single, explicitly scoped pair of minimized observations.
 * Missing source = missing *from provided evidence*, not missing in reality.
 * Both paper claims are unverified. This function never issues an effect.
 */
function assessGestorTeknisaContingency(input) {
 const r=base();
 if(!input||typeof input!=="object"||Array.isArray(input))
   return {...r,reasons:["AUDIT_INPUT_INVALID"]};
 const g=input.gestor===undefined?null:input.gestor;
 const t=input.teknisa===undefined?null:input.teknisa;
 if(g!==null&&!validGestor(g))return {...r,reasons:["GESTOR_SNAPSHOT_INVALID_OR_INCOMPLETE"]};
 if(t!==null&&!validTeknisa(t))return {...r,reasons:["TEKNISA_SNAPSHOT_INVALID_OR_INCOMPLETE"]};
 if(!g&&!t)return {...r,reasons:["BOTH_SOURCES_UNOBSERVED"]};
 // Do not publish unsalted hashes of low-entropy short display IDs:
 // those can be enumerated. A missing UUID yields no exported identifier.
 const identityUuid=clean(g?.order_uuid)||clean(t?.ifood_order_uuid);
 r.order_digest=UUID.test(identityUuid)?
   digest("v849:order-observation:"+identityUuid.toLowerCase()):null;
 // Physical receipt is not certified by boolean, JSON, ack or spool evidence.
 r.gestor_paper_claim_observed=g?.paper_claimed===true;
 r.teknisa_paper_claim_observed=t?.paper_claimed===true;
 if(g&&g.status==="CANCELLED")
  return {...r,priority:"CRITICAL",reasons:["IFOOD_CANCELLED_NO_PREPARATION_OR_REPRINT"]};
 if(g&&g.status==="PLACED")
  return {...r,reasons:["IFOOD_NOT_CONFIRMED_DO_NOT_ASSUMED_PRODUCTION_READY"]};
 if(g&&!t)return {...r,priority:"CRITICAL",reasons:[
  "GESTOR_PRESENT_TEK_NOT_OBSERVED_IN_PROVIDED_CAPTURE",
  "CHECK_TEKNISA_INGEST_AND_ORDER_AGE_WITH_OPERATOR"
 ]};
 if(t&&!g)return {...r,priority:"CRITICAL",reasons:[
  "TEKNISA_PRESENT_GESTOR_NOT_OBSERVED_IN_PROVIDED_CAPTURE",
  "CHECK_GESTOR_CAPTURE_COVERAGE_AND_ORDER_STATUS"
 ]};
 if(g.store_id!==t.store_id)
  return {...r,priority:"CRITICAL",reasons:["STORE_IDENTITY_MISMATCH"]};
 if(g.display_id!==t.ifood_display_id)
  return {...r,priority:"CRITICAL",reasons:["SHORT_DISPLAY_ID_MISMATCH"]};
 if(!g.order_uuid||!t.ifood_order_uuid)
  return {...r,priority:"CRITICAL",reasons:[
   "FULL_IFOOD_UUID_JOIN_NOT_PROVEN",
   "SHORT_ID_IS_NOT_UNIQUE_ORDER_ID"
  ]};
 if(g.order_uuid.toLowerCase()!==t.ifood_order_uuid.toLowerCase())
  return {...r,priority:"CRITICAL",reasons:["FULL_IFOOD_UUID_MISMATCH"]};
 r.matched_full_uuid=true;
 if(g.status!=="CONFIRMED")
  return {...r,reasons:["IFOOD_ORDER_STATUS_NOT_READY_FOR_PREPARATION_REVIEW"]};
 const left=compactItems(g.items),right=compactItems(t.items);
 // Compare names and quantities independent of notes, preserving duplicates.
 const getItemKeys=items=>items.map(row=>
  JSON.stringify([textNorm(row.name),row.quantity])).sort();
 r.items_equal=JSON.stringify(getItemKeys(g.items))===
  JSON.stringify(getItemKeys(t.items));
 r.observations_equal=JSON.stringify(left)===JSON.stringify(right)&&
  JSON.stringify(g.order_observations.map(textNorm).sort())===
  JSON.stringify(t.order_observations.map(textNorm).sort());
 if(!r.items_equal)
  return {...r,priority:"CRITICAL",reasons:["ITEMS_OR_QUANTITIES_DIFFER_REVIEW_SOURCE_MAPPINGS"]};
 if(!r.observations_equal)
  return {...r,priority:"CRITICAL",reasons:["ITEM_NOTES_DIFFER_OR_SCOPE_UNPROVEN"]};
 if(r.gestor_paper_claim_observed&&r.teknisa_paper_claim_observed)
  return {...r,priority:"CRITICAL",reasons:[
    "TWO_CHANNEL_PAPER_CLAIMS_REQUIRE_PHYSICAL_DUPLICATE_REVIEW"
  ]};
 return {...r,status:"MATCH_CANDIDATE_HOLD",priority:"REVIEW",
  needs_operator_reconciliation:true,
  reasons:["TWO_SNAPSHOTS_AGREE_NOT_WORLD_PROVEN",
    "NO_PRINT_AUTHORITY_OR_PHYSICAL_PAPER_PROOF"]};
}
module.exports={assessGestorTeknisaContingency,SCHEMA,NO_EFFECTS};

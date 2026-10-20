"use strict";
/**
 * V8.52 — temporal and coverage preflight for two independent capture channels.
 * Offline pure reviewer only, not a live GP iFood data source.
 * A valid JSON envelope is NOT cryptographic or provider provenance.
 * Never treats missing row as evidence a customer order was lost.
 */
const {assessGestorTeknisaContingency}=require("./comandas_ifood_gestor_contingencia_v849_offline.cjs");
const SCHEMA="deliveryos.comandas.ifood-teknisa-capture-coherence.v852.review-only";
const NO_EFFECTS=Object.freeze({
 ifood_api_call:false,ifood_acknowledgment:false,ifood_confirm:false,
 ifood_cancel:false,teknisa_write:false,sql:false,service_change:false,
 print:false,spooler_write:false,automatic_reprint:false,sequence_write:false,
 persistence_write:false,deploy:false
});
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
function instant(s){
 if(typeof s!=="string"||!ISO.test(s))return null;
 const ms=Date.parse(s);return Number.isFinite(ms)&&
  new Date(ms).toISOString().slice(0,19)===
  new Date(ms).toISOString().slice(0,19)?ms:null;
}
function freshEnvelope(e,which,now){
 if(!e||typeof e!=="object"||Array.isArray(e)||
   e.source!==which||e.fetch_succeeded!==true||
   e.window_complete!==true)return {reason:which+"_SOURCE_CAPTURE_COVERAGE_UNPROVEN"};
 const from=instant(e.from),until=instant(e.until);
 if(from===null||until===null||from>until||until>now||
   from>now)return {reason:which+"_CAPTURE_WINDOW_INVALID_OR_FUTURE"};
 return {from,until};
}
function assessCaptureCoherence(input){
 const out={
  schema:SCHEMA,status:"HOLD",priority:"REVIEW",reasons:[],
  baseline_status:"NOT_EVALUATED",order_digest:null,
  source_capture_overlap_proven:false,
  capture_freshness_acceptable:false,
  order_equivalence_proven:false,
  provider_authenticated:false,
  missing_order_proven:false,
  duplicate_print_proven:false,
  physical_paper_proven:false,
  authorizes_print:false,authorizes_reprint:false,
  authorizes_order_ack:false,
  effects:NO_EFFECTS
 };
 if(!input||typeof input!=="object"||Array.isArray(input))
  return {...out,reasons:["CAPTURE_PREFLIGHT_INPUT_INVALID"]};
 const now=instant(input.evaluated_at);
 if(now===null)return {...out,reasons:["EVALUATION_INSTANT_INVALID"]};
 // Maximum freshness is *explicitly* selected for this diagnostic invocation;
 // not an approved production SLA, clock-synchronization proof or shift gate.
 const limit=input.max_capture_age_seconds;
 if(!Number.isSafeInteger(limit)||limit<1||limit>86400)
  return {...out,reasons:["CAPTURE_AGE_POLICY_MISSING_OR_INVALID"]};
 const g=freshEnvelope(input.gestor_capture,"GESTOR",now);
 const t=freshEnvelope(input.teknisa_capture,"TEKNISA",now);
 if(g.reason||t.reason)return {...out,reasons:[g.reason,t.reason].filter(Boolean)};
 // A window ending before the other starts cannot prove contemporaneous
 // coverage, even if names, UUIDs, quantities and notes match.
 if(g.until<t.from||t.until<g.from)
  return {...out,reasons:["SOURCE_CAPTURE_WINDOWS_DISJOINT"]};
 out.source_capture_overlap_proven=true;
 const maxAge=limit*1000;
 if(now-g.until>maxAge||now-t.until>maxAge)
  return {...out,reasons:["SOURCE_CAPTURE_STALE_FOR_DECLARED_AGE_POLICY"]};
 out.capture_freshness_acceptable=true;
 const baseline=assessGestorTeknisaContingency({
  gestor:input.gestor??null,teknisa:input.teknisa??null
 });
 out.baseline_status=baseline.status;
 out.order_digest=baseline.order_digest;
 if((input.gestor&&!baseline.matched_full_uuid)||
    (input.teknisa&&!baseline.matched_full_uuid)) {
   return {...out,priority:baseline.priority,reasons:[
    "CAPTURE_COHERENT_BUT_ORDER_UUID_JOIN_UNPROVEN",
    ...baseline.reasons
   ]};
 }
 // Even a fully coherent temporal envelope contains self-reported claims.
 // Never promote this beyond a review candidate without independent proof.
 if(baseline.status==="MATCH_CANDIDATE_HOLD")
  return {...out,status:"TEMPORAL_MATCH_CANDIDATE_HOLD",
   reasons:["TEMPORAL_CAPTURE_COHERENT_SELF_ASSERTED_ONLY",
    "PROVIDER_ORIGIN_AND_ORDER_REVISION_NOT_AUTHENTICATED",
    "NO_PAPER_OR_PRINT_AUTHORITY"]};
 return {...out,priority:baseline.priority,
  reasons:["CAPTURE_COHERENT_BUT_BASELINE_REQUIRES_REVIEW",...baseline.reasons]};
}
module.exports={assessCaptureCoherence,SCHEMA,NO_EFFECTS};

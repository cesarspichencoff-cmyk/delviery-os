"use strict";
/**
 * Segregated OFFLINE V4.6 preview adapter. The base V8.71 renderer still
 * validates intra-native identity coherence across all 3 views. This adapter
 * receives independent iFood evidence ONLY as a second conference-specific
 * envelope; it never overwrites any native ticket identifier or source.
 *
 * No operational printer bytes may be transmitted by this module.
 */
const {assessViewSourceScopes}=require("./comandas_view_source_scope_v1_offline.cjs");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const SCHEMA="tata.comandas.scoped-v46-preview.v1.review-only";
const veto=(value,reason)=>({
 ...value,
 ready_for_offline_preview:false,ready_for_operational_print:false,
 blocking_reasons:[...new Set([...(value.blocking_reasons||[]),reason])].sort(),
 byte_count:0,bytes:[]
});
/**
 * V4.5 sets its aggregate preview-ready flag to FALSE when ONLY the
 * conference's packaging allocation is incomplete, even if two independently
 * projected native production stations are internally ready.
 *
 * Legacy V4.6 must remain fail-closed. For the separate, review-only adapter,
 * allow a temporary AGGREGATE-READY render only if:
 * - source integrity has zero global blockers;
 * - exactly two native production views are individually ready;
 * - only the conference is not ready and has explicit packaging warning;
 * - the V8.71 renderer still independently checks 3-view identifiers.
 *
 * Never mutate input, invent a route, lift production-local blockers,
 * authorize paper or treat external iFood as a production source.
 */
function onlyConferencePackagingIncomplete(src){
 if(!src||typeof src!=="object"||Array.isArray(src)||
    src.schema!=="deliveryos.operational-tickets.v45.shadow.v1"||
    src.ready_for_semantic_preview!==false||
    src.ready_for_automatic_operational_print!==false||
    !Array.isArray(src.blocking_reasons)||src.blocking_reasons.length!==0||
    !Array.isArray(src.production)||src.production.length!==2||
    !src.production.every(p=>p?.ready_for_semantic_preview===true)||
    !src.conference||src.conference.ready_for_semantic_preview!==false||
    !Array.isArray(src.conference.warnings))return false;
 return src.conference.warnings.some(w=>[
  "PACKAGING_PLAN_MISSING",
  "PACKAGING_ENGINE_UNKNOWN",
  "UNALLOCATED_ITEMS_REQUIRE_MANUAL_PACKING_REVIEW"
 ].includes(w));
}
function projectScopedPreview(nativeProjection,sourceClaims){
 const scope=assessViewSourceScopes(sourceClaims);
 const isolated=onlyConferencePackagingIncomplete(nativeProjection);
 const rendererSource=isolated
   ?{...nativeProjection,ready_for_semantic_preview:true}
   :nativeProjection;
 const base=renderOperationalTicketsProofV46(rendererSource);
 // A claimed source cannot reverse renderer-denied semantic source integrity.
 const production=base.production.map((v,i)=>
   scope.production[i]?.status==="NATIVE_ONLY_REVIEW"
    ?v:veto(v,"NATIVE_SOURCE_SCOPE_HOLD"));
 const conference=isolated
   ?veto(base.conference,"CONFERENCE_NATIVE_PACKAGING_HOLD")
   :scope.conference.status==="IFOOD_TEK_CANDIDATE_MATCH_REVIEW_ONLY"
    ?base.conference
    :veto(base.conference,"CONFERENCE_INDEPENDENT_IFOOD_CROSSCHECK_HOLD");
 return {schema:SCHEMA,source_review:scope,
  production,conference,effects:{
   print:false,spooler_write:false,odhen_write:false,cut:false,
   ifood_request:false,sql_read:false,sequence_write:false
  },ready_for_operational_print:false};
}
module.exports={projectScopedPreview,SCHEMA};

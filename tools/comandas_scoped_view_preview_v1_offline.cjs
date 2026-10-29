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
function projectScopedPreview(nativeProjection,sourceClaims){
 const scope=assessViewSourceScopes(sourceClaims);
 const base=renderOperationalTicketsProofV46(nativeProjection);
 // Source-claims can be self-consistent yet describe ANOTHER native order.
 // Never produce usable preview bytes for a cross-order source envelope.
 // This binding covers visible identifiers only; it does NOT attest the
 // native source, external iFood, latest revision or source snapshot hash.
 const n=sourceClaims?.native;
 const parts=typeof n?.order_key==="string"?n.order_key.split("|"):[];
 const id=nativeProjection?.conference?.identifiers;
 const claimMatchesProjection=parts.length===4&&
  typeof nativeProjection?.order_id==="string"&&
  nativeProjection.order_id===parts[3]&&
  typeof id?.teknisa==="string"&&id.teknisa===parts[3]&&
  typeof id?.ifood==="string"&&id.ifood===n.short_id;
 if(!claimMatchesProjection){
  return {schema:SCHEMA,source_review:scope,
   production:base.production.map(v=>veto(v,
    "NATIVE_PREVIEW_SOURCE_ORDER_IDENTITY_NOT_BOUND")),
   conference:veto(base.conference,
    "NATIVE_PREVIEW_SOURCE_ORDER_IDENTITY_NOT_BOUND"),
   native_projection_identity_consistent:false,
   native_snapshot_independently_bound_to_rendered_projection:false,
   effects:{print:false,spooler_write:false,odhen_write:false,cut:false,
    ifood_request:false,sql_read:false,sequence_write:false},
   ready_for_operational_print:false};
 }
 // A claimed source cannot reverse renderer-denied semantic source integrity.
 const production=base.production.map((v,i)=>
   scope.production[i]?.status==="NATIVE_ONLY_REVIEW"
    ?v:veto(v,"NATIVE_SOURCE_SCOPE_HOLD"));
 const conference=scope.conference.status==="IFOOD_TEK_CANDIDATE_MATCH_REVIEW_ONLY"
   ?base.conference
   :veto(base.conference,"CONFERENCE_INDEPENDENT_IFOOD_CROSSCHECK_HOLD");
 return {schema:SCHEMA,source_review:scope,
  production,conference,
  native_projection_identity_consistent:true,
  native_snapshot_independently_bound_to_rendered_projection:false,
  effects:{
   print:false,spooler_write:false,odhen_write:false,cut:false,
   ifood_request:false,sql_read:false,sequence_write:false
  },ready_for_operational_print:false};
}
module.exports={projectScopedPreview,SCHEMA};

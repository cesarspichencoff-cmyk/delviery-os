"use strict";
/**
 * Pure OFFLINE seam: bind one self-consistent native Reader V2 revision to
 * an order+station cross-revision attempt review. This does not prove that
 * the Reader is current, that a journal is complete, or that paper was sent.
 * No SQL, network, printer, filesystem, sequence or host operations.
 */
const {createHash}=require("node:crypto");
const {verifyPrintAttemptWitnessV882}=
 require("../dist/src/production/printAttemptWitnessV882.js");
const {assessNativeReaderV2}=
 require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {decideProductionOrderRevisionReviewV1}=
 require("../dist/src/production/productionPrintIdempotency.js");
const SCHEMA="tata.comandas.reader-print-history-link.v1.review-only";
const EFFECTS=Object.freeze({
 print:false,reprint:false,spooler:false,network:false,sql_read:false,
 sql_write:false,sequence_allocate:false,sequence_write:false,
 device_access:false,service:false,install:false,deploy:false
});
const SHA=/^[a-f0-9]{64}$/i;
const STATION=/^[A-Z0-9_-]{1,48}$/;
// Derived from the checked native Reader source and stable station identity.
// A matching hash proves a bounded DATA LINK, not independent custody or paper.
function orderStationWitnessBindingSha256V1(orderKey,day,station){
 return createHash("sha256").update(
  "TATA-COMANDAS-ORDER-STATION-WITNESS-V1\n"+
  JSON.stringify([orderKey,day,station])
 ).digest("hex");
}
function hold(reason,extras={}){
 return {schema:SCHEMA,status:"HOLD",reasons:[reason],
  reader_revision_consistency_checked:false,
  journal_independently_attested:false,
  latest_revision_independently_attested:false,
  cancellation_semantics_proven:false,
  first_native_print_event_proven:false,
  prior_physical_effect_absence_proven:false,
  automatic_retry_allowed:false,ready_for_operational_print:false,
  print_authorized:false,effects:EFFECTS,...extras};
}
function reviewReaderPrintHistory(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
    !input.reader_pair||!input.candidate||
    typeof input.candidate!=="object"||Array.isArray(input.candidate))
  return hold("READER_PRINT_LINK_INPUT_INVALID");
 const native=assessNativeReaderV2(input.reader_pair);
 if(native.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY"||
    native.source_review.production.length!==2||
    native.source_review.production.some(p=>p.status!=="NATIVE_ONLY_REVIEW"))
  return hold("NATIVE_READER_REVISION_NOT_CONSISTENT");
 const event=input.reader_pair.event;
 const order=event.order;
 const c=input.candidate;
 if(c.order_key!==event.order_key||
    c.operational_date!==order.DTHRABERMESA.slice(0,10)||
    typeof c.native_snapshot_sha256!=="string"||
    !SHA.test(c.native_snapshot_sha256)||
    c.native_snapshot_sha256.toLowerCase()!==event.snapshot_hash.toLowerCase()||
    typeof c.station_code!=="string"||!STATION.test(c.station_code)||
    typeof c.intent_fingerprint!=="string"||!SHA.test(c.intent_fingerprint))
  return hold("READER_PRINT_LINK_ORDER_DATE_REVISION_OR_STATION_MISMATCH");
 // Claims below are assessed diagnostically, NOT independently proven.
 // In particular, self-reported true does not grant an operational effect.
 const diagnosis=decideProductionOrderRevisionReviewV1({
  order_key:event.order_key,
  station_code:c.station_code,
  operational_date:order.DTHRABERMESA.slice(0,10),
  native_snapshot_sha256:event.snapshot_hash,
  intent_fingerprint:c.intent_fingerprint,
  history:input.history,
  history_complete_for_order_station:input.history_complete_claim===true,
  history_source_ref:input.history_source_ref,
  current_native_revision_verified_latest:input.latest_revision_claim===true,
  cancellation_revision_reconciled:input.cancellation_reconciled_claim===true
 });
 const reason=diagnosis.verdict==="HOLD"
  ?diagnosis.reasons[0]
  :"READER_AND_JOURNAL_CLAIMS_NOT_INDEPENDENTLY_ATTESTED";
 // Optional historical source-separated observation. Reuse the existing
 // V8.82 signature and source-separation verifier rather than accepting a
 // caller's job status. Trust supplied with the witness is NOT independently
 // custodied; even successful cryptography cannot certify paper/no-effect.
 if(input.print_attempt_witness!==undefined){
  const w=input.print_attempt_witness;
  if(!w||typeof w!=="object"||Array.isArray(w)||
     !w.record||typeof w.record!=="object"||Array.isArray(w.record)||
     !w.trust||typeof w.trust!=="object"||Array.isArray(w.trust)||
     typeof w.now_utc!=="string")
   return hold("PRINT_ATTEMPT_WITNESS_ENVELOPE_INVALID",{
    reader_revision_consistency_checked:true,
    history_diagnostic_verdict:diagnosis.verdict
   });
  const binding=orderStationWitnessBindingSha256V1(
   event.order_key,order.DTHRABERMESA.slice(0,10),c.station_code);
  if(w.record.order_binding_sha256!==binding||
     w.record.store_id!==order.CDFILIAL)
   return hold("PRINT_ATTEMPT_WITNESS_ORDER_STATION_SCOPE_MISMATCH",{
    reader_revision_consistency_checked:true,
    history_diagnostic_verdict:diagnosis.verdict
   });
  const verification=verifyPrintAttemptWitnessV882(
   w.record,w.trust,w.now_utc);
  if(verification.status!=="SIGNED_SOURCE_SEPARATION_MATCH_RECONCILIATION_ONLY"||
     verification.signed_witness_verified!==true)
   return hold("PRINT_ATTEMPT_WITNESS_SIGNATURE_OR_TRUST_INVALID",{
    reader_revision_consistency_checked:true,
    history_diagnostic_verdict:diagnosis.verdict
   });
  // Cryptographic coherence alone is NOT enough. The witnessed attempt
  // must be represented in this scoped order/station/day journal, including
  // its semantic fingerprint. Otherwise a signed observation for another
  // attempt could be misattributed to this order after a revision.
  const witnessed=Array.isArray(input.history)?input.history.filter(row=>
   row && typeof row==="object" && !Array.isArray(row) &&
   row.order_key===event.order_key &&
   row.operational_date===order.DTHRABERMESA.slice(0,10) &&
   row.station_code===c.station_code &&
   row.attempt_id===w.record.attempt_id
  ):[];
  const witnessFlags={
   reader_revision_consistency_checked:true,
   history_diagnostic_verdict:diagnosis.verdict,
   source_witness_signature_verified:true,
   source_witness_trust_independently_attested:false,
   witnessed_observation_requires_reconciliation:true
  };
  if(!witnessed.length)
   return hold("SIGNED_WITNESS_ATTEMPT_NOT_IN_SCOPED_HISTORY",witnessFlags);
  if(witnessed.some(row=>typeof row.intent_fingerprint!=="string" ||
     row.intent_fingerprint.toLowerCase()!==w.record.intent_fingerprint.toLowerCase()))
   return hold("SIGNED_WITNESS_ATTEMPT_FINGERPRINT_CONTRADICTED",witnessFlags);
  if(verification.witnessed_spooler_state==="SPOOLER_OBSERVED" &&
     witnessed.some(row=>row.state==="PROVEN_NO_EFFECT_FAILURE"))
   return hold("SIGNED_WITNESS_CONTRADICTS_PROVEN_NO_EFFECT",witnessFlags);
  // A valid signed spooler observation always requires reconciliation.
  // Even a self-reported complete journal is neither independent custody
  // nor permission to print; preserve stronger historical vetoes.
  return hold(diagnosis.verdict==="HOLD"
     ?reason:"SIGNED_PRINT_ATTEMPT_OBSERVED_EFFECT_RECONCILIATION_REQUIRED",
     witnessFlags);
 }
 return hold(reason,{
  reader_revision_consistency_checked:true,
  history_diagnostic_verdict:diagnosis.verdict
 });
}
module.exports={SCHEMA,EFFECTS,reviewReaderPrintHistory,
 orderStationWitnessBindingSha256V1};

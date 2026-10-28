"use strict";
/**
 * Pure OFFLINE seam: bind one self-consistent native Reader V2 revision to
 * an order+station cross-revision attempt review. This does not prove that
 * the Reader is current, that a journal is complete, or that paper was sent.
 * No SQL, network, printer, filesystem, sequence or host operations.
 */
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
 return hold(reason,{
  reader_revision_consistency_checked:true,
  // A positive internal diagnostic is not an authorization, even when all
  // caller-supplied claims say true. No trusted effect journal is wired here.
  history_diagnostic_verdict:diagnosis.verdict
 });
}
module.exports={SCHEMA,EFFECTS,reviewReaderPrintHistory};

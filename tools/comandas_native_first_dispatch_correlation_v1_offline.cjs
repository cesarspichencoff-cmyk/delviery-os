"use strict";
/**
 * Read-only correlation of a native first-production-dispatch CLAIM to
 * a self-consistent Reader V2 revision and exactly one journal attempt.
 *
 * No live native dispatch is attested. Every supplied claim, source SHA,
 * route, and journal row remains untrusted until independent custody checks.
 * No hardware, SQL, filesystem, network, sequence, fiscal or print effects.
 */
const {assessNativeReaderV2}=
 require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {reviewNativeFirstDispatch}=
 require("./comandas_native_first_dispatch_lineage_v1_offline.cjs");
const SCHEMA="tata.comandas.native-first-dispatch-correlation.v1.review-only";
const EFFECTS=Object.freeze({
 print:false,reprint:false,spooler_write:false,queue:false,network:false,
 sql_read:false,sql_write:false,filesystem_read:false,filesystem_write:false,
 sequence_allocate:false,sequence_write:false,service:false,install:false,
 deploy:false,host_read:false,fiscal:false,config_change:false
});
const SHA=/^[0-9a-f]{64}$/i;
const STATION=/^[A-Z0-9_-]{1,48}$/;
const ATTEMPT=/^(?:[A-Za-z0-9_-]{1,128}|attempt:[a-z0-9._-]{8,96})$/;
const STATES=new Set(["PLANNED","PROVEN_NO_EFFECT_FAILURE",
 "SUBMISSION_RETURNED_UNOBSERVED","SPOOLER_OBSERVED",
 "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION","PHYSICALLY_CONFIRMED"]);
function result(status,reason,extra={}){
 return {schema:SCHEMA,status,reason,
  source_claim_only:true,reader_revision_consistency_checked:false,
  native_order_station_day_correlated:false,
  journal_first_attempt_correlated:false,
  actual_first_native_print_event_proven:false,
  journal_independently_attested:false,
  dispatcher_source_independently_attested:false,
  source_and_journal_currency_proven:false,
  physical_paper_proven:false,can_authorize_cutover:false,
  print_authorized:false,automatic_retry_allowed:false,
  effects:EFFECTS,...extra};
}
function correlateNativeFirstDispatch(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
    !input.reader_pair||!input.claim||!input.candidate)
  return result("HOLD","FIRST_DISPATCH_CORRELATION_INPUT_INVALID");
 const reader=assessNativeReaderV2(input.reader_pair);
 if(reader.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY"||
    !reader.revision_consistency_checked||
    reader.source_independently_attested!==false)
  return result("HOLD","READER_V2_NATIVE_REVISION_UNTRUSTED");
 const e=input.reader_pair.event, o=e.order;
 const c=input.candidate, claim=input.claim;
 if(!c||typeof c!=="object"||Array.isArray(c)||
    !claim||typeof claim!=="object"||Array.isArray(claim))
  return result("HOLD","FIRST_DISPATCH_CORRELATION_INPUT_INVALID");
 const day=o.DTHRABERMESA.slice(0,10);
 const bound={
  reader_revision_consistency_checked:true
 };
 if(o.IDORGCMDVENDA!=="DLV_IFO"||
    claim.store_id!==o.CDFILIAL||claim.store_unit!==o.CDLOJA||
    claim.native_order_key!==e.order_key||
    claim.operational_date!==day||
    claim.station_code!==c.station_code||
    claim.first_attempt_id!==c.attempt_id||
    claim.native_revision_snapshot_sha256!==e.snapshot_hash||
    c.order_key!==e.order_key||c.operational_date!==day||
    c.native_snapshot_sha256!==e.snapshot_hash||
    typeof c.station_code!=="string"||!STATION.test(c.station_code)||
    typeof c.attempt_id!=="string"||!ATTEMPT.test(c.attempt_id)||
    typeof c.intent_fingerprint!=="string"||!SHA.test(c.intent_fingerprint))
  return result("HOLD","FIRST_DISPATCH_ORDER_DAY_REVISION_OR_STATION_MISMATCH",bound);
 const scope={...bound,native_order_station_day_correlated:true};
 const lineage=reviewNativeFirstDispatch(claim);
 if(lineage.status!=="REVIEW_CANDIDATE_NOT_INDEPENDENTLY_ATTESTED")
  return result("HOLD","FIRST_DISPATCH_EVENT_KIND_OR_SOURCE_CLAIM_REJECTED",scope);
 if(input.history_scope_complete_claim!==true||
    input.latest_native_revision_claim!==true||
    input.cancellation_reconciled_claim!==true||
    typeof input.history_source_ref!=="string"||
    !/^[A-Za-z0-9:._/-]{8,256}$/.test(input.history_source_ref))
  return result("HOLD","FIRST_DISPATCH_JOURNAL_OR_NATIVE_CURRENCY_UNATTESTED",scope);
 if(!Array.isArray(input.history)||input.history.length>5000)
  return result("HOLD","FIRST_DISPATCH_JOURNAL_INVALID",scope);
 // Every row must have a usable journal identity; dropping malformed rows
 // before scope filtering could falsely make a duplicated attempt disappear.
 if(input.history.some(r=>!r||typeof r!=="object"||Array.isArray(r)||
    typeof r.order_key!=="string"||
    typeof r.station_code!=="string"||!STATION.test(r.station_code)||
    typeof r.operational_date!=="string"||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.operational_date)||
    typeof r.attempt_id!=="string"||!ATTEMPT.test(r.attempt_id)||
    typeof r.intent_fingerprint!=="string"||!SHA.test(r.intent_fingerprint)||
    typeof r.native_snapshot_sha256!=="string"||
    !SHA.test(r.native_snapshot_sha256)||!STATES.has(r.state)))
  return result("HOLD","FIRST_DISPATCH_JOURNAL_INVALID",scope);
 // Reject conflicting/sideloaded records for this exact order+station;
 // one candidate print attempt cannot prove exclusivity against a second
 // attempt of any revision or a replay hidden behind an unrelated event.
 const rows=input.history.filter(r=>r && typeof r==="object" &&
  !Array.isArray(r) && r.order_key===e.order_key &&
  r.station_code===c.station_code);
 if(rows.some(r=>r.operational_date!==day))
  return result("HOLD","FIRST_DISPATCH_ORDER_DAY_CONTRADICTED",scope);
 if(rows.length!==1)
  return result("HOLD",rows.length===0
   ?"FIRST_DISPATCH_ATTEMPT_NOT_IN_JOURNAL"
   :"FIRST_DISPATCH_MULTIPLE_ATTEMPT_ROWS_UNRECONCILED",scope);
 const r=rows[0];
 if(r.attempt_id!==c.attempt_id||
    r.intent_fingerprint!==c.intent_fingerprint||
    r.native_snapshot_sha256!==e.snapshot_hash||
    !STATES.has(r.state))
  return result("HOLD","FIRST_DISPATCH_JOURNAL_ATTEMPT_IDENTITY_MISMATCH",scope);
 // Even matching claim + journal row is self-reported and cannot attest the
 // earliest real dispatch, effect, cancellation, or delivery of paper.
 return result("CORRELATED_CLAIMS_REVIEW_ONLY",
  "DISPATCH_AND_JOURNAL_ARE_NOT_INDEPENDENT_SOURCE_ATTESTATION",{
   ...scope,journal_first_attempt_correlated:true
  });
}
module.exports={correlateNativeFirstDispatch,SCHEMA,EFFECTS};

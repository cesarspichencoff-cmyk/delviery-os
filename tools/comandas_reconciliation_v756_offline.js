"use strict";
/**
 * V7.56: safe OFFLINE reconciliation of the V7.55 synthetic journal.
 *
 * DO NOT USE AS PRODUCTION PRINT AUTHORITY:
 * - Ledger may be written only by the disposable, in-memory test and temp
 *   journal fixtures. There is NO durable host-level attestation here.
 * - A missing record is NOT evidence that no physical print took place.
 * - An accepted spool job is NOT evidence of paper delivery.
 * - A claimed photograph in a ledger is NOT independently verified here.
 * - A stale lock or corrupt journal MUST NOT be auto-repaired or removed.
 * - This module NEVER returns permission to print or to reprint.
 */
const {normalize,STATES}=require("./comandas_idempotencia_v754_offline.js");
const {rootGuard,snapshot}=require("./comandas_journal_v755_sandbox.js");

const EFFECTS=Object.freeze({print:false,spooler_write:false,
 sequence_binding_write:false,service_change:false,driver_change:false,
 odhen_write:false,deploy:false,filesystem_write:false,lock_cleanup:false});
const STATUS=Object.freeze({
 MISSING:"NO_RESERVATION_RECORDED_NOT_PROOF_OF_NO_PRINT",
 RESERVED:"RESERVED_RESULT_UNKNOWN_NO_AUTO_RETRY",
 ACCEPTED:"SPOOL_ACK_ONLY_PAPER_UNKNOWN_NO_AUTO_RETRY",
 UNKNOWN:"UNCERTAIN_ATTEMPT_NO_AUTO_RETRY",
 PAPER:"PHOTO_REFERENCE_NOT_INDEPENDENTLY_VERIFIED"
});
function hold(reason){
 return {schema:"deliveryos.synthetic-reconciliation.v756.offline",
  status:"RECONCILIATION_HOLD",reasons:[reason],
  receipt_states:[],manual_review_required:true,
  no_automatic_retry:true,print_authorized:false,
  exact_once_physical_proven:false,external_anchor_proven:false,
  effects:EFFECTS};
}
function auditExpectedThreeViews(root,expected){
 if(!rootGuard(root))return hold("DISPOSABLE_SANDBOX_REQUIRED");
 if(!Array.isArray(expected)||expected.length!==3)
  return hold("EXPECTED_THREE_TICKETS_REQUIRED");
 // The only accepted proof shape is V7.54's strictly synthetic descriptor;
 // a method call is not a human approval or live route grant.
 const normalized=expected.map(x=>
  x?.scope_evidence==="SYNTHETIC_SCOPE_ONLY"?normalize(x):null);
 if(normalized.some(x=>!x)||new Set(normalized.map(x=>x.key)).size!==3||
   normalized[0].kind!=="PRODUCAO"||
   normalized[1].kind!=="PRODUCAO"||
   normalized[2].kind!=="CONFERENCIA"||
   normalized.some((x,i)=>x.slot!==i)||
   normalized.some(x=>x.scope_id!==normalized[0].scope_id||
     x.order_key!==normalized[0].order_key||
     x.source_sha256!==normalized[0].source_sha256||
     x.tata_sequence!==normalized[0].tata_sequence))
  return hold("EXPECTED_RECEIPTS_SOURCE_OR_IDENTITY_DRIFT");
 const observed=snapshot(root);
 if(observed.status!=="SYNTHETIC_SNAPSHOT_ONLY")
  return hold("JOURNAL_MISSING_LOCKED_TAMPERED_OR_UNREADABLE");
 const ledger=observed.ledger;
 if(!ledger||!Array.isArray(ledger.entries))
  return hold("JOURNAL_SCHEMA_UNTRUSTED");
 const expectedKeys=new Set(normalized.map(x=>x.key));
 if(ledger.entries.some(e=>!expectedKeys.has(e.key)))
  return hold("UNEXPECTED_ATTEMPT_FOR_OTHER_ORDER_OR_VIEW");
 let mismatch=false;
 const states=normalized.map(x=>{
  const found=ledger.entries.find(e=>e.key===x.key);
  if(found&&(found.payload_sha256!==x.payload_sha256||
     found.source_sha256!==x.source_sha256||
     found.tata_sequence!==x.tata_sequence||
     found.kind!==x.kind||found.station!==x.station||
     found.slot!==x.slot||found.scope_id!==x.scope_id||
     found.order_key!==x.order_key))mismatch=true;
  const key=found?{
   [STATES.RESERVED]:STATUS.RESERVED,
   [STATES.ACCEPTED]:STATUS.ACCEPTED,
   [STATES.UNKNOWN]:STATUS.UNKNOWN,
   [STATES.PAPER]:STATUS.PAPER
  }[found.state]:STATUS.MISSING;
  if(!key)mismatch=true;
  return {ticket_slot:x.slot,kind:x.kind,
   fingerprint:x.key.slice(0,16),state:key,
   may_have_printed:found?true:"UNKNOWN",
   physical_paper_verified:false};
 });
 if(mismatch)return hold("SOURCE_CONTENT_OR_OBSERVATION_DRIFT");
 const count=ledger.entries.length;
 return {schema:"deliveryos.synthetic-reconciliation.v756.offline",
  status:"MANUAL_RECONCILIATION_REQUIRED",
  source:"THREE_SOURCE_VERIFIED_SYNTHETIC_TICKETS_ONLY",
  recorded_attempts:count,missing_attempt_records:3-count,
  receipt_states:states,manual_review_required:true,
  next_step:"CORRELATE_EXTERNAL_EVIDENCE_WITHOUT_AUTO_RESEND",
  missing_record_is_not_no_print_proof:true,
  spool_ack_is_not_paper_proof:true,
  photo_reference_is_not_external_validation:true,
  offline_file_hash_chain_is_not_a_trusted_external_anchor:true,
  windows_power_loss_durability_proven:false,
  no_automatic_retry:true,print_authorized:false,
  exact_once_physical_proven:false,external_anchor_proven:false,
  effects:EFFECTS};
}
module.exports={auditExpectedThreeViews,STATUS,EFFECTS};

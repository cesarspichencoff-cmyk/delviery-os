"use strict";
/**
 * V7.59 — SYNTHETIC CAS witness protocol, verify and plan only.
 *
 * This is NOT a Firestore/GitHub/Cloudflare implementation. No credentials,
 * network/IPC/filesystem, printer or operational service access. A provider
 * transaction, independent trust custody and hardware durability are absent.
 * The operation never returns print authorization or guarantees exactly once.
 */
const crypto=require("node:crypto");
const {verifyWitnessHistoryOnly}=require("./comandas_external_witness_v758_offline.js");
const SCHEMA="deliveryos.synthetic-witness-cas.v759.offline";
const NO_EFFECTS=Object.freeze({print:false,reprint:false,spooler_write:false,
 network:false,provider_write:false,filesystem_write:false,service_change:false,
 driver_change:false,deploy:false,sequence_binding_write:false});
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const keys=(x,fields)=>!!x&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).length===fields.length&&fields.every(k=>Object.hasOwn(x,k));
function hold(reason){
 return {schema:SCHEMA,status:"CAS_WITNESS_HOLD",reason,authorize_print:false,
  authorize_reprint:false,manual_reconciliation_required:true,
  remote_atomic_commit_proven:false,independent_trust_proven:false,
  exactly_once_paper_proven:false,effects:NO_EFFECTS};
}
function planConditionalWitnessCommit(previousWitness,previousTrusted,
 candidateWitness,candidateTrusted){
 const old=verifyWitnessHistoryOnly(previousWitness,previousTrusted);
 if(old.status!=="SYNTHETIC_HISTORY_VALID_UNDER_SUPPLIED_TRUST")
  return hold("PREVIOUS_TRUSTED_HEAD_NOT_VERIFIED");
 const next=verifyWitnessHistoryOnly(candidateWitness,candidateTrusted);
 if(next.status!=="SYNTHETIC_HISTORY_VALID_UNDER_SUPPLIED_TRUST")
  return hold("NEW_SIGNED_HEAD_NOT_VERIFIED");
 const before=previousWitness.records,after=candidateWitness.records;
 if(candidateTrusted.authority!=="EPHEMERAL_CI_TEST_CONTEXT_ONLY"||
    candidateTrusted.journal_instance_id!==previousTrusted.journal_instance_id||
    candidateTrusted.witness_instance_id!==previousTrusted.witness_instance_id||
    candidateTrusted.public_key_sha256!==previousTrusted.public_key_sha256||
    candidateTrusted.public_key_spki_pem!==previousTrusted.public_key_spki_pem||
    candidateWitness.witness_instance_id!==previousWitness.witness_instance_id||
    candidateTrusted.pinned_witness_revision!==previousTrusted.pinned_witness_revision+1||
    after.length!==before.length+1||
    before.some((r,i)=>JSON.stringify(r)!==JSON.stringify(after[i]))||
    after[before.length].previous_sha256!==
     previousTrusted.pinned_witness_head_sha256||
    candidateTrusted.pinned_witness_head_sha256===
     previousTrusted.pinned_witness_head_sha256||
    candidateTrusted.required_latest_journal_head_sha256===
     previousTrusted.required_latest_journal_head_sha256)
  return hold("CANDIDATE_NOT_EXACT_APPEND_FROM_PINNED_PARENT");
 const requestId=hash(JSON.stringify(["v759-cas",previousTrusted.witness_instance_id,
  previousTrusted.pinned_witness_revision,
  previousTrusted.pinned_witness_head_sha256,
  candidateTrusted.pinned_witness_head_sha256]));
 return {schema:SCHEMA,status:"OFFLINE_CONDITIONAL_APPEND_PROPOSAL_ONLY",
  request_id:requestId,
  expected_revision:previousTrusted.pinned_witness_revision,
  expected_head_sha256:previousTrusted.pinned_witness_head_sha256,
  proposed_revision:candidateTrusted.pinned_witness_revision,
  proposed_head_sha256:candidateTrusted.pinned_witness_head_sha256,
  journal_head_sha256:candidateTrusted.required_latest_journal_head_sha256,
  witness_instance_id:previousTrusted.witness_instance_id,
  conditional_write_required:true,provider_fencing_required:true,
  re_read_after_commit_required:true,independent_trust_pin_advance_required:true,
  remote_atomic_commit_proven:false,independent_trust_proven:false,
  exactly_once_paper_proven:false,authorize_print:false,authorize_reprint:false,
  manual_reconciliation_required:true,effects:NO_EFFECTS};
}
/**
 * Interpret only a simulated provider readback. A lost/ambiguous ACK does NOT
 * release a print. The proof must match both a conditional request and a
 * new signed, source-pinned witness. The "remote" object is caller supplied.
 */
function reconcileSimulatedProviderResult(proposal,candidateWitness,
 candidateTrusted,readback){
 if(proposal?.status!=="OFFLINE_CONDITIONAL_APPEND_PROPOSAL_ONLY"||
    proposal.authorize_print!==false)
  return hold("PREPARED_CAS_PROPOSAL_REQUIRED");
 if(!keys(readback,["kind","witness","trusted","provider_request_id",
   "observed_revision","observed_head_sha256"])||
    readback.kind!=="SIMULATED_PROVIDER_READBACK"||
    readback.provider_request_id!==proposal.request_id||
    readback.observed_revision!==proposal.proposed_revision||
    readback.observed_head_sha256!==proposal.proposed_head_sha256||
    readback.trusted?.authority!=="EPHEMERAL_CI_TEST_CONTEXT_ONLY")
  return hold("PROVIDER_READBACK_MISSING_STALE_OR_AMBIGUOUS");
 const expected=verifyWitnessHistoryOnly(candidateWitness,candidateTrusted);
 const observed=verifyWitnessHistoryOnly(readback.witness,readback.trusted);
 if(expected.status!=="SYNTHETIC_HISTORY_VALID_UNDER_SUPPLIED_TRUST"||
    observed.status!=="SYNTHETIC_HISTORY_VALID_UNDER_SUPPLIED_TRUST"||
    JSON.stringify(readback.witness)!==JSON.stringify(candidateWitness)||
    JSON.stringify(readback.trusted)!==JSON.stringify(candidateTrusted)||
    candidateTrusted.pinned_witness_revision!==proposal.proposed_revision||
    candidateTrusted.pinned_witness_head_sha256!==proposal.proposed_head_sha256||
    candidateTrusted.witness_instance_id!==proposal.witness_instance_id||
    candidateTrusted.required_latest_journal_head_sha256!==
     proposal.journal_head_sha256)
  return hold("SIMULATED_READBACK_CANNOT_PROVE_PROPOSED_HEAD");
 return {schema:SCHEMA,status:"SYNTHETIC_CAS_READBACK_MATCH_NOT_PROVIDER_PROOF",
  request_id:proposal.request_id,
  simulated_revision:proposal.proposed_revision,
  signature_history_revalidated:true,
  remote_atomic_commit_proven:false,independent_trust_proven:false,
  provider_fencing_proven:false,physical_exactly_once_proven:false,
  authorize_print:false,authorize_reprint:false,
  manual_reconciliation_required:true,effects:NO_EFFECTS};
}
module.exports={SCHEMA,NO_EFFECTS,planConditionalWitnessCommit,
 reconcileSimulatedProviderResult};

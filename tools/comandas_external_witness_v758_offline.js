"use strict";
/**
 * V7.58: VERIFY-ONLY synthetic out-of-band witness history.
 *
 * No filesystem/network/print APIs. All witness records and the separately
 * pinned trust context must come from the caller, never from the printer's
 * journal. CI supplies temporary keys and separate disposable fixture roots.
 *
 * Passing means internally consistent signatures and pinned hashes under a
 * SIMULATED independently trusted context, NOT real external independence.
 * Never an operational installation or printer/reprint authorization.
 */
const crypto=require("node:crypto");
const {verifySignedSyntheticCheckpoint,keyFingerprint,messageFor}=
 require("./comandas_signed_anchor_v757_offline.js");

const S="deliveryos.synthetic-external-witness.v758.offline";
const G="DELIVERYOS-V758-SYNTHETIC-WITNESS-GENESIS\n";
const DIGEST=/^[0-9a-f]{64}$/;
const ID=/^test:[a-z0-9_-]{12,72}$/;
const SCHEMA757="deliveryos.signed-journal-anchor.v757.offline";
const NO_EFFECTS=Object.freeze({print:false,reprint:false,spooler_write:false,
 filesystem_write:false,network:false,external_service_call:false,
 service_change:false,driver_change:false,deploy:false,lock_cleanup:false,
 sequence_binding_write:false,odhen_write:false});
const keys=(x,fields)=>!!x&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).length===fields.length&&fields.every(k=>Object.hasOwn(x,k));
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
function refuse(code){
 return {schema:S,status:"WITNESS_HOLD",reason:code,
  signed_history_verified:false,latest_journal_checkpoint_matched:false,
  independently_custodied_trust_proven:false,independent_failure_domain_proven:false,
  externally_immutable_history_proven:false,windows_power_loss_durability_proven:false,
  exactly_once_paper_proven:false,authorize_print:false,authorize_reprint:false,
  manual_review_required:true,effects:NO_EFFECTS};
}
/** Stable domain-separated SHA-256 chaining. Not a substitute for a trusted
 * final head *outside the writable witness itself*. */
function genesisHash(instance){
 if(typeof instance!=="string"||!ID.test(instance))throw Error("BAD_SYNTHETIC_INSTANCE");
 return sha(Buffer.from(G+instance+"\n","utf8"));
}
function recordBytes(witnessId,previousHash,checkpoint){
 return Buffer.from("DELIVERYOS-V758-SYNTHETIC-WITNESS-RECORD\n"+
 JSON.stringify([witnessId,previousHash,checkpoint.schema,
  checkpoint.journal_instance_id,checkpoint.revision,
  checkpoint.journal_head_sha256,checkpoint.signature_base64])+"\n","utf8");
}
function recordHash(witnessId,previousHash,checkpoint){
 return sha(recordBytes(witnessId,previousHash,checkpoint));
}
function verifyWitnessHistoryOnly(witness,trusted){
 if(!keys(witness,["schema","witness_instance_id","records"])||
    !keys(trusted,["authority","journal_instance_id","witness_instance_id",
     "public_key_spki_pem","public_key_sha256","pinned_witness_revision",
     "pinned_witness_head_sha256","required_latest_journal_head_sha256"]))
  return refuse("TRUST_OR_WITNESS_ENVELOPE_INVALID");
 if(witness.schema!==S||
    trusted.authority!=="EPHEMERAL_CI_TEST_CONTEXT_ONLY"||
    !ID.test(witness.witness_instance_id)||
    !ID.test(trusted.journal_instance_id)||
    witness.witness_instance_id!==trusted.witness_instance_id||
    !Array.isArray(witness.records)||witness.records.length<1||
    witness.records.length>1000||
    !Number.isSafeInteger(trusted.pinned_witness_revision)||
    trusted.pinned_witness_revision<1||
    trusted.pinned_witness_revision!==witness.records.length||
    !DIGEST.test(trusted.pinned_witness_head_sha256)||
    !DIGEST.test(trusted.public_key_sha256)||
    !DIGEST.test(trusted.required_latest_journal_head_sha256)||
    typeof trusted.public_key_spki_pem!=="string"||
    trusted.public_key_spki_pem.length>1500)
  return refuse("WITNESS_SCOPE_OR_MONOTONIC_PIN_INVALID");
 let key;
 try{
  key=crypto.createPublicKey(trusted.public_key_spki_pem);
  if(key.asymmetricKeyType!=="ed25519"||
     keyFingerprint(key)!==trusted.public_key_sha256)
   return refuse("UNTRUSTED_EXTERNAL_KEY");
 }catch{return refuse("EXTERNAL_PUBLIC_KEY_INVALID")}
 let previous=genesisHash(witness.witness_instance_id);
 let priorJournalHead=null;
 for(let i=0;i<witness.records.length;i++){
  const row=witness.records[i];
  if(!keys(row,["previous_sha256","checkpoint","record_sha256"]))
   return refuse("WITNESS_RECORD_SHAPE_INVALID");
  const c=row.checkpoint;
  if(!keys(c,["schema","journal_instance_id","revision",
    "journal_head_sha256","signature_base64"])||
     c.schema!==SCHEMA757||
     c.journal_instance_id!==trusted.journal_instance_id||
     !Number.isSafeInteger(c.revision)||c.revision!==i+1||
     !DIGEST.test(c.journal_head_sha256)||
     row.previous_sha256!==previous||
     !DIGEST.test(row.record_sha256)||
     typeof c.signature_base64!=="string"||
     !/^[A-Za-z0-9+/]{86}==$/.test(c.signature_base64)||
     c.journal_head_sha256===priorJournalHead)
   return refuse("WITNESS_ORDER_OR_JOURNAL_IDENTITY_INVALID");
  const actual=recordHash(witness.witness_instance_id,previous,c);
  if(actual!==row.record_sha256)return refuse("WITNESS_CHAIN_TAMPERED");
  try{
   const sig=Buffer.from(c.signature_base64,"base64");
   if(sig.length!==64||sig.toString("base64")!==c.signature_base64||
      !crypto.verify(null,messageFor(c),key,sig))
    return refuse("WITNESS_CHECKPOINT_SIGNATURE_INVALID");
  }catch{return refuse("WITNESS_SIGNATURE_UNVERIFIABLE")}
  priorJournalHead=c.journal_head_sha256;
  previous=actual;
 }
 if(previous!==trusted.pinned_witness_head_sha256||
    priorJournalHead!==trusted.required_latest_journal_head_sha256)
  return refuse("WITNESS_LATEST_EXTERNAL_PIN_MISMATCH");
 return {schema:S,status:"SYNTHETIC_HISTORY_VALID_UNDER_SUPPLIED_TRUST",
  signed_history_verified:true,revision:witness.records.length,
  final_checkpoint:witness.records[witness.records.length-1].checkpoint,
  // A signed local artifact cannot prove the human custody of its trust.
  independently_custodied_trust_proven:false,
  authorize_print:false,authorize_reprint:false,effects:NO_EFFECTS};
}
function verifySyntheticWitnessAgainstJournal(journalRoot,witness,trusted){
 const checked=verifyWitnessHistoryOnly(witness,trusted);
 if(checked.status!=="SYNTHETIC_HISTORY_VALID_UNDER_SUPPLIED_TRUST")
  return checked;
 // Reuse strict V7.57 last journal head check and reject stale locks.
 const last=checked.final_checkpoint;
 const context={
  authority:"EPHEMERAL_CI_TEST_CONTEXT_ONLY",
  journal_instance_id:trusted.journal_instance_id,
  minimum_revision:checked.revision,
  required_head_sha256:trusted.required_latest_journal_head_sha256,
  public_key_spki_pem:trusted.public_key_spki_pem,
  public_key_sha256:trusted.public_key_sha256
 };
 const proof=verifySignedSyntheticCheckpoint(journalRoot,last,context);
 if(proof.status!=="SIGNED_SYNTHETIC_CHECKPOINT_MATCH_NOT_PRODUCTION_PROOF")
  return refuse("JOURNAL_NOT_AT_SIGNED_LATEST_CHECKPOINT");
 return {schema:S,
  status:"SYNTHETIC_OUT_OF_BAND_WITNESS_MATCH_NOT_PRODUCTION_PROOF",
  signed_history_verified:true,latest_journal_checkpoint_matched:true,
  verified_revision:checked.revision,
  latest_record_sha256:trusted.pinned_witness_head_sha256,
  independently_custodied_trust_proven:false,
  independent_failure_domain_proven:false,
  externally_immutable_history_proven:false,
  windows_power_loss_durability_proven:false,
  exactly_once_paper_proven:false,authorize_print:false,authorize_reprint:false,
  manual_review_required:true,effects:NO_EFFECTS};
}
module.exports={verifyWitnessHistoryOnly,verifySyntheticWitnessAgainstJournal,
 genesisHash,recordHash,NO_EFFECTS,SCHEMA:S};

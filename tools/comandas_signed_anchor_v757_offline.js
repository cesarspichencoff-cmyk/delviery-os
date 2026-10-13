"use strict";
/**
 * V7.57: verification-only, synthetic external-anchor contract.
 *
 * The verifier receives an OUT-OF-BAND trust checkpoint. It NEVER loads a
 * trust key from the anchor or the journal, signs data, writes files,
 * contacts a service or authorizes printing.
 *
 * Test checkpoints and keys are ephemeral. A future operational trust root
 * needs separate human authorization, key custody, monotonic anti-rollback,
 * power-loss validation and external failure-domain evidence.
 */
const crypto=require("node:crypto");
const {rootGuard,snapshot}=require("./comandas_journal_v755_sandbox.js");
const DIGEST=/^[0-9a-f]{64}$/;
const INSTANCE=/^test:[a-z0-9_-]{12,72}$/;
const STATUS="SIGNED_SYNTHETIC_CHECKPOINT_MATCH_NOT_PRODUCTION_PROOF";
const NO_EFFECTS=Object.freeze({print:false,spooler_write:false,
 reprint:false,filesystem_write:false,lock_cleanup:false,
 driver_change:false,service_change:false,deploy:false,
 sequence_binding_write:false});
const exact=(o,keys)=>!!o&&typeof o==="object"&&!Array.isArray(o)&&
 Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function hold(code){return {schema:"deliveryos.signed-journal-anchor.v757.offline",
 status:"ANCHOR_HOLD",reason:code,signature_verified:false,
 synthetic_checkpoint_matched:false,operational_external_anchor_proven:false,
 power_loss_durability_proven:false,exactly_once_paper_proven:false,
 authorize_print:false,authorize_reprint:false,manual_review_required:true,
 effects:NO_EFFECTS};}
function messageFor(anchor){
 return Buffer.from("DELIVERYOS-V757-SYNTHETIC-JOURNAL-ANCHOR\n"+
 JSON.stringify([anchor.journal_instance_id,anchor.revision,
  anchor.journal_head_sha256])+"\n","utf8");
}
function keyFingerprint(publicKey){
 const key=crypto.createPublicKey(publicKey);
 if(key.asymmetricKeyType!=="ed25519")throw Error("KEY_NOT_ED25519");
 return sha(key.export({format:"der",type:"spki"}));
}
/**
 * A trust checkpoint MAY be fabricated by the synthetic CI harness only.
 * Passing this function does not establish whether such a checkpoint would
 * actually be external or independently controlled in the real restaurant.
 */
function verifySignedSyntheticCheckpoint(root,anchor,trusted){
 if(!rootGuard(root))return hold("DISPOSABLE_JOURNAL_REQUIRED");
 if(!exact(anchor,["schema","journal_instance_id","revision",
   "journal_head_sha256","signature_base64"]))
  return hold("ANCHOR_ENVELOPE_INVALID");
 if(!exact(trusted,["authority","journal_instance_id","minimum_revision",
   "required_head_sha256","public_key_spki_pem","public_key_sha256"]))
  return hold("INDEPENDENT_TRUST_CONTEXT_REQUIRED");
 if(trusted.authority!=="EPHEMERAL_CI_TEST_CONTEXT_ONLY"||
    anchor.schema!=="deliveryos.signed-journal-anchor.v757.offline"||
    !INSTANCE.test(anchor.journal_instance_id)||
    anchor.journal_instance_id!==trusted.journal_instance_id||
    !Number.isSafeInteger(anchor.revision)||anchor.revision<1||
    !Number.isSafeInteger(trusted.minimum_revision)||trusted.minimum_revision<1||
    anchor.revision!==trusted.minimum_revision||
    typeof anchor.journal_head_sha256!=="string"||
    !DIGEST.test(anchor.journal_head_sha256)||
    anchor.journal_head_sha256!==trusted.required_head_sha256||
    !DIGEST.test(trusted.required_head_sha256)||
    !DIGEST.test(trusted.public_key_sha256)||
    typeof anchor.signature_base64!=="string"||
    !/^[A-Za-z0-9+/]{86}==$/.test(anchor.signature_base64)||
    typeof trusted.public_key_spki_pem!=="string"||
    trusted.public_key_spki_pem.length>1500)
  return hold("CHECKPOINT_SCOPE_REVISION_OR_HEADER_DRIFT");
 let key,sig;
 try{
  key=crypto.createPublicKey(trusted.public_key_spki_pem);
  if(key.asymmetricKeyType!=="ed25519"||
    keyFingerprint(key)!==trusted.public_key_sha256)
   return hold("UNTRUSTED_SIGNING_KEY");
  sig=Buffer.from(anchor.signature_base64,"base64");
  if(sig.length!==64||sig.toString("base64")!==anchor.signature_base64||
    !crypto.verify(null,messageFor(anchor),key,sig))
   return hold("ANCHOR_SIGNATURE_NOT_VALID");
 }catch{return hold("ANCHOR_CRYPTO_NOT_VERIFIED")}
 // Validate local chained revisions only AFTER cryptographic validation.
 // A stale lock, torn write, orphan record or any corruption is blocking.
 const local=snapshot(root);
 if(local.status!=="SYNTHETIC_SNAPSHOT_ONLY"||
   local.revision!==anchor.revision||
   local.journal_head_sha256!==anchor.journal_head_sha256||
   !Array.isArray(local.ledger?.entries)||
   local.ledger.entries.length!==anchor.revision)
  return hold("JOURNAL_DIFFERS_FROM_TRUSTED_CHECKPOINT");
 return {schema:"deliveryos.signed-journal-anchor.v757.offline",
  status:STATUS,signature_verified:true,synthetic_checkpoint_matched:true,
  revision:local.revision,anchored_head_sha256:anchor.journal_head_sha256,
  // Truth boundary: cryptography under simulated trust ≠ real trust custody.
  operational_external_anchor_proven:false,power_loss_durability_proven:false,
  exactly_once_paper_proven:false,authorize_print:false,
  authorize_reprint:false,manual_review_required:true,effects:NO_EFFECTS};
}
module.exports={verifySignedSyntheticCheckpoint,keyFingerprint,
 messageFor,NO_EFFECTS,STATUS};

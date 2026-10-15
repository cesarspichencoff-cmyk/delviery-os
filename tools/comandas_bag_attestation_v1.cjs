'use strict';
/**
 * Verify a signed human BAG review on an exact V2 order revision.
 * Reuses the existing source-integrity proposal gate. Cryptographic validity
 * is NOT evidence that a real operator controlled the private key.
 * No keys are generated/persisted here; no calls, writes, print or FACT.
 */
const crypto=require('node:crypto');
const {inspect}=require('./comandas_bag_human_proposal_v1.cjs');
const DOMAIN='DELIVERYOS-BAG-HUMAN-REVIEW-V1\n';
const HEX=/^[a-f0-9]{64}$/;
const NO_EFFECTS=Object.freeze({ready_override:false,print_authorized:false,
 ticket_authorized:false,v68_authorized:false,consumer_modified:false,
 service_changed:false,sequence_written:false,spooler_write:false,
 operational_human_authority_proven:false});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const FIELDS=['schema','purpose','operator_ref','order_key_sha256','snapshot_hash',
 'decision_fingerprint','ledger_git_blob','bag_case','bag_sizes','bag_count',
 'issued_at','expires_at','nonce'];
const ATTEST_FIELDS=[...FIELDS,'signature_base64'];
const TRUST_FIELDS=['schema','authority','operator_ref','public_key_spki_pem',
 'public_key_sha256','valid_from','valid_until','revoked_nonces',
 'revoked_snapshots'];
function no(reason){return {schema:'deliveryos.bag-human-signature-check.v1',
 status:'HOLD',reason,signature_valid:false,matched_review:false,
 human_key_custody_proven:false,independent_operator_authenticated:false,
 original_decision_unchanged:true,...NO_EFFECTS};}
function signingMessage(statement){
 if(!exact(statement,FIELDS))throw Error('STATEMENT_SCHEMA');
 return Buffer.from(DOMAIN+JSON.stringify(FIELDS.map(f=>statement[f]))+'\n','utf8');
}
function time(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(s))return null;
 const d=new Date(s);return Number.isFinite(d.getTime())&&d.toISOString()===s?d.getTime():null;
}
function verify(event,decision,ledgerBytes,attestation,externalTrust,nowUtc){
 try{
  const proposal=inspect(event,decision,ledgerBytes);
  if(proposal.status!=='SHADOW_BAG_MATCH_ATTESTATION_AND_V68_PENDING')
   return no('SOURCE_PROPOSAL_NOT_VERIFIED');
  if(!exact(attestation,ATTEST_FIELDS)||!exact(externalTrust,TRUST_FIELDS)||
   attestation.schema!=='deliveryos.bag-human-signed-review.v1'||
   attestation.purpose!=='SHADOW_REVIEW_NOT_RELEASE'||
   externalTrust.schema!=='deliveryos.bag-human-trust-context.v1')
   return no('SIGNED_REVIEW_OR_TRUST_SCHEMA_INVALID');
  // This scope is intentionally LAB ONLY. External, independently authenticated
  // operational trust material must be approved and integrated separately.
  if(externalTrust.authority!=='EPHEMERAL_CI_TEST_CONTEXT_ONLY')
   return no('INDEPENDENT_OPERATOR_TRUST_NOT_ESTABLISHED');
  if(typeof attestation.operator_ref!=='string'||
     !/^test:[a-z0-9_-]{8,64}$/.test(attestation.operator_ref)||
     externalTrust.operator_ref!==attestation.operator_ref)
   return no('OPERATOR_NOT_IN_TEST_TRUST_CONTEXT');
  const bag=proposal.bag_candidate;
  if(attestation.order_key_sha256!==sha(Buffer.from(event.order_key))||
   attestation.snapshot_hash!==event.snapshot_hash||
   attestation.decision_fingerprint!==decision.fingerprint||
   attestation.ledger_git_blob!==bag.source_git_blob||
   attestation.bag_case!==bag.case||
   JSON.stringify(attestation.bag_sizes)!==JSON.stringify(bag.sizes)||
   attestation.bag_count!==bag.count)
    return no('REVIEW_NOT_BOUND_TO_EXACT_ORDER_AND_BAG');
  if(!HEX.test(attestation.order_key_sha256)||
   !HEX.test(attestation.snapshot_hash)||
   !HEX.test(attestation.decision_fingerprint)||
   !/^[a-f0-9]{40}$/.test(attestation.ledger_git_blob)||
   !/^[a-f0-9]{64}$/.test(externalTrust.public_key_sha256)||
   typeof attestation.nonce!=='string'||
   !/^test:[a-z0-9_-]{16,80}$/.test(attestation.nonce)||
   !Array.isArray(externalTrust.revoked_nonces)||
   !Array.isArray(externalTrust.revoked_snapshots)||
   externalTrust.revoked_nonces.includes(attestation.nonce)||
   externalTrust.revoked_snapshots.includes(event.snapshot_hash))
   return no('IDENTITY_NONCE_OR_REVOCATION_INVALID');
  const now=time(nowUtc),issued=time(attestation.issued_at),
   expires=time(attestation.expires_at),from=time(externalTrust.valid_from),
   until=time(externalTrust.valid_until);
  if([now,issued,expires,from,until].some(x=>x===null)||
    issued<from||expires>until||expires-issued>86400000||
    issued>now||now>=expires||from>now||now>=until)
   return no('TIMESTAMP_WINDOW_INVALID_EXPIRED_OR_FUTURE');
  if(typeof externalTrust.public_key_spki_pem!=='string'||
   externalTrust.public_key_spki_pem.length>1500||
   typeof attestation.signature_base64!=='string'||
   !/^[a-zA-Z0-9+/]{86}==$/.test(attestation.signature_base64))
   return no('KEY_OR_SIGNATURE_FORMAT_INVALID');
  const publicKey=crypto.createPublicKey(externalTrust.public_key_spki_pem);
  if(publicKey.type!=='public'||publicKey.asymmetricKeyType!=='ed25519'||
   sha(publicKey.export({format:'der',type:'spki'}))!==externalTrust.public_key_sha256)
   return no('PUBLIC_KEY_FINGERPRINT_NOT_PINNED');
  const sig=Buffer.from(attestation.signature_base64,'base64');
  const stmt=Object.fromEntries(FIELDS.map(f=>[f,attestation[f]]));
  if(sig.length!==64||sig.toString('base64')!==attestation.signature_base64||
    !crypto.verify(null,signingMessage(stmt),publicKey,sig))
   return no('SIGNATURE_INVALID');
  return {schema:'deliveryos.bag-human-signature-check.v1',
   status:'SIGNED_SHADOW_REVIEW_MATCH_NOT_OPERATIONAL',reason:'CI_TEST_KEY_NOT_REAL_OPERATOR',
   signature_valid:true,matched_review:true,
   bag_case:bag.case,bag_count:bag.count,bag_sizes:[...bag.sizes],
   human_key_custody_proven:false,independent_operator_authenticated:false,
   original_decision_unchanged:true,...NO_EFFECTS};
 }catch{return no('INPUT_INVALID_OR_SIGNATURE_UNVERIFIABLE')}
}
module.exports={verify,signingMessage,FIELDS,NO_EFFECTS};

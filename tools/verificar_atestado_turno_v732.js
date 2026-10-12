"use strict";
/**
 * TATA Comandas V7.32 — cryptographically check a prospective shift claim
 * against a SEPARATELY TRUSTED public key. PURE: no file, network, service,
 * printer, sequence or database access.
 *
 * A valid RSA signature proves possession of the private key associated with
 * the explicitly supplied public key. It does NOT authenticate the human,
 * establish the key's operational authorization, approve a shift, or grant
 * any print permission. The caller must obtain a pinned, authorized trust
 * anchor from a separately governed source — never from this signed JSON.
 */
const crypto=require("node:crypto");
const CLAIM_FIELDS=Object.freeze([
 "store_id","operational_date","service","valid_from_local",
 "valid_until_local","confirmed_at_local","approval_ref","signer_id"
]);
const ATTEST_FIELDS=Object.freeze(["schema","claim","signature_base64"]);
const TRUST_FIELDS=Object.freeze([
 "store_id","signer_id","public_key_spki_pem","public_key_spki_sha256"
]);
const EFFECTS=Object.freeze({
 state_write:false,service_change:false,sql:false,sequence_write:false,
 spooler_write:false,printer:false,print:false,deploy:false
});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const object=o=>o!==null&&typeof o==="object"&&!Array.isArray(o);
const exact=(o,keys)=>object(o)&&Object.keys(o).length===keys.length&&
 keys.every(k=>own(o,k));
function verdict(reasons,keyDigest=null){
 return {schema:"deliveryos.prospective-shift-signature-verdict.v732",
  status:reasons.length?"BLOCKED":"SIGNATURE_VERIFIED_REVIEW_ONLY",
  reasons:[...new Set(reasons)].sort(),
  key_fingerprint_sha256:keyDigest,
  private_key_access:false,human_identity_authenticated:false,
  shift_authorized:false,print_authorized:false,effects:EFFECTS};
}
function localTicks(value){
 if(typeof value!=="string")return null;
 const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?$/.exec(value);
 if(!m)return null;
 const stamp=m[1];
 const d=new Date(stamp+"Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,19)!==stamp)
  return null;
 return stamp+"."+(m[2]||"").padEnd(7,"0");
}
function claimBytes(claim){
 // Fixed domain, fixed field order, length-independent JSON string escaping.
 // No locale/timezone/serialization options; reject extras upstream.
 return Buffer.from("TATA_COMANDAS_SHIFT_ATTESTATION_V732\n"+
  JSON.stringify(Object.fromEntries(CLAIM_FIELDS.map(k=>[k,claim[k]])))+"\n",
  "utf8");
}
function publicKeyFingerprint(pem){
 const key=crypto.createPublicKey(pem);
 if(key.asymmetricKeyType!=="rsa"||
    !key.asymmetricKeyDetails||
    key.asymmetricKeyDetails.modulusLength<2048)
  throw Error("INVALID_RSA_KEY");
 const spki=key.export({type:"spki",format:"der"});
 return {key,sha256:crypto.createHash("sha256").update(spki).digest("hex")};
}
function verifyProspectiveShiftV732(attestation,trust,order,nowLocal){
 const reasons=[];
 const fail=k=>reasons.push(k);
 if(!exact(attestation,ATTEST_FIELDS)||
    attestation.schema!=="deliveryos.prospective-shift-attestation.v732"||
    !exact(attestation.claim,CLAIM_FIELDS))
  return verdict(["ATTESTATION_CONTRACT_INVALID"]);
 if(!exact(trust,TRUST_FIELDS)||
    typeof trust.public_key_spki_pem!=="string"||
    typeof trust.public_key_spki_sha256!=="string"||
    !/^[0-9a-f]{64}$/.test(trust.public_key_spki_sha256))
  return verdict(["INDEPENDENT_TRUST_ANCHOR_MISSING"]);
 const claim=attestation.claim;
 if(typeof trust.store_id!=="string"||
    !/^[0-9]{4}$/.test(trust.store_id)||
    typeof trust.signer_id!=="string"||
    !/^[A-Z0-9_.:-]{3,80}$/.test(trust.signer_id)||
    claim.store_id!==trust.store_id||
    claim.signer_id!==trust.signer_id)
  fail("SIGNED_SCOPE_NOT_TRUSTED");
 if(typeof claim.operational_date!=="string"||
    !/^\d{4}-\d{2}-\d{2}$/.test(claim.operational_date)||
    !localTicks(claim.operational_date+"T12:00:00"))
  fail("OPERATIONAL_DATE_INVALID");
 if(!["LUNCH","DINNER"].includes(claim.service))
  fail("SERVICE_INVALID");
 if(typeof claim.approval_ref!=="string"||
    !/^[A-Za-z0-9_:/.-]{12,180}$/.test(claim.approval_ref))
  fail("EXPLICIT_APPROVAL_REF_REQUIRED");
 const from=localTicks(claim.valid_from_local),
   until=localTicks(claim.valid_until_local),
   confirmed=localTicks(claim.confirmed_at_local),
   now=localTicks(nowLocal),
   opened=localTicks(order?.opened_at_local);
 if(!from||!until||!confirmed||!now||!opened)
  fail("LOCAL_TIMESTAMPS_INVALID");
 if(from&&until&&from>=until)fail("INTERVAL_INVALID");
 if(from&&confirmed&&from<confirmed)
  fail("RETROACTIVE_CONFIRMATION_FORBIDDEN");
 if(confirmed&&now&&confirmed>now)
  fail("FUTURE_CONFIRMATION_FORBIDDEN");
 if(claim.operational_date&&[from,until,confirmed,now].some(
    v=>v&&v.slice(0,10)!==claim.operational_date))
  fail("SHIFT_DATE_MISMATCH");
 if(!object(order)||Object.keys(order).length!==3||
    typeof order.store_id!=="string"||typeof order.operational_date!=="string"||
    order.store_id!==claim.store_id||
    order.operational_date!==claim.operational_date||
    (opened&&opened.slice(0,10)!==order.operational_date))
  fail("ORDER_SCOPE_MISMATCH");
 if(opened&&from&&opened<from)fail("ORDER_PRECEDES_PROSPECTIVE_WINDOW");
 if(opened&&until&&opened>until)fail("ORDER_AFTER_WINDOW");
 let fingerprint=null,key;
 try{
  const keyInfo=publicKeyFingerprint(trust.public_key_spki_pem);
  fingerprint=keyInfo.sha256;
  if(fingerprint!==trust.public_key_spki_sha256)
   fail("PUBLIC_KEY_PIN_MISMATCH");
  else key=keyInfo.key;
 }catch{fail("PUBLIC_KEY_NOT_USABLE");}
 let sig;
 if(typeof attestation.signature_base64!=="string"||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(attestation.signature_base64)||
    attestation.signature_base64.length>1024||
    attestation.signature_base64.length<344)
  fail("SIGNATURE_ENCODING_INVALID");
 else{
  sig=Buffer.from(attestation.signature_base64,"base64");
  if(sig.toString("base64")!==attestation.signature_base64||
     sig.length<256||sig.length>512)fail("SIGNATURE_ENCODING_INVALID");
 }
 if(!reasons.length){
  try{
   if(!crypto.verify("sha256",claimBytes(claim),{
      key,padding:crypto.constants.RSA_PKCS1_PADDING
     },sig))fail("DETACHED_SIGNATURE_INVALID");
  }catch{fail("SIGNATURE_VERIFICATION_FAILED");}
 }
 return verdict(reasons,fingerprint===trust.public_key_spki_sha256?
    fingerprint:null);
}
module.exports={verifyProspectiveShiftV732,claimBytes,publicKeyFingerprint,
 localTicks,CLAIM_FIELDS,EFFECTS};

"use strict";
/** V7.32 offline CI: synthetic ephemeral RSA keys and fictional orders only. */
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {verifyProspectiveShiftV732,claimBytes,publicKeyFingerprint,localTicks}=
 require("./verificar_atestado_turno_v732.js");
const {privateKey,publicKey}=crypto.generateKeyPairSync("rsa",{
 modulusLength:2048,publicExponent:0x10001
});
const pem=publicKey.export({type:"spki",format:"pem"});
const trust=Object.freeze({
 store_id:"0001",signer_id:"TEST_REVIEWER_01",
 public_key_spki_pem:pem,
 public_key_spki_sha256:publicKeyFingerprint(pem).sha256
});
const claim={
 store_id:"0001",operational_date:"2026-10-12",service:"DINNER",
 valid_from_local:"2026-10-12T17:00:00",
 valid_until_local:"2026-10-12T22:00:00",
 confirmed_at_local:"2026-10-12T16:59:59",
 approval_ref:"fixture:test-approval-only",
 signer_id:"TEST_REVIEWER_01"
};
const order={store_id:"0001",operational_date:"2026-10-12",
 opened_at_local:"2026-10-12T18:00:00"};
const now="2026-10-12T18:15:00";
const signed=x=>({schema:"deliveryos.prospective-shift-attestation.v732",
 claim:structuredClone(x),
 signature_base64:crypto.sign("sha256",claimBytes(x),{
  key:privateKey,padding:crypto.constants.RSA_PKCS1_PADDING
 }).toString("base64")});
const attestation=signed(claim);
let checks=0;
function check(title,fn){
 fn();checks++;
 console.log("PASS V732 "+checks+" "+title);
}
const verify=(a=attestation,t=trust,o=order,n=now)=>
 verifyProspectiveShiftV732(a,t,o,n);
const blocked=(a,t,o,n,reason)=> {
 const v=verify(a,t,o,n);
 assert.equal(v.status,"BLOCKED");
 assert.equal(v.print_authorized,false);
 assert.equal(v.shift_authorized,false);
 assert.ok(Object.values(v.effects).every(x=>x===false));
 if(reason)assert.ok(v.reasons.includes(reason),
   "expected "+reason+" in "+JSON.stringify(v.reasons));
};
check("valid signed claim matches registered RSA key, never grants authority",()=>{
 const v=verify();
 assert.equal(v.status,"SIGNATURE_VERIFIED_REVIEW_ONLY");
 assert.equal(v.human_identity_authenticated,false);
 assert.equal(v.shift_authorized,false);
 assert.equal(v.print_authorized,false);
 assert.equal(v.key_fingerprint_sha256,trust.public_key_spki_sha256);
 assert.ok(Object.values(v.effects).every(x=>x===false));
});
check("exact fractional timestamp rejects invalid calendar days",()=>{
 assert.equal(localTicks("2026-02-30T17:00:00"),null);
 assert.equal(localTicks("2026-10-12T17:00:00.1234567"),
   "2026-10-12T17:00:00.1234567");
});
check("modified signed hour is rejected without new signature",()=>{
 const altered=structuredClone(attestation);
 altered.claim.valid_until_local="2026-10-12T23:00:00";
 blocked(altered,trust,order,now,"DETACHED_SIGNATURE_INVALID");
});
check("modified approval reference rejected",()=>{
 const x=structuredClone(attestation);x.claim.approval_ref="fixture:other-review";
 blocked(x,trust,order,now,"DETACHED_SIGNATURE_INVALID");
});
check("self-asserted approval or signer key inside claim rejected",()=>{
 const x=structuredClone(attestation);
 x.claim.approved=true;
 blocked(x,trust,order,now,"ATTESTATION_CONTRACT_INVALID");
});
check("absent separate trust anchor blocks",()=>{
 blocked(attestation,null,order,now,"INDEPENDENT_TRUST_ANCHOR_MISSING");
});
check("no signer-key pin equality blocks",()=>{
 blocked(attestation,{...trust,public_key_spki_sha256:"0".repeat(64)},
  order,now,"PUBLIC_KEY_PIN_MISMATCH");
});
check("attacker public key with same signer id but other pin blocks",()=>{
 const attacker=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
 const a=attacker.publicKey.export({type:"spki",format:"pem"});
 blocked(attestation,{...trust,public_key_spki_pem:a},order,now,
  "PUBLIC_KEY_PIN_MISMATCH");
});
check("wrong registered signer blocks",()=>{
 blocked(attestation,{...trust,signer_id:"OTHER_REVIEWER"},
  order,now,"SIGNED_SCOPE_NOT_TRUSTED");
});
check("order from wrong store cannot reuse signed shift",()=>{
 blocked(attestation,trust,{...order,store_id:"0002"},now,
  "ORDER_SCOPE_MISMATCH");
});
check("order from wrong operational date rejected",()=>{
 blocked(attestation,trust,{...order,operational_date:"2026-10-13"},now,
  "ORDER_SCOPE_MISMATCH");
});
check("past order cannot inherit later prospective shift",()=>{
 blocked(attestation,trust,{...order,opened_at_local:"2026-10-12T16:59:59"},
  now,"ORDER_PRECEDES_PROSPECTIVE_WINDOW");
});
check("future order after validity rejected",()=>{
 blocked(attestation,trust,{...order,opened_at_local:"2026-10-12T22:00:00.0000001"},
  now,"ORDER_AFTER_WINDOW");
});
check("signed backdated validity before confirmation rejected",()=>{
 const x={...claim,valid_from_local:"2026-10-12T16:00:00"};
 blocked(signed(x),trust,order,now,"RETROACTIVE_CONFIRMATION_FORBIDDEN");
});
check("signature claiming future confirmation rejected",()=>{
 const x={...claim,confirmed_at_local:"2026-10-12T20:00:00"};
 blocked(signed(x),trust,order,now,"FUTURE_CONFIRMATION_FORBIDDEN");
});
check("unsigned JSON cannot pretend signed claim",()=>{
 const x={...attestation,signature_base64:"approved"};
 blocked(x,trust,order,now,"SIGNATURE_ENCODING_INVALID");
});
check("invalid unrelated payload shape blocked even with correct signature",()=>{
 const x={...attestation,role:"MANAGER"};
 blocked(x,trust,order,now,"ATTESTATION_CONTRACT_INVALID");
});
check("out-of-date reviewed window cannot be used tomorrow",()=>{
 blocked(attestation,trust,order,"2026-10-13T09:00:00",
  "SHIFT_DATE_MISMATCH");
});
check("missing explicit approval reference rejected even when signed",()=>{
 const x={...claim,approval_ref:""};
 blocked(signed(x),trust,order,now,"EXPLICIT_APPROVAL_REF_REQUIRED");
});
check("input objects are unchanged after verification",()=>{
 const before=JSON.stringify({attestation,trust,order});
 verify();
 assert.equal(JSON.stringify({attestation,trust,order}),before);
});
console.log("THERMAL_SHIFT_SIGNATURE_V732="+checks+"/"+checks+
 " SYNTHETIC_RSA_NO_OPERATOR_AUTHENTICATION_NO_STATE_WRITE_NO_PRINT");

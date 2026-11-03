"use strict";
/**
 * Independent V2 attestation core. Opens NO database, key file, printer or
 * network connection. The caller supplies a READ-ONLY ledger handle, a
 * separately held attester key and pinned trust anchors.
 *
 * Crucially, this signer first checks EVERY historic signed writer receipt in
 * the scoped day via an independent verifier, then checks the strong-key V2
 * ledger. A successful signature alone NEVER authorizes operational printing.
 */
const crypto=require("node:crypto");
const {reviewPersistedDayWriterReceiptsV1}=require("./comandas_sequence_v2_writer_receipt_review_v1.cjs");
const {eligibleNativeRevisionV2}=require("./comandas_sequence_v2_native_pair_eligibility_v1.cjs");
const {inspectStrongKeySequence,STATE_SCHEMA}=require("./comandas_strong_key_sequence_v2_review_only.cjs");
const A=require("../dist/src/production/tataSequenceAttestationV1.js");
const SCHEMA="tata.comandas.sequence-v2-independent-attester-core.v1";
const EFFECTS=Object.freeze({ledger_write:false,allocation:false,print:false,
  spooler:false,fiscal:false,host:false,network:false,service:false});
function hold(reason){
 return {schema:SCHEMA,status:"HOLD",reason,attestation:null,
  chain_binding:null,number_for_operational_ticket:null,
  print_authorized:false,effects:EFFECTS};
}
function attestSignedLedgerV2({db,pair,writerTrust,attesterTrust,attesterPrivateKey,nowS,nonce,ttlS=3600}={}){
 if(!Number.isSafeInteger(nowS)||!Number.isSafeInteger(ttlS)||ttlS<1||ttlS>3600||
    typeof nonce!=="string"||!/^[a-f0-9]{32}$/.test(nonce))
  return hold("ATTESTER_CLOCK_NONCE_OR_TTL_INVALID");
 let eligible;
 try{eligible=eligibleNativeRevisionV2(pair);}catch{return hold("NATIVE_PAIR_INVALID");}
 if(eligible.reason)return hold(eligible.reason);
 if(eligible.store!=="0001|01")return hold("NOT_ITAIM_STORE");
 const dayScope="STORE:0001/01|DATE:"+eligible.day;
 const writerReview=reviewPersistedDayWriterReceiptsV1(db,dayScope,writerTrust);
 if(writerReview.status!=="SIGNED_DAY_RECEIPTS_VERIFIED_READ_ONLY_NOT_ATTESTED")
  return hold("WRITER_RECEIPT_REVIEW_HOLD:"+writerReview.reason);
 let privateKey,publicKey,attesterKeyId;
 try{
  privateKey=typeof attesterPrivateKey==="string"?crypto.createPrivateKey(attesterPrivateKey):attesterPrivateKey;
  if(privateKey?.type!=="private"||privateKey?.asymmetricKeyType!=="ed25519")throw Error("KEY");
  publicKey=crypto.createPublicKey(privateKey);
  attesterKeyId=A.publicKeyIdV1(publicKey);
 }catch{return hold("ATTESTER_PRIVATE_KEY_INVALID");}
 if(!writerTrust?.writer_key_ids||writerTrust.writer_key_ids.includes(attesterKeyId))
  return hold("SEPARATION_OF_DUTIES");
 const trusted=attesterTrust?.attesters?.filter(a=>a?.key_id===attesterKeyId);
 if(attesterTrust?.schema!==A.TATA_ATTESTERS_SCHEMA_V1||
    attesterTrust.store!=="0001|01"||
    !Array.isArray(attesterTrust.writer_key_ids)||
    !writerTrust.writer_key_ids.every(k=>attesterTrust.writer_key_ids.includes(k))||
    !Array.isArray(trusted)||trusted.length!==1)
  return hold("ATTESTER_NOT_PROVISIONED");
 if(trusted[0].scope!=="TEST_ISOLATED"&&trusted[0].scope!=="PRODUCTION_ITAIM")
  return hold("ATTESTER_SCOPE_INVALID");
 let rows;
 try{
  rows=db.prepare("SELECT order_key,seq,writer_key_id FROM tata_seq_v2_binding WHERE scope=? ORDER BY seq").all(dayScope);
 }catch{return hold("READ_ONLY_LEDGER_UNAVAILABLE");}
 const stateRows=rows.map(r=>({scope_id:dayScope,native_order_key:r.order_key,
  tata_sequence:String(r.seq).padStart(3,"0")}));
 const state={schema:STATE_SCHEMA,policy:{width:3,min_value:1,max_value:999},bindings:stateRows};
 let check;
 try{check=inspectStrongKeySequence({pair,state});}catch{return hold("NATIVE_STATE_RECHECK_FAILED");}
 if(check.status!=="STRONG_KEY_PRESENT_IN_SUPPLIED_STATE_NOT_ATTESTED")
  return hold("V2_STRONG_KEY_RECHECK_FAILED:"+check.reason);
 const digest=A.tataLedgerDayDigestV1(stateRows,stateRows.length);
 if(!digest||stateRows.length!==writerReview.row_count)
  return hold("DAY_LEDGER_PREFIX_MISMATCH");
 const writerRow=rows.find(r=>r.order_key===eligible.order_key);
 if(!writerRow)return hold("NATIVE_BINDING_NOT_IN_SIGNED_LEDGER");
 const st={schema:A.TATA_ATTESTATION_SCHEMA_V1,store:"0001|01",day:eligible.day,
  scope_id:eligible.scope_id,order_key:eligible.order_key,
  tata_sequence:String(writerRow.seq).padStart(3,"0"),ledger_day_rows:rows.length,
  ledger_day_digest:digest,writer_key_id:writerRow.writer_key_id,
  attester_key_id:attesterKeyId,issued_at_s:nowS,expires_at_s:nowS+ttlS,nonce};
 let attestation;
 try{
  attestation={...st,signature_base64:crypto.sign(null,A.attestationPayloadV1(st),
   privateKey).toString("base64")};
 }catch{return hold("ATTESTATION_SIGNING_FAILED");}
 const verified=A.verifyTataSequenceAttestationV1(attestation,attesterTrust,nowS);
 if(!verified.ok)return hold("ATTESTATION_RECHECK_FAILED:"+verified.reasons.join(","));
 return {schema:SCHEMA,status:"SIGNED_WRITER_LEDGER_ATTESTED_NOT_PRINT_AUTHORIZED",reason:null,
  attestation,chain_binding:{level:"LIVE_ATTESTED",persisted:true,
   attested_independently:true,order_key:eligible.order_key,
   scope_id:eligible.scope_id,tata_sequence:st.tata_sequence,attestation},
  signed_writer_receipts_sha256:writerReview.signed_receipts_sha256,
  attester_scope:verified.scope,
  number_for_operational_ticket:null,print_authorized:false,effects:EFFECTS};
}
module.exports={SCHEMA,EFFECTS,attestSignedLedgerV2};

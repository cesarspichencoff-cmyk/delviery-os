"use strict";
/**
 * Independent, read-only review of persisted V2 writer receipts.
 * Never signs an attestation, allocates a number, opens a connection or prints.
 * The caller supplies a READ-ONLY SQLite connection and a reviewed trust set.
 * No dependency on the writer/allocator implementation.
 */
const crypto=require("node:crypto");
const SCHEMA="tata.comandas.sequence-v2-writer-receipts-review.v1";
const DOMAIN="TATA-SEQUENCE-V2-WRITER-REQUEST\n";
const REQUEST="tata.sequence.writer-bind-request.v1";
const TRUST="tata.sequence.writer-anchors.v1";
const FIELDS=["schema","store","day","order_key","writer_key_id","issued_at_s","nonce"];
const SCOPE=/^STORE:0001\/01\|DATE:(\d{4}-\d{2}-\d{2})$/;
const ORDER=/^0001\|01\|[A-Za-z0-9_-]{1,64}\|[A-Za-z0-9_-]{1,64}$/;
const HEX64=/^[a-f0-9]{64}$/,HEX32=/^[a-f0-9]{32}$/;
const EFFECTS=Object.freeze({database_write:false,sequence_allocate:false,
  attestation_issue:false,print:false,spooler:false,network:false,
  service:false,deploy:false});
const answer=(status,reason,extra={})=>({schema:SCHEMA,status,reason,
  number_for_operational_ticket:null,live_attested:false,print_authorized:false,
  effects:EFFECTS,...extra});
function dayValid(day){
 if(typeof day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
 const d=new Date(day+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day;
}
function reviewPersistedDayWriterReceiptsV1(db,scope,trust) {
 const m=typeof scope==="string"?scope.match(SCOPE):null;
 if(!m||!dayValid(m[1]))return answer("HOLD","SCOPE_INVALID");
 if(!trust||trust.schema!==TRUST||trust.store!=="0001|01"||
    !Array.isArray(trust.writer_key_ids)||!Array.isArray(trust.writer_anchors)||
    !Array.isArray(trust.attester_key_ids)||!db||typeof db.prepare!=="function")
   return answer("HOLD","REVIEW_TRUST_OR_READONLY_DB_MISSING");
 let rows,head;
 try{
  rows=db.prepare("SELECT order_key,seq,writer_key_id,request_issued_at_s,request_nonce,request_signature_base64 FROM tata_seq_v2_binding WHERE scope=? ORDER BY seq").all(scope);
  head=db.prepare("SELECT highest FROM tata_seq_v2_head WHERE scope=?").get(scope);
 }catch{return answer("HOLD","LEDGER_UNREADABLE_OR_OLD_SCHEMA");}
 if(!Array.isArray(rows)||rows.length<1||rows.length>999||head?.highest!==rows.length)
  return answer("HOLD","LEDGER_HEAD_OR_CONTIGUITY_INVALID");
 const used=new Set(),nonces=new Set(),auditRows=[];
 for(let i=0;i<rows.length;i++){
  const r=rows[i];
  if(!r||r.seq!==i+1||typeof r.order_key!=="string"||!ORDER.test(r.order_key)||
     used.has(r.order_key)||typeof r.writer_key_id!=="string"||
     !HEX64.test(r.writer_key_id)||
     !Number.isSafeInteger(r.request_issued_at_s)||
     typeof r.request_nonce!=="string"||!HEX32.test(r.request_nonce)||
     nonces.has(r.request_nonce)||
     typeof r.request_signature_base64!=="string"||
     !/^[A-Za-z0-9+/]{86}==$/.test(r.request_signature_base64))
    return answer("HOLD","PERSISTED_RECEIPT_SHAPE_OR_SEQUENCE_INVALID");
  used.add(r.order_key);nonces.add(r.request_nonce);
  if(!trust.writer_key_ids.includes(r.writer_key_id)||
     trust.attester_key_ids.includes(r.writer_key_id))
    return answer("HOLD","HISTORIC_WRITER_NOT_TRUSTED");
  const matches=trust.writer_anchors.filter(a=>a&&a.key_id===r.writer_key_id);
  if(matches.length!==1)return answer("HOLD","HISTORIC_WRITER_ANCHOR_AMBIGUOUS");
  const anchor=matches[0],issued=r.request_issued_at_s;
  if(anchor.role!=="TATA_SEQUENCE_WRITER"||anchor.scope!=="PRODUCTION_ITAIM"||
     !Number.isSafeInteger(anchor.not_before_s)||
     !Number.isSafeInteger(anchor.not_after_s)||anchor.not_before_s>issued||
     issued>anchor.not_after_s)
    return answer("HOLD","HISTORIC_WRITER_OUTSIDE_ISSUANCE_WINDOW");
  const req={schema:REQUEST,store:"0001|01",day:m[1],order_key:r.order_key,
    writer_key_id:r.writer_key_id,issued_at_s:issued,nonce:r.request_nonce};
  let key,sig;
  try{
   key=crypto.createPublicKey({key:Buffer.from(String(anchor.public_key_spki_base64),"base64"),
    format:"der",type:"spki"});
   sig=Buffer.from(r.request_signature_base64,"base64");
   const id=crypto.createHash("sha256").update(key.export({format:"der",type:"spki"})).digest("hex");
   if(key.asymmetricKeyType!=="ed25519"||id!==r.writer_key_id||
      sig.length!==64||sig.toString("base64")!==r.request_signature_base64)
    return answer("HOLD","HISTORIC_WRITER_KEY_OR_SIGNATURE_FORMAT_INVALID");
   const bytes=Buffer.from(DOMAIN+JSON.stringify(FIELDS.map(k=>[k,req[k]])),"utf8");
   if(!crypto.verify(null,bytes,key,sig))
    return answer("HOLD","HISTORIC_WRITER_SIGNATURE_INVALID");
  }catch{return answer("HOLD","HISTORIC_WRITER_SIGNATURE_INVALID");}
  auditRows.push([r.seq,r.order_key,r.writer_key_id,issued,r.request_nonce,
    r.request_signature_base64]);
 }
 const proof=crypto.createHash("sha256").update(JSON.stringify([scope,auditRows]),"utf8").digest("hex");
 return answer("SIGNED_DAY_RECEIPTS_VERIFIED_READ_ONLY_NOT_ATTESTED",null,
  {scope,row_count:rows.length,signed_receipts_sha256:proof});
}
module.exports={SCHEMA,EFFECTS,reviewPersistedDayWriterReceiptsV1};

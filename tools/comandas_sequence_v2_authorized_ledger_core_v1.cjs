"use strict";
/**
 * TATA Comandas V2 — inert, injectable transactional ledger core.
 *
 * No device, file path, host, SQL server, credentials or printer is opened here.
 * DatabaseSync must be provided by an independently authenticated caller.
 * The writer request MUST be Ed25519-signed by a separately provisioned writer
 * key. The production trust registry remains EMPTY until reviewed provisioning.
 * A successful bind is NOT an attestation or a print authorization.
 */
const crypto=require("node:crypto");
const SCHEMA="tata.comandas.sequence-v2-authorized-ledger-core.v1";
const REQUEST="tata.sequence.writer-bind-request.v1";
const WRITERS="tata.sequence.writer-anchors.v1";
const DOMAIN="TATA-SEQUENCE-V2-WRITER-REQUEST\n";
const HEX64=/^[a-f0-9]{64}$/, HEX32=/^[a-f0-9]{32}$/;
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const SCOPE=/^STORE:0001\/01\|DATE:\d{4}-\d{2}-\d{2}$/;
const EFFECTS=Object.freeze({production_printer:false,spooler:false,network:false,
  fiscal:false,service:false,deploy:false,merge:false});
const FIELDS=["schema","store","day","order_key","writer_key_id","issued_at_s","nonce"];
const sqlDDL=[
 "CREATE TABLE IF NOT EXISTS tata_seq_v2_head(scope TEXT PRIMARY KEY, highest INTEGER NOT NULL CHECK(highest BETWEEN 0 AND 999))",
 "CREATE TABLE IF NOT EXISTS tata_seq_v2_binding(scope TEXT NOT NULL, order_key TEXT NOT NULL, seq INTEGER NOT NULL CHECK(seq BETWEEN 1 AND 999), writer_key_id TEXT NOT NULL, request_issued_at_s INTEGER NOT NULL, request_nonce TEXT NOT NULL, request_signature_base64 TEXT NOT NULL, PRIMARY KEY(scope,order_key), UNIQUE(scope,seq), UNIQUE(scope,request_nonce))",
 "CREATE TRIGGER IF NOT EXISTS tata_seq_v2_binding_no_update BEFORE UPDATE ON tata_seq_v2_binding BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BINDING'); END",
 "CREATE TRIGGER IF NOT EXISTS tata_seq_v2_binding_no_delete BEFORE DELETE ON tata_seq_v2_binding BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BINDING'); END"
];
function hold(reason,extra={}){
 return {schema:SCHEMA,status:"HOLD",reason,
  bound_number_for_attester:null,number_for_operational_ticket:null,
  live_attested:false,print_authorized:false,sequence_effect_confirmed:false,
  effects:EFFECTS,...extra};
}
function validDay(day){
 if(typeof day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
 const d=new Date(day+"T00:00:00Z");
 return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===day;
}
function payload(req){
 return Buffer.from(DOMAIN+JSON.stringify(FIELDS.map(k=>[k,req[k]])),"utf8");
}
function keyId(key){
 return crypto.createHash("sha256").update(
  key.export({format:"der",type:"spki"})).digest("hex");
}
/** For an audited migration only. Never called by bind(). */
function schemaStatementsV1(){return [...sqlDDL];}
function verifyWriterRequestV1(req,trust,nowS,expected){
 if(!req||typeof req!=="object"||Array.isArray(req)||!trust||typeof trust!=="object"||
    !Number.isSafeInteger(nowS))return "WRITER_REQUEST_OR_CLOCK_MISSING";
 if(Object.keys(req).length!==FIELDS.length+1||
    ![...FIELDS,"signature_base64"].every(k=>Object.hasOwn(req,k))||
    req.schema!==REQUEST||req.store!=="0001|01"||
    !validDay(req.day)||typeof req.order_key!=="string"||
    !/^0001\|01\|[A-Za-z0-9_-]{1,64}\|[A-Za-z0-9_-]{1,64}$/.test(req.order_key)||
    !HEX64.test(String(req.writer_key_id))||!HEX32.test(String(req.nonce))||
    !Number.isSafeInteger(req.issued_at_s)||
    nowS<req.issued_at_s||nowS-req.issued_at_s>120)
  return "WRITER_REQUEST_INVALID_OR_EXPIRED";
 if(req.store!==expected.store||req.day!==expected.day||req.order_key!==expected.order_key)
  return "WRITER_REQUEST_NOT_BOUND_TO_NATIVE_PAIR";
 if(trust.schema!==WRITERS||trust.store!=="0001|01"||
    !Array.isArray(trust.writer_anchors)||!Array.isArray(trust.writer_key_ids)||
    !Array.isArray(trust.attester_key_ids)||
    !trust.writer_key_ids.includes(req.writer_key_id)||
    trust.attester_key_ids.includes(req.writer_key_id))
  return "WRITER_NOT_PROVISIONED_OR_NOT_SEPARATED";
 const anchors=trust.writer_anchors.filter(a=>a&&a.key_id===req.writer_key_id);
 if(anchors.length!==1)return "WRITER_ANCHOR_NOT_UNIQUE";
 const anchor=anchors[0];
 if(anchor.role!=="TATA_SEQUENCE_WRITER"||anchor.scope!=="PRODUCTION_ITAIM"||
    !Number.isSafeInteger(anchor.not_before_s)||!Number.isSafeInteger(anchor.not_after_s)||
    anchor.not_after_s<=anchor.not_before_s||
    nowS<anchor.not_before_s||nowS>anchor.not_after_s||
    req.issued_at_s<anchor.not_before_s||req.issued_at_s>anchor.not_after_s)
  return "WRITER_ANCHOR_EXPIRED_OR_INVALID";
 try{
  const k=crypto.createPublicKey({key:Buffer.from(anchor.public_key_spki_base64,"base64"),
   format:"der",type:"spki"});
  if(k.asymmetricKeyType!=="ed25519"||keyId(k)!==req.writer_key_id)
   return "WRITER_PUBLIC_KEY_INVALID";
  const sig=Buffer.from(req.signature_base64,"base64");
  if(sig.length!==64||sig.toString("base64")!==req.signature_base64||
     !crypto.verify(null,payload(req),k,sig))
   return "WRITER_SIGNATURE_INVALID";
 }catch{return "WRITER_SIGNATURE_INVALID";}
 return null;
}
function selectIdentity(pair){
 // One authoritative V2 eligibility decision, shared with the current lab.
 // This import is validation only; it NEVER accesses the lab database.
 const {eligibleNativeRevisionV2}=require("./comandas_sequence_v2_native_pair_eligibility_v1.cjs");
 const e=eligibleNativeRevisionV2(pair);
 if(e.reason)return {reason:e.reason};
 if(e.store!=="0001|01"||!validDay(e.day)||
    e.scope_id!=="STORE:0001|01|DATE:"+e.day||
    e.order_key.split("|").length!==4||
    !e.order_key.split("|").every(v=>ID.test(v)))
  return {reason:"NATIVE_STRONG_KEY_NOT_TRUSTED"};
 // Signed attestation uses STORE:0001|01 while the V2 ledger uses
 // STORE:0001/01. These are distinct, explicitly checked namespaces.
 const ledger_scope="STORE:0001/01|DATE:"+e.day;
 if(!SCOPE.test(ledger_scope))return {reason:"NATIVE_LEDGER_SCOPE_INVALID"};
 return {...e,ledger_scope};
}
function inspectScope(db,scope){
 const rows=db.prepare("SELECT order_key,seq,writer_key_id,request_issued_at_s,request_nonce,request_signature_base64 FROM tata_seq_v2_binding WHERE scope=? ORDER BY seq").all(scope);
 const head=db.prepare("SELECT highest FROM tata_seq_v2_head WHERE scope=?").get(scope);
 if(rows.length>999||(!head&&rows.length>0))return {reason:"LEDGER_HEAD_OR_ROWS_MISSING"};
 const high=head?.highest??0;
 if(!Number.isSafeInteger(high)||high!==rows.length||high>999||
    rows.some((r,i)=>r.seq!==i+1||typeof r.order_key!=="string"||
      !/^0001\|01\|[A-Za-z0-9_-]{1,64}\|[A-Za-z0-9_-]{1,64}$/.test(r.order_key)||
      typeof r.writer_key_id!=="string"||!HEX64.test(r.writer_key_id)||
      !Number.isSafeInteger(r.request_issued_at_s)||
      !HEX32.test(String(r.request_nonce))||
      typeof r.request_signature_base64!=="string"||
      !/^[A-Za-z0-9+/]{86}==$/.test(r.request_signature_base64)))
  return {reason:"LEDGER_DAY_NOT_CONTIGUOUS_OR_UNTRUSTED"};
 return {rows,high};
}
/**
 * DB handle and source pair are supplied by authorized host integration.
 * An already-open SQLite transaction or foreign schema error yields HOLD.
 * No auto-retry when a post-COMMIT readback is uncertain.
 */
function bindAuthorizedNativeV2(db,pair,writerRequest,trust,nowS){
 let e;
 try{e=selectIdentity(pair);}catch{return hold("NATIVE_PAIR_INVALID");}
 if(e.reason)return hold(e.reason);
 const refused=verifyWriterRequestV1(writerRequest,trust,nowS,e);
 if(refused)return hold(refused);
 if(!db||typeof db.exec!=="function"||typeof db.prepare!=="function")
  return hold("AUTHORIZED_DATABASE_HANDLE_REQUIRED");
 let tx=false,committed=false,bound=null,reused=false;
 try{
  db.exec("BEGIN IMMEDIATE");tx=true;
  const check=inspectScope(db,e.ledger_scope);
  if(check.reason){db.exec("ROLLBACK");tx=false;return hold(check.reason);}
  const matching=check.rows.find(r=>r.order_key===e.order_key);
  if(matching){
   if(matching.writer_key_id!==writerRequest.writer_key_id){
    db.exec("ROLLBACK");tx=false;return hold("ORDER_WRITER_IDENTITY_CHANGED");
   }
   bound=matching.seq;reused=true;
  }else{
   if(check.high===999){db.exec("ROLLBACK");tx=false;return hold("DAILY_999_EXHAUSTED");}
   bound=check.high+1;
   if(check.high===0){
    db.prepare("INSERT INTO tata_seq_v2_head(scope,highest) VALUES (?,1)").run(e.ledger_scope);
   }else{
    const change=db.prepare("UPDATE tata_seq_v2_head SET highest=? WHERE scope=? AND highest=?")
     .run(bound,e.ledger_scope,check.high);
    if(change.changes!==1)throw Error("HEAD_CONFLICT");
   }
   db.prepare("INSERT INTO tata_seq_v2_binding(scope,order_key,seq,writer_key_id,request_issued_at_s,request_nonce,request_signature_base64) VALUES (?,?,?,?,?,?,?)")
    .run(e.ledger_scope,e.order_key,bound,writerRequest.writer_key_id,
      writerRequest.issued_at_s,writerRequest.nonce,writerRequest.signature_base64);
  }
  db.exec("COMMIT");tx=false;committed=true;
  const recheck=inspectScope(db,e.ledger_scope);
  const row=recheck.rows?.find(r=>r.order_key===e.order_key);
  if(recheck.reason||row?.seq!==bound||row.writer_key_id!==writerRequest.writer_key_id||
    !row.request_signature_base64||!row.request_nonce||
    !Number.isSafeInteger(row.request_issued_at_s))
   return hold("COMMITTED_READBACK_UNCERTAIN_MANUAL_RECONCILIATION",{
    sequence_effect_confirmed:false,write_may_have_occurred:true});
  return {schema:SCHEMA,status:reused?"V2_BOUND_REUSED_NOT_ATTESTED":"V2_BOUND_PERSISTED_NOT_ATTESTED",
   reason:"INDEPENDENT_ATTESTATION_AND_OPERATIONAL_AUTHORIZATION_REQUIRED",
   bound_number_for_attester:String(bound).padStart(3,"0"),
   number_for_operational_ticket:null,live_attested:false,
   print_authorized:false,sequence_effect_confirmed:true,
   reused,scope_id:e.scope_id,effects:EFFECTS};
 }catch{
  if(tx)try{db.exec("ROLLBACK");}catch{}
  return hold(committed?"COMMITTED_READBACK_UNCERTAIN_MANUAL_RECONCILIATION":
   "TRANSACTION_FAILED_OR_LEDGER_NOT_PROVISIONED",{write_may_have_occurred:committed});
 }
}
module.exports={SCHEMA,REQUEST,WRITERS,EFFECTS,writerPayloadV1:payload,
 schemaStatementsV1,verifyWriterRequestV1,bindAuthorizedNativeV2};

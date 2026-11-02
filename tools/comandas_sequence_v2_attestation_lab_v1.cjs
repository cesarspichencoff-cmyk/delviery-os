"use strict";
/**
 * Independent attester for the TATÁ number — ISOLATED lab only.
 *
 * Runs as its own process with its own Ed25519 key, opens the disposable lab
 * ledger READ-ONLY, re-checks the native revision (eligible, trusted Itaim
 * day) and the whole store day with the V2 policy (contiguous 001..n, one
 * number per order), and only then signs the statement defined in
 * src/production/tataSequenceAttestationV1.ts. It never allocates, never
 * writes the ledger and refuses the writer's key. Its keys are ephemeral test
 * keys; a production attester exists only after an authorized Itaim action.
 *
 *   node tools/comandas_sequence_v2_attestation_lab_v1.cjs attest <db> <pair.json> <key.pem> <writer_key_id> <now_s> <nonce>
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {DatabaseSync}=require("node:sqlite");
const A=require("../dist/src/production/tataSequenceAttestationV1.js");
const {eligibleNativeRevisionV2,exportLabStateV2}=require("./comandas_sequence_v2_native_lab_v1.cjs");
const {inspectStrongKeySequence}=require("./comandas_strong_key_sequence_v2_review_only.cjs");
const SCHEMA="tata.comandas.sequence-attestation-lab.v1";
const EFFECTS=Object.freeze({ledger_write:false,allocation:false,production_key:false,host:false,
 sql_server:false,print:false,network:false});
const DEFAULT_TTL_S=24*3600;

function disposable(file){
 const name=String(file||""),dir=path.resolve(path.dirname(name));
 return dir.startsWith(path.resolve(os.tmpdir())+path.sep)&&
  path.basename(dir).startsWith("comandas-atomic-test-")&&path.basename(name)==="synthetic-only.sqlite";
}
function hold(reason){
 return {schema:SCHEMA,status:"HOLD",reason,attestation:null,chain_binding:null,effects:EFFECTS};
}
/** The attester's only ledger access: a disposable file, opened read-only. */
function openLedgerReadOnlyV1(dbPath){
 if(!disposable(dbPath))throw Error("ATTESTER_LEDGER_NOT_DISPOSABLE");
 return new DatabaseSync(dbPath,{readOnly:true,timeout:0});
}
function attestInIsolationV1({dbPath,pair,attesterPrivateKeyPem,writerKeyId,nowS,ttlS=DEFAULT_TTL_S,nonce}){
 if(!disposable(dbPath))return hold("ATTESTER_LEDGER_NOT_DISPOSABLE");
 const e=eligibleNativeRevisionV2(pair);
 if(e.reason)return hold(e.reason);
 let key;
 try{key=crypto.createPrivateKey(attesterPrivateKeyPem);}catch{return hold("ATTESTER_KEY_INVALID");}
 if(key.asymmetricKeyType!=="ed25519")return hold("ATTESTER_KEY_INVALID");
 const attesterKeyId=A.publicKeyIdV1(crypto.createPublicKey(key));
 if(attesterKeyId===writerKeyId)return hold("SEPARATION_OF_DUTIES");
 let db;
 try{db=openLedgerReadOnlyV1(dbPath);}catch{return hold("ATTESTER_LEDGER_UNREADABLE");}
 try{
  const state=exportLabStateV2(db);
  const v=inspectStrongKeySequence({pair,state});
  if(v.status==="STRONG_KEY_CANDIDATE_NOT_PERSISTED")return hold("BINDING_NOT_IN_LEDGER");
  if(v.status!=="STRONG_KEY_PRESENT_IN_SUPPLIED_STATE_NOT_ATTESTED")return hold(v.reason);
  const v2Scope=e.scope_id.replace(/^STORE:([^|]+)\|([^|]+)\|DATE:/,"STORE:$1/$2|DATE:");
  const rows=state.bindings.filter(b=>b.scope_id===v2Scope);
  const digest=A.tataLedgerDayDigestV1(rows,rows.length);
  if(!digest)return hold("LEDGER_DAY_NOT_CONTIGUOUS");
  const statement={schema:A.TATA_ATTESTATION_SCHEMA_V1,store:e.store,day:e.day,scope_id:e.scope_id,
   order_key:e.order_key,tata_sequence:v.review_binding_number,ledger_day_rows:rows.length,
   ledger_day_digest:digest,writer_key_id:writerKeyId,attester_key_id:attesterKeyId,
   issued_at_s:nowS,expires_at_s:nowS+ttlS,nonce};
  const attestation={...statement,
   signature_base64:crypto.sign(null,A.attestationPayloadV1(statement),key).toString("base64")};
  return {schema:SCHEMA,status:"ATTESTATION_ISSUED_IN_ISOLATION",reason:null,attestation,
   chain_binding:{level:"LIVE_ATTESTED",persisted:true,attested_independently:true,order_key:e.order_key,
    scope_id:e.scope_id,tata_sequence:v.review_binding_number,attestation},
   effects:EFFECTS};
 }finally{db.close();}
}
if(require.main===module){
 const [mode,dbPath,pairFile,keyFile,writerKeyId,now,nonce]=process.argv.slice(2);
 const r=attestInIsolationV1({dbPath,pair:JSON.parse(fs.readFileSync(pairFile,"utf8")),
  attesterPrivateKeyPem:fs.readFileSync(keyFile,"utf8"),writerKeyId,nowS:Number(now),nonce});
 if(mode==="attest-then-crash")process.kill(process.pid,"SIGKILL"); // signed, never delivered
 process.stdout.write(JSON.stringify(r));
}
module.exports={SCHEMA,EFFECTS,attestInIsolationV1,openLedgerReadOnlyV1};

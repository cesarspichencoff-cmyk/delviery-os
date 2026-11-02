"use strict";
/** Synthetic-only SQLite transaction lab, not an operational sequence service.
 * Receives a disposable DB from a test runner and accepts TEST_ order IDs only.
 */
const SCHEMA="tata.comandas.sequence-v2-sqlite-lab.v1";
const EFFECTS=Object.freeze({disposable_sqlite_write:true,
 operational_sequence_write:false,print:false,spooler_write:false,
 network:false,retail_write:false,fiscal:false,service_change:false,
 deploy:false,merge:false});
const ORDER=/^0001\|01\|TEST_[A-Z0-9_]{1,40}\|TEST_[A-Z0-9_]{1,40}$/;
const os=require("node:os"),path=require("node:path");
/** No accidental access to an existing store DB even if invoked from scripts. */
function isDisposable(db){
 try{
  const location=db.location();
  if(location===null)return true; // :memory:
  if(typeof location!=="string")return false;
  const dir=path.resolve(path.dirname(location));
  const tmp=path.resolve(os.tmpdir())+path.sep;
  return dir.startsWith(tmp)&&
   path.basename(dir).startsWith("comandas-atomic-test-")&&
   path.basename(location)==="synthetic-only.sqlite";
 }catch{return false;}
}

function validDay(d){
 if(typeof d!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
 const parsed=new Date(d+"T00:00:00Z");
 return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===d;
}
function hold(reason,extra={}){
 return {schema:SCHEMA,status:"HOLD",reason,
  number_for_operational_ticket:null,live_source_attested:false,
  native_first_dispatch_proven:false,physical_print_proven:false,
  authorize_print:false,authorize_sequence_in_production:false,
  automatic_retry_allowed:false,effects:EFFECTS,...extra};
}
function createSyntheticTables(db){
 if(!isDisposable(db))throw Error("SYNTHETIC_DB_LOCATION_REQUIRED");
 db.exec("CREATE TABLE IF NOT EXISTS test_tata_seq_head("+
  "scope TEXT PRIMARY KEY,highest INTEGER NOT NULL CHECK(highest BETWEEN 0 AND 999));"+
  "CREATE TABLE IF NOT EXISTS test_tata_seq_bind("+
  "scope TEXT NOT NULL,order_key TEXT NOT NULL,seq INTEGER NOT NULL"+
  " CHECK(seq BETWEEN 1 AND 999),PRIMARY KEY(scope,order_key),UNIQUE(scope,seq));"+
  "CREATE TRIGGER IF NOT EXISTS test_tata_seq_immutable_update "+
  "BEFORE UPDATE ON test_tata_seq_bind BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BINDING'); END;"+
  "CREATE TRIGGER IF NOT EXISTS test_tata_seq_immutable_delete "+
  "BEFORE DELETE ON test_tata_seq_bind BEGIN SELECT RAISE(ABORT,'IMMUTABLE_BINDING'); END;");
 return {schema:SCHEMA,status:"SYNTHETIC_TABLES_PREPARED",effects:EFFECTS};
}
function bindSyntheticSequence(db,input){
 if(!isDisposable(db))return hold("SYNTHETIC_DB_LOCATION_REQUIRED");
 if(!input||input.lab_context!=="EPHEMERAL_CI_FIXTURE_ONLY"||
    input.store!=="0001|01"||!validDay(input.date)||
    typeof input.native_order_key!=="string"||
    !ORDER.test(input.native_order_key))
  return hold("SYNTHETIC_ONLY_CONTEXT_OR_STRONG_KEY_REQUIRED");
 const scope="STORE:"+input.store+"|DATE:"+input.date;
 let opened=false,committed=false;
 try{
  db.exec("BEGIN IMMEDIATE");opened=true;
  const head=db.prepare("SELECT highest FROM test_tata_seq_head WHERE scope=?").get(scope);
  const count=db.prepare("SELECT COUNT(*) AS n,MIN(seq) AS lo,MAX(seq) AS hi FROM test_tata_seq_bind WHERE scope=?").get(scope);
  const highest=head?.highest??0;
  if(!Number.isSafeInteger(highest)||highest<0||highest>999||
     (head===undefined&&count.n!==0)||count.n!==highest||
     (highest!==0&&(count.lo!==1||count.hi!==highest))){
   db.exec("ROLLBACK");opened=false;
   return hold("LAB_COUNTER_OR_BINDINGS_INTEGRITY_FAILED");
  }
  const existing=db.prepare("SELECT seq FROM test_tata_seq_bind WHERE scope=? AND order_key=?").get(scope,input.native_order_key);
  if(existing){
   db.exec("COMMIT");opened=false;committed=true;
   return {schema:SCHEMA,status:"SYNTHETIC_REUSE_RECHECKED",
    lab_sequence:String(existing.seq).padStart(3,"0"),reused:true,
    number_for_operational_ticket:null,live_source_attested:false,
    authorize_print:false,authorize_sequence_in_production:false,effects:EFFECTS};
  }
  if(highest>=999){
   db.exec("ROLLBACK");opened=false;return hold("SYNTHETIC_SEQUENCE_EXHAUSTED");
  }
  const next=highest+1;
  if(head){
   const changed=db.prepare("UPDATE test_tata_seq_head SET highest=? WHERE scope=? AND highest=?").run(next,scope,highest);
   if(changed.changes!==1)throw Error("SYNTHETIC_HEAD_CONFLICT");
  }else db.prepare("INSERT INTO test_tata_seq_head(scope,highest) VALUES (?,?)").run(scope,next);
  db.prepare("INSERT INTO test_tata_seq_bind(scope,order_key,seq) VALUES (?,?,?)").run(scope,input.native_order_key,next);
  db.exec("COMMIT");opened=false;committed=true;
  const after=db.prepare("SELECT seq FROM test_tata_seq_bind WHERE scope=? AND order_key=?").get(scope,input.native_order_key);
  const verifiedHead=db.prepare("SELECT highest FROM test_tata_seq_head WHERE scope=?").get(scope);
  if(after?.seq!==next||verifiedHead?.highest!==next)
   return hold("LAB_COMMIT_ACK_REQUIRES_MANUAL_READBACK",{lab_effect_may_have_occurred:true});
  return {schema:SCHEMA,status:"SYNTHETIC_ATOMIC_BIND_READBACK_ONLY",
   lab_sequence:String(next).padStart(3,"0"),reused:false,
   number_for_operational_ticket:null,live_source_attested:false,
   native_first_dispatch_proven:false,physical_print_proven:false,
   authorize_print:false,authorize_sequence_in_production:false,effects:EFFECTS};
 }catch{
  if(opened)try{db.exec("ROLLBACK")}catch{}
  return hold(committed?"LAB_COMMITTED_READBACK_UNCERTAIN":"LAB_TRANSACTION_FAILED_OR_LOCKED",
   {lab_effect_may_have_occurred:committed});
 }
}
module.exports={SCHEMA,EFFECTS,createSyntheticTables,bindSyntheticSequence};

"use strict";
/** V7.60: real SQLite transaction semantics, LAB only. Caller supplies DB.
 * This is NOT a Cloudflare Durable Object/production deployment.
 * Import/run only with disposable synthetic DB fixture in CI/local test.
 */
const SCHEMA="deliveryos.synthetic-sqlite-cas.v760.offline";
const DIGEST=/^[a-f0-9]{64}$/;
const NO_EFFECTS=Object.freeze({print:false,spooler_write:false,
 service_change:false,driver_change:false,deploy:false,
 sequence_write:false,remote_provider_write:false});
function hold(reason){
 return {schema:SCHEMA,status:"SQLITE_CAS_HOLD",reason,
  authorize_print:false,authorize_reprint:false,
  operational_durability_proven:false,effects:NO_EFFECTS};
}
function valid(p){
 return !!p&&p.status==="OFFLINE_CONDITIONAL_APPEND_PROPOSAL_ONLY"&&
 p.authorize_print===false&&p.conditional_write_required===true&&
 typeof p.witness_instance_id==="string"&&
 /^test:[a-z0-9_-]{12,72}$/.test(p.witness_instance_id)&&
 Number.isSafeInteger(p.expected_revision)&&p.expected_revision>=1&&
 p.proposed_revision===p.expected_revision+1&&
 [p.expected_head_sha256,p.proposed_head_sha256,p.journal_head_sha256,
  p.request_id].every(s=>typeof s==="string"&&DIGEST.test(s));
}
function createSyntheticSchema(db){
 db.exec("CREATE TABLE IF NOT EXISTS witness_head ("+
  "instance_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,"+
  "head_sha TEXT NOT NULL,journal_head_sha TEXT NOT NULL);"+
  "CREATE TABLE IF NOT EXISTS witness_commits ("+
  "instance_id TEXT NOT NULL,revision INTEGER NOT NULL,"+
  "request_id TEXT NOT NULL UNIQUE,parent_sha TEXT NOT NULL,"+
  "head_sha TEXT NOT NULL,journal_head_sha TEXT NOT NULL,"+
  "PRIMARY KEY(instance_id,revision));");
 return {status:"SCHEMA_PREPARED_LAB_ONLY",authorize_print:false};
}
function seedOnlySyntheticFixture(db,instance,revision,head,journalHead){
 if(typeof instance!=="string"||!/^test:[a-z0-9_-]{12,72}$/.test(instance)||
  !Number.isSafeInteger(revision)||revision<1||
  ![head,journalHead].every(x=>typeof x==="string"&&DIGEST.test(x)))
  return hold("INVALID_SYNTHETIC_FIXTURE");
 try{
  db.prepare("INSERT INTO witness_head(instance_id,revision,head_sha,journal_head_sha) VALUES (?,?,?,?)")
   .run(instance,revision,head,journalHead);
  return {status:"SYNTHETIC_SEED_ONLY",authorize_print:false};
 }catch{return hold("FIXTURE_ALREADY_EXISTS")}
}
function applyConditionalSyntheticCommit(db,p){
 if(!valid(p))return hold("UNVERIFIED_PREPARED_PROPOSAL");
 let inTx=false;
 try{
  db.exec("BEGIN IMMEDIATE");inTx=true;
  const prev=db.prepare("SELECT revision,head_sha FROM witness_head WHERE instance_id=?")
   .get(p.witness_instance_id);
  if(!prev||prev.revision!==p.expected_revision||
   prev.head_sha!==p.expected_head_sha256){
   db.exec("ROLLBACK");inTx=false;
   return hold("CAS_EXPECTED_HEAD_CONFLICT_OR_MISSING");
  }
  db.prepare("INSERT INTO witness_commits(instance_id,revision,request_id,parent_sha,head_sha,journal_head_sha) VALUES (?,?,?,?,?,?)")
   .run(p.witness_instance_id,p.proposed_revision,p.request_id,
    p.expected_head_sha256,p.proposed_head_sha256,p.journal_head_sha256);
  const row=db.prepare("UPDATE witness_head SET revision=?,head_sha=?,journal_head_sha=? WHERE instance_id=? AND revision=? AND head_sha=?")
   .run(p.proposed_revision,p.proposed_head_sha256,p.journal_head_sha256,
    p.witness_instance_id,p.expected_revision,p.expected_head_sha256);
  if(Number(row.changes)!==1)throw Error("NO_ATOMIC_CHANGE");
  db.exec("COMMIT");inTx=false;
  return {schema:SCHEMA,
   status:"LOCAL_SQLITE_TRANSACTION_COMMITTED_NO_REMOTE_PROOF",
   revision:p.proposed_revision,head_sha256:p.proposed_head_sha256,
   request_id:p.request_id,authorize_print:false,authorize_reprint:false,
   operational_durability_proven:false,effects:NO_EFFECTS};
 }catch{
  if(inTx){try{db.exec("ROLLBACK")}catch{}}
  return hold("TRANSACTION_ABORTED_OR_UNCERTAIN");
 }
}
function inspectSyntheticHead(db,instance){
 try{
  const r=db.prepare("SELECT revision,head_sha,journal_head_sha FROM witness_head WHERE instance_id=?")
   .get(instance);
  return r?{schema:SCHEMA,status:"LOCAL_SQLITE_READBACK_NOT_REMOTE_PROOF",
   revision:r.revision,head_sha256:r.head_sha,
   journal_head_sha256:r.journal_head_sha,authorize_print:false}:
   hold("MISSING_HEAD");
 }catch{return hold("READBACK_UNAVAILABLE")}
}
module.exports={SCHEMA,NO_EFFECTS,createSyntheticSchema,
 seedOnlySyntheticFixture,applyConditionalSyntheticCommit,inspectSyntheticHead};
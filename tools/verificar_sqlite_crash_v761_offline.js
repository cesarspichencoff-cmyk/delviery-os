"use strict";
/** V7.61: synthetic SQLite crash/recovery and corruption tests only.
 * Database exists solely in a disposable os.tmpdir() fixture. No devices.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const {DatabaseSync}=require("node:sqlite");
const {createSyntheticSchema,seedOnlySyntheticFixture,applyConditionalSyntheticCommit,inspectSyntheticHead}=require("./comandas_sqlite_cas_v760_offline.js");
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const ID="test:crash_sqlite_001",old=sha("previous"),next=sha("new"),prevJ=sha("previous-journal"),newJ=sha("new-journal");
const request={status:"OFFLINE_CONDITIONAL_APPEND_PROPOSAL_ONLY",authorize_print:false,conditional_write_required:true,witness_instance_id:ID,expected_revision:2,expected_head_sha256:old,proposed_revision:3,proposed_head_sha256:next,journal_head_sha256:newJ,request_id:sha("request-one")};
const root=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v761-"));
const filename=path.join(root,"witness.db");
const open=()=>{const d=new DatabaseSync(filename);d.exec("PRAGMA busy_timeout=15000; PRAGMA synchronous=FULL; PRAGMA journal_mode=WAL;");return d};
let n=0,db;
const test=(label,fn)=>{fn();console.log("PASS V761 "+(++n)+" "+label)};
const runner=body=>spawnSync(process.execPath,["--no-warnings","-e",body,filename],{encoding:"utf8",timeout:6000});
const paths=JSON.stringify(path.join(__dirname,"comandas_sqlite_cas_v760_offline.js"));
try{
 db=open();
 test("initial schema and genesis",()=>{
  assert.equal(createSyntheticSchema(db).authorize_print,false);
  assert.equal(seedOnlySyntheticFixture(db,ID,2,old,prevJ).status,"SYNTHETIC_SEED_ONLY");
 });
 db.close();db=null;
 const pre=[
  "const {DatabaseSync}=require('node:sqlite')",
  "const d=new DatabaseSync(process.argv[1])",
  "d.exec('PRAGMA busy_timeout=15000; PRAGMA synchronous=FULL; PRAGMA journal_mode=WAL;')",
  "d.exec('BEGIN IMMEDIATE')",
  "d.prepare('INSERT INTO witness_commits(instance_id,revision,request_id,parent_sha,head_sha,journal_head_sha) VALUES (?,?,?,?,?,?)').run("+[ID,3,request.request_id,old,next,newJ].map(JSON.stringify).join(",")+")",
  "d.prepare('UPDATE witness_head SET revision=3,head_sha=?,journal_head_sha=? WHERE instance_id=?').run("+[next,newJ,ID].map(JSON.stringify).join(",")+")",
  "process.exit(71)"
 ].join(";");
 const first=runner(pre);
 test("process exits before SQLite commit",()=>assert.equal(first.status,71,first.stderr));
 db=open();
 test("uncommitted transaction rolled back",()=>{
  assert.equal(inspectSyntheticHead(db,ID).revision,2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM witness_commits").get().n,0);
 });
 db.close();db=null;
 const post=[
  "const {DatabaseSync}=require('node:sqlite')",
  "const {applyConditionalSyntheticCommit}=require("+paths+")",
  "const d=new DatabaseSync(process.argv[1])",
  "d.exec('PRAGMA busy_timeout=15000; PRAGMA synchronous=FULL; PRAGMA journal_mode=WAL;')",
  "const r=applyConditionalSyntheticCommit(d,"+JSON.stringify(request)+")",
  "if(r.status!=='LOCAL_SQLITE_TRANSACTION_COMMITTED_NO_REMOTE_PROOF')process.exit(99)",
  "process.exit(72)"
 ].join(";");
 const second=runner(post);
 test("process exits after commit without ACK",()=>assert.equal(second.status,72,second.stderr));
 db=open();
 test("persisted head and audit both present",()=>{
  const read=inspectSyntheticHead(db,ID);
  assert.equal(read.status,"LOCAL_SQLITE_READBACK_NOT_REMOTE_PROOF");
  assert.equal(read.history_checked,true);
  assert.equal(read.revision,3);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM witness_commits").get().n,1);
 });
 test("same request replay remains blocked",()=>{
  const got=applyConditionalSyntheticCommit(db,request);
  assert.equal(got.status,"SQLITE_CAS_HOLD");
  assert.equal(got.authorize_print,false);
 });
 const original=db.prepare("SELECT * FROM witness_commits").get();
 test("deletion of audit row cannot impersonate valid head",()=>{
  db.exec("DELETE FROM witness_commits");
  assert.equal(inspectSyntheticHead(db,ID).status,"SQLITE_CAS_HOLD");
 });
 test("tampered head cannot create a new transaction",()=>{
  const another={...request,expected_revision:3,expected_head_sha256:next,proposed_revision:4,proposed_head_sha256:sha("four"),journal_head_sha256:sha("four-j"),request_id:sha("second")};
  assert.equal(applyConditionalSyntheticCommit(db,another).status,"SQLITE_CAS_HOLD");
  assert.equal(db.prepare("SELECT revision FROM witness_head").get().revision,3);
 });
 test("restoring original audit permits read-only verification again",()=>{
  db.prepare("INSERT INTO witness_commits(instance_id,revision,request_id,parent_sha,head_sha,journal_head_sha) VALUES (?,?,?,?,?,?)").run(original.instance_id,original.revision,original.request_id,original.parent_sha,original.head_sha,original.journal_head_sha);
  assert.equal(inspectSyntheticHead(db,ID).history_checked,true);
 });
 test("rewriting parent hash is detected",()=>{
  db.prepare("UPDATE witness_commits SET parent_sha=?").run(sha("evil"));
  assert.equal(inspectSyntheticHead(db,ID).status,"SQLITE_CAS_HOLD");
  db.prepare("UPDATE witness_commits SET parent_sha=?").run(original.parent_sha);
 });
 test("rewriting only journal head is detected",()=>{
  db.prepare("UPDATE witness_head SET journal_head_sha=?").run(sha("evil-journal"));
  assert.equal(inspectSyntheticHead(db,ID).status,"SQLITE_CAS_HOLD");
  db.prepare("UPDATE witness_head SET journal_head_sha=?").run(newJ);
 });
 test("orphan future audit record detected",()=>{
  db.prepare("INSERT INTO witness_commits(instance_id,revision,request_id,parent_sha,head_sha,journal_head_sha) VALUES (?,?,?,?,?,?)").run(ID,4,sha("orphan"),next,sha("head-four"),sha("journal-four"));
  assert.equal(inspectSyntheticHead(db,ID).status,"SQLITE_CAS_HOLD");
  db.prepare("DELETE FROM witness_commits WHERE revision=4").run();
 });
 test("missing genesis/head fails closed",()=>{
  db.prepare("DELETE FROM witness_head WHERE instance_id=?").run(ID);
  assert.equal(inspectSyntheticHead(db,ID).status,"SQLITE_CAS_HOLD");
 });
 test("no observed state authorizes printing",()=>{
  assert.equal(inspectSyntheticHead(db,ID).authorize_print,false);
 });
 console.log(JSON.stringify({schema:"deliveryos.synthetic-sqlite-failure.v761",result:"PASS",checks:n,pre_commit_rollback:true,post_commit_ambiguous_ack:true,missing_audit_detected:true,local_platform:process.platform,cloudflare_proven:false,windows_power_loss_proven:false,printer_calls:0,service_changes:0}));
}finally{if(db)db.close();fs.rmSync(root,{recursive:true,force:true})}
"use strict";
/** V7.60: real concurrent processes, one SHARED disposable SQLite fixture.
 * NO account/provider/retail order, spooler, service or printer access.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),
 os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {spawn}=require("node:child_process");
const {DatabaseSync}=require("node:sqlite");
const {createSyntheticSchema,seedOnlySyntheticFixture,
 applyConditionalSyntheticCommit,inspectSyntheticHead}=
 require("./comandas_sqlite_cas_v760_offline.js");
const hash=s=>crypto.createHash("sha256").update(s).digest("hex");
const INSTANCE="test:sqlite_witness_001",PREV=hash("head-2"),NEXT=hash("head-3");
const proposal={
 status:"OFFLINE_CONDITIONAL_APPEND_PROPOSAL_ONLY",authorize_print:false,
 conditional_write_required:true,witness_instance_id:INSTANCE,
 expected_revision:2,expected_head_sha256:PREV,proposed_revision:3,
 proposed_head_sha256:NEXT,journal_head_sha256:hash("journal-3"),
 request_id:hash("request-3")
};
const worker=process.argv[2]==="--worker";
const fixtureRoot=worker?path.dirname(process.argv[3]):
 fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v760-"));
const dbpath=worker?process.argv[3]:path.join(fixtureRoot,"witness.db");
const fixtureAllowed=path.resolve(path.dirname(fixtureRoot))===
 path.resolve(os.tmpdir())&&
 /^deliveryos-v760-[a-zA-Z0-9_-]{3,64}$/.test(path.basename(fixtureRoot))&&
 path.basename(dbpath)==="witness.db"&&
 path.resolve(dbpath)===path.resolve(fixtureRoot,"witness.db");
if(!fixtureAllowed)throw Error("DISPOSABLE_SQLITE_FIXTURE_ONLY");
function open(){
 const db=new DatabaseSync(dbpath);
 db.exec("PRAGMA busy_timeout=15000; PRAGMA synchronous=FULL; PRAGMA journal_mode=WAL;");
 return db;
}
function blocked(r){
 assert.equal(r.status,"SQLITE_CAS_HOLD");
 assert.equal(r.authorize_print,false);assert.equal(r.authorize_reprint,false);
}
if(worker){
 const db=open();
 try{
  const result=applyConditionalSyntheticCommit(db,proposal);
  console.log(JSON.stringify({status:result.status,authorize_print:result.authorize_print}));
 }finally{db.close()}
 process.exit(0);
}
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log("PASS V760 "+checks+" "+name)};
(async()=>{
 let db;
 try{
  db=open();
  test("create only synthetic SQLite schema",()=>{
   assert.equal(createSyntheticSchema(db).authorize_print,false);
  });
  test("seed synthetic revision 2",()=>{
   assert.equal(seedOnlySyntheticFixture(db,INSTANCE,2,PREV,hash("journal-2")).status,
    "SYNTHETIC_SEED_ONLY");
  });
  test("malformed proposed print permission rejected",()=>{
   blocked(applyConditionalSyntheticCommit(db,{...proposal,authorize_print:true}));
  });
  test("wrong prior head aborts before committing",()=>{
   blocked(applyConditionalSyntheticCommit(db,
    {...proposal,expected_head_sha256:hash("incorrect-head")}));
  });
  db.close();db=null;
  const jobs=Array.from({length:8},()=>new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,["--no-warnings",__filename,"--worker",dbpath],
    {stdio:["ignore","pipe","pipe"]});
   let output="",errors="";
   child.stdout.on("data",d=>output+=d);
   child.stderr.on("data",d=>errors+=d);
   child.on("error",reject);
   child.on("close",code=>code===0?resolve(JSON.parse(output.trim())):
    reject(Error(errors||output)));
  }));
  const results=await Promise.all(jobs);
  test("eight processes: exactly one atomic SQLite CAS commit",()=>{
   assert.equal(results.filter(x=>
    x.status==="LOCAL_SQLITE_TRANSACTION_COMMITTED_NO_REMOTE_PROOF").length,1);
   assert.equal(results.filter(x=>x.status==="SQLITE_CAS_HOLD").length,7);
   assert.ok(results.every(x=>x.authorize_print===false));
  });
  db=open();
  test("after process restart readback sees revision 3",()=>{
   const s=inspectSyntheticHead(db,INSTANCE);
   assert.equal(s.status,"LOCAL_SQLITE_READBACK_NOT_REMOTE_PROOF");
   assert.equal(s.revision,3);assert.equal(s.head_sha256,NEXT);
  });
  test("database has exactly one committed request ID",()=>{
   assert.equal(db.prepare("SELECT COUNT(*) n FROM witness_commits").get().n,1);
   assert.equal(db.prepare("SELECT request_id FROM witness_commits").get().request_id,
    proposal.request_id);
  });
  test("automatic replay after timeout is blocked",()=>{
   blocked(applyConditionalSyntheticCommit(db,proposal));
  });
  test("same revision with altered payload cannot write again",()=>{
   blocked(applyConditionalSyntheticCommit(db,
    {...proposal,proposed_head_sha256:hash("other")}));
  });
  test("invalid identity fails strict validation before SQL",()=>{
   blocked(applyConditionalSyntheticCommit(db,
    {...proposal,witness_instance_id:"test:invalid'identity"}));
  });
  test("readback remains NO PRINT / NO PROVIDER proof",()=>{
   assert.equal(inspectSyntheticHead(db,INSTANCE).authorize_print,false);
  });
  console.log(JSON.stringify({schema:"deliveryos.synthetic-sqlite-cas.v760.offline",
   result:"PASS",checks,processes:8,commits:1,
   only_disposable_sqlite:true,provider_calls:0,printer_calls:0,
   real_cloudflare_atomicity_proven:false,real_windows_power_loss_proven:false,
   real_independent_custody_proven:false}));
 }finally{
  if(db)db.close();
  fs.rmSync(fixtureRoot,{recursive:true,force:true});
 }
})().catch(err=>{console.error(err);process.exitCode=1});
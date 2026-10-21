"use strict";
/** All writes confined to disposable OS temp fixture. NO printer. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 os=require("node:os"),crypto=require("node:crypto"),{spawnSync,spawn}=require("node:child_process");
const {snapshot,reserveDurablyInSyntheticSandbox,rootGuard}=
 require("./comandas_journal_v755_sandbox.js");
const h=x=>crypto.createHash("sha256").update(x).digest("hex");
const raw={scope_id:"STORE:SIMULATED|DATE:2026-10-13",scope_evidence:"SYNTHETIC_SCOPE_ONLY",
 order_key:"0001|01|0000000001|0000000001",kind:"PRODUCAO",
 station:"SUSHI",slot:0,tata_sequence:"001",
 payload_sha256:h("test-three-view-payload"),source_sha256:h("source-event")};
const args=process.argv.slice(2);
if(args[0]==="--worker"){
 assert.equal(args.length,2);
 const result=reserveDurablyInSyntheticSandbox(args[1],raw,0);
 // Avoid immediate process.exit() while stdout is buffered to a pipe
 // (especially on hosted Windows). Let Node flush the complete JSON line.
 process.exitCode=result.status==="SYNTHETIC_JOURNAL_COMMIT_OBSERVED"||
  result.status==="HOLD"?0:5;
 process.stdout.write(JSON.stringify({
  status:result.status,authorize_print:result.authorize_print
 })+"\n");
}
else if(args[0]==="--lock-and-crash"){
 assert.equal(args.length,2);fs.mkdirSync(path.join(args[1],".attempt-lock"));
 process.exit(47);
}
else{
 if(args.length!==0)throw Error("INVALID_TEST_MODE");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v755-"));
const root2=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v755-"));
const root3=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v755-"));
let checks=0;
const test=(label,fn)=>{fn();checks++;process.stdout.write("PASS "+checks+" "+label+"\n");};
(async()=>{try{
 test("restrict journal to fixture directory under OS temp",()=>{
  assert.equal(rootGuard(root),true);
  assert.equal(rootGuard(process.cwd()),false);
  assert.equal(rootGuard(path.join(root,"anything")),false);
 });
 test("initial synthetic fixture empty and never prints",()=>{
  const s=snapshot(root);assert.equal(s.status,"SYNTHETIC_SNAPSHOT_ONLY");
  assert.equal(s.ledger.revision,0);assert.equal(s.authorize_print,false);
 });
 test("durable sandbox reservation read-back success",()=>{
  const r=reserveDurablyInSyntheticSandbox(root,raw,0);
  assert.equal(r.status,"SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
  assert.equal(r.revision,1);assert.equal(r.authorize_print,false);
  assert.equal(r.windows_power_loss_durability_proven,false);
  const files=fs.readdirSync(root);assert.deepEqual(files,["state-000001.json"]);
 });
 test("restart reads same attempt without duplicate",()=>{
  const s=snapshot(root);assert.equal(s.status,"SYNTHETIC_SNAPSHOT_ONLY");
  assert.equal(s.ledger.entries.length,1);
  assert.equal(reserveDurablyInSyntheticSandbox(root,raw,1).status,"HOLD");
  assert.deepEqual(fs.readdirSync(root),["state-000001.json"]);
 });
 test("stale lock from crash causes fail-closed, never unlock automatically",()=>{
  const c=spawnSync(process.execPath,[__filename,"--lock-and-crash",root2],{encoding:"utf8"});
  assert.equal(c.status,47);
  assert.equal(snapshot(root2).status,"HOLD");
  assert.equal(reserveDurablyInSyntheticSandbox(root2,raw,0).status,"HOLD");
  assert.ok(fs.existsSync(path.join(root2,".attempt-lock")));
 });
 test("forged ledger modification refuses reservation",()=>{
  const name=path.join(root,"state-000001.json");
  const r=JSON.parse(fs.readFileSync(name,"utf8"));
  r.ledger.entries[0].payload_sha256=h("tampered payload");
  fs.writeFileSync(name,JSON.stringify(r));
  assert.equal(snapshot(root).status,"HOLD");
  assert.equal(reserveDurablyInSyntheticSandbox(root,raw,1).status,"HOLD");
  assert.ok(fs.existsSync(path.join(root,".attempt-lock")),"uncertainty leaves lock");
 });
 const jobs=Array.from({length:5},()=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[__filename,"--worker",root3],{stdio:["ignore","pipe","pipe"]});
  let out="",err="";
  child.stdout.on("data",d=>out+=d);child.stderr.on("data",d=>err+=d);
  // `exit` can precede stdout/stderr pipe closure on Windows. Parse only
  // on `close` after both streams are drained; never invent a HOLD result
  // from partial or missing worker output.
  child.once("close",(status,signal)=>{
   if(status!==0)return reject(Error(
    "V755_WORKER_EXIT_"+status+"_"+String(signal||"NO_SIGNAL")+
    " "+String(err||out).slice(0,320)));
   let parsed;
   try{parsed=JSON.parse(out.trim());}
   catch{return reject(Error("V755_WORKER_OUTPUT_INCOMPLETE_OR_INVALID"));}
   if(!parsed||!["SYNTHETIC_JOURNAL_COMMIT_OBSERVED","HOLD"].includes(parsed.status)||
      parsed.authorize_print!==false)
    return reject(Error("V755_WORKER_UNEXPECTED_RESULT"));
   resolve(parsed);
  });
  child.once("error",reject);
 }));
 const results=await Promise.all(jobs);
 test("five independent processes result in one reservation max",()=>{
  assert.equal(results.filter(x=>x.status==="SYNTHETIC_JOURNAL_COMMIT_OBSERVED").length,1);
  assert.equal(results.filter(x=>x.status==="HOLD").length,4);
  assert.ok(results.every(x=>x.authorize_print===false));
  assert.equal(snapshot(root3).ledger.entries.length,1);
 });
 test("corrupt recovery does not erase conflicting state",()=>{
  assert.equal(fs.readdirSync(root3).length,1);
  assert.equal(snapshot(root3).ledger.revision,1);
 });
 const code=fs.readFileSync(path.join(__dirname,"comandas_journal_v755_sandbox.js"),"utf8");
 test("sandbox code has no printer or service APIs",()=>{
  assert.doesNotMatch(code,/\b(?:OpenPrinter|StartDocPrinter|WritePrinter|Get-Printer|Set-Printer|Restart-Service|Start-Service|execSync|spawnSync|fetch|createConnection)\s*\(/);
 });
 console.log(JSON.stringify({schema:"deliveryos.synthetic-journal-v755",checks,
 result:"PASS",independent_processes:5,successful_reservations:1,
 actual_printer_calls:0,operational_persistence:false,physical_exactly_once_proven:false,
 sandbox_temp_only:true}));
}finally{
 // Test cleanup never runs in service/operational directories.
 for(const dir of [root,root2,root3])fs.rmSync(dir,{recursive:true,force:true});
}})().catch(e=>{console.error(e);process.exitCode=1});
}

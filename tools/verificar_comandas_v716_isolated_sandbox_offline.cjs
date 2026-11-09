"use strict";
/**
 * Actual offhost Node process test. A temp-only copy of the V7.16 consumer
 * is executed with deliberately fictional order + rule files. Never touches
 * Windows cash register, SQL, actual printer, source order or external network.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const original=fs.readFileSync(path.join(root,
 "runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs"));
const candidate=fs.readFileSync(path.join(root,
 "runtime/shadow/live_shadow_consumer_v2_candidate_v716_isolated_REVIEW_ONLY.cjs"));
const blob=x=>crypto.createHash("sha1").update("blob "+x.length+"\0").update(x).digest("hex");
const sha256=x=>crypto.createHash("sha256").update(x).digest("hex");
const note="PRIVATE_FAKE_NOTE_MUST_NOT_REACH_PUBLIC_STDOUT";
let count=0;
function check(name,fn){fn();count++;console.log("PASS "+count+" "+name);}
check("frozen legacy V714 unchanged",()=>{
 assert.equal(blob(original),"8e75fea85437d063c2f6ee2df09ee33962d42ce6");
 assert.notEqual(blob(candidate),blob(original));
});
check("new fork has no operational state access or full-result stdout",()=>{
 const s=candidate.toString("utf8");
 assert.doesNotMatch(s,/ProgramData.{0,90}TataComandaReader/s);
 assert.doesNotMatch(s,/process\.stdout\.write\s*\(\s*JSON\.stringify\s*\(\s*result\s*\)/);
 assert.match(s,/OFFHOST_DISPOSABLE_LAB_ROOT_REQUIRED/);
 assert.match(s,/LAB_ITAIM_NATIVE_IFOOD_SCOPE_INVALID/);
 assert.match(s,/OFFHOST_LAB_ONLY_NO_PRODUCTION_SEQUENCE/);
 assert.match(s,/fs\.openSync\(target,"wx",0o600\)/);
 assert.match(s,/fs\.lstatSync\(root\)\.isSymbolicLink\(\)/);
 assert.doesNotMatch(s,/require\(["'](?:node:)?(?:net|http|https|child_process|serialport)["']\)/);
});
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),"comandas-v716-sandbox-"));
const consumer=path.join(sandbox,"consumer.cjs");
const eventDir=path.join(sandbox,"isolated-events");
const outDir=path.join(sandbox,"isolated-decisions");
const eventPath=path.join(eventDir,"fake-event.json");
const decisionPath=path.join(outDir,"fake-decision.json");
const write=(p,data)=>fs.writeFileSync(path.join(sandbox,p),
 JSON.stringify(data)+"\n",{encoding:"utf8",mode:0o600});
const event={
 schema:"deliveryos.tata-reader-stable-order-event.v1",
 order_key:"0001|01|FAKESALE|FAKEORDER",
 snapshot_hash:"a".repeat(64),
 ready_for_downstream_shadow:false,
 blockers:["NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ"],
 service_resolution:{service:null,evidence:"UNKNOWN",source_ref:null,
  blockers:["BUSINESS_FINALITY_NOT_PROVEN"]},
 order:{
  CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"FAKESALE",
  NRCOMANDA:"FAKEORDER",NRCOMANDAEXT:"1234",IDORGCMDVENDA:"DLV_IFO",
  IDSTCOMANDA:"3",DTHRABERMESA:"2026-11-09T11:30:00",
  observation_scan_complete:false,
  observation_rows:[{scope_hint:"item",source_field:"DSOBSDESCIT",
   value:note,item_index:0,CDPRODUTO:"FPROD",join_proven:true}],
  items:[{NRPRODCOMVEN:"000001",CDPRODUTO:"FPROD",
   CDARVPROD:"9100507200",QTPRODCOMVEN:"1.000",IDSTPRCOMVEN:"4"}]
 }};
const run=(p=eventPath,out=null)=>spawnSync(process.execPath,
 [consumer,p,...(out?[out]:[])],{encoding:"utf8",timeout:15000,
  env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
try{
 fs.mkdirSync(eventDir);fs.mkdirSync(outDir);
 fs.copyFileSync(path.join(root,
  "runtime/shadow/live_shadow_consumer_v2_candidate_v716_isolated_REVIEW_ONLY.cjs"),consumer);
 const motor=fs.readFileSync(path.join(root,
  "tools/fixtures/canonical-packaging-v63-pinned.js"));
 check("canonical motor copied byte-for-byte before child execution",()=>{
  assert.equal(blob(motor),"3167c309f02a0ad5a84fb43043b8866e3bee873c");
  assert.equal(sha256(motor),"1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e");
 });
 fs.writeFileSync(path.join(sandbox,"packaging-current.js"),motor);
 write("product-identity-cache-v1.json",{
  schema:"deliveryos.product-identity-cache.v1",
  rows:[{CDPRODUTO:"FPROD",canonical:"9.10.05.072.00",NMPRODUTO:"FAKE DUPLA"}]});
 write("app-data.json",{products:[]});
 write("product-aliases-v1.json",{
  schema:"deliveryos.academia-live-product-aliases.v1",
  aliases:[{live_name:"FAKE DUPLA",canonical_code:"9.10.05.072.00",
   classification:{family:"dupla",station:"duplas",review_required:false}}]});
 write("human-order-overrides-v1.json",{
  schema:"deliveryos.human-exact-order-overrides.v1",orders:[]});
 write("routing.json",{
  schema:"deliveryos.odhen.product-routing.compact.v1",
  products:{"9.10.05.072.00":["00009"]}});
 write("printer-map.json",{
  schema:"deliveryos.runtime-printer-map.v1",
  mappings:[{printer_code:"00009",printer_name:"FAKE_STATION",printer_ip:null}]});
 write("non-production.json",{items:{}});
 fs.writeFileSync(eventPath,JSON.stringify(event),{mode:0o600});
 check("real child executes synthetic candidate with private decision confined",()=>{
  const v=run(eventPath,decisionPath);
  assert.equal(v.status,5,v.stderr);
  assert.equal(v.stderr,"",v.stderr);
  const publicLine=JSON.parse(v.stdout.trim());
  assert.equal(publicLine.schema,"tata.comandas.v716-offhost-lab-result.v1");
  assert.equal(publicLine.status,"HOLD");
  assert.equal(publicLine.synthetic_only,true);
  assert.equal(publicLine.print_authorized,false);
  assert.equal(publicLine.private_decision_written,true);
  assert.ok(!v.stdout.includes(note));
  assert.ok(!v.stdout.includes("FAKESALE"));
  assert.equal(fs.existsSync(decisionPath),true);
  const privateResult=JSON.parse(fs.readFileSync(decisionPath,"utf8"));
  assert.equal(privateResult.ready,false);
  assert.ok(privateResult.blocking_reasons.includes(
   "OFFHOST_LAB_ONLY_NO_PRODUCTION_SEQUENCE"));
  assert.equal(privateResult.effects.print,false);
  assert.equal(privateResult.effects.database_read,false);
  assert.equal(privateResult.order_observations.length,0);
  assert.equal(privateResult.items.length,1);
  assert.equal(privateResult.items[0].observations[0].value,note);
 });
 check("existing output is never overwritten",()=>{
  const before=fs.readFileSync(decisionPath);
  const v=run(eventPath,decisionPath);
  assert.notEqual(v.status,0);
  assert.equal(fs.readFileSync(decisionPath).equals(before),true);
 });
 check("foreign store is denied before rules or decision creation",()=>{
  const wrong=structuredClone(event);wrong.order.CDLOJA="02";
  wrong.order_key="0001|02|FAKESALE|FAKEORDER";
  const other=path.join(eventDir,"foreign.json");
  fs.writeFileSync(other,JSON.stringify(wrong));
  const out=path.join(outDir,"foreign-decision.json");
  const v=run(other,out);
  assert.notEqual(v.status,0);
  assert.match(v.stderr,/LAB_ITAIM_NATIVE_IFOOD_SCOPE_INVALID/);
  assert.ok(!v.stderr.includes(note));
  assert.equal(fs.existsSync(out),false);
 });
 check("native-origin mismatch is denied before decision creation",()=>{
  const wrong=structuredClone(event);wrong.order.IDORGCMDVENDA="DLV_OTHER";
  const source=path.join(eventDir,"non-ifood.json");
  fs.writeFileSync(source,JSON.stringify(wrong));
  const out=path.join(outDir,"non-ifood-decision.json");
  const v=run(source,out);
  assert.notEqual(v.status,0);
  assert.match(v.stderr,/LAB_ITAIM_NATIVE_IFOOD_SCOPE_INVALID/);
  assert.equal(fs.existsSync(out),false);
 });
 check("input outside sandbox is not accessible",()=>{
  const v=run(path.join(os.tmpdir(),"not-in-this-lab.json"));
  assert.notEqual(v.status,0);
  assert.match(v.stderr,/LAB_FILE_OUTSIDE_SANDBOX/);
 });
 check("output outside sandbox is rejected without creating file",()=>{
  const dest=path.join(os.tmpdir(),
   "comandas-v716-no-output-"+crypto.randomBytes(5).toString("hex")+".json");
  const v=run(eventPath,dest);
  assert.notEqual(v.status,0);
  assert.equal(fs.existsSync(dest),false);
 });
 check("no output request never writes decision and logs only safe summary",()=>{
  const entries=fs.readdirSync(outDir);
  const v=run();
  assert.equal(v.status,5,v.stderr);
  assert.equal(v.stderr,"");
  const r=JSON.parse(v.stdout.trim());
  assert.equal(r.private_decision_written,false);
  assert.equal(fs.readdirSync(outDir).join("|"),entries.join("|"));
  assert.ok(!v.stdout.includes(note));
 });
}finally{
 fs.rmSync(sandbox,{recursive:true,force:true});
}
check("disposable lab root removed",()=>assert.equal(fs.existsSync(sandbox),false));
if(count!==11)throw Error("V716_ISOLATED_OFFHOST_TEST_COUNT_"+count);
console.log("COMANDAS_V716_ISOLATED_SANDBOX_TEST_PASS "+count+"/"+count+
 " SYNTHETIC_ONLY NO_CAIXA_NO_SQL_NO_PRINT");
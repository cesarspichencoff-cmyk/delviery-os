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
 assert.match(s,/LAB_NATIVE_SNAPSHOT_HASH_INVALID_NO_OUTPUT/);
 assert.match(s,/OFFHOST_LAB_ONLY_NO_PRODUCTION_SEQUENCE/);
 assert.equal(s.includes('fs.openSync(tmp,"wx",0o600)'),true);
 assert.equal(s.includes('fs.fsyncSync(handle)'),true);
 assert.equal(s.includes('fs.linkSync(tmp,target)'),true);
 assert.equal(s.includes('fs.unlinkSync(tmp)'),true);
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
// Same canonical header/item/note basis as the Reader V2 verifier; this
// deliberately does NOT claim independent authenticity or complete commit.
function syntheticSnapshotHash(order){
 const keys=["CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA",
  "NRCOMANDAEXT","IDORGCMDVENDA","IDSTCOMANDA","DTHRABERMESA"];
 const itemKeys=["NRPRODCOMVEN","CDPRODUTO","CDARVPROD",
  "QTPRODCOMVEN","IDSTPRCOMVEN"];
 const basis={};
 for(const key of keys)basis[key]=order[key];
 basis.items=order.items.map(item=>{
  const row={};for(const key of itemKeys)row[key]=item[key];return row;
 });
 if(order.observation_rows.length)basis.observation_rows=order.observation_rows;
 return sha256(JSON.stringify(basis));
}
event.snapshot_hash=syntheticSnapshotHash(event.order);
const run=(p=eventPath,out=null)=>spawnSync(process.execPath,
 [consumer,p,...(out?[out]:[])],{encoding:"utf8",timeout:15000,
  env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
try{
 fs.mkdirSync(eventDir);fs.mkdirSync(outDir);
 fs.copyFileSync(path.join(root,
  "runtime/shadow/live_shadow_consumer_v2_candidate_v716_isolated_REVIEW_ONLY.cjs"),consumer);
 fs.copyFileSync(path.join(root,
  "data/comandas_cesar_clarificacoes_20261101_review_only.json"),
  path.join(sandbox,"human-clarifications.json"));
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
 check("mutated item quantity with stale source hash is rejected before output",()=>{
  const fake=structuredClone(event);
  fake.order.items[0].QTPRODCOMVEN="2.000";
  const input=path.join(eventDir,"mutated-quantity.json");
  const output=path.join(outDir,"mutated-quantity.json");
  fs.writeFileSync(input,JSON.stringify(fake));
  const result=run(input,output);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/LAB_NATIVE_SNAPSHOT_HASH_INVALID_NO_OUTPUT/);
  assert.equal(fs.existsSync(output),false);
  assert.equal(result.stdout,"");
 });
 check("mutated note with stale source hash is rejected without leaking it",()=>{
  const fake=structuredClone(event);
  fake.order.observation_rows[0].value="PRIVATE_CHANGED_FAKE_NOTE";
  const input=path.join(eventDir,"mutated-note.json");
  const output=path.join(outDir,"mutated-note.json");
  fs.writeFileSync(input,JSON.stringify(fake));
  const result=run(input,output);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/LAB_NATIVE_SNAPSHOT_HASH_INVALID_NO_OUTPUT/);
  assert.ok(!result.stderr.includes("PRIVATE_CHANGED_FAKE_NOTE"));
  assert.equal(fs.existsSync(output),false);
  assert.equal(result.stdout,"");
 });
 check("duplicate native product ID fails closed instead of last-win",()=>{
  const file=path.join(sandbox,"product-identity-cache-v1.json");
  const original=fs.readFileSync(file);
  try{
    const data=JSON.parse(original);
    data.rows.push({...data.rows[0],canonical:"9.99.99.999.99"});
    fs.writeFileSync(file,JSON.stringify(data));
    const output=path.join(outDir,"duplicate-native-id.json");
    const p=run(eventPath,output);
    assert.notEqual(p.status,0);
    assert.match(p.stderr,/LAB_NATIVE_PRODUCT_DUPLICATE_KEY_HOLD/);
    assert.equal(fs.existsSync(output),false);
    assert.equal(p.stdout,"");
  }finally{fs.writeFileSync(file,original);}
 });
 check("duplicate normalized Academy name is never silently substituted",()=>{
  const file=path.join(sandbox,"app-data.json");
  const original=fs.readFileSync(file);
  try{
    fs.writeFileSync(file,JSON.stringify({products:[
     {nome:"FAKE DUPLA",classification:{family:"dupla",review_required:false}},
     {nome:"fake dupla",classification:{family:"bebida",review_required:false}}
    ]}));
    const output=path.join(outDir,"duplicate-academy-name.json");
    const p=run(eventPath,output);
    assert.notEqual(p.status,0);
    assert.match(p.stderr,/LAB_ACADEMY_PRODUCT_NAME_DUPLICATE_KEY_HOLD/);
    assert.equal(fs.existsSync(output),false);
    assert.equal(p.stdout,"");
  }finally{fs.writeFileSync(file,original);}
 });
 check("duplicate alias is never used as arbitrary classification",()=>{
  const file=path.join(sandbox,"product-aliases-v1.json");
  const original=fs.readFileSync(file);
  try{
    const data=JSON.parse(original);
    data.aliases.push({...data.aliases[0],live_name:"fake dupla",
      classification:{family:"bebida",review_required:false}});
    fs.writeFileSync(file,JSON.stringify(data));
    const output=path.join(outDir,"duplicate-alias.json");
    const p=run(eventPath,output);
    assert.notEqual(p.status,0);
    assert.match(p.stderr,/LAB_APPROVED_ALIAS_NAME_DUPLICATE_KEY_HOLD/);
    assert.equal(fs.existsSync(output),false);
    assert.equal(p.stdout,"");
  }finally{fs.writeFileSync(file,original);}
 });
 check("malformed private JSON has sanitized stderr and no decision",()=>{
  const input=path.join(eventDir,"malformed-note.json");
  const output=path.join(outDir,"malformed-private.json");
  const secret="PRIVATE_FAKE_CONTENT_MUST_NOT_ESCAPE_JSON_PARSE";
  fs.writeFileSync(input,'{"schema":"broken","note":"'+secret+'",');
  const result=run(input,output);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/LAB_JSON_SOURCE_INVALID/);
  assert.ok(!result.stderr.includes(secret));
  assert.equal(result.stdout,"");
  assert.equal(fs.existsSync(output),false);
 });
 check("stale interrupted temp file is never promoted as final decision",()=>{
  const output=path.join(outDir,"new-atomic-decision.json");
  const stale=output+".tmp-STALE_PARTIAL_FICTION";
  fs.writeFileSync(stale,'{"incomplete":');
  try{
    const result=run(eventPath,output);
    assert.equal(result.status,5,result.stderr);
    assert.equal(result.stderr,"");
    const decision=JSON.parse(fs.readFileSync(output,"utf8"));
    assert.equal(decision.ready,false);
    assert.equal(decision.effects.print,false);
    assert.equal(fs.readFileSync(stale,"utf8"),'{"incomplete":');
    assert.equal(fs.readdirSync(outDir).some(n=>
      n.startsWith("new-atomic-decision.json.tmp-")&&n!==
       path.basename(stale)),false);
  }finally{fs.unlinkSync(stale);}
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
 check("Cesar's tartar enters isolated shadow without printer authority",()=>{
  const files=["product-identity-cache-v1.json","product-aliases-v1.json",
   "routing.json","printer-map.json"];
  const original=files.map(f=>[f,fs.readFileSync(path.join(sandbox,f))]);
  try{
   write("product-identity-cache-v1.json",{
    schema:"deliveryos.product-identity-cache.v1",
    rows:[{CDPRODUTO:"FPROD",canonical:"9.10.05.050.00",
     NMPRODUTO:"TARTAR DE SALMAO"}]});
   write("product-aliases-v1.json",{
    schema:"deliveryos.academia-live-product-aliases.v1",aliases:[]});
   write("routing.json",{
    schema:"deliveryos.odhen.product-routing.compact.v1",
    products:{"9.10.05.050.00":["00006"]}});
   write("printer-map.json",{
    schema:"deliveryos.runtime-printer-map.v1",
    mappings:[{printer_code:"00006",printer_name:"FAKE_SUSHI_2",printer_ip:null}]});
   const fictional=structuredClone(event);
   fictional.order.items[0].CDARVPROD="9100505000";
   fictional.snapshot_hash=syntheticSnapshotHash(fictional.order);
   const source=path.join(eventDir,"tartar-human.json");
   const target=path.join(outDir,"tartar-human.json");
   fs.writeFileSync(source,JSON.stringify(fictional));
   const runResult=run(source,target);
   assert.equal(runResult.status,5,runResult.stderr);
   assert.equal(runResult.stderr,"");
   const result=JSON.parse(fs.readFileSync(target,"utf8"));
   assert.equal(result.ready,false);
   assert.equal(result.items[0].classification_source,
    "CESAR_EXACT_HUMAN_RULE_REVIEW_ONLY");
   assert.equal(result.items[0].classification.station,"enrolados_quentes");
   assert.equal(result.items[0].classification.family,"ITEM_FRIO");
   assert.equal(result.effects.print,false);
   assert.ok(result.blocking_reasons.includes(
    "LAB_REVISION_NOT_INDEPENDENTLY_AUTHENTICATED"));
   assert.ok(!runResult.stdout.includes("TARTAR DE SALMAO"));
  }finally{for(const [file,bytes] of original)
   fs.writeFileSync(path.join(sandbox,file),bytes);}
 });
 check("same human rule rejects conflicting printer area",()=>{
  const files=["product-identity-cache-v1.json","product-aliases-v1.json",
   "routing.json","printer-map.json"];
  const original=files.map(f=>[f,fs.readFileSync(path.join(sandbox,f))]);
  try{
   write("product-identity-cache-v1.json",{
    schema:"deliveryos.product-identity-cache.v1",
    rows:[{CDPRODUTO:"FPROD",canonical:"9.10.05.050.00",
     NMPRODUTO:"TARTAR DE SALMAO"}]});
   write("product-aliases-v1.json",{
    schema:"deliveryos.academia-live-product-aliases.v1",aliases:[]});
   write("routing.json",{
    schema:"deliveryos.odhen.product-routing.compact.v1",
    products:{"9.10.05.050.00":["00002"]}});
   write("printer-map.json",{
    schema:"deliveryos.runtime-printer-map.v1",
    mappings:[{printer_code:"00002",printer_name:"FAKE_KITCHEN",printer_ip:null}]});
   const fictional=structuredClone(event);
   fictional.order.items[0].CDARVPROD="9100505000";
   fictional.snapshot_hash=syntheticSnapshotHash(fictional.order);
   const source=path.join(eventDir,"tartar-invalid-route.json");
   const target=path.join(outDir,"tartar-invalid-route.json");
   fs.writeFileSync(source,JSON.stringify(fictional));
   const runResult=run(source,target);
   assert.equal(runResult.status,5,runResult.stderr);
   assert.equal(runResult.stderr,"");
   const result=JSON.parse(fs.readFileSync(target,"utf8"));
   assert.equal(result.ready,false);
   assert.equal(result.items[0].classification_source,null);
   assert.ok(result.blocking_reasons.includes(
    "CLASSIFICATION_UNKNOWN_9.10.05.050.00"));
   assert.equal(result.effects.print,false);
  }finally{for(const [file,bytes] of original)
   fs.writeFileSync(path.join(sandbox,file),bytes);}
 });
 check("real pinned Itaim routing remains dual-role HOLD on fictional order",()=>{
  const sources=[
   ["routing.json","data/odhen_product_routing_compact_v1.json",
    "d7d4d25bcb882370a37cf748d2d79139b07159a0"],
   ["printer-map.json","data/runtime_printer_map_v1.json",
    "24a3b068598798209f7d9f8492c9cbb3aa973dab"],
   ["non-production.json","data/non_production_delivery_items_v1.json",
    "e14326430770551e132bf6e0f8b54376dee56e6a"]
  ];
  for(const [target,source,expected] of sources){
   const bytes=fs.readFileSync(path.join(root,source));
   assert.equal(blob(bytes),expected,source);
   fs.writeFileSync(path.join(sandbox,target),bytes);
  }
  const output=path.join(outDir,"real-config-fake-order.json");
  const child=run(eventPath,output);
  assert.equal(child.status,5,child.stderr);
  assert.equal(child.stderr,"");
  assert.ok(!child.stdout.includes(note));
  const decision=JSON.parse(fs.readFileSync(output,"utf8"));
  assert.equal(decision.ready,false);
  assert.ok(decision.blocking_reasons.includes(
   "SUSHI1_DUAL_PRODUCTION_ROLE_UNPROVEN_9.10.05.072.00"));
  assert.deepEqual(decision.items[0].targets,[]);
  assert.equal(decision.effects.print,false);
  assert.equal(decision.effects.spooler_write,false);
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
if(count!==21)throw Error("V716_ISOLATED_OFFHOST_TEST_COUNT_"+count);
console.log("COMANDAS_V716_ISOLATED_SANDBOX_TEST_PASS "+count+"/"+count+
 " SYNTHETIC_ONLY NO_CAIXA_NO_SQL_NO_PRINT");
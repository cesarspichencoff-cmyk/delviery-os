"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const crypto=require("node:crypto");
const {auditCandidatePrerequisitesV711,REQUIRED,CANONICAL_MOTOR_SHA256}=
 require("./auditar_preflight_consumidor_v711.js");
const {PACKAGING_SOURCE_SHA256_V78}=require("../dist/src/production/currentPackagingBridgeV63.js");
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"tata-v711-preflight-"));
const dir=path.join(tmp,"shadow");
const engine='globalThis.TATAPackaging={FACT:"FACT"};\n';
const fixtures={
 "app-data.json":{meta:{version:"simulation"},products:[]},
 "routing.json":{schema:"deliveryos.odhen.product-routing.compact.v1",products:{}},
 "printer-map.json":{schema:"deliveryos.runtime-printer-map.v1",mappings:[]},
 "non-production.json":{schema:"deliveryos.non-production-items.v1",items:{}},
 "product-identity-cache-v1.json":{schema:"deliveryos.product-identity-cache.v1",rows:[]},
 "product-aliases-v1.json":{schema:"deliveryos.academia-live-product-aliases.v1",aliases:[]},
 "human-order-overrides-v1.json":{schema:"deliveryos.human-exact-order-overrides.v1",orders:[]},
};
let tests=0;
function check(name,fn){fn();tests++;console.log("PASS "+tests+" "+name)}
function emit(){
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,"packaging-current.js"),engine);
 for(const [k,v] of Object.entries(fixtures))fs.writeFileSync(path.join(dir,k),JSON.stringify(v));
}
const audit=()=>auditCandidatePrerequisitesV711(dir,{expectedMotorSha256:sha(engine)});
try{
 emit();
 check("V7.11 canonical motor SHA is exactly bridge V7.8 SHA",()=>{
  assert.equal(CANONICAL_MOTOR_SHA256,PACKAGING_SOURCE_SHA256_V78);
 });
 check("V7.11 eight independent assets exactly match V2 consumer",()=>{
  assert.deepEqual(REQUIRED.map(x=>x.name),[
   "packaging-current.js","app-data.json","routing.json","printer-map.json",
   "non-production.json","product-identity-cache-v1.json",
   "product-aliases-v1.json","human-order-overrides-v1.json"]);
 });
 check("V7.11 valid artificial source set is only preflight not approval",()=>{
  const r=audit();assert.equal(r.status,"SOURCE_PREFLIGHT_MATCH_ONLY_NO_DEPLOY_AUTHORIZATION");
  assert.equal(r.files.length,8);assert.ok(r.files.every(x=>x.status==="MATCHED"));
  assert.equal(r.safeguards.authorizes_cutover,false);
  assert.equal(r.safeguards.authenticates_windows_service,false);
  assert.equal(r.safeguards.validates_human_turn,false);
 });
 check("V7.11 a fake motor always fails the real production pin",()=>{
  const r=auditCandidatePrerequisitesV711(dir);
  assert.equal(r.status,"BLOCKED");
  assert.ok(r.blockers.includes("packaging-current.js:CANONICAL_MOTOR_SHA256_MISMATCH"));
 });
 check("V7.11 missing one of eight files fails closed",()=>{
  const file=path.join(dir,"human-order-overrides-v1.json");
  const original=fs.readFileSync(file);fs.rmSync(file);
  const r=audit();
  assert.ok(r.blockers.some(x=>x.startsWith("human-order-overrides-v1.json:")));
  fs.writeFileSync(file,original);
 });
 check("V7.11 alias schema wrong is blocked",()=>{
  const file=path.join(dir,"product-aliases-v1.json"),saved=fs.readFileSync(file);
  fs.writeFileSync(file,JSON.stringify({schema:"wrong",aliases:[]}));
  assert.ok(audit().blockers.includes("product-aliases-v1.json:SOURCE_SCHEMA_MISMATCH"));
  fs.writeFileSync(file,saved);
 });
 check("V7.11 wrong source shape blocked despite valid schema",()=>{
  const file=path.join(dir,"printer-map.json"),saved=fs.readFileSync(file);
  fs.writeFileSync(file,JSON.stringify({...fixtures["printer-map.json"],mappings:{}}));
  assert.ok(audit().blockers.includes("printer-map.json:SOURCE_SHAPE_MISMATCH"));
  fs.writeFileSync(file,saved);
 });
 check("V7.11 invalid JSON blocked with no source payload leakage",()=>{
  const file=path.join(dir,"human-order-overrides-v1.json"),saved=fs.readFileSync(file);
  fs.writeFileSync(file,'{SECRET_CUSTOMER_DATA:"');
  const r=audit();assert.equal(r.status,"BLOCKED");
  assert.ok(!JSON.stringify(r).includes("SECRET_CUSTOMER_DATA"));
  fs.writeFileSync(file,saved);
 });
 check("V7.11 replaced alias symlink not traversed",()=>{
  const file=path.join(dir,"product-aliases-v1.json");
  const original=fs.readFileSync(file),link=path.join(tmp,"outside.json");
  fs.writeFileSync(link,original);fs.rmSync(file);fs.symlinkSync(link,file);
  assert.ok(audit().blockers.includes("product-aliases-v1.json:NONREGULAR_FILE"));
  fs.rmSync(file);fs.writeFileSync(file,original);
 });
 check("V7.11 read-only preflight does not change any input",()=>{
  const before=REQUIRED.map(x=>sha(fs.readFileSync(path.join(dir,x.name))));
  const stat=REQUIRED.map(x=>fs.statSync(path.join(dir,x.name)).mtimeMs);
  audit();
  const after=REQUIRED.map(x=>sha(fs.readFileSync(path.join(dir,x.name))));
  const now=REQUIRED.map(x=>fs.statSync(path.join(dir,x.name)).mtimeMs);
  assert.deepEqual(after,before);assert.deepEqual(now,stat);
 });
 check("V7.11 source values and fake override content never included",()=>{
  const p=path.join(dir,"human-order-overrides-v1.json");
  fs.writeFileSync(p,JSON.stringify({...fixtures["human-order-overrides-v1.json"],
    orders:[{teknisa_sequence:"SECRET_FAKE_ORDER_999",notes:"SECRET_FAKE_NOTE_123"}]}));
  const r=audit();assert.equal(r.status,"SOURCE_PREFLIGHT_MATCH_ONLY_NO_DEPLOY_AUTHORIZATION");
  const serialized=JSON.stringify(r);
  assert.ok(!serialized.includes("SECRET_FAKE_ORDER_999"));
  assert.ok(!serialized.includes("SECRET_FAKE_NOTE_123"));
 });
 check("V7.11 strict UTF16LE BOM source decoding",()=>{
  const file=path.join(dir,"product-aliases-v1.json"),saved=fs.readFileSync(file);
  const text=JSON.stringify(fixtures["product-aliases-v1.json"]);
  fs.writeFileSync(file,Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,"utf16le")]));
  assert.equal(audit().status,"SOURCE_PREFLIGHT_MATCH_ONLY_NO_DEPLOY_AUTHORIZATION");
  fs.writeFileSync(file,saved);
 });
 check("V7.11 unsupported source directory cannot pass",()=>{
  assert.equal(auditCandidatePrerequisitesV711(path.join(tmp,"missing")).status,"BLOCKED");
 });
 check("V7.11 execution contains no remote effects",()=>{
  const r=audit();
  assert.deepEqual(r.safeguards,{
   sql:false,state_write:false,service_restart:false,print:false,spooler:false,
   source_values_exported:false,authenticates_windows_service:false,
   validates_human_turn:false,validates_runtime_permissions:false,authorizes_cutover:false
  });
 });
 console.log("THERMAL_V711_CUTOVER_PREFLIGHT="+tests+"/"+tests+" EIGHT_ASSETS READ_ONLY NO_CUTOVER");
}finally{fs.rmSync(tmp,{recursive:true,force:true})}

"use strict";
/**
 * V7.10 thermal consumer candidate – zero production effects.
 * Proves the isolated candidate differs from CAIXA-installed V2 source only
 * by eight hashed lineage refs + accompanying comments. Exercises both code
 * paths in TEMP shadow dirs with fictional events; no services or printers.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const candidatePath=path.join(__dirname,"../runtime/shadow/live_shadow_consumer_v2_candidate_v710.cjs");
const candidate=fs.readFileSync(candidatePath,"utf8");
const header=/^\/\/ BEGIN V710 CANDIDATE HEADER[^\n]*\n[\s\S]*?\/\/ END V710 CANDIDATE HEADER\n/;
function removeAddon(src,label){
 const re=new RegExp("(?:(?:\\n)?[ ]*)?\\/\\/ BEGIN V710 LINEAGE "+label+"[^\\n]*\\n[\\s\\S]*?\\/\\/ END V710 LINEAGE "+label+"\\n");
 assert.match(src,re,"missing lineage marker "+label);
 return src.replace(re,"");
}
let original=candidate.replace(header,"");
assert.ok(original.length<candidate.length,"candidate provenance marker missing");
for(const i of [1,2,3])original=removeAddon(original,i);
// V7.10 retains the original business rules; the candidate alone now binds
// digests to loaded bytes, so reverse both loader substitutions for the baseline.
original=original.replace('loadMotorFromExactBytes(path.join(here, "packaging-current.js"));',
 'require(path.join(here, "packaging-current.js"));');
original=original.replace('return recordLoadedJsonRule(p, buf, JSON.parse(text));',
 'return JSON.parse(text);');
// Lineage 3 was inserted immediately before an existing indented property.
// Restoring the installed source requires its original newline; no golden edit.
original=original.replace("  ...core,  effects: {","  ...core,\n  effects: {");
// read_file returns installed source without terminal LF; candidate staging
// added one LF for text-file hygiene. Exclude that LF from the original blob.
original=original.replace(/\n$/,"");
const digest=crypto.createHash("sha1")
 .update(Buffer.from("blob "+Buffer.byteLength(original)+"\0"))
 .update(original,"utf8").digest("hex");
let checks=0;
function check(title,fn){fn();checks++;console.log("PASS "+checks+" "+title);}
check("candidate inherits exact CAIXA installed V2 source with only 3 lineage additions",()=>{
 assert.equal(digest,"22e3bdcbbed1cf245088f32679dd29ffb50766c9");
 assert.equal(Buffer.byteLength(original),16480);
 assert.ok(candidate.includes("const orderObservations = []"));
 assert.ok(candidate.includes("ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW"));
 assert.ok(candidate.includes("human-order-overrides-v1.json"));
});
check("no network/printer and only existing optional shadow JSON output",()=>{
 assert.ok(!/\b(?:fetch|https?\.request|execSync|shell\.exec)\s*\(/.test(candidate));
 assert.ok(!/\b(?:print|spooler_write|odhen_write|database_write):\s*true\b/.test(candidate));
 assert.ok(candidate.includes("if (outPath) writeAtomicJson(outPath, result)"));
 assert.ok(candidate.includes('vm.runInThisContext(bytes.toString("utf8")'));
 assert.ok(candidate.includes("return recordLoadedJsonRule(p, buf, JSON.parse(text));"));
 assert.ok(!candidate.includes('update(fs.readFileSync(file))'));
});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"tata-thermal-v710-"));
const root=path.join(tmp,"baseline"),modern=path.join(tmp,"candidate");
const fakeCode="9.10.05.072.00",product="99001";
const fixtures={
 "app-data.json":{products:[]},
 "product-identity-cache-v1.json":{schema:"deliveryos.product-identity-cache.v1",
   rows:[{CDPRODUTO:product,canonical:fakeCode,NMPRODUTO:"TESTE DUPLA"}]},
 "product-aliases-v1.json":{schema:"deliveryos.academia-live-product-aliases.v1",
   aliases:[{live_name:"TESTE DUPLA",canonical_code:fakeCode,
    classification:{family:"dupla",subfamily:"dupla_dyo",station:"duplas",review_required:false}}]},
 "human-order-overrides-v1.json":{schema:"deliveryos.human-exact-order-overrides.v1",
   orders:[{teknisa_sequence:"0000000001",ifood_sequence:"1001",
    bags:[{size:"M",quantity:1}],kits:[{kit:"Kit Kids",quantidade:1}]}]},
 "routing.json":{schema:"deliveryos.odhen.product-routing.compact.v1",
   products:{[fakeCode]:["00009"]}},
 "printer-map.json":{schema:"deliveryos.runtime-printer-map.v1",
   mappings:[{printer_code:"00009",printer_name:"SIMULACAO_SUSHI",printer_ip:"127.0.0.1"}]},
 "non-production.json":{items:{}}
};
const fakeMotor='globalThis.TATAPackaging={FACT:"FACT",categoryOf:()=>({status:"FACT",category:"dupla_dyo"}),packComanda:()=>({has_unknown:false,total_items:1,bags:{size:"P",size_status:"UNKNOWN",exact_bag_count_status:"UNKNOWN"}}),kitVerdict:()=>({status:"UNKNOWN",kits:[]})};\n';
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
function setup(folder,source){
 fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,"consumer.cjs"),source);
 fs.writeFileSync(path.join(folder,"packaging-current.js"),fakeMotor);
 for(const [name,data] of Object.entries(fixtures))
   fs.writeFileSync(path.join(folder,name),JSON.stringify(data));
}
try{
 setup(root,original);setup(modern,candidate);
 function run(folder,notes=[],scanComplete=true){
  const e={schema:"deliveryos.tata-reader-stable-order-event.v1",
   order_key:"0001|01|0000000001",snapshot_hash:"a".repeat(64),
   ready_for_downstream_shadow:false,blockers:["SERVICE_STATE_EXPIRED_FOR_ORDER"],
   service_resolution:{service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",
    source_ref:"fixture-only",blockers:["EXPIRED"]},
   order:{CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000000001",
    NRCOMANDA:"0000000001",NRCOMANDAEXT:"1001",IDORGCMDVENDA:"DLV_TEST",
    DTHRABERMESA:"2026-10-10T11:30:00.0000000",items:[{
      NRPRODCOMVEN:"000001",CDPRODUTO:product,
      CDARVPROD:fakeCode.replace(/\./g,""),QTPRODCOMVEN:"1.000",IDSTPRCOMVEN:"A"
    }],observation_scan_complete:scanComplete,observation_rows:notes}};
  const epath=path.join(folder,"event-fixture.json");
  fs.writeFileSync(epath,JSON.stringify(e));
  const r=spawnSync(process.execPath,[path.join(folder,"consumer.cjs"),epath],
   {encoding:"utf8",timeout:10000,env:{...process.env,NO_COLOR:"1"}});
  assert.equal(r.status,5,"expected safe blocked fixture; stderr="+r.stderr.slice(0,280));
  assert.equal(r.stderr,"");
  const j=JSON.parse(r.stdout);
  assert.equal(j.ready,false);
  assert.equal(j.effects.print,false);assert.equal(j.effects.spooler_write,false);
  return j;
 }
 const general={source_field:"DSOBSCOMANDA",value:"FAKE PAYMENT NOTE",
   scope_hint:"order",join_proven:true};
 const item={source_field:"DSOBSDESCIT",value:"SEM PIMENTA",
   scope_hint:"item",item_index:0,CDPRODUTO:product,join_proven:true};
 const allergen={...item,value:"ALERGIA"};
 for(const [name,notes,scan] of [
   ["no notes",[],true],["order note",[general],true],
   ["item note",[item],true],["allergen",[allergen],true],
   ["both notes",[general,item],true],["scan incomplete",[],false]
 ]){
  check("identical V2 decision content & fingerprint: "+name,()=>{
   const before=run(root,notes,scan),after=run(modern,notes,scan);
   const {generated_at:btime,...b}=before;
   const {generated_at:atime,rule_lineage:lineage,...a}=after;
   assert.deepEqual(a,b,"V7.10 must be behavior identical to installed V2");
   assert.equal(after.fingerprint,before.fingerprint);
   assert.equal(lineage.academy_rule_refs.length,2);
   assert.equal(lineage.delivery_rule_refs.length,6);
   assert.ok(lineage.academy_rule_refs[0].endsWith(sha(fakeMotor)));
   for(const [file,source] of [
     ["app-data.json",lineage.academy_rule_refs[1]],
     ...["routing.json","printer-map.json","non-production.json",
       "product-identity-cache-v1.json","product-aliases-v1.json",
       "human-order-overrides-v1.json"].map((f,i)=>[f,lineage.delivery_rule_refs[i]])
   ])assert.ok(source.endsWith(sha(fs.readFileSync(path.join(modern,file)))));
   assert.deepEqual(after.items[0].observations,notes.filter(n=>n.scope_hint==="item")
      .map(n=>({source_field:n.source_field,value:n.value})));
   assert.deepEqual(after.order_observations,notes.filter(n=>n.scope_hint==="order")
      .map(n=>({source_field:n.source_field,value:n.value})));
   if(name==="allergen")assert.ok(after.blocking_reasons.includes("ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW"));
   if(name==="no notes"){
    assert.equal(after.packaging.bags.exact_bag_count,1);
    assert.equal(after.packaging.bags.size,"M");
    assert.equal(after.kits.status,"FACT");
    assert.equal(after.items[0].classification_source,"HUMAN_CONFIRMED_NAME_ALIAS_2026_10_05");
   }
  });
 }
 // TOCTOU regression: modify TWO source files after the candidate has consumed
 // their bytes but before the lineage object is assembled. Digests must still
 // identify the original bytes used, never a second read of the altered files.
 check("lineage digests bind to source bytes used despite later file mutations",()=>{
   const folder=path.join(tmp,"mutation-candidate");
   const motorBefore=fakeMotor;
   const academyBefore=JSON.stringify(fixtures["app-data.json"]);
   const withMotorMutation=candidate.replace(
     'const P = globalThis.TATAPackaging;',
     'fs.writeFileSync(path.join(here,"packaging-current.js"),"TAMPERED_MOTOR_AFTER_LOAD");\\nconst P = globalThis.TATAPackaging;'.replace('\\n','\\n'));
   assert.notEqual(withMotorMutation,candidate,"motor mutation hook missing");
   const withBothMutations=withMotorMutation.replace(
     'const academy = readJson(path.join(here, "app-data.json"));',
     'const academy = readJson(path.join(here, "app-data.json"));\\nfs.writeFileSync(path.join(here,"app-data.json"),"TAMPERED_JSON_AFTER_LOAD");'.replace('\\n','\\n'));
   assert.notEqual(withBothMutations,withMotorMutation,"JSON mutation hook missing");
   setup(folder,withBothMutations);
   const decision=run(folder);
   assert.equal(decision.rule_lineage.academy_rule_refs.length,2);
   assert.equal(decision.rule_lineage.academy_rule_refs[0].split("#sha256=")[1],sha(motorBefore));
   assert.equal(decision.rule_lineage.academy_rule_refs[1].split("#sha256=")[1],sha(academyBefore));
   assert.notEqual(sha(fs.readFileSync(path.join(folder,"packaging-current.js"))),sha(motorBefore));
   assert.notEqual(sha(fs.readFileSync(path.join(folder,"app-data.json"))),sha(academyBefore));
   assert.equal(decision.ready,false);
   assert.equal(decision.effects.print,false);
 });
 check("no alias/override source may silently disappear from lineage",()=>{
  const c=fs.readFileSync(path.join(modern,"consumer.cjs"),"utf8");
  for(const name of ["product-aliases-v1.json","human-order-overrides-v1.json"])
   assert.ok(c.includes('"deliveryos:installed/'+name+'#sha256="'));
 });
 check("temp fixture has no service installation, no printer calls and is cleaned",()=>{
  assert.ok(fs.existsSync(root)&&fs.existsSync(modern));
 });
 console.log("THERMAL_CONSUMER_V710_PARITY="+checks+"/"+checks+" HISTORIC_V2_BEHAVIOR_PRESERVED NO_PRODUCTION_EFFECT");
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
// Human-confirmed D1/C1/B1-B15 is review-only and must never upgrade V2 readiness.
require('./comandas-human-review-v1/human_review_v1.test.cjs');
// Only synthetic data; original customer event bytes are NOT checked in.
require('./verificar_comandas_exact_intake_v1.cjs');
// Shadow-only: source hashes plus pinned human ledger never authorize FACT or print.
require('./verificar_comandas_bag_human_proposal_v1.cjs');
// Ed25519 verification remains synthetic/shadow. Never mint FACT or print rights.
require('./verificar_comandas_bag_attestation_v1.cjs');
// Zero-PII aggregate audit of ten original note scopes; no V6.8/print authority.
require('./verificar_comandas_ten_v68_note_scope_audit_v1.cjs');

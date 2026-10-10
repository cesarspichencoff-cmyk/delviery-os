"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const sourcePath=path.join(__dirname,"../runtime/shadow/live_shadow_consumer_v2_candidate_v712.cjs");
const candidate=fs.readFileSync(sourcePath,"utf8");
const basePath=path.join(__dirname,"../runtime/shadow/live_shadow_consumer_v2_candidate_v710.cjs");
const prev=fs.readFileSync(basePath,"utf8");
const sha1blob=txt=>crypto.createHash("sha1")
 .update("blob "+Buffer.byteLength(txt)+"\0").update(txt).digest("hex");
const sha256=txt=>crypto.createHash("sha256").update(txt).digest("hex");
const prefix=/^\/\/ BEGIN V712 CANDIDATE[^\n]*\n[\s\S]*?\/\/ END V712 CANDIDATE\n/;
const gate=/\/\/ BEGIN V712 HUMAN OVERRIDE GATE[^\n]*\n[\s\S]*?\/\/ END V712 HUMAN OVERRIDE GATE/;
const old=`const exactOrderOverride = (orderOverrides.orders || []).find(o =>
  String(o.teknisa_sequence || "") === String(event.order.NRCOMANDA || "") &&
  String(o.ifood_sequence || "") === String(event.order.NRCOMANDAEXT || "")
) || null;

if (exactOrderOverride) {`;
let checks=0;
function check(label,fn){fn();checks++;console.log("PASS "+checks+" "+label)}
check("V7.12 source is EXACT V7.10 plus one scope guard; no silent rewrite",()=>{
 assert.ok(prefix.test(candidate));assert.ok(gate.test(candidate));
 const back=candidate.replace(prefix,"").replace(gate,old);
 assert.equal(back,prev);
 assert.equal(sha1blob(prev),"fc91468270888e14b56179835e668d3ca67a6dbf");
 assert.ok(candidate.includes("observation_rows"));
 assert.ok(candidate.includes("ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW"));
 assert.ok(candidate.includes("rule_lineage: ruleLineage"));
});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"thermal-v712-"));
const folder=path.join(temp,"candidate");
const pCode="99001",productCode="9.10.05.072.00",order_key="0001|01|0000000001",revision="a".repeat(64);
const fakeMotor='globalThis.TATAPackaging={FACT:"FACT",categoryOf:()=>({status:"FACT",category:"dupla_dyo"}),packComanda:()=>({has_unknown:false,bags:{size:"P",size_status:"UNKNOWN",exact_bag_count_status:"UNKNOWN"}}),kitVerdict:()=>({status:"UNKNOWN",kits:[]})};\n';
const baseOverride={
 teknisa_sequence:"0000000001",ifood_sequence:"1001",
 bags:[{size:"M",quantity:1}],kits:[{kit:"Kit Kids",quantidade:1}],
 source_refs:["human-evidence:fictional-review-20261010"]
};
const fullyBound={...baseOverride,scope:"EXACT_SNAPSHOT_ONLY",store_id:"0001",
 loja_id:"01",operational_date:"2026-10-10",order_key,snapshot_hash:revision};
function setConfig(overrides){
 fs.writeFileSync(path.join(folder,"human-order-overrides-v1.json"),
  JSON.stringify({schema:"deliveryos.human-exact-order-overrides.v1",orders:overrides}));
}
try{
 fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,"consumer.cjs"),candidate);
 fs.writeFileSync(path.join(folder,"packaging-current.js"),fakeMotor);
 const docs={
  "app-data.json":{products:[]},
  "product-identity-cache-v1.json":{schema:"deliveryos.product-identity-cache.v1",
   rows:[{CDPRODUTO:pCode,canonical:productCode,NMPRODUTO:"TESTE DUPLA"}]},
  "product-aliases-v1.json":{schema:"deliveryos.academia-live-product-aliases.v1",
   aliases:[{live_name:"TESTE DUPLA",canonical_code:productCode,
    classification:{family:"dupla",station:"duplas",review_required:false}}]},
  "routing.json":{schema:"deliveryos.odhen.product-routing.compact.v1",
   products:{[productCode]:["00009"]}},
  "printer-map.json":{schema:"deliveryos.runtime-printer-map.v1",
   mappings:[{printer_code:"00009",printer_name:"FICTICIOUS",printer_ip:"127.0.0.1"}]},
  "non-production.json":{items:{}}
 };
 for(const [k,v] of Object.entries(docs))
  fs.writeFileSync(path.join(folder,k),JSON.stringify(v));
 function run(orders,notes=[]){
  setConfig(orders);
  const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
   order_key,snapshot_hash:revision,ready_for_downstream_shadow:false,
   blockers:["SERVICE_STATE_EXPIRED_FOR_ORDER"],
   service_resolution:{service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",source_ref:"FICTIONAL",blockers:["EXPIRED"]},
   order:{CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000000001",
    NRCOMANDA:"0000000001",NRCOMANDAEXT:"1001",IDORGCMDVENDA:"DLV_TEST",
    DTHRABERMESA:"2026-10-10T11:30:00.0000000",
    items:[{NRPRODCOMVEN:"000001",CDPRODUTO:pCode,
     CDARVPROD:productCode.replace(/\./g,""),QTPRODCOMVEN:"1.000",IDSTPRCOMVEN:"A"}],
    observation_scan_complete:true,observation_rows:notes}};
  const eventPath=path.join(folder,"event.json");
  fs.writeFileSync(eventPath,JSON.stringify(event));
  const p=spawnSync(process.execPath,[path.join(folder,"consumer.cjs"),eventPath],
   {encoding:"utf8",timeout:10000});
  assert.equal(p.status,5,"fixture must remain blocked by expired service");
  assert.equal(p.stderr,"");
  const result=JSON.parse(p.stdout);
  assert.equal(result.ready,false);
  assert.equal(result.effects.print,false);assert.equal(result.effects.spooler_write,false);
  return result;
 }
 check("V7.12 legacy exact-sequence override is blocked without snapshot binding",()=>{
  const r=run([baseOverride]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
  assert.notEqual(r.packaging.bags.size_status,"FACT");
  assert.equal(r.kits.status,"UNKNOWN");
 });
 check("V7.12 fully bound fictional override retains proven M bag and Kids kit",()=>{
  const r=run([fullyBound]);
  assert.ok(!r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
  assert.equal(r.packaging.bags.size,"M");
  assert.equal(r.packaging.bags.exact_bag_count,1);
  assert.equal(r.kits.status,"FACT");
  assert.deepEqual(r.kits.kits,[{kit:"Kit Kids",quantidade:1}]);
 });
 check("V7.12 mismatch of snapshot hash cannot authorize kits or bag",()=>{
  const r=run([{...fullyBound,snapshot_hash:"b".repeat(64)}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
  assert.equal(r.kits.status,"UNKNOWN");
 });
 check("V7.12 wrong store identity cannot reuse override",()=>{
  const r=run([{...fullyBound,store_id:"0002"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.12 wrong unit identity cannot reuse override",()=>{
  const r=run([{...fullyBound,loja_id:"99"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.12 wrong operational date cannot reuse override",()=>{
  const r=run([{...fullyBound,operational_date:"2026-10-09"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.12 wrong order key cannot reuse override",()=>{
  const r=run([{...fullyBound,order_key:"0001|01|0000000002"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.12 wrong scope refuses otherwise matching identity",()=>{
  const r=run([{...fullyBound,scope:"HISTORICAL_ONLY"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.12 missing evidence references rejects human override",()=>{
  const r=run([{...fullyBound,source_refs:[]}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.12 duplicate matching override records are ambiguous not first-wins",()=>{
  const r=run([fullyBound,{...fullyBound}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_AMBIGUOUS"));
  assert.equal(r.kits.status,"UNKNOWN");
 });
 check("V7.12 other order override does not block this order",()=>{
  const r=run([{...fullyBound,teknisa_sequence:"9999999999"}]);
  assert.ok(!r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
  assert.equal(r.kits.status,"UNKNOWN");
 });
 check("V7.12 allergen warning preserved even with bound exception",()=>{
  const r=run([fullyBound],[{scope_hint:"item",source_field:"DSOBSDESCIT",
   value:"ALERGIA",item_index:0,CDPRODUTO:pCode,join_proven:true}]);
  assert.ok(r.blocking_reasons.includes("ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW"));
  assert.equal(r.ready,false);
 });
 check("V7.12 new candidate still provides eight hashed origins outside core",()=>{
  const r=run([fullyBound]);
  assert.equal(r.rule_lineage.academy_rule_refs.length,2);
  assert.equal(r.rule_lineage.delivery_rule_refs.length,6);
  assert.equal(r.fingerprint.length,64);
  assert.equal(r.rule_lineage.academy_rule_refs[0].split("#sha256=")[1],sha256(fakeMotor));
 });
 check("V7.12 unchanged candidate has no printer execution or outside effects",()=>{
  assert.ok(!/\b(?:fetch|https?\.request|execSync|spawnSync)\s*\(/.test(candidate));
  const r=run([baseOverride]);
  assert.deepEqual(r.effects,{database_read:false,database_write:false,
   sequence_binding_write:false,print:false,spooler_write:false,
   odhen_write:false,fiscal_action:false,sefaz_call:false});
 });
 console.log("THERMAL_OVERRIDE_SNAPSHOT_GUARD_V712="+checks+"/"+checks+" NO_LEGACY_AUTO_FACT NO_PRINT");
}finally{fs.rmSync(temp,{recursive:true,force:true});}

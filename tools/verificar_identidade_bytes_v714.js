"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
// Reuse the existing V6.8 gate, not a second validator.
const {verifyLiveReaderPairV68}=require("../dist/src/production/stableReaderShadowPairV68.js");
const sourcePath=path.join(__dirname,"../runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs");
const candidate=fs.readFileSync(sourcePath,"utf8");
const v712=fs.readFileSync(path.join(__dirname,
 "../runtime/shadow/live_shadow_consumer_v2_candidate_v712.cjs"),"utf8");
const header713="// END V713 CANDIDATE\n";
const headerEnd=candidate.indexOf(header713);
assert.ok(headerEnd>0);
const stripped=candidate.slice(headerEnd+header713.length);
const start713="// BEGIN V713 INDEPENDENT AUTHORITY BOUNDARY";
const end713="// END V713 INDEPENDENT AUTHORITY BOUNDARY";
const newAt=stripped.indexOf(start713);
const newEnd=stripped.indexOf(end713)+end713.length;
const oldAt=v712.indexOf("if (exactOrderOverride && exactOverrideBound) {");
const oldEnd=v712.indexOf("\nif (!packaging) {",oldAt);
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
check("V7.14 rule-lineage uses bytes consumed, original note/override gates intact",()=>{
 assert.ok(candidate.startsWith("// BEGIN V714 CANDIDATE"));
 assert.ok(candidate.includes("sourceDigestV714.set(path.resolve(p)"));
 assert.ok(candidate.includes("PACKAGING_ENGINE_CHANGED_DURING_LOAD"));
 assert.ok(candidate.includes("HUMAN_ORDER_OVERRIDE_ATTESTATION_NOT_VERIFIED"));
 assert.ok(candidate.includes("ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW"));
 assert.ok(candidate.includes("rule_lineage: ruleLineage"));
});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"thermal-v714-"));
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
 function run(orders,notes=[],qty="1.000",extraQty=undefined,withPair=false){
  setConfig(orders);
  const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
   order_key,snapshot_hash:revision,ready_for_downstream_shadow:false,
   blockers:["SERVICE_STATE_EXPIRED_FOR_ORDER"],
   service_resolution:{service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",source_ref:"FICTIONAL",blockers:["EXPIRED"]},
   order:{CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000000001",
    NRCOMANDA:"0000000001",NRCOMANDAEXT:"1001",IDORGCMDVENDA:"DLV_TEST",
    DTHRABERMESA:"2026-10-10T11:30:00.0000000",
    items:[{NRPRODCOMVEN:"000001",CDPRODUTO:pCode,
     CDARVPROD:productCode.replace(/\./g,""),QTPRODCOMVEN:qty,IDSTPRCOMVEN:"A"},
     ...(extraQty===undefined ? [] : [{
      NRPRODCOMVEN:"000002",CDPRODUTO:pCode,
      CDARVPROD:productCode.replace(/\./g,""),
      QTPRODCOMVEN:extraQty,IDSTPRCOMVEN:"A"
     }])],
    observation_scan_complete:true,observation_rows:notes}};
  if(withPair){
   // Exactly the watched V2 snapshot schema and key insertion order.
   // Note rows affect the SHA only when nonempty. Source is fictional and offline.
   event.order.IDSTCOMANDA="A";
   const o=event.order;
   const snapshot={CDFILIAL:o.CDFILIAL,CDLOJA:o.CDLOJA,
    NRVENDAREST:o.NRVENDAREST,NRCOMANDA:o.NRCOMANDA,
    NRCOMANDAEXT:o.NRCOMANDAEXT,IDORGCMDVENDA:o.IDORGCMDVENDA,
    IDSTCOMANDA:o.IDSTCOMANDA,DTHRABERMESA:o.DTHRABERMESA,
    items:o.items.map(item=>({
     NRPRODCOMVEN:item.NRPRODCOMVEN,CDPRODUTO:item.CDPRODUTO,
     CDARVPROD:item.CDARVPROD,QTPRODCOMVEN:item.QTPRODCOMVEN,
     IDSTPRCOMVEN:item.IDSTPRCOMVEN
    }))};
   // Watcher V2 hashes the canonical mapped row keys, not arbitrary input
   // object insertion order. Match inspectV2WatcherNotesV76 exactly.
   if(notes.length)snapshot.observation_rows=notes.map(row=>(
    row.scope_hint==="item"
     ? {source_field:row.source_field,value:row.value,
        item_index:row.item_index,CDPRODUTO:row.CDPRODUTO,
        scope_hint:"item",join_proven:true}
     : {source_field:row.source_field,value:row.value,
        scope_hint:"order",join_proven:true}
   ));
   event.snapshot_hash=sha256(JSON.stringify(snapshot));
  }
  const eventPath=path.join(folder,"event.json");
  fs.writeFileSync(eventPath,JSON.stringify(event));
  const p=spawnSync(process.execPath,[path.join(folder,"consumer.cjs"),eventPath],
   {encoding:"utf8",timeout:10000});
  assert.equal(p.status,5,"fixture must remain blocked by expired service");
  assert.equal(p.stderr,"");
  const result=JSON.parse(p.stdout);
  assert.equal(result.ready,false);
  assert.equal(result.effects.print,false);assert.equal(result.effects.spooler_write,false);
  return withPair?{event,decision:result}:result;
 }
 check("V7.14 legacy exact-sequence override is blocked without snapshot binding",()=>{
  const r=run([baseOverride]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
  assert.notEqual(r.packaging.bags.size_status,"FACT");
  assert.equal(r.kits.status,"UNKNOWN");
 });
 check("V7.14 even a fully matching self-declared review does NOT create FACT",()=>{
  const r=run([fullyBound]);
  assert.ok(!r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_ATTESTATION_NOT_VERIFIED"));
  assert.equal(r.packaging.bags.size_status,"UNKNOWN");
  assert.equal(r.kits.status,"UNKNOWN");
  assert.equal(r.ready,false);
 });
 check("V7.14 mismatch of snapshot hash cannot authorize kits or bag",()=>{
  const r=run([{...fullyBound,snapshot_hash:"b".repeat(64)}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
  assert.equal(r.kits.status,"UNKNOWN");
 });
 check("V7.14 wrong store identity cannot reuse override",()=>{
  const r=run([{...fullyBound,store_id:"0002"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.14 wrong unit identity cannot reuse override",()=>{
  const r=run([{...fullyBound,loja_id:"99"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.14 wrong operational date cannot reuse override",()=>{
  const r=run([{...fullyBound,operational_date:"2026-10-09"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.14 wrong order key cannot reuse override",()=>{
  const r=run([{...fullyBound,order_key:"0001|01|0000000002"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.14 wrong scope refuses otherwise matching identity",()=>{
  const r=run([{...fullyBound,scope:"HISTORICAL_ONLY"}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.14 missing evidence references rejects human override",()=>{
  const r=run([{...fullyBound,source_refs:[]}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
 });
 check("V7.14 duplicate matching override records are ambiguous not first-wins",()=>{
  const r=run([fullyBound,{...fullyBound}]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_AMBIGUOUS"));
  assert.equal(r.kits.status,"UNKNOWN");
 });
 check("V7.14 other order override does not block this order",()=>{
  const r=run([{...fullyBound,teknisa_sequence:"9999999999"}]);
  assert.ok(!r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_NOT_BOUND_TO_EXACT_SNAPSHOT"));
  assert.equal(r.kits.status,"UNKNOWN");
 });
 check("V7.14 allergen warning preserved even with bound exception",()=>{
  const r=run([fullyBound],[{scope_hint:"item",source_field:"DSOBSDESCIT",
   value:"ALERGIA",item_index:0,CDPRODUTO:pCode,join_proven:true}]);
  assert.ok(r.blocking_reasons.includes("ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW"));
  assert.equal(r.ready,false);
 });
 check("V7.14 new candidate still provides eight hashed origins outside core",()=>{
  const r=run([fullyBound]);
  assert.equal(r.rule_lineage.academy_rule_refs.length,2);
  assert.equal(r.rule_lineage.delivery_rule_refs.length,6);
  assert.equal(r.fingerprint.length,64);
  assert.equal(r.rule_lineage.academy_rule_refs[0].split("#sha256=")[1],sha256(fakeMotor));
 });
 check("V7.14 unchanged candidate has no printer execution or outside effects",()=>{
  assert.ok(!/\b(?:fetch|https?\.request|execSync|spawnSync)\s*\(/.test(candidate));
  const r=run([baseOverride]);
  assert.deepEqual(r.effects,{database_read:false,database_write:false,
   sequence_binding_write:false,print:false,spooler_write:false,
   odhen_write:false,fiscal_action:false,sefaz_call:false});
 });

 check("V7.14 notes and human exceptions remain blocked after source-snapshot guard",()=>{
  const row={source_field:"DSOBSCOMANDA",scope_hint:"order",
   value:"FAKE GENERAL REQUIRES REVIEW",join_proven:true};
  const r=run([fullyBound],[row]);
  assert.ok(r.blocking_reasons.includes("HUMAN_ORDER_OVERRIDE_ATTESTATION_NOT_VERIFIED"));
  assert.deepEqual(r.order_observations,[{source_field:"DSOBSCOMANDA",value:row.value}]);
  assert.equal(r.kits.status,"UNKNOWN");
 });
 check("V7.14 a rule file changing after it was read cannot falsify input digest",()=>{
  const target=path.join(folder,"product-aliases-v1.json");
  const original=fs.readFileSync(target),old=sha256(original);
  const preloader=path.join(folder,"mutation-shim.cjs");
  const shim="const fs=require('node:fs'),path=require('node:path');"+
   "const old=fs.readFileSync.bind(fs),file="+JSON.stringify(target)+";"+
   "let used=false;fs.readFileSync=function(p,...a){const buf=old(p,...a);"+
   "if(!used&&path.resolve(String(p))===path.resolve(file)){used=true;"+
   "fs.writeFileSync(file,JSON.stringify({schema:'deliveryos.academia-live-product-aliases.v1',aliases:[]}));}"+
   "return buf;};";
  fs.writeFileSync(preloader,shim);
  setConfig([fullyBound]);
  const eventPath=path.join(folder,"event.json");
  const proc=spawnSync(process.execPath,["-r",preloader,path.join(folder,"consumer.cjs"),eventPath],
    {encoding:"utf8",timeout:10000});
  assert.equal(proc.status,5,proc.stderr);
  const r=JSON.parse(proc.stdout);
  const declared=r.rule_lineage.delivery_rule_refs.find(x=>x.startsWith(
    "deliveryos:installed/product-aliases-v1.json#sha256=")).split("=")[1];
  assert.equal(declared,old);
  assert.notEqual(sha256(fs.readFileSync(target)),declared);
  fs.writeFileSync(target,original);
 });
 check("V7.14 motor replacement between load and verification aborts consumer",()=>{
  const target=path.join(folder,"packaging-current.js");
  const original=fs.readFileSync(target);
  const sh=path.join(folder,"motor-mutation-shim.cjs");
  fs.writeFileSync(sh,"const fs=require('node:fs'),path=require('node:path');"+
   "const read=fs.readFileSync.bind(fs),file="+JSON.stringify(target)+";"+
   "let used=false;fs.readFileSync=function(p,...a){const bytes=read(p,...a);"+
   "if(!used&&path.resolve(String(p))===path.resolve(file)){used=true;"+
   "fs.writeFileSync(file,'globalThis.TATAPackaging={FACT:123};');}"+
   "return bytes;};");
  const eventPath=path.join(folder,"event.json");
  const proc=spawnSync(process.execPath,["-r",sh,path.join(folder,"consumer.cjs"),eventPath],
    {encoding:"utf8",timeout:10000});
  assert.notEqual(proc.status,0);
  assert.ok(proc.stderr.includes("PACKAGING_ENGINE_CHANGED_DURING_LOAD"),proc.stderr.slice(0,400));
  assert.equal(proc.stdout,"");
  fs.writeFileSync(target,original);
 });
 // V7.18: same V6.8 raw quantity grammar, enforced at the V2 consumer boundary.
 check("V7.18 malformed raw quantities never invent a unit, packaging or kit",()=>{
  for(const raw of ["0","0.000","-1","-2.000","1.5","2.100","3,0","1e3",
   "Infinity","NaN","abc",""," "," 1.000","1.000 ","1.00001",
   "9007199254740992",null,1,0,true,{},[]]){
   const r=run([],[],raw);
   assert.equal(r.ready,false,"invalid input cannot be ready");
   assert.ok(r.blocking_reasons.includes("RAW_ITEM_QUANTITY_INVALID:1"),
     "missing quantity blocker on "+JSON.stringify(raw));
   assert.ok(r.blocking_reasons.includes("PACKAGING_SKIPPED_INVALID_RAW_QUANTITY"));
   assert.equal(r.items.length,0,"invalid input yielded an item");
   assert.equal(r.packaging,null,"invalid input yielded packaging");
   assert.equal(r.kits,null,"invalid input yielded kits");
   assert.equal(r.effects.print,false);
   assert.equal(r.effects.spooler_write,false);
  }
 });
 check("V7.18 one valid plus one invalid item must not yield partial boxes or kits",()=>{
  for(const [first,second,position] of [
   ["1.000","0",2],["-1","2.000",1],
   ["3.000","1.5",2],["abc","1.000",1]
  ]){
   const r=run([],[],first,second);
   assert.equal(r.ready,false);
   assert.ok(r.blocking_reasons.includes("RAW_ITEM_QUANTITY_INVALID:"+position));
   assert.ok(r.blocking_reasons.includes("PACKAGING_SKIPPED_INVALID_RAW_QUANTITY"));
   assert.equal(r.items.length,1,"only the valid item may be retained for audit");
   assert.equal(r.packaging,null,"no partial order packaging can be FACT");
   assert.equal(r.kits,null,"no partial order kit can be FACT");
   assert.equal(r.effects.print,false);assert.equal(r.effects.spooler_write,false);
  }
 });
 check("V7.18 retains exact positive integer formats already accepted by V6.8",()=>{
  for(const [raw,expected] of [["1",1],["1.0",1],["1.000",1],
   ["0002.000",2],["17",17],["9007199254740991",9007199254740991]]){
   const r=run([],[],raw);
   assert.equal(r.items.length,1,JSON.stringify(raw));
   assert.equal(r.items[0].quantity,expected);
   assert.ok(!r.blocking_reasons.some(x=>x.startsWith("RAW_ITEM_QUANTITY_INVALID:")));
   assert.equal(r.ready,false,"expired fixture cannot authorize output");
  }
 });
 check("V7.18 quantity parser matches V6.8 gate and preserves zero effects",()=>{
  const source=fs.readFileSync(path.join(__dirname,
   "../src/production/stableReaderShadowPairV68.ts"),"utf8");
  const quantityContract=String.raw`if(typeof s!=="string"||!/^\d+(?:\.0+)?$/.test(s))return null;`;
  assert.ok(source.includes(quantityContract),"V6.8 contract drift");
  const candidateContract=String.raw`if(typeof raw!=="string" || !/^\d+(?:\.0+)?$/.test(raw)) return null;`;
  assert.ok(candidate.includes(candidateContract),"candidate quantity contract drift");
  assert.ok(!candidate.includes("Math.max(1, Number(raw.QTPRODCOMVEN) || 1)"));
  const r=run([],[],"0");
  assert.deepEqual(r.effects,{database_read:false,database_write:false,
   sequence_binding_write:false,print:false,spooler_write:false,
   odhen_write:false,fiscal_action:false,sefaz_call:false});
 });

 // Exercise the actual V2 child process and the existing V6.8 verifier
 // using exactly the same offline event and decision (not handmade decisions).
 check("V7.19 consumer V2 -> V6.8 same revision has no artificial identity drift",()=>{
  const pair=run([],[],"1.000",undefined,true);
  assert.equal(pair.event.snapshot_hash,pair.decision.snapshot_hash);
  assert.equal(pair.event.order_key,pair.decision.order_key);
  const verdict=verifyLiveReaderPairV68(pair.event,pair.decision);
  assert.equal(verdict.status,"BLOCKED");
  for(const unexpected of [
   "SHADOW_DECISION_EVENT_REVISION_MISMATCH",
   "WATCHER_V2_NOTE_SNAPSHOT_HASH_MISMATCH",
   "SHADOW_DECISION_CONTENT_FINGERPRINT_MISMATCH",
   "SHADOW_DECISION_ORDER_IDENTIFIERS_MISMATCH",
  ])assert.ok(!verdict.reasons.includes(unexpected),unexpected);
  assert.ok(verdict.reasons.includes("EVENT_OR_DECISION_NOT_READY_FOR_SHADOW"));
  assert.ok(verdict.reasons.includes("SHADOW_DECISION_PACKAGING_SOURCE_NOT_PINNED_V78"),
   "fake motor must never authenticate as current academy packaging");
  assert.equal(verdict.effects.print,false);
  assert.equal(verdict.effects.spooler,false);
 });
 check("V7.19 stale V2 decision from same order but different quantity is rejected",()=>{
  const original=run([],[],"1.000",undefined,true);
  const updated=run([],[],"2.000",undefined,true);
  assert.equal(original.event.order_key,updated.event.order_key);
  assert.notEqual(original.event.snapshot_hash,updated.event.snapshot_hash);
  for(const [event,decision] of [
   [original.event,updated.decision],[updated.event,original.decision]
  ]){
   const verdict=verifyLiveReaderPairV68(event,decision);
   assert.equal(verdict.status,"BLOCKED");
   assert.ok(verdict.reasons.includes("SHADOW_DECISION_EVENT_REVISION_MISMATCH"));
   assert.ok(verdict.reasons.some(x=>x.startsWith(
    "READER_EVENT_DECISION_PRODUCT_IDENTITY_OR_QUANTITY_MISMATCH")));
   assert.equal(verdict.effects.print,false);
  }
 });
 check("V7.19 event or consumer decision mutation is independently caught by V6.8",()=>{
  const pair=run([],[],"1.000",undefined,true);
  const changedEvent=structuredClone(pair.event);
  changedEvent.order.items[0].QTPRODCOMVEN="4.000";
  const e=verifyLiveReaderPairV68(changedEvent,pair.decision);
  assert.ok(e.reasons.includes("WATCHER_V2_NOTE_SNAPSHOT_HASH_MISMATCH"));
  const changedDecision=structuredClone(pair.decision);
  changedDecision.items[0].quantity=4;
  const d=verifyLiveReaderPairV68(pair.event,changedDecision);
  assert.ok(d.reasons.includes("SHADOW_DECISION_CONTENT_FINGERPRINT_MISMATCH"));
  assert.ok(d.reasons.some(x=>x.startsWith(
   "READER_EVENT_DECISION_PRODUCT_IDENTITY_OR_QUANTITY_MISMATCH")));
  assert.equal(d.effects.print,false);
 });
 check("V7.19 item observation remains bound to same V2 snapshot and text",()=>{
  const note={source_field:"DSOBSDESCIT",scope_hint:"item",
   value:"SEM PIMENTA",item_index:0,CDPRODUTO:pCode,join_proven:true};
  const pair=run([],[note],"1.000",undefined,true);
  const ok=verifyLiveReaderPairV68(pair.event,pair.decision);
  assert.equal(ok.status,"BLOCKED");
  assert.ok(!ok.reasons.includes("WATCHER_V2_NOTE_SNAPSHOT_HASH_MISMATCH"));
  assert.ok(!ok.reasons.includes("WATCHER_V2_OBSERVATIONS_NOT_IDENTICAL_IN_DECISION"));
  const altered=structuredClone(pair.event);
  altered.order.observation_rows[0].value="COM PIMENTA";
  const blocked=verifyLiveReaderPairV68(altered,pair.decision);
  assert.ok(blocked.reasons.includes("WATCHER_V2_NOTE_SNAPSHOT_HASH_MISMATCH"));
  assert.equal(blocked.effects.print,false);
 });

 // V7.20: exercise the new pinned offline ENTRYPOINT, not just a detached
 // pair verifier. No separately supplied decision or optional gate switch.
 const gatePath=path.join(__dirname,"gerar_tres_vias_v2_gate_v720_offline.js");
 const gateText=fs.readFileSync(gatePath,"utf8");
 const gateArgs=()=>["--event",path.join(folder,"event.json"),
  "--consumer",path.join(folder,"consumer.cjs"),
  "--proof",path.join(folder,"proof.json"),
  "--motor",path.join(folder,"packaging-current.js")];
 const runGate=args=>spawnSync(process.execPath,[gatePath,...args],{
  encoding:"utf8",timeout:20000});
 check("V7.20 mandatory V6.8 call precedes every ticket rendering path",()=>{
  assert.ok(gateText.includes("verifyLiveReaderPairV68(event,decision)"));
  assert.ok(gateText.indexOf("const result=verifyLiveReaderPairV68(event,decision)")<
   gateText.indexOf("return renderVerifiedOffline(["));
  assert.ok(!gateText.includes("ready_for_operational_print:true"));
  assert.ok(!gateText.includes("spooler_write:true"));
  assert.ok(!gateText.includes("print_authorized:true"));
 });
 check("V7.21 unpinned executable motor cannot run even once before validation",()=>{
  // V7.19 above already proves the real V2 child -> real V6.8 on this
  // blocked fictional fixture. The V7.21 gate rejects its fake executable
  // module BEFORE spawn, so this scenario must stop at SOURCE_PREFLIGHT.
  run([],[],"1.000",undefined,true);
  fs.writeFileSync(path.join(folder,"proof.json"),"{}");
  const motorPath=path.join(folder,"packaging-current.js");
  const original=fs.readFileSync(motorPath);
  const canary=path.join(folder,"should-not-exist.v721");
  try{
   fs.writeFileSync(motorPath,
    "require('node:fs').writeFileSync("+JSON.stringify(canary)+",'BAD');"+fakeMotor);
   const p=runGate(gateArgs());
   assert.equal(p.status,2,p.stderr);
   const r=JSON.parse(p.stdout.trim());
   assert.equal(r.status,"BLOCKED");
   assert.equal(r.stage,"SOURCE_PREFLIGHT");
   assert.ok(r.reasons.includes("CANONICAL_PACKAGING_MOTOR_SOURCE_NOT_PINNED_BEFORE_EXEC"));
   assert.equal(fs.existsSync(canary),false,"unpinned motor executed before source pin");
   assert.deepEqual(r.outputs,[]);
   assert.equal(r.effects.print,false);
   assert.equal(r.effects.spooler_write,false);
   assert.equal(r.effects.database_write,false);
   assert.equal(r.print_authorized,false);
  }finally{fs.writeFileSync(motorPath,original);}
 });
 check("V7.20 cannot import a cached or manually replaced consumer decision",()=>{
  const args=[...gateArgs(),"--decision",path.join(folder,"stale.json")];
  const p=runGate(args);
  assert.equal(p.status,2);
  const r=JSON.parse(p.stdout.trim());
  assert.equal(r.status,"BLOCKED");
  assert.deepEqual(r.outputs,[]);
 });
 check("V7.20 rejects unpinned consumer before any artifact generation",()=>{
  const fake=path.join(folder,"untrusted-consumer.cjs");
  fs.writeFileSync(fake,'console.log(JSON.stringify({ready:true}));');
  const args=gateArgs();
  args[args.indexOf("--consumer")+1]=fake;
  const p=runGate(args);
  assert.equal(p.status,2);
  const r=JSON.parse(p.stdout.trim());
  assert.equal(r.status,"BLOCKED");
  assert.equal(r.stage,"SOURCE_PREFLIGHT");
  assert.ok(r.reasons.includes("CONSUMER_GIT_BLOB_NOT_PINNED"));
  assert.deepEqual(r.outputs,[]);
  assert.equal(r.effects.print,false);
 });
 check("V7.21 read-only effects and exit/status agreement are required",()=>{
  const {readOnlyConsumerResult}=require(gatePath);
  const keys=["database_read","database_write","sequence_binding_write",
   "print","spooler_write","odhen_write","fiscal_action","sefaz_call"];
  const base={ready:false,effects:Object.fromEntries(keys.map(k=>[k,false]))};
  assert.equal(readOnlyConsumerResult(base,5),true);
  assert.equal(readOnlyConsumerResult({...base,ready:true},0),true);
  assert.equal(readOnlyConsumerResult(base,0),false);
  assert.equal(readOnlyConsumerResult({...base,ready:true},5),false);
  assert.equal(readOnlyConsumerResult({...base,effects:null},5),false);
  assert.equal(readOnlyConsumerResult({...base,effects:{}},5),false);
  assert.equal(readOnlyConsumerResult({...base,effects:{...base.effects,print:true}},5),false);
  assert.equal(readOnlyConsumerResult({...base,effects:{...base.effects,spooler_write:true}},5),false);
  assert.equal(readOnlyConsumerResult({...base,effects:{...base.effects,database_write:true}},5),false);
  assert.equal(readOnlyConsumerResult({...base,effects:{...base.effects,unknown_effect:false}},5),false);
  const {withoutNodePreloads}=require(gatePath);
  const inherited={NODE_OPTIONS:"--require /tmp/evil.js",node_options:"--import /tmp/evil.mjs",
   NODE_PATH:"/tmp",node_path:"/else",npm_config_node_options:"--eval bad",
   NPM_CONFIG_NODE_OPTIONS:"--eval bad2",SAFE_FLAG:"keep"};
  const safe=withoutNodePreloads(inherited);
  assert.deepEqual(safe,{SAFE_FLAG:"keep"});
  assert.equal(inherited.NODE_OPTIONS,"--require /tmp/evil.js");
  assert.ok(gateText.includes('env:childEnv'));
 });
 check("V7.21 executable motor pin and V6.8 remain mandatory before rendering",()=>{
  assert.ok(gateText.indexOf("CANONICAL_PACKAGING_MOTOR_SOURCE_NOT_PINNED_BEFORE_EXEC")<
   gateText.indexOf("const child=spawnSync("));
  assert.ok(gateText.indexOf("readOnlyConsumerResult(decision,child.status)")<
   gateText.indexOf("verifyLiveReaderPairV68(event,decision)"));
  assert.ok(gateText.indexOf("verifyLiveReaderPairV68(event,decision)")<
   gateText.indexOf("return renderVerifiedOffline(["));
 });

 console.log("THERMAL_BYTE_IDENTITY_V714="+checks+"/"+checks+" NO_LEGACY_AUTO_FACT NO_PRINT");
}finally{fs.rmSync(temp,{recursive:true,force:true});}

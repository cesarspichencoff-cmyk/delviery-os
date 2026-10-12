"use strict";
/**
 * V7.22 — positive, FULL, actual candidate-V2 -> V6.8 -> renderer replay.
 * Only fictional in-memory identifiers. The source-pinned engine fixture is
 * exact bytes from private Academy Git blob 3167c309f02a0ad5a84fb43043b8866e3bee873c.
 * Linux temp sandbox only; no installed Windows/service/print/sequence effects.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),
 path=require("node:path"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const {PACKAGING_SOURCE_BLOB_V63,PACKAGING_SOURCE_SHA256_V78}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const {blob}=require("./gerar_tres_vias_par_leitor_v68_offline.js");
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const SOURCE=path.join(__dirname,"fixtures/canonical-packaging-v63-pinned.js");
const CONSUMER=path.join(__dirname,"../runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs");
const GATE=path.join(__dirname,"gerar_tres_vias_v2_gate_v720_offline.js");
const ENGINE=fs.readFileSync(SOURCE);
assert.equal(blob(ENGINE),PACKAGING_SOURCE_BLOB_V63,"canonical motor blob mismatch");
assert.equal(sha(ENGINE),PACKAGING_SOURCE_SHA256_V78,"canonical motor SHA-256 mismatch");
assert.equal(process.platform,"linux","proof must not inspect Windows ProgramData");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v722-positive-"));
const consumerDir=path.join(temp,"consumer");
const textJson=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n");
const products=[
 {internal:"99001",code:"9.10.05.072.00",name:"SUSHI SALMAO",family:"dupla",station:"duplas",route:"00009"},
 {internal:"99002",code:"9.20.00.010.00",name:"TEMAKI SALMAO",family:"temaki",station:"enrolados",route:"00006"}
];
function createSource(){
 fs.mkdirSync(consumerDir,{recursive:true});
 fs.copyFileSync(CONSUMER,path.join(consumerDir,"consumer.cjs"));
 fs.copyFileSync(SOURCE,path.join(consumerDir,"packaging-current.js"));
 const configs={
  "app-data.json":{products:[]},
  "product-identity-cache-v1.json":{schema:"deliveryos.product-identity-cache.v1",
    rows:products.map(p=>({CDPRODUTO:p.internal,canonical:p.code,NMPRODUTO:p.name}))},
  "product-aliases-v1.json":{schema:"deliveryos.academia-live-product-aliases.v1",
    aliases:products.map(p=>({live_name:p.name,canonical_code:p.code,
      classification:{family:p.family,station:p.station,review_required:false}}))},
  "human-order-overrides-v1.json":{schema:"deliveryos.human-exact-order-overrides.v1",orders:[]},
  "routing.json":{schema:"deliveryos.odhen.product-routing.compact.v1",
    products:Object.fromEntries(products.map(p=>[p.code,[p.route]]))},
  "printer-map.json":{schema:"deliveryos.runtime-printer-map.v1",
    mappings:[{printer_code:"00009",printer_name:"SIMULATED_SUSHI"},
      {printer_code:"00006",printer_name:"SIMULATED_ENROLADOS"}]},
  "non-production.json":{items:{}}
 };
 for(const [f,obj] of Object.entries(configs))textJson(path.join(consumerDir,f),obj);
 const order={
  CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000000001",
  NRCOMANDA:"0000000001",NRCOMANDAEXT:"1001",IDORGCMDVENDA:"DLV_TEST",
  IDSTCOMANDA:"A",DTHRABERMESA:"2026-10-11T12:00:00.0000000",
  items:products.map((p,i)=>({
   NRPRODCOMVEN:String(i+1).padStart(6,"0"),CDPRODUTO:p.internal,
   CDARVPROD:p.code.replace(/\./g,""),QTPRODCOMVEN:"1.000",IDSTPRCOMVEN:"A"
  })),observation_scan_complete:true,observation_rows:[]
 };
 // Exact V2 watcher ordering and no empty observation_rows field in hashBasis.
 const hashed={CDFILIAL:order.CDFILIAL,CDLOJA:order.CDLOJA,
  NRVENDAREST:order.NRVENDAREST,NRCOMANDA:order.NRCOMANDA,
  NRCOMANDAEXT:order.NRCOMANDAEXT,IDORGCMDVENDA:order.IDORGCMDVENDA,
  IDSTCOMANDA:order.IDSTCOMANDA,DTHRABERMESA:order.DTHRABERMESA,
  items:order.items.map(({NRPRODCOMVEN,CDPRODUTO,CDARVPROD,QTPRODCOMVEN,IDSTPRCOMVEN})=>
   ({NRPRODCOMVEN,CDPRODUTO,CDARVPROD,QTPRODCOMVEN,IDSTPRCOMVEN}))};
 const hash=sha(Buffer.from(JSON.stringify(hashed)));
 const service={service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",
  source_ref:"fixture:fictional-service-only",blockers:[]};
 const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:"0001|01|0000000001",snapshot_hash:hash,
  ready_for_downstream_shadow:true,blockers:[],service_resolution:service,order};
 textJson(path.join(temp,"event.json"),event);
 textJson(path.join(temp,"sequence.json"),
  {schema:"deliveryos.tata-sequence-state.v1",next_value:1});
 const delivery={pedido_interno:order.NRCOMANDA,pedido_externo:order.NRCOMANDAEXT,
  items:products.map((p,i)=>({item_index:i,codigo:p.code,nome:p.name,quantidade:1,observacoes:[]})),
  order_observations:[]};
 const production={join_key_proof:"DLV_NRCOMANDA_PROVEN",
  pedido_interno_from_dlv:order.NRCOMANDA,
  lines:products.map(p=>({nome:p.name,quantidade:1,tx_prod_com_ven:[],printer_key:p.route}))};
 const print_intents=products.map((p,i)=>({
  printer:{printer_name:p.route==="00009"?"SIMULATED_SUSHI":"SIMULATED_ENROLADOS",
   printer_code:p.route},intent_fingerprint:String(i+7).repeat(64),
  identifiers:{ifood_sequence:order.NRCOMANDAEXT,teknisa_sequence:order.NRCOMANDA,
   tata_sequence:"001",order_time:"12:00"},
  lines:[{item_index:i,product_code:p.code,product_name:p.name,quantity:1,
   item_observations:[],mount_group_id:"OLD_"+i,box_label:i===0?"CX 240":"CX 450",
   prep_components:[]}]
 }));
 const plan={schema:"deliveryos.production-print-plan.v1",order_id:order.NRCOMANDA,
  ready_for_shadow_payload:true,blocking_reasons:[],print_intents};
 const identities=products.map((p,i)=>({item_index:i,product_code:p.code,
  product_name:p.name,quantity:1,classification:{station:p.station,family:p.family},
  packaging_role:"OTHER",station_proof:"CURRENT_MOTOR_PROVEN",
  proof:"CURRENT_PRODUCT_IDENTITY_CROSSWALK_PROVEN",
  source_ref:"fixture:fictional-current-product:"+p.code}));
 const observation_proofs=products.map((p,i)=>({item_index:i,canonical_code:p.code,
  snapshot_hash:hash,status:"PROVEN_NONE_FOR_THIS_ITEM",
  source_ref:"fixture:fictional-observation:"+p.internal,
  delivery_observations:[],production_observations:[]}));
 const proof={schema:"deliveryos.reconciled-reader-pair-proof.v68.offline",
  delivery,production,production_plan:plan,current_product_identities:identities,
  item_observation_proofs:observation_proofs};
 textJson(path.join(temp,"proof.json"),proof);
 return {event,proof};
}
function invoke(){
 return spawnSync(process.execPath,[GATE,"--event",path.join(temp,"event.json"),
  "--consumer",path.join(consumerDir,"consumer.cjs"),
  "--proof",path.join(temp,"proof.json"),
  "--motor",SOURCE,"--sequence-fixture",path.join(temp,"sequence.json")],{
   encoding:"utf8",timeout:20000,maxBuffer:1024*1024});
}
// V7.26 adversarial replay: exercise the ACTUAL source-pinned V2 subprocess,
// its exact watcher hash, V6.8 pair and rendering gate. No mock decision.
function exactWatcherHash(order){
 const header=["CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA",
  "NRCOMANDAEXT","IDORGCMDVENDA","IDSTCOMANDA","DTHRABERMESA"];
 const fields=["NRPRODCOMVEN","CDPRODUTO","CDARVPROD","QTPRODCOMVEN","IDSTPRCOMVEN"];
 const data={};
 for(const k of header)data[k]=order[k];
 data.items=order.items.map(item=>Object.fromEntries(fields.map(k=>[k,item[k]])));
 if(order.observation_rows?.length)data.observation_rows=order.observation_rows;
 return sha(Buffer.from(JSON.stringify(data)));
}
function assertRejectCase(label,mutator,expectedReason=null){
 const p=path.join(temp,"event.json"),baseline=fs.readFileSync(p);
 try{
  const event=JSON.parse(baseline);
  mutator(event);
  textJson(p,event);
  const response=invoke();
  assert.equal(response.status,2,label+" must fail closed: "+response.stdout.slice(0,1200));
  const blocked=JSON.parse(response.stdout);
  assert.equal(blocked.status,"BLOCKED",label);
  assert.deepEqual(blocked.outputs,[],label);
  assert.equal(blocked.effects.print,false,label);
  assert.equal(blocked.effects.spooler_write,false,label);
  if(expectedReason)
   assert.ok(blocked.reasons.some(x=>x.includes(expectedReason)),
    label+" wrong block reasons "+JSON.stringify(blocked.reasons));
  console.log("PASS V7.26 "+label+" -> "+blocked.stage);
 }finally{fs.writeFileSync(p,baseline);}
}

let complete=false;
try{
 const {event}=createSource();
 const child=invoke();
 assert.equal(child.status,0,"full gate failed: "+child.stdout.slice(0,3500)+" / "+child.stderr.slice(0,500));
 const got=JSON.parse(child.stdout);
 assert.equal(got.status,"OFFLINE_VERIFIED_NO_PHYSICAL_EFFECT");
 assert.equal(got.effects.print,false);
 assert.equal(got.effects.spooler_write,false);
 assert.equal(got.outputs.length,3,"two production and one conference, no dropped ticket");
 assert.equal(new Set(got.outputs.map(x=>x.filename)).size,3);
 assert.ok(got.outputs.every(o=>/^[0-9a-f]{64}$/.test(o.svg_sha256)));
 assert.equal(got.origin.event_sha256,sha(fs.readFileSync(path.join(temp,"event.json"))));
 assert.equal(got.origin.motor_blob_sha,PACKAGING_SOURCE_BLOB_V63);
 const manifest=JSON.parse(fs.readFileSync(path.join(got.proof_dir,"manifest.json"),"utf8"));
 assert.deepEqual(manifest.outputs,got.outputs);
 for(const o of got.outputs){
  const svg=fs.readFileSync(path.join(got.proof_dir,o.filename));
  assert.equal(sha(svg),o.svg_sha256);
 }
 fs.rmSync(got.proof_dir,{recursive:true,force:true});
 console.log("PASS V7.22 pinned actual engine + actual V2 child + V6.8 + two station SVGs + conference");
 // Routing is recomputed by the real V2 child, but MUST agree independently
 // with the reconciled production source. A matching V2 lineage is not enough.
 const routingPath=path.join(consumerDir,"routing.json");
 const routingOriginal=fs.readFileSync(routingPath);
 try{
  const changed=JSON.parse(routingOriginal);
  changed.products[products[1].code]=["00009"];
  textJson(routingPath,changed);
  const drift=invoke();
  assert.equal(drift.status,2,"wrong route not blocked: "+drift.stdout.slice(0,1000));
  const blocked=JSON.parse(drift.stdout);
  assert.equal(blocked.status,"BLOCKED");
  assert.ok(!blocked.proof_dir);
  assert.ok(!blocked.outputs||blocked.outputs.length===0);
  assert.equal(blocked.effects.print,false);
  console.log("PASS V7.24 V2 rule-consistent routing drift rejected by independent V6.8 proof");
 }finally{fs.writeFileSync(routingPath,routingOriginal);}
 // The decision may stay valid while the independent proof is altered:
 // exact order source and observation proof must still reconcile.
 const proofPath=path.join(temp,"proof.json"),savedProof=fs.readFileSync(proofPath);
 try{
  const altered=JSON.parse(savedProof);
  altered.delivery.items[0].quantidade=99;
  textJson(proofPath,altered);
  const badProof=invoke();
  assert.equal(badProof.status,2,"modified proof not blocked: "+badProof.stdout.slice(0,1000));
  const blocked=JSON.parse(badProof.stdout);
  assert.equal(blocked.status,"BLOCKED");
  assert.ok(!blocked.proof_dir);
  assert.ok(!blocked.outputs||blocked.outputs.length===0);
  assert.equal(blocked.effects.print,false);
  console.log("PASS V7.24 altered independent quantity proof never generates preview");
 }finally{fs.writeFileSync(proofPath,savedProof);}
 // Pinned V2, exact watcher hash and real V6.8 must agree on item identity.
 assertRejectCase("same-order revision with original watcher hash",x=>{
  x.order.items[0].QTPRODCOMVEN="3.000";
 });
 assertRejectCase("duplicate SQL line identity despite freshly computed hash",x=>{
  x.order.items[1].NRPRODCOMVEN=x.order.items[0].NRPRODCOMVEN;
  x.snapshot_hash=exactWatcherHash(x.order);
 });
 assertRejectCase("wrong order key despite unchanged complete order",x=>{
  x.order_key="0001|01|FOREIGN_ORDER";
 });
 assertRejectCase("allergen declared in exact order note",x=>{
  x.order.observation_rows=[{source_field:"DSOBSCOMANDA",
   value:"ALERGIA A CAMARAO",scope_hint:"order",join_proven:true}];
  x.snapshot_hash=exactWatcherHash(x.order);
 });
 assertRejectCase("allergen declared in exact item note",x=>{
  x.order.observation_rows=[{source_field:"TXPRODCOMVEN",
   value:"SOU ALERGICO A AMENDOIM",item_index:0,CDPRODUTO:"99001",
   scope_hint:"item",join_proven:true}];
  x.snapshot_hash=exactWatcherHash(x.order);
 });
 assertRejectCase("item note linked to a different product",x=>{
  x.order.observation_rows=[{source_field:"TXPRODCOMVEN",
   value:"SEM CEBOLA",item_index:0,CDPRODUTO:"99002",
   scope_hint:"item",join_proven:true}];
  x.snapshot_hash=exactWatcherHash(x.order);
 });
 assertRejectCase("duplicate note source on same item",x=>{
  x.order.observation_rows=[
   {source_field:"TXPRODCOMVEN",value:"SEM CEBOLA",
    item_index:0,CDPRODUTO:"99001",scope_hint:"item",join_proven:true},
   {source_field:"TXPRODCOMVEN",value:"SEM PIMENTA",
    item_index:0,CDPRODUTO:"99001",scope_hint:"item",join_proven:true}];
  x.snapshot_hash=exactWatcherHash(x.order);
 });
 assertRejectCase("unproven item observation join",x=>{
  x.order.observation_rows=[{source_field:"TXPRODCOMVEN",
   value:"SEM PIMENTA",item_index:1,CDPRODUTO:"99002",
   scope_hint:"item",join_proven:false}];
  x.snapshot_hash=exactWatcherHash(x.order);
 });
 assertRejectCase("apparently benign general note without independent approval",x=>{
  x.order.observation_rows=[{source_field:"DSOBSCOMANDA",
   value:"ENTREGAR APOS AS 12H",scope_hint:"order",join_proven:true}];
  x.snapshot_hash=exactWatcherHash(x.order);
 });
 assertRejectCase("unscanned observation source despite event ready",x=>{
  x.order.observation_scan_complete=false;
  x.snapshot_hash=exactWatcherHash(x.order);
 });
 // Adversarial regression on the *same* executable and same independent proof.
 const altered=structuredClone(event);altered.order.items[0].QTPRODCOMVEN="2.000";
 textJson(path.join(temp,"event.json"),altered);
 const invalid=invoke();
 assert.equal(invalid.status,2);
 const result=JSON.parse(invalid.stdout);
 assert.equal(result.status,"BLOCKED");
 assert.deepEqual(result.outputs,[]);
 assert.equal(result.effects.print,false);
 console.log("PASS V7.22 changed quantity without new watcher revision cannot emit output");
 complete=true;
}finally{
 fs.rmSync(temp,{recursive:true,force:true});
}
if(complete)console.log("THERMAL_REAL_MOTOR_POSITIVE_V722=14/14 OFFLINE_2_PRODUCTION_1_CONFERENCE NO_PRINT");

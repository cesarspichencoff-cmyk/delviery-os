"use strict";
/** Offline only: sealed candidate, synthetic source claims, real archived 9627 pair. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const {build,verify}=require("./comandas_shadow_bundle_v1.cjs");
const {snapshotHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const ROOT=path.resolve(__dirname,".."),load=n=>JSON.parse(fs.readFileSync(path.join(ROOT,"data",n),"utf8"));
const work=fs.mkdtempSync(path.join(os.tmpdir(),"comandas-bundle-gate-"));
let count=0;function test(name,fn){fn();process.stdout.write("PASS "+(++count)+" "+name+"\n");}
try{
 const output=path.join(work,"bundle");
 test("52-file package verifies source & compiled dependency digests",()=>{
  const b=build(output);
  assert.equal(b.status,"BUNDLE_BUILT_VERIFIED");
  assert.equal(b.candidate_files,34);
  assert.ok(b.compiled_files>=10);
  assert.equal(verify(output).files_verified,b.files_verified);
 });
 const {run}=require(path.join(output,"tools/comandas_shadow_offline_run_v1.cjs"));
 test("bundle imports executable pure replay without node_modules or compiler",()=>{
  assert.equal(typeof run,"function");
 });
 const sources=path.join(work,"sources");fs.mkdirSync(sources);
 const original=load("tata_reader_real_read_cdarvprod_success_20261005_v1.json");
 const replay=load("tata_reader_real_order_unified_replay_success_20261005_v2.json");
 const canon=s=>{const v=String(s).replace(/\./g,"");return v[0]+"."+v.slice(1,3)+"."+v.slice(3,5)+"."+v.slice(5,8)+"."+v.slice(8,10)};
 const names=Object.fromEntries(replay.production.flatMap(p=>p.lines).map(l=>[l.product_code,l.product_name]));
 const cls={
  "9.80.00.010.00":{family:"combinado",subfamily:"kids",station:"combinados"},
  "9.10.00.080.00":{family:"entrada",subfamily:"entrada_quente",station:"cozinha_quentes"},
  "9.10.00.020.00":{family:"entrada",subfamily:"entrada_quente",station:"cozinha_quentes"},
  "9.30.00.090.00":{family:"dupla",subfamily:"sushi",station:"duplas"}
 };
 const put=(name,obj)=>fs.writeFileSync(path.join(sources,name),JSON.stringify(obj));
 fs.copyFileSync(path.join(ROOT,"tools/fixtures/canonical-packaging-v63-pinned.js"),path.join(sources,"packaging-current.js"));
 put("app-data.json",{products:[]});
 put("product-identity-cache-v1.json",{schema:"deliveryos.product-identity-cache.v1",
  rows:original.observed_items.map(v=>({CDPRODUTO:v.CDPRODUTO,canonical:canon(v.CDARVPROD),
   NMPRODUTO:names[canon(v.CDARVPROD)]}))});
 put("product-aliases-v1.json",{schema:"deliveryos.academia-live-product-aliases.v1",
  aliases:original.observed_items.map(v=>({live_name:names[canon(v.CDARVPROD)],
   canonical_code:canon(v.CDARVPROD),classification:{...cls[canon(v.CDARVPROD)],review_required:false}}))});
 put("human-order-overrides-v1.json",{schema:"deliveryos.human-exact-order-overrides.v1",orders:[]});
 put("routing.json",load("odhen_product_routing_compact_v1.json"));
 put("printer-map.json",load("runtime_printer_map_v1.json"));
 put("non-production.json",load("non_production_delivery_items_v1.json"));
 const o=original.observed_order;
 const order={CDFILIAL:o.CDFILIAL,CDLOJA:o.CDLOJA,NRVENDAREST:o.NRVENDAREST,NRCOMANDA:o.NRCOMANDA,
  NRCOMANDAEXT:o.NRCOMANDAEXT,IDORGCMDVENDA:o.IDORGCMDVENDA,IDSTCOMANDA:o.IDSTCOMANDA,
  DTHRABERMESA:o.DTHRABERMESA,items:structuredClone(original.observed_items),
  observation_scan_complete:true,observation_rows:[]};
 const blocker=["SERVICE_STATE_DATE_MISMATCH_ORDER_DATE","SERVICE_STATE_EXPIRED_FOR_ORDER"];
 const ev={schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|"),
  snapshot_hash:snapshotHash(order),order,service_resolution:{
   service:null,evidence:"UNKNOWN",source_ref:null,blockers:blocker},
  ready_for_downstream_shadow:false,blockers:blocker};
 const eventFile=path.join(work,"event9627.json");fs.writeFileSync(eventFile,JSON.stringify(ev));
 // The test generates its own V2 decision on Foxxy only. This is NOT a bundle
 // feature and is forbidden on the CAIXA host due to the V7.14 absolute state path.
 const hostSeq="C:\\ProgramData\\TataComandaReader\\state\\tata-sequence-state.json";
 if(fs.existsSync(hostSeq))throw Error("TEST_CONSUMER_ABSOLUTE_HOST_STATE_PRESENT");
 const consumer=path.join(sources,"consumer.cjs");
 fs.copyFileSync(path.join(ROOT,"runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs"),consumer);
 const produced=spawnSync(process.execPath,[consumer,eventFile],{encoding:"utf8",timeout:20000});
 assert.ok([0,5].includes(produced.status)&&produced.stdout,"TEST_CONSUMER_UNAVAILABLE");
 const decision=JSON.parse(produced.stdout);
 const decisionFile=path.join(work,"decision9627.json");fs.writeFileSync(decisionFile,JSON.stringify(decision));
 test("archived V7.14 decision & event yield 3 virtual views with no bytes",()=>{
  const out=run(eventFile,decisionFile);
  assert.equal(out.status,"SHADOW_PAIR_REPLAYED");
  assert.equal(out.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
  assert.equal(out.layers.L3.status,"NATIVE_CONTENT_PROVEN");
  assert.equal(out.layers.L4.status,"THREE_VIEWS_VIRTUAL");
  assert.equal(out.layers.L5.status,"HOLD");
  assert.equal(out.views.length,3);
  assert.ok(out.views.every(v=>v.escpos_bytes===0));
  assert.equal(out.v2_consumer_executed,false);
 });
 test("modified native revision cannot be used with old V2 decision",()=>{
  const corrupt=structuredClone(ev);
  corrupt.order.items[0].QTPRODCOMVEN="2.000";
  const p=path.join(work,"event-tampered.json");fs.writeFileSync(p,JSON.stringify(corrupt));
  const out=run(p,decisionFile);
  assert.equal(out.status,"HOLD");
  assert.equal(out.layers.L1.status,"HOLD");
  assert.equal(out.views.length,0);
 });
 test("tampered V2 decision fingerprint cannot project any view",()=>{
  const wrong=structuredClone(decision);wrong.fingerprint="f".repeat(64);
  const p=path.join(work,"decision-tampered.json");fs.writeFileSync(p,JSON.stringify(wrong));
  const out=run(eventFile,p);
  assert.equal(out.status,"HOLD");assert.equal(out.views.length,0);
 });
 test("modified bundle code blocks before any data read",()=>{
  fs.appendFileSync(path.join(output,"src/production/nativeReaderChainV1.ts"),"\n");
  assert.throws(()=>run(eventFile,decisionFile),/BUNDLE_FILE_DRIFT/);
 });
}finally{fs.rmSync(work,{recursive:true,force:true})}
process.stdout.write("COMANDAS_SHADOW_BUNDLE_V1="+count+"/"+count+" PASS PAIR_ONLY\n");

"use strict";
/**
 * Native chain V1 gate. Runs the ACTUAL V2 consumer candidate (V7.14) and the
 * pinned Academy motor bytes on the REAL archived revision 9627 (ids, items,
 * quantities and native states X/4 already committed in data/), with the
 * legacy 14/10 daily service-state emulated exactly as the installed watcher
 * reads it. Product classification enters through TEST aliases (the private
 * Academy catalog is not in this repository); the local private replay
 * `tools/comandas_replay_real_privado_p0.cjs` uses the real catalog instead.
 * No SQL, host, spooler, queue, sequence write or print.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {projectVerifiedReaderPairV68}=require("../dist/src/production/stableReaderShadowPairV68.js");
const {runNativeChainV1,NO_SEQUENCE}=require("./comandas_cadeia_nativa_v1_offline.cjs");
const N=require("../dist/src/production/nativeReaderChainV1.js");

const ROOT=path.join(__dirname,"..");
const load=f=>JSON.parse(fs.readFileSync(path.join(ROOT,"data",f),"utf8"));
const MOTOR=fs.readFileSync(path.join(__dirname,"fixtures/canonical-packaging-v63-pinned.js"));
const routing=load("odhen_product_routing_compact_v1.json");
const printers=load("runtime_printer_map_v1.json");
const calibration=load("production_printer_calibration_registry_v1.json");
const read=load("tata_reader_real_read_cdarvprod_success_20261005_v1.json");
const replay=load("tata_reader_real_order_unified_replay_success_20261005_v2.json");
const canon=v=>{v=String(v).replace(/\./g,"");return v[0]+"."+v.slice(1,3)+"."+v.slice(3,5)+"."+v.slice(5,8)+"."+v.slice(8,10);};
const names=Object.fromEntries(replay.production.flatMap(p=>p.lines).map(l=>[l.product_code,l.product_name]));
// TEST aliases: classification mirroring the private Academy replay output.
const CLASS={
 "9.80.00.010.00":{family:"combinado",subfamily:"kids",station:"combinados"},
 "9.10.00.080.00":{family:"entrada",subfamily:"entrada_quente",station:"cozinha_quentes"},
 "9.10.00.020.00":{family:"entrada",subfamily:"entrada_quente",station:"cozinha_quentes"},
 "9.30.00.090.00":{family:"dupla",subfamily:"sushi",station:"duplas"}};
let n=0;function test(name,fn){fn();console.log("PASS "+(++n)+" "+name);}

const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tata-native-chain-"));
const dir=path.join(temp,"consumer");fs.mkdirSync(dir);
fs.copyFileSync(path.join(ROOT,"runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs"),path.join(dir,"consumer.cjs"));
fs.writeFileSync(path.join(dir,"packaging-current.js"),MOTOR);
const put=(f,o)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(o));
put("app-data.json",{products:[]});
put("routing.json",routing);put("printer-map.json",printers);
put("non-production.json",load("non_production_delivery_items_v1.json"));
put("human-order-overrides-v1.json",{schema:"deliveryos.human-exact-order-overrides.v1",orders:[]});
put("product-identity-cache-v1.json",{schema:"deliveryos.product-identity-cache.v1",
 rows:read.observed_items.map(x=>({CDPRODUTO:x.CDPRODUTO,canonical:canon(x.CDARVPROD),NMPRODUTO:names[canon(x.CDARVPROD)]}))});
put("product-aliases-v1.json",{schema:"deliveryos.academia-live-product-aliases.v1",
 aliases:read.observed_items.map(x=>({live_name:names[canon(x.CDARVPROD)],canonical_code:canon(x.CDARVPROD),
  classification:{...CLASS[canon(x.CDARVPROD)],review_required:false}}))});

// Installed watcher Read-ServiceState against the legacy 2026-10-14 file.
function legacyService(opened){
 const b=[];if(opened.slice(0,10)!=="2026-10-14")b.push("SERVICE_STATE_DATE_MISMATCH_ORDER_DATE");
 if(opened.slice(0,19)>"2026-10-14T23:59:59")b.push("SERVICE_STATE_EXPIRED_FOR_ORDER");
 return b.length?{service:null,evidence:"UNKNOWN",source_ref:null,blockers:b}
  :{service:"DINNER",evidence:"HUMAN_CONFIRMED_RULE",source_ref:"legacy-14-10",blockers:[]};
}
function event(mut=x=>x){
 const o=read.observed_order;
 const order=mut({CDFILIAL:o.CDFILIAL,CDLOJA:o.CDLOJA,NRVENDAREST:o.NRVENDAREST,NRCOMANDA:o.NRCOMANDA,
  NRCOMANDAEXT:o.NRCOMANDAEXT,IDORGCMDVENDA:o.IDORGCMDVENDA,IDSTCOMANDA:o.IDSTCOMANDA,
  DTHRABERMESA:o.DTHRABERMESA,items:structuredClone(read.observed_items),
  observation_scan_complete:true,observation_rows:[]});
 const s=legacyService(order.DTHRABERMESA);
 return {schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:[order.CDFILIAL,order.CDLOJA,order.NRVENDAREST,order.NRCOMANDA].join("|"),
  snapshot_hash:snapshotHash(order),order,service_resolution:s,
  ready_for_downstream_shadow:s.blockers.length===0,blockers:[...s.blockers]};
}
function consume(ev){
 const p=path.join(temp,"event-"+ev.snapshot_hash.slice(0,12)+".json");
 fs.writeFileSync(p,JSON.stringify(ev));
 const r=spawnSync(process.execPath,[path.join(dir,"consumer.cjs"),p],{encoding:"utf8",timeout:20000});
 assert.ok(r.stdout,"consumer produced no decision: "+r.stderr.slice(0,400));
 return JSON.parse(r.stdout);
}
const chain=(ev,d,extra={})=>runNativeChainV1({event:ev,decision:d,routing,printer_map:printers,
 calibration,motor_source:MOTOR,...extra});
const real=event(),decision=consume(real);

test("real revision 9627 keeps native states X/4 and the consumer proves all content",()=>{
 assert.equal(real.order.IDSTCOMANDA,"X");
 assert.ok(real.order.items.every(x=>x.IDSTPRCOMVEN==="4"));
 assert.ok(decision.items.every(x=>x.classification?.review_required===false));
 assert.equal(decision.kits.status,"FACT");
 assert.equal(decision.packaging.has_unknown,false);
});
test("the consumer blocks it ONLY on legacy service, pair roles and sequence",()=>{
 const c=N.classifyConsumerBlockersV1(decision.blocking_reasons,real.blockers);
 assert.deepEqual(c.content,[]);
 assert.ok(c.legacy_service_state.includes("UPSTREAM_EVENT_NOT_READY"));
 assert.deepEqual(c.paired_destination.map(x=>x.canonical_code).sort(),["9.30.00.090.00","9.80.00.010.00"]);
 assert.deepEqual(c.sequence,["TATA_SEQUENCE_STATE_MISSING"]);
});
test("cause: the existing V6.8 path can never project a real revision (service file + printed DLV join)",()=>{
 const items=decision.items.map((x,i)=>({item_index:i,codigo:x.canonical_code,nome:x.product_name,quantidade:x.quantity,observacoes:[]}));
 const r=projectVerifiedReaderPairV68(real,decision,{
  delivery:{pedido_interno:real.order.NRCOMANDA,pedido_externo:real.order.NRCOMANDAEXT,items,order_observations:[]},
  production:{join_key_proof:"UNPROVEN",pedido_interno_from_dlv:null,lines:[]},
  production_plan:{schema:"deliveryos.production-print-plan.v1",order_id:null,ready_for_shadow_payload:false,
   ready_for_physical_print:false,blocking_reasons:["X"],print_intents:[],no_own_production_ticket_items:[]},
  identities:[],observation_proofs:[],motor:null,motor_blob_sha:""});
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.reasons.includes("EVENT_OR_DECISION_NOT_READY_FOR_SHADOW"));
 assert.ok(r.reasons.includes("EVENT_DECISION_SERVICE_PROOF_MISMATCH"));
});
const out=chain(real,decision);
test("native chain: real revision -> three virtual views, dinner routes Sushi 1 to DELIVERY SUSHI 1",()=>{
 assert.equal(out.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
 assert.equal(out.layers.L2.window,"DINNER_CANDIDATE");
 assert.equal(out.layers.L3.status,"NATIVE_CONTENT_PROVEN");
 assert.equal(out.layers.L3.join.print_text_used,false);
 assert.equal(out.layers.L4.status,"THREE_VIEWS_VIRTUAL");
 assert.deepEqual(out.views.map(v=>v.kind+":"+v.station),
  ["PRODUCAO:COZINHA","PRODUCAO:DELIVERY SUSHI 1","CONFERENCIA:CONFERENCIA"]);
 const conf=out.views[2].text_trace;
 assert.equal((conf.match(/Op\. ________/g)||[]).length,6);
 assert.ok(conf.includes("1 SACOLA G | 3 KIT KIDS | 1 KIT QUENTE"));
 assert.ok(out.views[1].text_trace.includes("C3  CAIXA 750"));
 assert.ok(out.views[1].text_trace.includes("SUSHI DE UNAGUI"));
 assert.equal(out.layers.L4.conference_ifood_crosscheck,"HOLD");
});
test("no TATA number is ever shown without an attested binding; no physical bytes",()=>{
 assert.equal(out.layers.L5.status,"HOLD");
 assert.equal(out.layers.L5.tata_number,null);
 for(const v of out.views){
  assert.equal(v.escpos_bytes,0);
  assert.ok(v.render_blockers.includes("TATA_SEQUENCE_NOT_PROVEN"));
  assert.doesNotMatch(v.text_trace,/^\s*\d{3}\s*$/m);
  assert.equal(v.text_trace.includes(NO_SEQUENCE),false);
 }
 assert.equal(out.physical_effect_authorized,false);assert.equal(out.paper_proven,false);
});
test("lunch revision: Sushi 1 goes to BALCAOSUSHI1; neither DELIVERY SUSHI receives anything",()=>{
 const lunch=event(o=>({...o,DTHRABERMESA:"2026-10-05T12:30:00.0000000"}));
 const r=chain(lunch,consume(lunch));
 assert.equal(r.layers.L2.window,"LUNCH_CANDIDATE");
 assert.deepEqual(r.views.map(v=>v.station),["COZINHA","BALCAOSUSHI1","CONFERENCIA"]);
 assert.ok(!r.views.some(v=>/DELIVERY SUSHI/.test(v.station)));
});
test("outside documented hours: destinations HOLD, proven content is NOT erased",()=>{
 const late=event(o=>({...o,DTHRABERMESA:"2026-10-05T16:10:00.0000000"}));
 const r=chain(late,consume(late));
 assert.equal(r.layers.L2.status,"OUTSIDE_DOCUMENTED_WINDOW");
 assert.equal(r.layers.L3.status,"NATIVE_CONTENT_PROVEN");
 assert.equal(r.layers.L4.status,"HOLD");
 assert.ok(r.layers.L4.reasons.includes("OUTSIDE_REPORTED_DELIVERY_HOURS"));
 // Real archived 9092 opened 23:02:07, after the documented 23:00 end.
 assert.equal(require("./comandas_window_station_select_v1_offline.cjs").windowOf("2026-10-02","23:02"),
  "OUTSIDE_REPORTED_WINDOW");
 assert.deepEqual(r.views,[]);
});
test("cancellation: header 4 and item 6 stop at L1",()=>{
 for(const mut of [o=>({...o,IDSTCOMANDA:"4"}),
  o=>({...o,items:o.items.map((x,i)=>i===0?{...x,IDSTPRCOMVEN:"6"}:x)})]){
  const ev=event(mut),r=chain(ev,consume(ev));
  assert.equal(r.layers.L1.status,"HOLD");assert.deepEqual(r.views,[]);
 }
});
test("item modified: stale decision or un-rehashed event never projects",()=>{
 const changed=event(o=>({...o,items:o.items.map((x,i)=>i===0?{...x,QTPRODCOMVEN:"2.000"}:x)}));
 assert.equal(chain(changed,decision).layers.L1.status,"HOLD");
 const tampered=structuredClone(real);tampered.order.items[0].QTPRODCOMVEN="2.000";
 assert.equal(chain(tampered,decision).layers.L1.status,"HOLD");
});
test("new revision is re-evaluated from its own snapshot; unproven kits are never borrowed",()=>{
 // 2 Kids instead of 3: the pinned motor has no proven bag/kit rule for
 // this composition, so the NEW revision holds instead of reusing 3 Kit Kids.
 const rev=event(o=>({...o,items:o.items.map((x,i)=>i===0?{...x,QTPRODCOMVEN:"2.000"}:x)}));
 const before=JSON.stringify(out);
 const r=chain(rev,consume(rev));
 assert.equal(r.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
 assert.notEqual(r.layers.L1.snapshot_sha256,out.layers.L1.snapshot_sha256);
 assert.equal(r.layers.L3.status,"HOLD");
 assert.ok(r.layers.L3.reasons.includes("KITS_NOT_FACT"));
 assert.deepEqual(r.views,[]);
 assert.equal(JSON.stringify(out),before);
});
test("repetition / return to session: identical inputs give byte-identical output",()=>{
 assert.equal(JSON.stringify(chain(real,decision)),JSON.stringify(out));
 assert.equal(JSON.stringify(chain(real,consume(real))),JSON.stringify(out));
});
test("unknown consumer blocker is CONTENT (fail closed); mixed upstream blocker is not 'service'",()=>{
 const d=structuredClone(decision);d.blocking_reasons=[...d.blocking_reasons,"SOMETHING_NEW"];
 const r=chain(real,d);
 assert.equal(r.layers.L3.status,"HOLD");assert.ok(r.layers.L3.reasons.includes("SOMETHING_NEW"));
 const c=N.classifyConsumerBlockersV1(["UPSTREAM_EVENT_NOT_READY","UPSTREAM_X"],["SERVICE_STATE_EXPIRED_FOR_ORDER","X"]);
 assert.deepEqual(c.content.sort(),["UPSTREAM_EVENT_NOT_READY","UPSTREAM_X"]);
});
test("sequence gate: unattested or other-revision binding shows nothing; attested binding opens only its revision",()=>{
 const base={persisted:true,order_key:real.order_key,snapshot_sha256:real.snapshot_hash,tata_sequence:"037"};
 for(const b of [{...base,attested_independently:false},{...base,persisted:false,attested_independently:true},
  {...base,attested_independently:true,snapshot_sha256:"0".repeat(64)},{...base,attested_independently:true,tata_sequence:"000"}]){
  const r=chain(real,decision,{sequence_binding:b});
  assert.equal(r.layers.L5.tata_number,null);assert.ok(r.views.every(v=>v.escpos_bytes===0));
 }
 // Synthetic attested binding (no real binding exists): only then a number appears.
 const ok=chain(real,decision,{sequence_binding:{...base,attested_independently:true}});
 assert.equal(ok.layers.L5.status,"BOUND");assert.equal(ok.layers.L5.tata_number,"037");
 assert.ok(ok.views.every(v=>v.text_trace.includes("IFOOD 9627 | TEKNISA")));
});
test("pinned motor bytes are enforced before any projection",()=>{
 const r=runNativeChainV1({event:real,decision,routing,printer_map:printers,calibration,
  motor_source:Buffer.concat([MOTOR,Buffer.from("\n")])});
 assert.ok(r.layers.L3.reasons.includes("PINNED_ACADEMY_MOTOR_BYTES_MISMATCH"));
 assert.deepEqual(r.views,[]);
});
test("decision fingerprint is the V8.57 contract and outputs are effect-free",()=>{
 assert.equal(decisionHash(decision),decision.fingerprint);
 for(const v of Object.values(out.effects))assert.equal(v,false);
});

fs.rmSync(temp,{recursive:true,force:true});
console.log("COMANDAS_NATIVE_CHAIN_V1="+n+"/"+n+" REAL_REVISION_9627 CONSUMER_V714 PINNED_MOTOR THREE_VIRTUAL_VIEWS NO_PRINT");

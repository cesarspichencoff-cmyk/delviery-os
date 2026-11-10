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
// Real archived revision 9092 (02/10, 23:02:07, header X, items 4). Its
// combo 9.15.00.030.00 deliberately gets NO alias: the consumer leaves it
// CLASSIFICATION_UNKNOWN (pair routes are stripped before its COMB bridge).
const read9092=load("tata_reader_real_read_success_20261003_v1.json");
const route9092=load("tata_reader_real_order_expected_route_direct_identity_20261004_v1.json");
const items9092=read9092.observed_items.map(x=>({NRPRODCOMVEN:x.NRPRODCOMVEN,CDPRODUTO:x.CDPRODUTO,
 CDARVPROD:route9092.items.find(r=>r.sql_cdproduto===x.CDPRODUTO).cdarvprod_raw,
 QTPRODCOMVEN:x.QTPRODCOMVEN,IDSTPRCOMVEN:x.IDSTPRCOMVEN}));
const equivalence=load("comandas_catalog_equivalence_v1.json");
put("product-identity-cache-v1.json",{schema:"deliveryos.product-identity-cache.v1",
 rows:[...read.observed_items.map(x=>({CDPRODUTO:x.CDPRODUTO,canonical:canon(x.CDARVPROD),NMPRODUTO:names[canon(x.CDARVPROD)]})),
  ...read9092.observed_items.map((x,i)=>({CDPRODUTO:x.CDPRODUTO,canonical:canon(items9092[i].CDARVPROD),NMPRODUTO:x.NMPRODUTO.trim()}))]});
put("product-aliases-v1.json",{schema:"deliveryos.academia-live-product-aliases.v1",
 aliases:[...read.observed_items.map(x=>({live_name:names[canon(x.CDARVPROD)],canonical_code:canon(x.CDARVPROD),
  classification:{...CLASS[canon(x.CDARVPROD)],review_required:false}})),
  // TEST alias mirroring the private replay (Academy exact name "Temaki de Barriga de Salmão").
  {live_name:"TEMAKI DE BARRIGA DE SALMAO",canonical_code:"9.60.00.010.00",
   classification:{family:"enrolado",subfamily:"temaki",station:"enrolados",review_required:false}}]});

// Installed watcher Read-ServiceState against the legacy 2026-10-14 file.
function legacyService(opened){
 const b=[];if(opened.slice(0,10)!=="2026-10-14")b.push("SERVICE_STATE_DATE_MISMATCH_ORDER_DATE");
 if(opened.slice(0,19)>"2026-10-14T23:59:59")b.push("SERVICE_STATE_EXPIRED_FOR_ORDER");
 return b.length?{service:null,evidence:"UNKNOWN",source_ref:null,blockers:b}
  :{service:"DINNER",evidence:"HUMAN_CONFIRMED_RULE",source_ref:"legacy-14-10",blockers:[]};
}
function event(mut=x=>x,src={o:read.observed_order,items:read.observed_items}){
 const o=src.o;
 const order=mut({CDFILIAL:o.CDFILIAL,CDLOJA:o.CDLOJA,NRVENDAREST:o.NRVENDAREST,NRCOMANDA:o.NRCOMANDA,
  NRCOMANDAEXT:o.NRCOMANDAEXT,IDORGCMDVENDA:o.IDORGCMDVENDA,IDSTCOMANDA:o.IDSTCOMANDA,
  DTHRABERMESA:o.DTHRABERMESA,items:structuredClone(src.items),
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
// TATÁ number protocol: a LIVE claim needs an Ed25519 attestation from a key in
// the trusted attester set, the day ledger rechecked and a clock. The key below
// is SYNTHETIC provisioning in memory for the gate; the pinned production set
// (data/tata_sequence_attesters_v1.json) has no attester at all.
const A=require("../dist/src/production/tataSequenceAttestationV1.js");
const {STATE_SCHEMA}=require("./comandas_strong_key_sequence_v2_review_only.cjs");
const crypto=require("node:crypto");
function attestedLive(ev,number,{scope="PRODUCTION_ITAIM",now=1793620000}={}){
 const writer=crypto.generateKeyPairSync("ed25519"),attester=crypto.generateKeyPairSync("ed25519");
 const o=ev.order,day=o.DTHRABERMESA.slice(0,10),store=o.CDFILIAL+"|"+o.CDLOJA,n=Number(number);
 const scope_id="STORE:"+store+"|DATE:"+day,v2="STORE:"+o.CDFILIAL+"/"+o.CDLOJA+"|DATE:"+day;
 const rows=Array.from({length:n},(_,k)=>({scope_id:v2,tata_sequence:String(k+1).padStart(3,"0"),
  native_order_key:k+1===n?ev.order_key:"0001|01|TESTPRIOR"+k+"|TESTPRIOR"+k}));
 const statement={schema:A.TATA_ATTESTATION_SCHEMA_V1,store,day,scope_id,order_key:ev.order_key,
  tata_sequence:number,ledger_day_rows:n,ledger_day_digest:A.tataLedgerDayDigestV1(rows,n),
  writer_key_id:A.publicKeyIdV1(writer.publicKey),attester_key_id:A.publicKeyIdV1(attester.publicKey),
  issued_at_s:now-60,expires_at_s:now+3600,nonce:crypto.randomBytes(16).toString("hex")};
 const attestation={...statement,signature_base64:crypto.sign(null,A.attestationPayloadV1(statement),attester.privateKey).toString("base64")};
 return {sequence_binding:{level:"LIVE_ATTESTED",persisted:true,attested_independently:true,
   order_key:ev.order_key,scope_id,tata_sequence:number,attestation},
  sequence_attesters:{schema:A.TATA_ATTESTERS_SCHEMA_V1,store,writer_key_ids:[statement.writer_key_id],
   attesters:[{key_id:statement.attester_key_id,role:"TATA_SEQUENCE_ATTESTER",scope,not_before_s:now-86400,
    not_after_s:now+86400,public_key_spki_base64:attester.publicKey.export({type:"spki",format:"der"}).toString("base64")}]},
  sequence_ledger_day:{schema:STATE_SCHEMA,policy:{width:3,min_value:1,max_value:999},bindings:rows},now_s:now};
}

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
test("native child table veto survives forged scan-complete and ready flags in structural join",()=>{
 const fake=structuredClone(real);
 fake.order.observation_scan_complete=true;
 fake.blockers=["NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ"];
 fake.ready_for_downstream_shadow=true;
 fake.snapshot_hash=snapshotHash(fake.order);
 const d=structuredClone(decision);
 d.snapshot_hash=fake.snapshot_hash;
 const j=N.joinNativeReaderSnapshotV1(fake,d,{});
 assert.equal(j.status,"HOLD");
 assert.equal(j.join,null);
 assert.ok(j.reasons.includes("NATIVE_CHILD_SOURCE_COVERAGE_NOT_ATTESTED"));
 assert.equal(j.provenance.independent_source_attested,false);
});
test("missing coverage veto vector cannot be interpreted as clean native source",()=>{
 const fake=structuredClone(real);
 fake.blockers=null;
 const j=N.joinNativeReaderSnapshotV1(fake,decision,{});
 assert.equal(j.status,"HOLD");
 assert.equal(j.join,null);
 assert.ok(j.reasons.includes("NATIVE_SOURCE_BLOCKERS_INVALID"));
});
test("unrecognized upstream source blocker cannot create a structurally ready native join",()=>{
 const fake=structuredClone(real);
 fake.blockers=["SOURCE_ROWSET_CALLER_NOT_AUTHENTICATED"];
 fake.ready_for_downstream_shadow=true;
 fake.order.observation_scan_complete=true;
 const j=N.joinNativeReaderSnapshotV1(fake,decision,{});
 assert.equal(j.status,"HOLD");
 assert.equal(j.join,null);
 assert.ok(j.reasons.includes("NATIVE_SOURCE_NON_SERVICE_BLOCKER"));
 assert.equal(j.provenance.independent_source_attested,false);
});
test("mixed legacy hours and new source failure still refuse the joined content",()=>{
 const fake=structuredClone(real);
 fake.blockers=["SERVICE_HOURS_OUTSIDE_WINDOW","NATIVE_SOURCE_NOT_PROVEN"];
 const j=N.joinNativeReaderSnapshotV1(fake,decision,{});
 assert.equal(j.status,"HOLD");
 assert.equal(j.join,null);
 assert.ok(j.reasons.includes("NATIVE_SOURCE_NON_SERVICE_BLOCKER"));
});
test("unknown future blocker and malformed blocker both fail closed",()=>{
 for(const cause of ["FUTURE_NATIVE_COMMIT_NOT_PROVEN",null,{},72]){
  const fake=structuredClone(real);
  fake.blockers=[cause];
  const j=N.joinNativeReaderSnapshotV1(fake,decision,{});
  assert.equal(j.status,"HOLD");
  assert.equal(j.join,null);
  assert.ok(j.reasons.includes("NATIVE_SOURCE_NON_SERVICE_BLOCKER"));
 }
});
test("legacy service expiry alone is not a native item-source proof failure",()=>{
 const j=N.joinNativeReaderSnapshotV1(real,decision,{});
 assert.ok(!j.reasons.includes("NATIVE_CHILD_SOURCE_COVERAGE_NOT_ATTESTED"));
 assert.ok(!j.reasons.includes("NATIVE_SOURCE_BLOCKERS_INVALID"));
 assert.equal(j.provenance.independent_source_attested,false);
});
const out=chain(real,decision);
test("native chain: real revision -> three virtual views, dinner routes Sushi 1 to DELIVERY SUSHI 1",()=>{
 assert.equal(out.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
 assert.equal(out.layers.L2.window,"DINNER_CANDIDATE");
 assert.equal(out.layers.L3.status,"NATIVE_CONTENT_PROVEN");
 assert.equal(out.layers.L3.join.print_text_used,false);
 assert.equal(out.layers.L4.status,"VIRTUAL_VIEWS_READY");
 assert.equal(out.layers.L4.view_count,3);
 assert.equal(out.layers.L4.production_view_count,2);
 assert.equal(out.layers.L4.conference_view_count,1);
 assert.deepEqual(out.layers.L4.stations,["COZINHA","DELIVERY SUSHI 1","CONFERENCIA"]);
 assert.deepEqual(out.views.map(v=>v.kind+":"+v.station),
  ["PRODUCAO:COZINHA","PRODUCAO:DELIVERY SUSHI 1","CONFERENCIA:CONFERENCIA"]);
 const conf=out.views[2].text_trace;
 assert.equal((conf.match(/Op\. ________/g)||[]).length,6);
 assert.ok(conf.includes("Sacola: 1 G  |  3 Kit Kids  |  1 Kit Quente"));
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
test("one Sushi 1 item yields exactly TWO applicable virtual views and explicit counts",()=>{
 // One proven sushi item, unlike the Kids combo whose lone-bag rule is HOLD.
 const single=event(o=>({...o,items:o.items.filter(x=>canon(x.CDARVPROD)==="9.30.00.090.00")}));
 assert.equal(single.order.items.length,1);
 const r=chain(single,consume(single));
 assert.equal(r.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
 assert.equal(r.layers.L3.status,"NATIVE_CONTENT_PROVEN",JSON.stringify(r.layers.L3.reasons));
 assert.equal(r.layers.L4.status,"VIRTUAL_VIEWS_READY",JSON.stringify(r.layers.L4.reasons));
 assert.equal(r.layers.L4.view_count,2);
 assert.equal(r.layers.L4.production_view_count,1);
 assert.equal(r.layers.L4.conference_view_count,1);
 assert.deepEqual(r.layers.L4.stations,["DELIVERY SUSHI 1","CONFERENCIA"]);
 assert.deepEqual(r.views.map(x=>x.station),r.layers.L4.stations);
 assert.ok(r.views.every(v=>v.semantic_ready&&v.escpos_bytes===0));
 assert.equal(r.layers.L5.status,"HOLD");
 assert.equal(r.physical_effect_authorized,false);
});
test("a second view cannot bypass an unproven single-item bag",()=>{
 const comboOnly=event(o=>({...o,items:o.items.filter(x=>canon(x.CDARVPROD)==="9.80.00.010.00")}));
 const r=chain(comboOnly,consume(comboOnly));
 assert.equal(r.layers.L3.status,"HOLD");
 assert.ok(r.layers.L3.reasons.includes("BAG_SIZE_NOT_FACT"));
 assert.equal(r.layers.L4.status,"HOLD");
 assert.deepEqual(r.views,[]);
 assert.equal(r.layers.L5.status,"HOLD");
 assert.equal(r.physical_effect_authorized,false);
});
test("outside documented hours: destinations HOLD, proven content is NOT erased",()=>{
 const late=event(o=>({...o,DTHRABERMESA:"2026-10-05T16:10:00.0000000"}));
 const r=chain(late,consume(late));
 assert.equal(r.layers.L2.status,"OUTSIDE_DOCUMENTED_WINDOW");
 assert.equal(r.layers.L3.status,"NATIVE_CONTENT_PROVEN");
 assert.equal(r.layers.L4.status,"HOLD");
 assert.ok(r.layers.L4.reasons.includes("OUTSIDE_REPORTED_DELIVERY_HOURS"));
 assert.deepEqual(r.views,[]);
});
const ev9092=(mut=x=>x)=>event(mut,{o:read9092.observed_order,items:items9092});
const real9092=ev9092(),decision9092=consume(real9092);
test("real 9092 at 23:02 is dinner (César 02/11); the hour never hides its product HOLD",()=>{
 assert.equal(real9092.order.DTHRABERMESA.slice(11,16),"23:02");
 assert.ok(decision9092.blocking_reasons.includes("CLASSIFICATION_UNKNOWN_9.15.00.030.00"));
 const r=chain(real9092,decision9092);
 assert.equal(r.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
 assert.equal(r.layers.L2.status,"NATIVE_ORDER_TIME_WINDOW");
 assert.equal(r.layers.L2.window,"DINNER_CANDIDATE");
 assert.equal(r.layers.L3.status,"HOLD");
 assert.ok(r.layers.L3.reasons.includes("CLASSIFICATION_UNKNOWN_9.15.00.030.00"));
 assert.deepEqual(r.views,[]);
});
test("catalog equivalence resolves 9.15.00.030.00; 9092 then holds ONLY on the unjudged kit rule",()=>{
 const r=chain(real9092,decision9092,{catalog_equivalence:equivalence});
 assert.deepEqual(r.layers.L3.catalog_resolution.resolved,["EQ-9.15.00.030.00"]);
 assert.equal(r.layers.L3.catalog_resolution.motor_rerun,true);
 assert.equal(r.layers.L3.status,"HOLD");
 assert.deepEqual(r.layers.L3.reasons,
  ["MOTOR_KITS_NOT_FACT:Combinado + avulsos fora dos limites julgados: temaki:3."]);
 assert.deepEqual(r.views,[]);
});
test("differential: combo 2p + 2 temakis (a judged kit rule) flows to three dinner views",()=>{
 const two=ev9092(o=>({...o,items:o.items.map(x=>x.CDPRODUTO==="0000001641"?{...x,QTPRODCOMVEN:"2.000"}:x)}));
 const r=chain(two,consume(two),{catalog_equivalence:equivalence});
 assert.equal(r.layers.L3.status,"NATIVE_CONTENT_PROVEN",JSON.stringify(r.layers.L3.reasons));
 assert.equal(r.layers.L4.status,"VIRTUAL_VIEWS_READY",JSON.stringify(r.layers.L4.reasons));
 assert.deepEqual(r.views.map(v=>v.station),["DELIVERY SUSHI 1","DELIVERY SUSHI 2","CONFERENCIA"]);
 assert.ok(r.views[0].text_trace.includes("C1  CAIXA 1500\n1  COMB SUSHI + SASHIMI ESPECIAL 2 P"));
 assert.ok(r.views[1].text_trace.includes("C1  CAIXA 750\n2  TEMAKI DE BARRIGA DE SALMAO"));
 assert.ok(r.views[2].text_trace.includes("Sacola: 1 G  |  1 Kit p/2  |  1 Kit Simples"));
 assert.equal((r.views[2].text_trace.match(/Op\. ________/g)||[]).length,2);
 assert.ok(r.views.every(v=>v.escpos_bytes===0));
});
// César's exact kit decision (PR #135 comment 6582963189): combo 9.15.00.030.00
// x1 + 3 temakis -> Kit p/2 + Kit Simples; + 4 temakis -> Kit p/2 + Kit p/1.
// The 2-temaki rule stays with the pinned motor. Nothing else is generalized.
const kitRules=load("comandas_kit_rules_human_v1.json");
const withTemakis=(n,extra=x=>x)=>ev9092(o=>extra({...o,items:o.items.map(x=>x.CDPRODUTO==="0000001641"?{...x,QTPRODCOMVEN:n+".000"}:x)}));
const kitLine=r=>(r.views.find(v=>v.station==="CONFERENCIA")?.text_trace??"").split("\n").find(l=>/\bKIT\b/i.test(l))??null;
const units=(r,station,name)=>(r.views.find(v=>v.station===station)?.text_trace??"").split("\n")
 .map(l=>/^(\d+)  (.+)$/.exec(l)).filter(m=>m&&m[2]===name).reduce((n,m)=>n+Number(m[1]),0);
test("9092 real: 2p combo + 3 temakis takes César's rule (Kit p/2 + Kit Simples) and reaches three views",()=>{
 const r=chain(real9092,decision9092,{catalog_equivalence:equivalence,kit_rules:kitRules});
 assert.equal(r.layers.L3.status,"NATIVE_CONTENT_PROVEN",JSON.stringify(r.layers.L3.reasons));
 assert.equal(r.layers.L3.kit_rule?.id,"KIT-9.15.00.030.00-x1+TEMAKI-x3");
 assert.match(r.layers.L3.kit_rule.source_ref,/issuecomment-6582963189$/);
 assert.equal(r.layers.L4.status,"VIRTUAL_VIEWS_READY",JSON.stringify(r.layers.L4?.reasons));
 assert.deepEqual(r.views.map(v=>v.station),["DELIVERY SUSHI 1","DELIVERY SUSHI 2","CONFERENCIA"]);
 assert.match(kitLine(r),/1 KIT P\/2/i);assert.match(kitLine(r),/1 KIT SIMPLES/i);
 assert.doesNotMatch(kitLine(r),/KIT P\/1/i);
 assert.equal(units(r,"CONFERENCIA","TEMAKI DE BARRIGA DE SALMAO"),3);
 assert.equal(units(r,"DELIVERY SUSHI 2","TEMAKI DE BARRIGA DE SALMAO"),3);
 assert.equal(units(r,"DELIVERY SUSHI 1","COMB SUSHI + SASHIMI ESPECIAL 2 P"),1);
});
test("4 temakis -> Kit p/2 + Kit p/1 (rule); 2 temakis keep the motor's own judged rule (no overlay)",()=>{
 const four=withTemakis(4),r4=chain(four,consume(four),{catalog_equivalence:equivalence,kit_rules:kitRules});
 assert.equal(r4.layers.L3.kit_rule?.id,"KIT-9.15.00.030.00-x1+TEMAKI-x4",JSON.stringify(r4.layers.L3));
 assert.equal(r4.layers.L3.status,"NATIVE_CONTENT_PROVEN",JSON.stringify(r4.layers.L3.reasons));
 assert.match(kitLine(r4),/1 KIT P\/2/i);assert.match(kitLine(r4),/1 KIT P\/1/i);
 assert.doesNotMatch(kitLine(r4),/KIT SIMPLES/i);
 assert.equal(units(r4,"CONFERENCIA","TEMAKI DE BARRIGA DE SALMAO"),4);
 const two=withTemakis(2),r2=chain(two,consume(two),{catalog_equivalence:equivalence,kit_rules:kitRules});
 assert.equal(r2.layers.L3.kit_rule,null);
 assert.equal(r2.layers.L3.status,"NATIVE_CONTENT_PROVEN");
 assert.match(kitLine(r2),/1 KIT P\/2/i);assert.match(kitLine(r2),/1 KIT SIMPLES/i);
});
test("no extrapolation: 5 temakis, combo x2, other item, or no rule file keep the motor HOLD",()=>{
 const five=withTemakis(5),r5=chain(five,consume(five),{catalog_equivalence:equivalence,kit_rules:kitRules});
 assert.equal(r5.layers.L3.status,"HOLD");assert.equal(r5.layers.L3.kit_rule??null,null);
 assert.ok(r5.layers.L3.reasons.some(x=>/^MOTOR_KITS_NOT_FACT:.*temaki:5/.test(x)),JSON.stringify(r5.layers.L3.reasons));
 const combo2=withTemakis(3,o=>({...o,items:o.items.map(x=>x.CDPRODUTO==="0000001459"?{...x,QTPRODCOMVEN:"2.000"}:x)}));
 const rc=chain(combo2,consume(combo2),{catalog_equivalence:equivalence,kit_rules:kitRules});
 assert.equal(rc.layers.L3.kit_rule??null,null);
 assert.ok(rc.views.every(v=>!/KIT SIMPLES/i.test(v.text_trace)||rc.layers.L3.status==="NATIVE_CONTENT_PROVEN"));
 const r0=chain(real9092,decision9092,{catalog_equivalence:equivalence});
 assert.deepEqual([r0.layers.L3.status,r0.layers.L3.kit_rule??null],["HOLD",null]);
 // Unit level, on the real decision: every identity mismatch refuses the rule.
 const res=N.resolveCatalogEquivalenceV1(real9092,decision9092,equivalence.records,decision9092.blocking_reasons);
 const notFact={status:"UNKNOWN",kits:[]};
 const apply=(d,rules=kitRules.rules,motor=notFact)=>N.resolveHumanKitRuleV1(d,res,rules,motor);
 assert.equal(apply(decision9092).rule.id,"KIT-9.15.00.030.00-x1+TEMAKI-x3");
 const mutate=f=>{const d=structuredClone(decision9092);f(d);return d;};
 assert.equal(apply(mutate(d=>{d.items[0].CDPRODUTO="0000009999";})).rule,null);
 assert.equal(apply(mutate(d=>{d.items[0].canonical_code="9.15.00.040.00";})).rule,null);
 assert.equal(apply(mutate(d=>{d.items.push({...d.items[1],item_index:3,CDPRODUTO:"0000001418",
  canonical_code:"9.10.00.080.00",product_name:"EDAMAME",quantity:1,classification:{family:"entrada",
  subfamily:"entrada_quente",station:"cozinha_quentes",review_required:false}});})).rule,null);
 assert.equal(apply(mutate(d=>{d.items[1].classification={...d.items[1].classification,review_required:true};})).rule,null);
 assert.equal(apply(decision9092,kitRules.rules,{status:"FACT",kits:[{kit:"Kit p/2",quantidade:1},{kit:"Kit Simples",quantidade:1}]}).rule,null);
 assert.equal(apply(decision9092,kitRules.rules,{status:"FACT",kits:[{kit:"Kit p/1",quantidade:1}]}).reason,
  "HUMAN_KIT_RULE_CONFLICTS_WITH_MOTOR");
 assert.equal(apply(decision9092,[...kitRules.rules,{...kitRules.rules[0],id:"DUP"}]).reason,"HUMAN_KIT_RULE_AMBIGUOUS");
 assert.equal(apply(decision9092,[{...kitRules.rules[0],source_ref:""}]).reason,"HUMAN_KIT_RULE_RECORD_INVALID");
 assert.equal(apply(decision9092,[{...kitRules.rules[0],kits:[{kit:"Kit p/3",quantidade:1}]}]).reason,"HUMAN_KIT_RULE_RECORD_INVALID");
});
test("catalog equivalence guards: exact native match only, no override, ambiguity and bad records refused",()=>{
 const rec=equivalence.records[0];
 const run=recs=>N.resolveCatalogEquivalenceV1(real9092,decision9092,recs,decision9092.blocking_reasons);
 for(const bad of [{native_cdproduto:"0000009999"},{native_name:"COMB SASHIMI + SUSHI ESPECIAL 2 P"},
  {canonical_code:"9.15.00.040.00"}])
  assert.deepEqual(run([{...rec,...bad}]).resolved,[]);
 assert.deepEqual(run([rec,{...rec,id:"EQ-DUP"}]).refused,["CATALOG_EQUIVALENCE_AMBIGUOUS:9.15.00.030.00"]);
 assert.ok(run([{...rec,academy_entry_ids:["only_one"]}]).refused.includes("CATALOG_EQUIVALENCE_RECORD_INVALID"));
 // A proven classification is never replaced, even by a record for that code.
 const kids={...rec,id:"EQ-KIDS",canonical_code:"9.80.00.010.00",native_cdproduto:"0000001705",native_name:"COMBINADO KIDS"};
 assert.deepEqual(N.resolveCatalogEquivalenceV1(real,decision,[kids],decision.blocking_reasons).resolved,[]);
 assert.equal(JSON.stringify(chain(real,decision,{catalog_equivalence:{records:[kids]}}).views),JSON.stringify(out.views));
 assert.equal(rec.not_a_human_confirmation,true);
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
test("real-world legacy hours + Sushi 1 reason are separated without bypassing exact routing",()=>{
 const ev=structuredClone(real);
 ev.blockers=["SERVICE_HOURS_OUTSIDE_WINDOW"];
 ev.service_resolution={service:null,evidence:"UNKNOWN",source_ref:null,
  blockers:["SERVICE_HOURS_OUTSIDE_WINDOW"]};
 ev.ready_for_downstream_shadow=false;
 const dec=structuredClone(decision);
 dec.blocking_reasons=["UPSTREAM_SERVICE_HOURS_OUTSIDE_WINDOW",
  "SERVICE_REQUIRED_SUSHI1_9.80.00.010.00","TATA_SEQUENCE_STATE_MISSING"];
 const cls=N.classifyConsumerBlockersV1(dec.blocking_reasons,ev.blockers);
 assert.deepEqual(cls.content,[]);
 assert.deepEqual(cls.legacy_service_state,["UPSTREAM_SERVICE_HOURS_OUTSIDE_WINDOW"]);
 assert.deepEqual(cls.paired_destination.map(x=>[x.pair,x.canonical_code]),
  [["SUSHI_1","9.80.00.010.00"]]);
 const r=chain(ev,dec);
 assert.equal(r.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
 assert.equal(r.layers.L2.window,"DINNER_CANDIDATE");
 assert.equal(r.layers.L3.status,"NATIVE_CONTENT_PROVEN");
 assert.equal(r.layers.L4.status,"VIRTUAL_VIEWS_READY");
 assert.deepEqual(r.views.map(x=>x.station),["COZINHA","DELIVERY SUSHI 1","CONFERENCIA"]);
 assert.equal(r.layers.L5.status,"HOLD");
 assert.ok(r.views.every(v=>v.escpos_bytes===0));
 assert.equal(r.physical_effect_authorized,false);
});
test("legacy Sushi 1 role cannot invent a code or a missing paired station",()=>{
 const ev=structuredClone(real);ev.blockers=["SERVICE_HOURS_OUTSIDE_WINDOW"];
 const dec=structuredClone(decision);
 const cause="UPSTREAM_SERVICE_HOURS_OUTSIDE_WINDOW";
 for(const [req,blocked] of [
  ["SERVICE_REQUIRED_SUSHI1_9.15.00.050.00","LEGACY_SERVICE_PAIR_PRODUCT_NOT_IN_NATIVE_REVISION"],
  ["SERVICE_REQUIRED_SUSHI2_9.80.00.010.00","LEGACY_SERVICE_PAIR_DESTINATIONS_NOT_PROVEN"]]){
  dec.blocking_reasons=[cause,req];
  const r=chain(ev,dec);
  assert.equal(r.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
  assert.equal(r.layers.L3.status,"NATIVE_CONTENT_PROVEN");
  assert.equal(r.layers.L4.status,"HOLD");
  assert.ok(r.layers.L4.reasons.includes(blocked),JSON.stringify(r.layers.L4.reasons));
  assert.deepEqual(r.views,[]);
  assert.equal(r.layers.L5.status,"HOLD");
 }
});
test("untrusted/unknown service labels remain CONTENT or an out-of-hours destination HOLD",()=>{
 const ev=structuredClone(real);ev.blockers=["SERVICE_HOURS_OUTSIDE_WINDOW","NATIVE_SOURCE_NOT_PROVEN"];
 const base=structuredClone(decision);
 for(const extra of ["UPSTREAM_SERVICE_HOURS_OUTSIDE_WINDOW",
  "SERVICE_REQUIRED_SUSHI1_9.80.00.010.00_EXTRA",
  "UPSTREAM_SERVICE_UNEXPECTED"]){
  const changed=structuredClone(base);changed.blocking_reasons=[extra];
  const r=chain(ev,changed);
  assert.equal(r.layers.L3.status,"HOLD");
  assert.deepEqual(r.views,[]);
 }
 const outside=event(o=>({...o,DTHRABERMESA:"2026-10-05T16:10:00.0000000"}));
 const decisionOutside=consume(outside);
 outside.blockers=["SERVICE_HOURS_OUTSIDE_WINDOW"];
 decisionOutside.blocking_reasons=["UPSTREAM_SERVICE_HOURS_OUTSIDE_WINDOW",
  "SERVICE_REQUIRED_SUSHI1_9.80.00.010.00"];
 const r=chain(outside,decisionOutside);
 assert.equal(r.layers.L2.status,"OUTSIDE_DOCUMENTED_WINDOW");
 assert.equal(r.layers.L4.status,"HOLD");
 assert.deepEqual(r.views,[]);
});
test("unknown consumer blocker is CONTENT (fail closed); mixed upstream blocker is not 'service'",()=>{
 const d=structuredClone(decision);d.blocking_reasons=[...d.blocking_reasons,"SOMETHING_NEW"];
 const r=chain(real,d);
 assert.equal(r.layers.L3.status,"HOLD");assert.ok(r.layers.L3.reasons.includes("SOMETHING_NEW"));
 const c=N.classifyConsumerBlockersV1(["UPSTREAM_EVENT_NOT_READY","UPSTREAM_X"],["SERVICE_STATE_EXPIRED_FOR_ORDER","X"]);
 assert.deepEqual(c.content.sort(),["UPSTREAM_EVENT_NOT_READY","UPSTREAM_X"]);
});
test("sequence levels: only LIVE_ATTESTED for this order and Itaim day reaches paper; PREVIEW and lab never print",()=>{
 const scope="STORE:0001|01|DATE:2026-10-04";
 const base={order_key:real.order_key,scope_id:scope,tata_sequence:"037"};
 const L=attestedLive(real,"037"),live=L.sequence_binding;
 const none=chain(real,decision);
 assert.deepEqual([none.layers.L5.reasons,none.layers.L5.sequence_level,none.layers.L5.sequence_scope],
  [["TATA_SEQUENCE_NOT_BOUND"],null,scope]);
 assert.equal(none.layers.L5.sequence_rule_ref,"human:cesar:2026-10-01:daily-store-tata-sequence");
 // PREVIEW and lab numbers are reported for review, never placed in a view.
 for(const [level,persisted,reason] of [["PREVIEW",false,"TATA_SEQUENCE_PREVIEW_ONLY_NOT_PERSISTED"],
  ["CANDIDATE_PERSISTED_IN_LAB",true,"TATA_SEQUENCE_LAB_ONLY_NOT_LIVE_ATTESTED"]]){
  const r=chain(real,decision,{sequence_binding:{...base,level,persisted,attested_independently:false}});
  assert.deepEqual([r.layers.L5.status,r.layers.L5.reasons,r.layers.L5.sequence_level,
   r.layers.L5.candidate_number,r.layers.L5.tata_number],["HOLD",[reason],level,"037",null]);
  assert.ok(r.views.length===3&&r.views.every(v=>v.escpos_bytes===0&&!/\b037\b/.test(v.text_trace)));
 }
 // Refused claims: flags that contradict the level, other order, other day or
 // unit, number 000, and the old snapshot-pinned shape without a level.
 for(const b of [{...live,attested_independently:false},{...live,persisted:false},
  {...base,level:"CANDIDATE_PERSISTED_IN_LAB",persisted:true,attested_independently:true},
  {...live,order_key:real.order_key.replace(/\|[^|]+$/,"|0000000001")},
  {...live,scope_id:"STORE:0001|01|DATE:2026-10-05"},{...live,scope_id:"STORE:0001|02|DATE:2026-10-04"},
  {...live,tata_sequence:"000"},{...live,level:"live_attested"},{...live,tata_sequence:"038"},
  {...live,attestation:undefined},{...base,level:"LIVE_ATTESTED",persisted:true,attested_independently:true},
  {persisted:true,attested_independently:true,order_key:real.order_key,snapshot_sha256:real.snapshot_hash,tata_sequence:"037"}]){
  const r=chain(real,decision,{...L,sequence_binding:b});
  assert.deepEqual([r.layers.L5.tata_number,r.layers.L5.sequence_level,r.layers.L5.candidate_number],[null,null,null],JSON.stringify(b));
  assert.ok(r.views.every(v=>v.escpos_bytes===0));
 }
 // Attested in isolation (TEST anchor): reported like the lab, never printed.
 const iso=chain(real,decision,attestedLive(real,"037",{scope:"TEST_ISOLATED"}));
 assert.deepEqual([iso.layers.L5.tata_number,iso.layers.L5.sequence_level,iso.layers.L5.candidate_number,iso.layers.L5.reasons],
  [null,"CANDIDATE_PERSISTED_IN_LAB","037",["TATA_SEQUENCE_ATTESTED_IN_ISOLATION_NOT_LIVE"]]);
 assert.ok(iso.views.every(v=>v.escpos_bytes===0));
 // A valid attestation alone is not enough: no ledger, no clock, rewritten history.
 const rewritten=structuredClone(L.sequence_ledger_day);rewritten.bindings[0].native_order_key="0001|01|TESTOTHER|TESTOTHER";
 for(const [extra,reason] of [[{sequence_ledger_day:undefined},"TATA_SEQUENCE_LEDGER_NOT_RECHECKED"],
  [{now_s:undefined},"TATA_SEQUENCE_ATTESTATION_REFUSED:CLOCK_MISSING"],
  [{now_s:L.now_s+7200},"TATA_SEQUENCE_ATTESTATION_REFUSED:WINDOW_INVALID"],
  [{sequence_ledger_day:rewritten},"TATA_SEQUENCE_LEDGER_HISTORY_CHANGED"],
  [{sequence_attesters:{...L.sequence_attesters,attesters:[]}},"TATA_SEQUENCE_ATTESTATION_REFUSED:ATTESTER_NOT_TRUSTED"]]){
  const r=chain(real,decision,{...L,...extra});
  assert.deepEqual([r.layers.L5.tata_number,r.layers.L5.reasons],[null,[reason]],reason);
 }
 // The ledger keeps growing during the day: later orders never void an attestation.
 const grown=structuredClone(L.sequence_ledger_day);
 grown.bindings.push({...grown.bindings[0],native_order_key:"0001|01|TESTLATER|TESTLATER",tata_sequence:"038"});
 assert.equal(chain(real,decision,{...L,sequence_ledger_day:grown}).layers.L5.tata_number,"037");
 // The pinned production attester set is empty: nothing reaches paper with it.
 const pinned=load("tata_sequence_attesters_v1.json");
 assert.deepEqual([pinned.schema,pinned.attesters],[A.TATA_ATTESTERS_SCHEMA_V1,[]]);
 assert.equal(chain(real,decision,{...L,sequence_attesters:pinned}).layers.L5.tata_number,null);
 // Attested by a provisioned PRODUCTION key (synthetic here): the number reaches the three views.
 const ok=chain(real,decision,L);
 assert.deepEqual([ok.layers.L5.status,ok.layers.L5.tata_number,ok.layers.L5.sequence_level],["BOUND","037","LIVE_ATTESTED"]);
 assert.ok(ok.views.every(v=>v.text_trace.includes("iFood #9627  |  TEKNISA")&&/\b037\b/.test(v.text_trace)));
 // The number belongs to the ORDER: a new native revision (header X -> P,
 // other snapshot) keeps it; the contract never renumbers a revision.
 const rev=event(o=>({...o,IDSTCOMANDA:"P"}));
 assert.notEqual(rev.snapshot_hash,real.snapshot_hash);
 const again=chain(rev,consume(rev),L);
 assert.deepEqual([again.layers.L5.status,again.layers.L5.tata_number],["BOUND","037"]);
});
test("a converted or malformed native clock has no Itaim window or day: L2 and L5 HOLD",()=>{
 for(const t of ["2026-10-05T01:58:50Z","2026-10-04T22:58:50-03:00","2026-10-04T22:58:50.0000000+00:00",
  "2026-10-04 22:58:50","2026-10-04T24:00:00.0000000"]){
  const ev=event(o=>({...o,DTHRABERMESA:t}));
  const r=chain(ev,consume(ev),attestedLive(real,"037"));
  if(r.layers.L1.status!=="NATIVE_REVISION_CONSISTENT"){assert.equal(r.layers.L1.status,"HOLD",t);continue;}
  assert.deepEqual([r.layers.L2.status,r.layers.L2.reasons,r.layers.L2.window],
   ["HOLD",["NATIVE_ORDER_TIME_NOT_STORE_LOCAL"],null],t);
  assert.equal(r.layers.L5.tata_number,null,t);assert.ok(r.layers.L5.reasons.includes("SOURCE_LOCAL_DAY_NOT_TRUSTED"),t);
  assert.ok(r.views.every(v=>v.escpos_bytes===0),t);
 }
 assert.deepEqual(N.storeLocalTimeV1("2026-10-04T22:58:50.0000000"),{day:"2026-10-04",hm:"22:58"});
});
test("native item notes stay intact: own station and conference, verbatim, never elsewhere; a general note HOLDs",()=>{
 const {planAnnotationV67}=require("../dist/src/production/annotationLinePlanV67.js");
 const note=(o,field,value,i)=>({source_field:field,value,scope_hint:"item",join_proven:true,
  item_index:i,CDPRODUTO:o.items[i].CDPRODUTO});
 // 0 COMBINADO KIDS (3 closed boxes, Sushi 1) · 1 EDAMAME (Cozinha) · 3 SUSHI DE UNAGUI (Sushi 1);
 // the same note in DSOBS* and TXPRODCOMVEN must print once, not twice.
 const ev=event(o=>({...o,observation_rows:[note(o,"DSOBSPEDDIGCMD","sem cebolinha",0),
  note(o,"DSOBSDESCIT","MOLHO A PARTE",1),note(o,"TXPRODCOMVEN","SEM TARE",3),note(o,"DSOBSPEDDIGCMD","SEM TARE",3)]}));
 const r=chain(ev,consume(ev),attestedLive(ev,"037"));
 assert.deepEqual([r.layers.L3.status,r.layers.L4?.status],["NATIVE_CONTENT_PROVEN","VIRTUAL_VIEWS_READY"],
  JSON.stringify([r.layers.L3.reasons,r.layers.L4?.reasons]));
 const view=st=>r.views.find(v=>v.station===st).text_trace.split("\n");
 const [kitchen,sushi,conf]=[view("COZINHA"),view("DELIVERY SUSHI 1"),view("CONFERENCIA")];
 const count=(lines,s)=>lines.filter(l=>l===s).length;
 const printed=raw=>planAnnotationV67("OBS",raw.toLocaleUpperCase("pt-BR")).lines.map(l=>l.text);
 for(const [raw,product,own,other] of [["sem cebolinha","1  COMBINADO KIDS",sushi,kitchen],
  ["MOLHO A PARTE","1  EDAMAME",kitchen,sushi],["SEM TARE","1  SUSHI DE UNAGUI",sushi,kitchen]]){
  const boxes=count(own,product);assert.ok(boxes>=1,product);
  for(const l of printed(raw)){
   assert.equal(count(own,l),boxes,raw+" in own station, once per box of its product");
   assert.equal(count(conf,l),count(conf,product),raw+" in the conference with its product");
   assert.equal(count(other,l),0,raw+" never in the other station");
  }
 }
 assert.ok(r.views.every(v=>v.escpos_bytes>0));
 // Figma: notes bold on production views (master 30:3), regular on the conference (20:9).
 const P=require("./comandas_papel_virtual_escpos_v1_offline.cjs");
 for(const v of r.views){
  const notes=P.layoutVirtualPaperV1(v.escpos).lines.filter(l=>/^OBS: /.test(l.text));
  assert.ok(notes.length>0&&notes.every(l=>l.runs[0].bold===(v.kind==="PRODUCAO")),v.station);
 }
 // General note (DSOBSCOMANDA): may carry payment text; V7.6/V7.7 keep it
 // blocked until a per-note human disposition. Never dropped, never printed.
 const g=event(o=>({...o,observation_rows:[{source_field:"DSOBSCOMANDA",value:"TROCO PARA 100",scope_hint:"order",join_proven:true}]}));
 const rg=chain(g,consume(g),attestedLive(g,"037"));
 assert.equal(rg.layers.L4.status,"HOLD");assert.ok(rg.layers.L4.reasons.includes("ORDER_OBSERVATION_RELEVANCE_UNPROVEN_0"));
 assert.deepEqual(rg.views,[]);
});
test("one explicitly reviewed financial general note stays in source but not in three shadow views",()=>{
 const ev=event(o=>({...o,observation_rows:[{source_field:"DSOBSCOMANDA",
  value:"PAGO ONLINE (VALOR: 99.00) ID: 456 - COD. P/ CANCELAMENTO: 789",
  scope_hint:"order",join_proven:true}]}));
 const dec=consume(ev);
 const oldEvent=JSON.stringify(ev),oldDecision=JSON.stringify(dec);
 const hash=s=>crypto.createHash("sha256").update(s,"utf8").digest("hex");
 const note=ev.order.observation_rows[0].value;
 const claim={schema:"tata.comandas.note-disposition-claim.v1",
  scope:"SHADOW_VIEW_ONLY",classification:"NON_PRODUCTION_SENSITIVE_PAYMENT_CANCEL_METADATA",
  action:"EXCLUDE_FROM_PRODUCTION_TICKETS",source_field:"DSOBSCOMANDA",
  human_review_reference:"human-review:cesar-test-fixture-20261103",
  order_key_digest:hash(ev.order_key),snapshot_hash:ev.snapshot_hash.toLowerCase(),
  decision_fingerprint:dec.fingerprint.toLowerCase(),note_content_sha256:hash(note),
  event_file_sha256:hash(oldEvent),decision_file_sha256:hash(oldDecision)};
 const sources={event_json:oldEvent,decision_json:oldDecision};
 const noClaim=chain(ev,dec);
 assert.equal(noClaim.layers.L4.status,"HOLD");
 assert.ok(noClaim.layers.L4.reasons.includes("ORDER_OBSERVATION_RELEVANCE_UNPROVEN_0"));
 const accepted=chain(ev,dec,{note_disposition_claim:claim,
  note_source_file_pair:sources});
 assert.equal(accepted.layers.L1.status,"NATIVE_REVISION_CONSISTENT");
 assert.equal(accepted.layers.L3.status,"NATIVE_CONTENT_PROVEN");
 assert.equal(accepted.layers.L4.status,"VIRTUAL_VIEWS_READY");
 assert.equal(accepted.layers.L4.note_disposition,"EXCLUDED_FOR_SHADOW_ONLY");
 assert.equal(accepted.layers.L5.status,"HOLD");
 assert.equal(accepted.views.length,3);
 assert.ok(accepted.views.every(v=>v.escpos_bytes===0));
 assert.ok(accepted.views.every(v=>!v.text_trace.includes(note)));
 assert.equal(JSON.stringify(ev),oldEvent);
 assert.equal(JSON.stringify(dec),oldDecision);
 const checkReject=(change,code)=>{
  const invalid={...claim,...change};
  const r=chain(ev,dec,{note_disposition_claim:invalid,
   note_source_file_pair:sources});
  assert.equal(r.layers.L3.status,"NATIVE_CONTENT_PROVEN");
  assert.equal(r.layers.L4.status,"HOLD");
  assert.ok(r.layers.L4.reasons.includes(code),JSON.stringify(r.layers.L4.reasons));
  assert.deepEqual(r.views,[]);
 };
 checkReject({scope:"PRODUCTION"},"NOTE_DISPOSITION_SCOPE_OR_HUMAN_REVIEW_REF_INVALID");
 checkReject({note_content_sha256:"f".repeat(64)},"NOTE_DISPOSITION_NOT_BOUND_TO_EXACT_GENERAL_NOTE");
 checkReject({decision_fingerprint:"e".repeat(64)},"NOTE_DISPOSITION_NOT_BOUND_TO_NATIVE_REVISION");
 checkReject({order_key_digest:"a".repeat(64)},"NOTE_DISPOSITION_NOT_BOUND_TO_NATIVE_REVISION");
 checkReject({classification:"PRODUCTION_RELEVANT"},"NOTE_DISPOSITION_SCOPE_OR_HUMAN_REVIEW_REF_INVALID");
 checkReject({action:"PRINT_ON_CONFERENCE"},"NOTE_DISPOSITION_SCOPE_OR_HUMAN_REVIEW_REF_INVALID");
 checkReject({human_review_reference:""},"NOTE_DISPOSITION_SCOPE_OR_HUMAN_REVIEW_REF_INVALID");
 const verifySourceHold=(sourcePair,customClaim,code)=>{
  const r=chain(ev,dec,{note_disposition_claim:customClaim??claim,
   ...(sourcePair===undefined?{}:{note_source_file_pair:sourcePair})});
  assert.equal(r.layers.L4.status,"HOLD");
  assert.ok(r.layers.L4.reasons.includes(code),JSON.stringify(r.layers.L4.reasons));
  assert.deepEqual(r.views,[]);
  assert.equal(r.physical_effect_authorized,false);
  assert.ok(!JSON.stringify(r).includes(note));
 };
 verifySourceHold(undefined,claim,"NOTE_SOURCE_FILE_BYTES_REQUIRED_FOR_SHADOW");
 verifySourceHold({event_json:oldEvent},claim,"NOTE_SOURCE_FILE_BYTES_REQUIRED_FOR_SHADOW");
 verifySourceHold({event_json:oldEvent,decision_json:oldDecision,
  claimed_real_proven:true},claim,"NOTE_SOURCE_FILE_BYTES_REQUIRED_FOR_SHADOW");
 verifySourceHold({...sources,event_json:oldEvent+" "},claim,
  "NOTE_SOURCE_FILE_SHA256_MISMATCH");
 verifySourceHold({...sources,decision_json:oldDecision+" "},claim,
  "NOTE_SOURCE_FILE_SHA256_MISMATCH");
 verifySourceHold(sources,{...claim,event_file_sha256:"e".repeat(64)},
  "NOTE_SOURCE_FILE_SHA256_MISMATCH");
 verifySourceHold(sources,{...claim,decision_file_sha256:"e".repeat(64)},
  "NOTE_SOURCE_FILE_SHA256_MISMATCH");
 const tamperedEvent=JSON.stringify({...ev,order:{...ev.order,NRCOMANDA:"TAMPERED"}});
 verifySourceHold({...sources,event_json:tamperedEvent},
  {...claim,event_file_sha256:hash(tamperedEvent)},
  "NOTE_SOURCE_FILES_NOT_SAME_NATIVE_PAIR");
 const tamperedDecision=JSON.stringify({...dec,blocking_reasons:["TAMPERED"]});
 verifySourceHold({...sources,decision_json:tamperedDecision},
  {...claim,decision_file_sha256:hash(tamperedDecision)},
  "NOTE_SOURCE_FILES_NOT_SAME_NATIVE_PAIR");
 verifySourceHold({...sources,event_json:"{"},
  {...claim,event_file_sha256:hash("{")},"NOTE_SOURCE_FILE_JSON_INVALID");
 verifySourceHold({...sources,decision_json:"{"},
  {...claim,decision_file_sha256:hash("{")},"NOTE_SOURCE_FILE_JSON_INVALID");
 const nonCanonicalEvent=JSON.stringify(ev,null,2);
 const nonCanonicalDecision=JSON.stringify(dec,null,2);
 const sameObjectWithDifferentRawFileBytes=chain(ev,dec,{
  note_disposition_claim:{...claim,event_file_sha256:hash(nonCanonicalEvent),
   decision_file_sha256:hash(nonCanonicalDecision)},
  note_source_file_pair:{event_json:nonCanonicalEvent,
   decision_json:nonCanonicalDecision}});
 assert.equal(sameObjectWithDifferentRawFileBytes.layers.L4.status,"VIRTUAL_VIEWS_READY");
 assert.equal(sameObjectWithDifferentRawFileBytes.layers.L5.status,"HOLD");
 assert.equal(sameObjectWithDifferentRawFileBytes.physical_effect_authorized,false);
 assert.ok(sameObjectWithDifferentRawFileBytes.views.every(x=>!x.text_trace.includes(note)));
 assert.equal(JSON.stringify(ev),oldEvent);
 assert.equal(JSON.stringify(dec),oldDecision);
});
test("three-view content contract: ids on every view, each product in exactly one station, conference complete",()=>{
 const r=chain(real,decision,attestedLive(real,"037"));
 const native=new Map(decision.items.map(x=>[x.product_name.toLocaleUpperCase("pt-BR"),x.quantity]));
 const itemsOf=v=>v.text_trace.split("\n").map(l=>/^(\d+)  (.+)$/.exec(l)).filter(Boolean)
  .map(m=>({qty:Number(m[1]),name:m[2]}));
 const sum=(list,name)=>list.filter(x=>x.name===name).reduce((n,x)=>n+x.qty,0);
 const production=r.views.filter(v=>v.kind==="PRODUCAO"),conf=r.views.find(v=>v.kind==="CONFERENCIA");
 // iFood + Teknisa + TATÁ (synthetic LIVE claim) identical on the three views.
 for(const v of r.views){
  assert.ok(v.text_trace.includes("iFood #9627  |  TEKNISA 0000348850  |  22:58"),v.station);
  assert.equal(v.text_trace.trim().split("\n").at(-1),"037",v.station);
 }
 for(const [name,qty] of native){
  // Every production product sits in exactly ONE station view, with its full quantity.
  const holders=production.filter(v=>sum(itemsOf(v),name)>0);
  assert.equal(holders.length,1,name+" must be in exactly one station view");
  assert.equal(sum(itemsOf(holders[0]),name),qty,name+" quantity in its station");
  // The conference carries every product with its full quantity.
  assert.equal(sum(itemsOf(conf),name),qty,name+" quantity in the conference");
 }
 // Nothing foreign: no line in any view that is not a native product.
 for(const v of r.views)for(const x of itemsOf(v))assert.ok(native.has(x.name),v.station+": "+x.name);
 // One operator field per physical box; box numbering is contiguous C1..Cn.
 const boxes=conf.text_trace.split("\n").filter(l=>/^C\d+  CAIXA /.test(l));
 assert.deepEqual(boxes.map(l=>l.split(" ")[0]),boxes.map((_,i)=>"C"+(i+1)));
 assert.ok(boxes.every(l=>l.endsWith("  Op. ________")));
 assert.equal((conf.text_trace.match(/Op\. ________/g)||[]).length,boxes.length);
 // Figma V4.4/V4.3 layout (César 02/11): full-width dividers, one after every
 // box (conference included), Op. in the right column, the station name alone,
 // no lines the approved masters do not have, the master's shadow banner.
 const FULL="-".repeat(48);
 for(const v of r.views){
  const lines=v.text_trace.split("\n");
  assert.equal(lines[0],"SIMULAÇÃO · NÃO PRODUZIR",v.station);
  assert.ok(!lines.some(l=>/^-+$/.test(l)&&l!==FULL),v.station+": every divider spans 48 columns");
  for(let k=1;k<lines.length;k++)if(/^C\d+  CAIXA /.test(lines[k])&&!/^C1  /.test(lines[k]))
   assert.equal(lines.slice(0,k).reverse().find(l=>/^C\d+  CAIXA |^-+$/.test(l)),FULL,v.station+": divider between boxes");
 }
 assert.deepEqual(production.map(v=>v.text_trace.split("\n")[1]),["COZINHA","DELIVERY SUSHI 1"]);
 assert.equal(conf.text_trace.split("\n")[1],"CONFERÊNCIA");
 assert.ok(boxes.every(l=>l.length===48),"Op. ends at the right edge");
 assert.ok(!/1 CAIXA \||FINALIZAÇÃO: CONFERIR FICHA VALIDADA/.test(conf.text_trace));
 // The exact bytes decode with the known command set and fit the 72 mm width.
 const P=require("./comandas_papel_virtual_escpos_v1_offline.cjs");
 for(const v of r.views){
  const lay=P.layoutVirtualPaperV1(v.escpos);
  assert.deepEqual([lay.errors,lay.overflow,v.escpos.length],[[],[],v.escpos_bytes],v.station);
  assert.equal(require("node:crypto").createHash("sha256").update(Buffer.from(v.escpos)).digest("hex"),v.escpos_sha256);
  // The TATÁ number is the largest element; item names are 1x2 bold.
  const seq=lay.lines.find(l=>l.text==="037"),items=lay.lines.filter(l=>/^\d+  /.test(l.text));
  assert.ok(seq&&items.length&&items.every(l=>seq.height>l.height&&l.runs[0].hmul===2&&l.runs[0].bold),v.station);
  assert.ok(lay.lines.every(l=>l===seq||l.height<seq.height),v.station+": nothing as tall as the TATÁ number");
  if(v.kind==="PRODUCAO"){const st=lay.lines[1];assert.deepEqual([st.runs[0].hmul,st.runs[0].bold],[2,true]);}
 }
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

/**
 * Integrated, separated-role V2 rehearsal on an archived REAL native source.
 * Only the disposable SQLite fixture and ephemeral Ed25519 keys are used.
 * There is no production provisioning, live ledger, host or printer effect.
 */
const Integration=require("./comandas_conference_sequence_v2_integration_v1.cjs");
const WriterCore=require("./comandas_sequence_v2_authorized_ledger_core_v1.cjs");
const {attestSignedLedgerV2}=require("./comandas_sequence_v2_independent_attester_core_v1.cjs");
const {DatabaseSync:SQLiteFixture}=require("node:sqlite");
const integrationInput={event:real,decision,routing,printer_map:printers,
 calibration,motor_source:MOTOR};
const prepared=Integration.preflightConferenceV2(integrationInput);
test("V2 integration: actual native 9627 content preflight, Conference only, no effects",()=>{
 assert.equal(prepared.status,"READY_FOR_SIGNED_WRITER_REVIEW_ONLY",JSON.stringify(prepared));
 assert.ok(/^[a-f0-9]{64}$/.test(prepared.source_fingerprint));
 assert.ok(prepared.conference_lines>0);
 assert.equal(prepared.production_station_count,2);
 assert.equal(prepared.conference,null);
 assert.equal(prepared.number_for_operational_ticket,null);
 assert.equal(prepared.physical_print_authorized,false);
 assert.ok(Object.values(prepared.effects).every(x=>x===false));
 assert.equal(Integration.preflightConferenceV2({...integrationInput,
   note_disposition_claim:{schema:"tata.comandas.note-disposition-claim.v1"}}).reason,
   "SHADOW_NOTE_CLAIM_NOT_OPERATIONAL_AUTHORITY");
 assert.equal(Integration.preflightConferenceV2({...integrationInput,
   motor_source:Buffer.from("unverified-motor")}).status,"HOLD");
});
const ledgerFixture=path.join(temp,"signed-v2-integration-rehearsal.sqlite");
const writerFixture=crypto.generateKeyPairSync("ed25519"),attesterFixture=crypto.generateKeyPairSync("ed25519");
const spki=k=>k.export({type:"spki",format:"der"}).toString("base64");
const kid=k=>crypto.createHash("sha256").update(k.export({type:"spki",format:"der"})).digest("hex");
const writerKeyId=kid(writerFixture.publicKey),attesterKeyId=kid(attesterFixture.publicKey);
const integrationNow=Math.floor(Date.parse("2026-11-03T17:30:00Z")/1000);
const writerTrust={schema:WriterCore.WRITERS,store:"0001|01",
 writer_key_ids:[writerKeyId],attester_key_ids:[attesterKeyId],
 writer_anchors:[{key_id:writerKeyId,public_key_spki_base64:spki(writerFixture.publicKey),
  role:"TATA_SEQUENCE_WRITER",scope:"PRODUCTION_ITAIM",
  not_before_s:integrationNow-86400,not_after_s:integrationNow+86400}]};
const trust=(scope)=>({schema:A.TATA_ATTESTERS_SCHEMA_V1,store:"0001|01",
 writer_key_ids:[writerKeyId],
 attesters:[{key_id:attesterKeyId,public_key_spki_base64:spki(attesterFixture.publicKey),
  role:"TATA_SEQUENCE_ATTESTER",scope,not_before_s:integrationNow-86400,
  not_after_s:integrationNow+86400}]});
const requestPayload={schema:WriterCore.REQUEST,store:"0001|01",
 day:real.order.DTHRABERMESA.slice(0,10),order_key:real.order_key,
 writer_key_id:writerKeyId,issued_at_s:integrationNow,
 nonce:crypto.randomBytes(16).toString("hex")};
const signedRequest={...requestPayload,signature_base64:crypto.sign(null,
 WriterCore.writerPayloadV1(requestPayload),writerFixture.privateKey).toString("base64")};
let integrationDb,liveChain,storedDigest;
test("V2 integration: real-native L4 -> signed writer -> read-only attester -> content-bearing Conference",()=>{
 integrationDb=new SQLiteFixture(ledgerFixture);
 integrationDb.exec("PRAGMA journal_mode=WAL");
 integrationDb.exec("PRAGMA synchronous=FULL");
 for(const stmt of WriterCore.schemaStatementsV1())integrationDb.exec(stmt);
 const refused=Integration.bindPreparedConferenceV2({input:integrationInput,preflight:{...prepared,
  source_fingerprint:"a".repeat(64)},db:integrationDb,
  writerRequest:signedRequest,writerTrust,nowS:integrationNow});
 assert.equal(refused.reason,"PREFLIGHT_CHANGED_OR_NOT_BOUND_TO_SOURCE");
 assert.equal(integrationDb.prepare("SELECT COUNT(*) AS n FROM tata_seq_v2_binding").get().n,0);
 const bound=Integration.bindPreparedConferenceV2({input:integrationInput,preflight:prepared,
  db:integrationDb,writerRequest:signedRequest,writerTrust,nowS:integrationNow});
 assert.equal(bound.status,"PERSISTED_FOR_INDEPENDENT_ATTESTER_ONLY",JSON.stringify(bound));
 assert.equal(bound.bound_number_for_attester,"001");
 assert.equal(bound.number_for_operational_ticket,null);
 assert.equal(bound.physical_print_authorized,false);
 assert.ok(Object.values(bound.effects).every(x=>x===false));
 const reused=Integration.bindPreparedConferenceV2({input:integrationInput,preflight:prepared,
  db:integrationDb,writerRequest:signedRequest,writerTrust,nowS:integrationNow});
 assert.equal(reused.status,"PERSISTED_FOR_INDEPENDENT_ATTESTER_ONLY");
 assert.equal(reused.bound_number_for_attester,"001");
 assert.equal(reused.reused,true);
 assert.equal(integrationDb.prepare("SELECT COUNT(*) AS n FROM tata_seq_v2_binding").get().n,1);
 const ro=new SQLiteFixture(ledgerFixture,{readOnly:true});
 try{
  assert.throws(()=>ro.exec("DELETE FROM tata_seq_v2_binding"),/read.?only|readonly|attempt/i);
  const isolated=attestSignedLedgerV2({db:ro,pair:{event:real,decision},writerTrust,
   attesterTrust:trust("TEST_ISOLATED"),attesterPrivateKey:attesterFixture.privateKey,
   nowS:integrationNow,nonce:crypto.randomBytes(16).toString("hex")});
  assert.equal(isolated.status,"SIGNED_WRITER_LEDGER_ATTESTED_NOT_PRINT_AUTHORIZED",JSON.stringify(isolated));
  const state={schema:STATE_SCHEMA,policy:{width:3,min_value:1,max_value:999},
   bindings:ro.prepare("SELECT scope,order_key,seq FROM tata_seq_v2_binding ORDER BY seq").all()
    .map(x=>({scope_id:x.scope,native_order_key:x.order_key,
     tata_sequence:String(x.seq).padStart(3,"0")}))};
  const labOnly=Integration.reviewAttestedConferenceV2({input:integrationInput,
   preflight:prepared,chainBinding:isolated.chain_binding,
   attesterTrust:trust("TEST_ISOLATED"),ledgerState:state,nowS:integrationNow});
  assert.equal(labOnly.status,"HOLD");
  // A synthetic PRODUCTION_ITAIM-scoped key is used ONLY in this offline fixture.
  // Even a formally valid signature may produce ONLY watermarked in-memory bytes.
  const syntheticProduction=attestSignedLedgerV2({db:ro,pair:{event:real,decision},writerTrust,
   attesterTrust:trust("PRODUCTION_ITAIM"),attesterPrivateKey:attesterFixture.privateKey,
   nowS:integrationNow,nonce:crypto.randomBytes(16).toString("hex")});
  assert.equal(syntheticProduction.status,"SIGNED_WRITER_LEDGER_ATTESTED_NOT_PRINT_AUTHORIZED",
   JSON.stringify(syntheticProduction));
  liveChain={binding:syntheticProduction.chain_binding,state};
  const final=Integration.reviewAttestedConferenceV2({input:integrationInput,
   preflight:prepared,chainBinding:liveChain.binding,
   attesterTrust:trust("PRODUCTION_ITAIM"),ledgerState:liveChain.state,
   nowS:integrationNow});
  assert.equal(final.status,"CONFERENCE_CONTENT_ATTESTED_OFFLINE_NOT_FOR_PRINT",JSON.stringify(final));
  assert.equal(final.tata_sequence_for_offline_review,"001");
  assert.equal(final.production_views_exported,0);
  assert.equal(final.number_for_operational_ticket,null);
  assert.equal(final.physical_print_authorized,false);
  assert.ok(Object.values(final.effects).every(x=>x===false));
  assert.ok(final.conference.lines>0&&final.conference.escpos_bytes>0);
  assert.match(final.conference.text_trace,/^SIMULAÇÃO · NÃO PRODUZIR\nCONFERÊNCIA\n/);
  assert.equal(final.conference.text_trace.trim().split("\n").at(-1),"001");
  assert.ok(final.conference.text_trace.includes("TEKNISA"));
  assert.ok(final.conference.text_trace.includes("CAIXA"));
  assert.ok(!("production" in final)&&!("production_views" in final));
  storedDigest=crypto.createHash("sha256").update(
    JSON.stringify(ro.prepare("SELECT * FROM tata_seq_v2_binding").all())).digest("hex");
 }finally{ro.close();}
});
test("V2 integration: stale source, ledger mutation, missing signature or removed anchor HOLD",()=>{
 const changed={...integrationInput,decision:{...decision,fingerprint:"f".repeat(64)}};
 assert.equal(Integration.reviewAttestedConferenceV2({input:changed,preflight:prepared,
  chainBinding:liveChain.binding,attesterTrust:trust("PRODUCTION_ITAIM"),
  ledgerState:liveChain.state,nowS:integrationNow}).status,"HOLD");
 assert.equal(Integration.reviewAttestedConferenceV2({input:integrationInput,preflight:prepared,
  chainBinding:liveChain.binding,attesterTrust:trust("PRODUCTION_ITAIM"),
  ledgerState:{...liveChain.state,bindings:[]},nowS:integrationNow}).status,"HOLD");
 assert.equal(Integration.reviewAttestedConferenceV2({input:integrationInput,preflight:prepared,
  chainBinding:{...liveChain.binding,attestation:{...liveChain.binding.attestation,
   signature_base64:"A".repeat(86)+"=="}},
  attesterTrust:trust("PRODUCTION_ITAIM"),ledgerState:liveChain.state,
  nowS:integrationNow}).status,"HOLD");
 assert.equal(Integration.reviewAttestedConferenceV2({input:integrationInput,preflight:prepared,
  chainBinding:liveChain.binding,attesterTrust:{...trust("PRODUCTION_ITAIM"),attesters:[]},
  ledgerState:liveChain.state,nowS:integrationNow}).status,"HOLD");
 assert.equal(Integration.bindPreparedConferenceV2({input:{...integrationInput,
  note_disposition_claim:{scope:"SHADOW_VIEW_ONLY"}},preflight:prepared,
  db:integrationDb,writerRequest:signedRequest,writerTrust,nowS:integrationNow}).status,"HOLD");
 const nowDigest=crypto.createHash("sha256").update(
    JSON.stringify(integrationDb.prepare("SELECT * FROM tata_seq_v2_binding").all())).digest("hex");
 assert.equal(nowDigest,storedDigest);
 integrationDb.close();
 const reopened=new SQLiteFixture(ledgerFixture,{readOnly:true});
 try{
  assert.equal(reopened.prepare("SELECT seq FROM tata_seq_v2_binding").get().seq,1);
  assert.equal(crypto.createHash("sha256").update(
   JSON.stringify(reopened.prepare("SELECT * FROM tata_seq_v2_binding").all())).digest("hex"),storedDigest);
 }finally{reopened.close();}
});

fs.rmSync(temp,{recursive:true,force:true});
console.log("COMANDAS_NATIVE_CHAIN_V1="+n+"/"+n+" REAL_REVISION_9627 CONSUMER_V714 PINNED_MOTOR VARIABLE_VIRTUAL_VIEW_COUNT NO_PRINT");

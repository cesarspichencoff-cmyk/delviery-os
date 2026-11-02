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
 assert.equal(r.layers.L4.status,"THREE_VIEWS_VIRTUAL",JSON.stringify(r.layers.L4.reasons));
 assert.deepEqual(r.views.map(v=>v.station),["DELIVERY SUSHI 1","DELIVERY SUSHI 2","CONFERENCIA"]);
 assert.ok(r.views[0].text_trace.includes("C1  CAIXA 1500\n1  COMB SUSHI + SASHIMI ESPECIAL 2 P"));
 assert.ok(r.views[1].text_trace.includes("C1  CAIXA 750\n2  TEMAKI DE BARRIGA DE SALMAO"));
 assert.ok(r.views[2].text_trace.includes("1 SACOLA G | 1 KIT P/2 | 1 KIT SIMPLES"));
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
 assert.equal(r.layers.L4.status,"THREE_VIEWS_VIRTUAL",JSON.stringify(r.layers.L4?.reasons));
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
 const live={...base,level:"LIVE_ATTESTED",persisted:true,attested_independently:true};
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
  {...live,tata_sequence:"000"},{...live,level:"live_attested"},
  {persisted:true,attested_independently:true,order_key:real.order_key,snapshot_sha256:real.snapshot_hash,tata_sequence:"037"}]){
  const r=chain(real,decision,{sequence_binding:b});
  assert.deepEqual([r.layers.L5.tata_number,r.layers.L5.sequence_level,r.layers.L5.candidate_number],[null,null,null],JSON.stringify(b));
  assert.ok(r.views.every(v=>v.escpos_bytes===0));
 }
 // Synthetic LIVE claim (no producer exists): only then a number appears, on all three views.
 const ok=chain(real,decision,{sequence_binding:live});
 assert.deepEqual([ok.layers.L5.status,ok.layers.L5.tata_number,ok.layers.L5.sequence_level],["BOUND","037","LIVE_ATTESTED"]);
 assert.ok(ok.views.every(v=>v.text_trace.includes("IFOOD 9627 | TEKNISA")&&/\b037\b/.test(v.text_trace)));
 // The number belongs to the ORDER: a new native revision (header X -> P,
 // other snapshot) keeps it; the contract never renumbers a revision.
 const rev=event(o=>({...o,IDSTCOMANDA:"P"}));
 assert.notEqual(rev.snapshot_hash,real.snapshot_hash);
 const again=chain(rev,consume(rev),{sequence_binding:live});
 assert.deepEqual([again.layers.L5.status,again.layers.L5.tata_number],["BOUND","037"]);
});
test("a converted or malformed native clock has no Itaim window or day: L2 and L5 HOLD",()=>{
 for(const t of ["2026-10-05T01:58:50Z","2026-10-04T22:58:50-03:00","2026-10-04T22:58:50.0000000+00:00",
  "2026-10-04 22:58:50","2026-10-04T24:00:00.0000000"]){
  const ev=event(o=>({...o,DTHRABERMESA:t}));
  const r=chain(ev,consume(ev),{sequence_binding:{level:"LIVE_ATTESTED",persisted:true,attested_independently:true,
   order_key:ev.order_key,scope_id:"STORE:0001|01|DATE:2026-10-04",tata_sequence:"037"}});
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
 const live={level:"LIVE_ATTESTED",persisted:true,attested_independently:true,order_key:real.order_key,
  scope_id:"STORE:0001|01|DATE:2026-10-04",tata_sequence:"037"};
 const note=(o,field,value,i)=>({source_field:field,value,scope_hint:"item",join_proven:true,
  item_index:i,CDPRODUTO:o.items[i].CDPRODUTO});
 // 0 COMBINADO KIDS (3 closed boxes, Sushi 1) · 1 EDAMAME (Cozinha) · 3 SUSHI DE UNAGUI (Sushi 1);
 // the same note in DSOBS* and TXPRODCOMVEN must print once, not twice.
 const ev=event(o=>({...o,observation_rows:[note(o,"DSOBSPEDDIGCMD","sem cebolinha",0),
  note(o,"DSOBSDESCIT","MOLHO A PARTE",1),note(o,"TXPRODCOMVEN","SEM TARE",3),note(o,"DSOBSPEDDIGCMD","SEM TARE",3)]}));
 const r=chain(ev,consume(ev),{sequence_binding:live});
 assert.deepEqual([r.layers.L3.status,r.layers.L4?.status],["NATIVE_CONTENT_PROVEN","THREE_VIEWS_VIRTUAL"],
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
 // General note (DSOBSCOMANDA): may carry payment text; V7.6/V7.7 keep it
 // blocked until a per-note human disposition. Never dropped, never printed.
 const g=event(o=>({...o,observation_rows:[{source_field:"DSOBSCOMANDA",value:"TROCO PARA 100",scope_hint:"order",join_proven:true}]}));
 const rg=chain(g,consume(g),{sequence_binding:live});
 assert.equal(rg.layers.L4.status,"HOLD");assert.ok(rg.layers.L4.reasons.includes("ORDER_OBSERVATION_RELEVANCE_UNPROVEN_0"));
 assert.deepEqual(rg.views,[]);
});
test("three-view content contract: ids on every view, each product in exactly one station, conference complete",()=>{
 const live={level:"LIVE_ATTESTED",persisted:true,attested_independently:true,order_key:real.order_key,
  scope_id:"STORE:0001|01|DATE:2026-10-04",tata_sequence:"037"};
 const r=chain(real,decision,{sequence_binding:live});
 const native=new Map(decision.items.map(x=>[x.product_name.toLocaleUpperCase("pt-BR"),x.quantity]));
 const itemsOf=v=>v.text_trace.split("\n").map(l=>/^(\d+)  (.+)$/.exec(l)).filter(Boolean)
  .map(m=>({qty:Number(m[1]),name:m[2]}));
 const sum=(list,name)=>list.filter(x=>x.name===name).reduce((n,x)=>n+x.qty,0);
 const production=r.views.filter(v=>v.kind==="PRODUCAO"),conf=r.views.find(v=>v.kind==="CONFERENCIA");
 // iFood + Teknisa + TATÁ (synthetic LIVE claim) identical on the three views.
 for(const v of r.views){
  assert.ok(v.text_trace.includes("IFOOD 9627 | TEKNISA 0000348850 | 22:58"),v.station);
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
 // The exact bytes decode with the known command set and fit the 72 mm width.
 const P=require("./comandas_papel_virtual_escpos_v1_offline.cjs");
 for(const v of r.views){
  const lay=P.layoutVirtualPaperV1(v.escpos);
  assert.deepEqual([lay.errors,lay.overflow,v.escpos.length],[[],[],v.escpos_bytes],v.station);
  assert.equal(require("node:crypto").createHash("sha256").update(Buffer.from(v.escpos)).digest("hex"),v.escpos_sha256);
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

fs.rmSync(temp,{recursive:true,force:true});
console.log("COMANDAS_NATIVE_CHAIN_V1="+n+"/"+n+" REAL_REVISION_9627 CONSUMER_V714 PINNED_MOTOR THREE_VIRTUAL_VIEWS NO_PRINT");

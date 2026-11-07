"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {syntheticReaderPairV857:fixture}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {projectExpectedRouting}=
 require("../dist/src/shadow/expectedRouting.js");
const {SCHEMA,EFFECTS,reviewNativeBoundWindow:review}=
 require("./comandas_native_window_revision_binding_v1_offline.cjs");
const load=f=>JSON.parse(fs.readFileSync(path.join(__dirname,"..","data",f),"utf8"));
const routing=load("odhen_product_routing_compact_v1.json"),
 printers=load("runtime_printer_map_v1.json"),
 calibration=load("production_printer_calibration_registry_v1.json");
function data(){
 const x=fixture(),o=x.event.order;
 o.IDSTCOMANDA="3";
 for(const row of o.items)row.IDSTPRCOMVEN="4";
 x.event.snapshot_hash=snapshotHash(o);
 x.decision.snapshot_hash=x.event.snapshot_hash;
 x.decision.fingerprint=decisionHash(x.decision);
 const r=structuredClone(routing);
 r.products["9.20.00.010.00"]=["00009","00003"];
 r.products["9.20.00.020.00"]=["00002"];
 const projection=projectExpectedRouting({
  ids:{pedido_interno:o.NRCOMANDA},
  items:x.decision.items.map((v,i)=>({
   item_index:i,codigo:v.canonical_code,nome:v.product_name,
   quantidade:v.quantity
  }))
 },r,printers);
 const claim={
  schema:"tata.comandas.window-evidence-claim.v1",
  store_id:o.CDFILIAL,store_unit:o.CDLOJA,
  timestamp_origin:"TEKNISA_ORDER_SOURCE_CLAIM",
  snapshot_sha256:x.event.snapshot_hash,
  source_ref:"SYNTHETIC_NATIVE_PAIR_SELF_CONSISTENCY_ONLY",
  order_local_day:o.DTHRABERMESA.slice(0,10),
  order_local_hm:o.DTHRABERMESA.slice(11,16),
  item_roles:[
   {item_index:0,category:"COMBINADOS",
    product_code:"9.20.00.010.00",rule_ref:"REVIEWED_SYNTHETIC_ONLY",
    rule_source:"REVIEWED_CATALOG_RULE_CLAIM"},
   {item_index:1,category:"INDEPENDENT",
    product_code:"9.20.00.020.00",rule_ref:"REVIEWED_SYNTHETIC_ONLY",
    rule_source:"REVIEWED_CATALOG_RULE_CLAIM"}
  ]
 };
 const context={tata_sequence:"007",teknisa_sequence:o.NRCOMANDA,
  ifood_sequence:o.NRCOMANDAEXT,order_time:claim.order_local_hm,
  template_version:"production-ticket-v2-shadow",ticket_items:[]};
 return {x,projection,claim,context};
}
let n=0;
function test(name,fn){fn();console.log("PASS "+(++n)+" "+name);}
function call(v){
 const p=JSON.stringify(v.projection),c=JSON.stringify(v.claim),
  a=JSON.stringify(v.x),ctx=JSON.stringify(v.context);
 const r=review(v.projection,v.claim,v.context,calibration,v.x);
 assert.equal(JSON.stringify(v.projection),p);
 assert.equal(JSON.stringify(v.claim),c);
 assert.equal(JSON.stringify(v.x),a);
 assert.equal(JSON.stringify(v.context),ctx);
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.print_authorized,false);
 assert.equal(r.first_native_print_event_proven,false);
 assert.equal(r.independent_native_source_attested,false);
 assert.equal(r.printer_power_proven,false);
 return r;
}
function held(v,reason){
 const r=call(v);assert.equal(r.status,"HOLD");
 assert.ok(r.reasons.includes(reason),r.reasons.join(","));
 assert.equal(r.plan,null);
 return r;
}
test("valid pair, date and exact two-item projection bind shadow candidate only",()=>{
 const v=data();assert.equal(v.projection.ready,true);
 const r=call(v);
 assert.equal(r.status,"REVIEW_CANDIDATE_ONLY",r.reasons.join(","));
 assert.equal(r.native_projection_claim_bound,true);
 assert.deepEqual(r.selected.map(t=>t.printer_code).sort(),["00002","00009"]);
 assert.equal(r.plan.ready_for_physical_print,false);
});
test("native date cannot be substituted for weekend date with same clock",()=>{
 const v=data();v.claim.order_local_day="2026-10-25";
 held(v,"WINDOW_DAY_TIME_STORE_OR_SNAPSHOT_NOT_BOUND_TO_READER");
});
test("same time different business day refuses selector's weekend rule",()=>{
 const v=data();v.claim.order_local_day="2026-10-24";
 held(v,"WINDOW_DAY_TIME_STORE_OR_SNAPSHOT_NOT_BOUND_TO_READER");
});
test("different time cannot send dinner route under lunch source",()=>{
 const v=data();v.claim.order_local_hm="19:31";v.context.order_time="19:31";
 held(v,"WINDOW_DAY_TIME_STORE_OR_SNAPSHOT_NOT_BOUND_TO_READER");
});
test("stale claim revision cannot reuse a different Reader snapshot",()=>{
 const v=data();v.claim.snapshot_sha256="a".repeat(64);
 held(v,"WINDOW_DAY_TIME_STORE_OR_SNAPSHOT_NOT_BOUND_TO_READER");
});
test("wrong native store cannot borrow Itaim policy",()=>{
 const v=data();v.claim.store_unit="02";
 held(v,"WINDOW_DAY_TIME_STORE_OR_SNAPSHOT_NOT_BOUND_TO_READER");
});
test("wrong visible short iFood identifier cannot be printed",()=>{
 const v=data();v.context.ifood_sequence="9999";
 held(v,"PREVIEW_VISIBLE_IDENTIFIERS_NOT_BOUND_TO_READER");
});
test("wrong Teknisa identifier cannot be printed",()=>{
 const v=data();v.context.teknisa_sequence="DIFFERENT";
 held(v,"PREVIEW_VISIBLE_IDENTIFIERS_NOT_BOUND_TO_READER");
});
test("wrong projection order key cannot borrow same item routes",()=>{
 const v=data();v.projection.order_id="OTHER";
 held(v,"PROJECTION_ORDER_OR_ITEM_COVERAGE_NOT_BOUND_TO_READER");
});
test("different line quantity cannot inherit another native revision",()=>{
 const v=data();v.projection.items[0].quantity++;
 held(v,"PROJECTION_ITEM_IDENTITY_OR_QUANTITY_NOT_BOUND_TO_READER");
});
test("different item index cannot be silently rebound",()=>{
 const v=data();v.projection.items[0].item_index=1;
 held(v,"PROJECTION_ITEM_IDENTITY_OR_QUANTITY_NOT_BOUND_TO_READER");
});
test("product code from another item cannot inherit reviewed category",()=>{
 const v=data();v.claim.item_roles[0].product_code="9.20.00.020.00";
 held(v,"STATION_ROLE_NOT_BOUND_TO_NATIVE_PRODUCT");
});
test("unreviewed native status cannot inherit stored hash",()=>{
 const v=data();v.x.event.order.IDSTCOMANDA="4";
 v.x.event.snapshot_hash=snapshotHash(v.x.event.order);
 v.x.decision.snapshot_hash=v.x.event.snapshot_hash;
 v.x.decision.fingerprint=decisionHash(v.x.decision);
 v.claim.snapshot_sha256=v.x.event.snapshot_hash;
 held(v,"READER_V2_PAIR_NOT_SELF_CONSISTENT");
});
test("modified native notes with old snapshot are vetoed",()=>{
 const v=data();v.x.event.order.observation_rows[0].value="DIFFERENT";
 held(v,"READER_V2_PAIR_NOT_SELF_CONSISTENT");
});
test("legacy unbound candidate may claim anything; new gateway refuses it",()=>{
 const v=data();v.claim.order_local_day="2026-10-25";
 const r=held(v,"WINDOW_DAY_TIME_STORE_OR_SNAPSHOT_NOT_BOUND_TO_READER");
 assert.equal(r.native_projection_claim_bound,false);
});
console.log("COMANDAS_NATIVE_WINDOW_REVISION_BINDING="+n+"/"+n+
 " SOURCE_PAIR_ONLY NO_PRINT NO_LIVE_AUTHORITY");

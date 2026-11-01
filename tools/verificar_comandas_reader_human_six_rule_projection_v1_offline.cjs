"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {CATALOG_SCHEMA}=require("./comandas_packaging_classification_review_v1_offline.cjs");
const {EFFECTS,projectHumanRulesForReader:project}=require("./comandas_reader_human_six_rule_projection_v1_offline.cjs");
let count=0;
const test=(label,fn)=>{fn();console.log("PASS "+(++count)+" "+label)};
const product=[
 {code:"9.10.05.070.00",name:"CEVICHE",native:"0000001111"},
 {code:"8.20.11.002.00",name:"COOKIE PISTACHE",native:"0000001112"}
];
function refresh(pair){
 pair.event.snapshot_hash=snapshotHash(pair.event.order);
 pair.decision.snapshot_hash=pair.event.snapshot_hash;
 pair.decision.fingerprint=decisionHash(pair.decision);
}
function sample(){
 const pair=syntheticReaderPairV857();
 pair.event.order.observation_rows=[];
 pair.decision.order_observations=[];
 pair.decision.items.forEach(x=>x.observations=[]);
 pair.event.order.IDSTCOMANDA="3";
 pair.event.order.items.forEach((row,i)=>{
  row.IDSTPRCOMVEN="4";
  row.CDPRODUTO=product[i].native;
  row.CDARVPROD=product[i].code.replace(/\./g,"");
 });
 pair.decision.items.forEach((row,i)=>{
  row.CDPRODUTO=product[i].native;
  row.canonical_code=product[i].code;
  row.product_name=product[i].name;
 });
 refresh(pair);
 const capture={schema:CATALOG_SCHEMA,
  source_kind:"LOCAL_READ_ONLY_CAPTURE_CLAIM",
  source_ref:"SYNTHETIC_UNATTESTED_NOT_LIVE",
  store_id:"0001",store_unit:"01",captured_local_date:"2026-10-31",
  entries:product.map(x=>({CDPRODUTO:x.native,
   canonical_code:x.code,product_name:x.name,active:true}))};
 return {pair,capture};
}
function audit(data){
 const prior=JSON.stringify(data);
 const r=project(data.pair,data.capture);
 assert.equal(JSON.stringify(data),prior,"must never mutate");
 assert.deepEqual(r.effects,EFFECTS);
 for(const field of ["catalog_current_independently_attested",
  "live_product_status_proven","native_first_dispatch_proven",
  "station_destination_currently_attested","packaging_currently_attested",
  "conference_print_authorized","production_print_authorized","print_authorized"])
  assert.equal(r[field],false,field);
 const output=JSON.stringify(r);
 for(const value of ["COOKIE PISTACHE","CEVICHE","0000001111",
 "ENTREGA NA PORTARIA","ALERGIA A CAMARAO"])
  assert.equal(output.includes(value),false,"should not expose "+value);
 return r;
}
test("Ceviche maps Sushi Quentes as physically cold; cookie conference candidate",()=>{
 const r=audit(sample());
 assert.equal(r.status,"ALL_ITEMS_EXACT_REVIEW_ONLY");
 assert.equal(r.items.length,2);
 assert.deepEqual(r.items.map(x=>x.decision_kind),
  ["PRODUCTION_ROUTE_CANDIDATE","CONFERENCE_ONLY_CANDIDATE"]);
 assert.equal(r.items[0].stated_area,"SUSHI_QUENTES");
 assert.equal(r.items[0].item_temperature,"FRIO");
 assert.equal(r.items[1].stated_area,"CONFERENCIA");
 assert.ok(r.items.every(x=>x.route_currently_proven===false));
});
test("missing item in supplied catalog holds the entire order",()=>{
 const x=sample();x.capture.entries.pop();
 assert.equal(audit(x).status,"HOLD");
});
test("full native item allergy note holds before production role",()=>{
 const x=sample();
 const id=x.pair.event.order.items[0].CDPRODUTO;
 x.pair.event.order.observation_rows.push({
  source_field:"DSOBSPEDDIGCMD",value:"ALERGIA A CAMARAO",
  scope_hint:"item",join_proven:true,item_index:0,CDPRODUTO:id
 });
 x.pair.decision.items[0].observations.push({
  source_field:"DSOBSPEDDIGCMD",value:"ALERGIA A CAMARAO"
 });
 refresh(x.pair);
 const r=audit(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.reason,"NATIVE_OBSERVATIONS_REQUIRE_EXPLICIT_DISPOSITION");
 assert.equal(r.items.length,0);
 assert.equal(r.review_receipt_sha256,null);
});
test("complete general order note blocks classification and cookie role",()=>{
 const x=sample();
 x.pair.event.order.observation_rows.push({
  source_field:"DSOBSCOMANDA",value:"SEM MOLHO",
  scope_hint:"order",join_proven:true
 });
 x.pair.decision.order_observations.push({
  source_field:"DSOBSCOMANDA",value:"SEM MOLHO"
 });
 refresh(x.pair);
 const r=audit(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.items.length,0);
 assert.equal(r.review_receipt_sha256,null);
});
test("wrong native ID under exact name and code cannot match",()=>{
 const x=sample();x.capture.entries[0].CDPRODUTO="9999999999";
 assert.equal(audit(x).status,"HOLD");
});
test("inactive item cannot inherit confirmed human rule",()=>{
 const x=sample();x.capture.entries[1].active=false;
 assert.equal(audit(x).status,"HOLD");
});
test("additional self-approval or absent active field is a global hold",()=>{
 for(const change of [x=>x.capture.approved=true,
  x=>delete x.capture.entries[0].active]){
  const x=sample();change(x);assert.equal(audit(x).status,"HOLD");
 }
});
test("wrong shop and canceled native item fail with hash recomputed",()=>{
 for(const change of [x=>{
  x.pair.event.order.CDLOJA="02";
  x.pair.event.order_key="0001|02|0000349281|0000348850";
  x.pair.decision.order_key=x.pair.event.order_key;
 },x=>x.pair.event.order.items[0].IDSTPRCOMVEN="6"]){
  const x=sample();change(x);refresh(x.pair);
  assert.equal(audit(x).status,"HOLD");
 }
});
test("unapproved variant product code cannot borrow exact cookie routing",()=>{
 const x=sample();
 x.pair.event.order.items[1].CDARVPROD="8201100201";
 x.pair.decision.items[1].canonical_code="8.20.11.002.01";
 x.capture.entries[1].canonical_code="8.20.11.002.01";
 refresh(x.pair);
 const r=audit(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.items.length,0);
});
test("same item identity with a changed Reader revision has a new binding",()=>{
 const x=sample(),old=audit(x);
 x.pair.event.order.IDSTCOMANDA="P";refresh(x.pair);
 const next=audit(x);
 assert.equal(next.status,"ALL_ITEMS_EXACT_REVIEW_ONLY");
 assert.notEqual(next.items[0].source_revision_sha256,
  old.items[0].source_revision_sha256);
});
test("old untrusted capture date does not become live proof",()=>{
 const x=sample();x.capture.captured_local_date="2026-10-05";
 const r=audit(x);assert.equal(r.status,"ALL_ITEMS_EXACT_REVIEW_ONLY");
 assert.equal(r.catalog_current_independently_attested,false);
 assert.equal(r.live_product_status_proven,false);
});
test("all six exact human rules bind to their intended source lines only",()=>{
 const human=require("../data/comandas_cesar_clarificacoes_20261101_review_only.json");
 for(const h of human.product_rules){
  const x=sample();
  const index=h.code==="8.20.11.002.00"?1:0;
  x.pair.event.order.items[index].CDARVPROD=h.code.replace(/\./g,"");
  x.pair.decision.items[index].canonical_code=h.code;
  x.pair.decision.items[index].product_name=h.label;
  x.capture.entries[index].canonical_code=h.code;
  x.capture.entries[index].product_name=h.label;
  refresh(x.pair);
  const r=audit(x);
  assert.equal(r.status,"ALL_ITEMS_EXACT_REVIEW_ONLY",h.code);
  assert.equal(r.items[index].stated_area,h.stated_area,h.code);
  assert.equal(r.items[index].item_temperature,h.stated_item_temperature,h.code);
  assert.equal(r.items[index].stated_container,h.stated_container,h.code);
  assert.equal(r.items[index].stated_reference,h.stated_reference,h.code);
  assert.equal(r.items[index].decision_kind,
   h.code==="8.20.11.002.00"?
    "CONFERENCE_ONLY_CANDIDATE":"PRODUCTION_ROUTE_CANDIDATE");
  assert.match(r.review_receipt_sha256,/^[a-f0-9]{64}$/);
 }
});
test("hot kitchen Shimeji keeps sealed 650 separate from food temperature",()=>{
 const h=require("../data/comandas_cesar_clarificacoes_20261101_review_only.json")
  .product_rules.find(x=>x.code==="9.10.00.050.00");
 const x=sample();
 x.pair.event.order.items[0].CDARVPROD=h.code.split(".").join("");
 x.pair.decision.items[0].canonical_code=h.code;
 x.pair.decision.items[0].product_name=h.label;
 x.capture.entries[0].canonical_code=h.code;
 x.capture.entries[0].product_name=h.label;
 refresh(x.pair);
 const v=audit(x);
 assert.equal(v.status,"ALL_ITEMS_EXACT_REVIEW_ONLY");
 assert.equal(v.items[0].item_temperature,"QUENTE");
 assert.equal(v.items[0].stated_container,"650_SELADA");
 assert.equal(v.items[0].stated_reference,"SHIMEJI");
 assert.equal(v.print_authorized,false);
});
test("receipt binds source, capture and rule version yet grants no authority",()=>{
 const x=sample(),a=audit(x),b=audit(x);
 assert.equal(a.review_receipt_sha256,b.review_receipt_sha256);
 x.capture.source_ref="SYNTHETIC_REVISED_SOURCE";
 const c=audit(x);
 assert.notEqual(a.review_receipt_sha256,c.review_receipt_sha256);
 x.capture.source_ref="SYNTHETIC_UNATTESTED_NOT_LIVE";
 x.capture.captured_local_date="2026-10-05";
 const d=audit(x);
 assert.notEqual(a.review_receipt_sha256,d.review_receipt_sha256);
 x.capture.entries.reverse();
 const e=audit(x);
 assert.equal(e.review_receipt_sha256,d.review_receipt_sha256);
 assert.equal(e.production_print_authorized,false);
});
test("held projections cannot reuse a stale receipt",()=>{
 const x=sample(),ok=audit(x);
 x.capture.entries[0].active=false;
 const hold=audit(x);
 assert.equal(hold.status,"HOLD");
 assert.equal(hold.review_receipt_sha256,null);
 assert.notEqual(ok.review_receipt_sha256,hold.review_receipt_sha256);
});
console.log("COMANDAS_HUMAN_RULE_READER_JOIN="+count+"/"+count+" REVIEW_ONLY NO_PRINT");

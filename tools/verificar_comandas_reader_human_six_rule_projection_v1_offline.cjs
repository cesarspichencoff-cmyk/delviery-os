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
console.log("COMANDAS_HUMAN_RULE_READER_JOIN="+count+"/"+count+" REVIEW_ONLY NO_PRINT");

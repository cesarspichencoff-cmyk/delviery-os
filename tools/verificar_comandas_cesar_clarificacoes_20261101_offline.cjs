"use strict";
const assert=require("node:assert/strict");
const rules=require("../data/comandas_cesar_clarificacoes_20261101_review_only.json");
const {reviewHumanRuleItem:review,NO_EFFECTS}=require("./comandas_cesar_clarificacoes_20261101_review_only.cjs");
const archived=require("../data/comandas_historical_native_identity_lineage_20261005_review_only.json");
let passed=0;const test=(name,fn)=>{fn();console.log("PASS "+(++passed)+" "+name)};
function checks(out){
 assert.deepEqual(out.effects,NO_EFFECTS);
 for(const key of ["catalog_identity_proven","active_product_proven",
 "physical_route_proven","packaging_proven","print_authorized"])
  assert.equal(out[key],false);
 assert.equal(JSON.stringify(out).includes("CDPRODUTO"),false);
}
test("all six confirmed human decisions cover unique historical source codes",()=>{
 assert.equal(rules.recorded_local_date,"2026-11-01");
 assert.equal(rules.store_scope,"ITAIM_0001_01");
 assert.equal(rules.product_rules.length,6);
 assert.equal(new Set(rules.product_rules.map(x=>x.code)).size,6);
 assert.equal(rules.human_rule_capture,"CAPTURED");
 for(const item of rules.product_rules){
  assert.ok(archived.entries.some(x=>x.canonical_code===item.code));
  assert.equal(item.new_production_ticket_policy!=="",true);
 }
 for(const key of ["current_native_id_confirmed","catalog_active_status_confirmed",
  "station_route_currently_verified","packaging_motor_current_pin_verified",
  "kit_and_bag_composition_verified","first_native_dispatch_proven",
  "physical_test_authorized","operational_deployed","print_authorized"])
  assert.equal(rules[key],false,key);
});
test("each stated rule remains candidate only, no printing effects",()=>{
 for(const line of rules.product_rules){
  const input={canonical_code:line.code,product_name:line.label};
  const before=JSON.stringify(input);
  const r=review(input);checks(r);
  assert.equal(JSON.stringify(input),before);
  assert.equal(r.status,"HUMAN_RULE_CAPTURED_CATALOG_PENDING");
  assert.equal(r.rule_code,line.code);
  assert.equal(r.stated_area,line.stated_area);
  assert.equal(r.stated_item_temperature,line.stated_item_temperature);
 }
});
test("cold ceviche and salmon tartar remain on Sushi Quentes, never marked hot",()=>{
 for(const code of ["9.10.05.070.00","9.10.05.050.00"]){
  const row=rules.product_rules.find(x=>x.code===code);
  assert.equal(row.stated_area,"SUSHI_QUENTES");
  assert.equal(row.stated_item_temperature,"FRIO");
  assert.equal(row.stated_container,"650_SELADA");
  assert.equal(row.stated_reference,"TUNA SHISO");
 }
});
test("Shimeji and Shitake is kitchen hot starter with sealed 650",()=>{
 const x=rules.product_rules.find(x=>x.code==="9.10.00.050.00");
 assert.deepEqual([x.stated_area,x.stated_family,x.stated_item_temperature,
  x.stated_container,x.stated_reference],
  ["COZINHA","ENTRADA_QUENTE","QUENTE","650_SELADA","SHIMEJI"]);
});
test("water leaves bar with soda reference, no inferred straw or kit",()=>{
 const x=rules.product_rules.find(x=>x.code==="8.00.00.010.00");
 assert.equal(x.stated_area,"BAR");assert.equal(x.stated_reference,"REFRIGERANTE");
 assert.equal(x.stated_container,"SAME_AS_REFERENT_UNVERIFIED");
 assert.equal(x.stated_item_temperature,"UNKNOWN");
 assert.equal(rules.kit_and_bag_composition_verified,false);
});
test("salmon tuna for two references salmon for two; boxes/kits remain unknown",()=>{
 const x=rules.product_rules.find(x=>x.code==="9.15.00.070.00");
 assert.equal(x.stated_area,"COMBINADOS");
 assert.equal(x.stated_reference,"SALMAO PARA 2 PESSOAS");
 assert.equal(x.stated_container,"SAME_AS_REFERENT_UNVERIFIED");
 assert.equal(rules.kit_and_bag_composition_verified,false);
});
test("pistachio cookie is conference-only in proposed new flow, never production",()=>{
 const x=rules.product_rules.find(x=>x.code==="8.20.11.002.00");
 assert.equal(x.new_production_ticket_policy,"NO_NEW_PRODUCTION_TICKET");
 assert.equal(x.conference_ticket_policy,"REQUIRED");
 const result=review({canonical_code:x.code,product_name:x.label});checks(result);
 assert.equal(result.proposed_conference_only,true);
 assert.equal(result.print_authorized,false);
});
test("wrong code, similar name, missing inputs and attempts to promote hold",()=>{
 for(const x of [null,{}, {canonical_code:"8.20.11.002.01",product_name:"COOKIE PISTACHE"},
  {canonical_code:"8.20.11.002.00",product_name:"COOKIE TRES CHOCOLATES"},
  {canonical_code:"9.10.05.070.00",product_name:"CEVICHE MIX"},
  {canonical_code:"9.15.00.070.00",product_name:"SALMAO 2 PESSOAS"}]){
  const out=review(x);checks(out);assert.equal(out.status,"HOLD");
  assert.equal(out.proposed_conference_only,false);
 }
});
test("historic code identity and human decision do not establish current active catalog",()=>{
 assert.equal(archived.active_status_proven,false);
 for(const x of rules.product_rules){
  const original=archived.entries.find(e=>e.canonical_code===x.code);
  assert.equal(original.active_status,"UNKNOWN");
  assert.equal(original.current_source_join_proven,false);
  assert.equal(original.print_authorized,false);
 }
});
console.log("COMANDAS_CESAR_HUMAN_RULES="+passed+"/"+passed+" REVIEW_ONLY NO_PRINT");

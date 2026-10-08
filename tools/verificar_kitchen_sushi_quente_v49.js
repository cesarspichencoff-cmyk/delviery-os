"use strict";
const assert=require("node:assert/strict");
const catalogue=require("../data/cardapio_knowledge_seed.json");
const rules=require("../data/kitchen_dependency_rules_v1.json");
const policy=require("../data/kitchen_sushi_quente_scope_v49.json");
const {classifySushiHotPreparationsV49,projectTwoKitchenTicketsScopedV49}=
 require("../dist/src/production/kitchenSushiQuenteScopeV49.js");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");

let n=0;const test=(label,fn)=>{fn();n++;console.log(" PASS "+String(n).padStart(2,"0")+" "+label)};
function item(i,name,qty=1,praca,proof){
 return {item_index:i,product_code:"SKU-"+i,product_name:name,quantity:qty,
 observations:[],packaging_role:"OTHER",current_praca:praca??undefined,
 current_praca_proof:proof??undefined};
}
function classify(items){return classifySushiHotPreparationsV49(items,catalogue.itens,rules)}
function approved(name,qty=1){return item(1,name,qty,"enrolados_quentes","CURRENT_MOTOR_PROVEN")}
test("human scope is exactly Sushi Quente HOT/EBITEN/SHISO, with quantities still partial",()=>{
 assert.equal(policy.station,"enrolados_quentes");
 assert.equal(policy.status,"HUMAN_CONFIRMED_SCOPE__QUANTITY_COVERAGE_PARTIAL");
 assert.equal(policy.quantity_rule,"PER_SOLD_PORTION_FACTOR_REQUIRES_PRODUCT_SPECIFIC_HUMAN_CONFIRMATION");
 assert.equal(rules.coverage,"PARTIAL");
});
test("all seven historical catalogue names are identified for Sushi Quente",()=>{
 const sample=["Hot Roll","Hot Roll Tatá","Hot Roll com Shimeji","Temaki Ebiten",
  "Uramaki Ebiten","Uramaki Ebiten Especial","Tuna Shisô Tartar"];
 const projection=classify(sample.map((s,i)=>item(i,s)));
 assert.equal(projection.candidates.length,7);
 assert.equal(projection.eligible_products_with_current_station,0);
 assert.equal(projection.candidates.filter(x=>x.station_evidence==="HISTORICAL_REFERENCE_ONLY").length,7);
 assert.deepEqual(projection.candidates.map(x=>x.kitchen_kind).sort(),
  ["HOT","HOT","HOT","EBITEN","EBITEN","EBITEN","SHISO"].sort());
 assert.equal(projection.pending_factor_count,6);
});
test("one existing confirmed EBITEN factor survives, no other factor is invented",()=>{
 const sample=["Hot Roll","Hot Roll Tatá","Hot Roll com Shimeji","Temaki Ebiten",
  "Uramaki Ebiten","Uramaki Ebiten Especial","Tuna Shisô Tartar"];
 const proj=classify(sample.map((s,i)=>item(i,s)));
 const confirmed=proj.candidates.filter(x=>x.yield_evidence==="EXACT_HUMAN_CONFIRMED_RULE");
 assert.equal(confirmed.length,1);
 assert.equal(confirmed[0].product_name,"URAMAKI EBITEN ESPECIAL");
 assert.equal(confirmed[0].yield_per_sold_unit,1);
 assert.equal(confirmed[0].requested_quantity,1);
 assert.ok(proj.candidates.filter(x=>x.yield_per_sold_unit===null).every(x=>x.requested_quantity===null));
});
test("if station Sushi Quente is CURRENT_MOTOR_PROVEN scope actually applies",()=>{
 const v=classify([approved("Uramaki Ebiten Especial",3)]);
 assert.equal(v.eligible_products_with_current_station,1);
 assert.equal(v.candidates[0].scope_status,"HUMAN_SCOPE_APPLIES");
 assert.equal(v.candidates[0].requested_quantity,3);
 assert.equal(v.complete_quantity_coverage_proven,false);
 assert.equal(v.ready_for_automatic_operational_print,false);
});
test("human rule applies to a NEW Sushi Quente item when CURRENT MOTOR confirms station",()=>{
 const v=classify([approved("Uramaki Hot com Ebiten",2)]);
 assert.deepEqual(v.candidates.map(x=>x.kitchen_kind),["HOT","EBITEN"]);
 assert.ok(v.candidates.every(x=>x.scope_status==="HUMAN_SCOPE_APPLIES"));
 assert.ok(v.candidates.every(x=>x.requested_quantity===null));
});
test("a proven current DIFFERENT STATION wins over outdated catalogue",()=>{
 const v=classify([item(1,"Hot Roll",1,"cozinha_quentes","CURRENT_MOTOR_PROVEN")]);
 assert.equal(v.candidates.length,0);
});
test("name without keyword is NOT assigned a made-up HOT/EBITEN/SHISO demand",()=>{
 const v=classify([approved("Edamame"),approved("Combinado Kids")]);
 assert.equal(v.candidates.length,0);
});
test("non-sushi name with hot term cannot be operationally auto-scoped from history",()=>{
 const v=classify([item(1,"HOT Chocolate",1)]);
 assert.equal(v.eligible_products_with_current_station,0);
 assert.equal(v.candidates.length,1);
 assert.equal(v.candidates[0].scope_status,"PENDING_STATION_PROOF");
 assert.ok(v.required_reviews.some(x=>x.startsWith("CURRENT_SUSHI_QUENTE_STATION_NOT_PROVEN")));
});
test("Shisô and Shisso variants both canonicalize to SHISO",()=>{
 const v=classify([approved("Tuna Shisô Tartar",1),item(2,"Shisso",2,"enrolados_quentes","CURRENT_MOTOR_PROVEN")]);
 assert.deepEqual(v.candidates.map(x=>x.kitchen_kind),["SHISO","SHISO"]);
});
test("keyword boundaries exclude substrings that are not named preparations",()=>{
 const v=classify([approved("SHOT Especial"),approved("EBITENADO"),approved("SHISOL")]);
 assert.equal(v.candidates.length,0);
});
test("scope diagnostic does not print an unconfirmed factor",()=>{
 const v=classify([approved("Hot Roll",4)]);
 assert.equal(v.candidates[0].source_order_quantity,4);
 assert.equal(v.candidates[0].requested_quantity,null);
 assert.ok(v.required_reviews.includes("PRODUCT_COMPONENT_FACTOR_NOT_CONFIRMED:1:HOT"));
 assert.equal(v.effects.print,false);
});
test("duplicate item_index is a quality blocker",()=>{
 const v=classify([approved("Hot Roll"),approved("Uramaki Ebiten Especial")]);
 assert.ok(v.required_reviews.includes("SOURCE_INDEX_NOT_UNIQUE_OR_INVALID:1"));
});
test("unknown station proof does not get promoted to CURRENT motor evidence",()=>{
 const v=classify([item(1,"Hot Roll",2,"enrolados_quentes","UNKNOWN")]);
 assert.equal(v.eligible_products_with_current_station,0);
 assert.equal(v.candidates[0].scope_status,"HISTORICAL_CANDIDATE");
});
test("wrapper reuses production+conference and existing dependency rules safely",()=>{
 const real=archivedResult();
 const src=[item(0,"Combinado Kids",3),item(1,"Edamame"),item(2,"Nasu no Misso"),item(3,"Sushi de Unagui")];
 const v=projectTwoKitchenTicketsScopedV49(src,catalogue.itens,real,rules);
 assert.equal(v.scope.candidates.length,0);
 assert.equal(v.split.dishes.channel,"KITCHEN_DISHES");
 assert.equal(v.split.components,null);
 assert.equal(v.print_authorized,false);
 assert.equal(v.split.ready_for_automatic_operational_print,false);
});
test("wrapper gives item-specific pending review and retains separate dishes route",()=>{
 const real=archivedResult();
 const src=[approved("Hot Roll",2),item(1,"Edamame")];
 const v=projectTwoKitchenTicketsScopedV49(src,catalogue.itens,real,rules);
 assert.ok(v.split.review_reasons.some(s=>s.includes("PRODUCT_COMPONENT_FACTOR_NOT_CONFIRMED:1:HOT")));
 assert.equal(v.split.ready_for_complete_components,false);
 assert.equal(v.split.dishes.channel,"KITCHEN_DISHES");
});
test("no rules, stock, printer, routing or fiscal side effects",()=>{
 const v=classify([approved("Uramaki Ebiten",2)]);
 assert.deepEqual(v.effects,{print:false,spooler_write:false,odhen_write:false,stock_write:false});
 assert.equal(v.ready_for_automatic_operational_print,false);
 assert.equal(rules.rules.length,1);
});
console.log("kitchen-sushi-quente-scope-v49: "+n+"/"+n+" PASS (SHADOW, no print)");

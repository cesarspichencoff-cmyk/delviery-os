"use strict";
const assert=require("node:assert/strict");
const catalogue=require("../data/cardapio_knowledge_seed.json");
const rules=require("../data/kitchen_dependency_rules_v1.json");
const policy=require("../data/kitchen_sushi_quente_scope_v49.json");
const {classifySushiHotPreparationsV49,projectTwoKitchenTicketsScopedV49}=
 require("../dist/src/production/kitchenSushiQuenteScopeV49.js");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
let passed=0;
function test(label,fn){fn();passed++;console.log(" PASS "+String(passed).padStart(2,"0")+" "+label);}
function item(index,name,quantity=1,station,proof){
 return {item_index:index,product_code:"SKU-"+index,product_name:name,quantity,
 observations:[],packaging_role:"OTHER",current_praca:station,
 current_praca_proof:proof};
}
function sushi(index,name,qty=1){
 return item(index,name,qty,"enrolados_quentes","CURRENT_MOTOR_PROVEN");
}
function classify(items,rs=rules){return classifySushiHotPreparationsV49(items,catalogue.itens,rs);}
const examples=[
 ["Hot Roll","HOT"],["Hot Roll Tatá","HOT"],["Hot Roll com Shimeji","HOT"],
 ["Temaki Ebiten","EBITEN"],["Uramaki Ebiten","EBITEN"],
 ["Uramaki Ebiten Especial","EBITEN"],["Tuna Shisô Tartar","SHISO"],
];
test("01 authoritative category is one preparation per sold Sushi Quente portion",()=>{
 assert.equal(policy.status,"HUMAN_CONFIRMED_SCOPE_AND_ONE_PREPARATION_PER_SOLD_PORTION");
 assert.equal(policy.quantity_rule,"ONE_PREPARATION_PER_SOLD_PORTION_PER_MATCHED_KIND");
 assert.deepEqual(policy.factor_per_sold_portion,{HOT:1,EBITEN:1,SHISO:1});
 assert.equal(rules.coverage,"PARTIAL");
});
test("02 seven old-catalogue item names are review candidates, not current route proof",()=>{
 const result=classify(examples.map(([name],i)=>item(i,name)));
 assert.equal(result.candidates.length,7);
 assert.equal(result.eligible_products_with_current_station,0);
 assert.ok(result.candidates.every(c=>c.station_evidence==="HISTORICAL_REFERENCE_ONLY"));
 assert.ok(result.candidates.every(c=>c.requested_quantity===null));
 assert.equal(result.pending_factor_count,6); // one old exact product rule remains known
});
test("03 seven CURRENT Sushi Quente products all request one portion per unit",()=>{
 const result=classify(examples.map(([name],i)=>sushi(i,name,2)));
 assert.equal(result.candidates.length,7);
 assert.equal(result.eligible_products_with_current_station,7);
 assert.equal(result.pending_factor_count,0);
 for(let i=0;i<7;i++){
  assert.equal(result.candidates[i].kitchen_kind,examples[i][1]);
  assert.equal(result.candidates[i].yield_per_sold_unit,1);
  assert.equal(result.candidates[i].requested_quantity,2);
 }
 assert.ok(!result.required_reviews.some(x=>x.startsWith("PRODUCT_COMPONENT_FACTOR_NOT_CONFIRMED")));
});
test("04 established Uramaki Ebiten Especial exact rule remains a factor of one",()=>{
 const c=classify([sushi(0,"Uramaki Ebiten Especial",3)]).candidates[0];
 assert.equal(c.yield_evidence,"EXACT_HUMAN_CONFIRMED_RULE");
 assert.equal(c.requested_quantity,3);
});
test("05 quantity means sold portions, never number of sushi pieces",()=>{
 const c=classify([sushi(0,"Uramaki Ebiten (8 peças)",4)]).candidates[0];
 assert.equal(c.source_order_quantity,4);
 assert.equal(c.requested_quantity,4);
 assert.equal(c.yield_evidence,"HUMAN_CONFIRMED_CATEGORY_1_PER_PORTION");
});
test("06 two component words create one portion of each kind per sold item",()=>{
 const c=classify([sushi(0,"Uramaki Hot com Ebiten",2)]).candidates;
 assert.deepEqual(c.map(x=>[x.kitchen_kind,x.requested_quantity]),[["HOT",2],["EBITEN",2]]);
});
test("07 proven routing to different station overrides historical Sushi Quente",()=>{
 const r=classify([item(0,"Hot Roll",4,"cozinha_quentes","CURRENT_MOTOR_PROVEN")]);
 assert.equal(r.candidates.length,0);
});
test("08 historical catalogue alone never makes a printable/current kitchen request",()=>{
 const c=classify([item(0,"Hot Roll",3)]);
 assert.equal(c.candidates[0].requested_quantity,null);
 assert.equal(c.candidates[0].scope_status,"HISTORICAL_CANDIDATE");
 assert.ok(c.required_reviews.some(x=>x.includes("CURRENT_SUSHI_QUENTE_STATION_NOT_PROVEN")));
});
test("09 unknown routing metadata cannot be upgraded to proven routing",()=>{
 const c=classify([item(0,"Temaki Ebiten",2,"enrolados_quentes","UNKNOWN")]);
 assert.equal(c.eligible_products_with_current_station,0);
 assert.equal(c.candidates[0].requested_quantity,null);
});
test("10 shisô and shisso both generate SHISO once per portion",()=>{
 const c=classify([sushi(0,"Tuna Shisô Tartar",1),sushi(1,"Tuna Shisso",3)]).candidates;
 assert.deepEqual(c.map(x=>[x.kitchen_kind,x.requested_quantity]),[["SHISO",1],["SHISO",3]]);
});
test("11 words must be independent, not incidental substrings",()=>{
 assert.equal(classify([sushi(0,"SHOT"),sushi(1,"EBITENADO"),sushi(2,"SHISOL")]).candidates.length,0);
});
test("12 items without matching keywords do not acquire invented preparation",()=>{
 assert.equal(classify([sushi(0,"Edamame"),sushi(1,"Combinado Kids")]).candidates.length,0);
});
test("13 duplicate source indexes are blocked",()=>{
 const c=classify([sushi(2,"Hot Roll"),sushi(2,"Uramaki Ebiten")]);
 assert.ok(c.required_reviews.some(x=>x.includes("SOURCE_INDEX_NOT_UNIQUE_OR_INVALID")));
});
test("14 an explicit conflicting product rule blocks instead of overriding silently",()=>{
 const conflicting={...rules,rules:[...rules.rules,{
   canonical_item_name:"Hot Roll",proof:"HUMAN_CONFIRMED",yields:{HOT:2},
 }]};
 const c=classify([sushi(0,"Hot Roll",2)],conflicting);
 assert.equal(c.candidates[0].requested_quantity,null);
 assert.ok(c.required_reviews.some(x=>x.startsWith("EXACT_RULE_CONFLICTS_WITH_HUMAN_CATEGORY_FACTOR")));
});
test("15 verified categories pass through existing kitchen motor as scoped quantities",()=>{
 const real=archivedResult();
 const src=[sushi(0,"Hot Roll",3),sushi(1,"Uramaki Ebiten",2),sushi(2,"Tuna Shisô Tartar",4)];
 const r=projectTwoKitchenTicketsScopedV49(src,catalogue.itens,real,rules);
 assert.deepEqual(r.split.components.tasks.map(x=>[x.kind,x.quantity]),[
   ["HOT",3],["EBITEN",2],["SHISO",4],
 ]);
 assert.equal(r.scope.pending_factor_count,0);
 assert.equal(r.print_authorized,false);
 assert.equal(r.split.components.status,"PARTIAL_REVIEW_REQUIRED");
});
test("16 the archived real kitchen dishes remain separate",()=>{
 const real=archivedResult();
 const src=[item(0,"Combinado Kids",3),item(1,"Edamame"),item(2,"Nasu no Misso"),item(3,"Sushi de Unagui")];
 const r=projectTwoKitchenTicketsScopedV49(src,catalogue.itens,real,rules);
 assert.equal(r.split.dishes.channel,"KITCHEN_DISHES");
 assert.equal(r.split.components,null);
 assert.equal(r.print_authorized,false);
});
test("17 kitchen component global coverage stays partial despite confirmed category factors",()=>{
 const real=archivedResult();
 const r=projectTwoKitchenTicketsScopedV49([sushi(0,"Hot Roll",2)],catalogue.itens,real,rules);
 assert.equal(r.split.components.tasks[0].quantity,2);
 assert.equal(r.split.ready_for_complete_components,false);
 assert.equal(r.split.ready_for_automatic_operational_print,false);
 assert.ok(r.split.review_reasons.some(x=>x.includes("DEPENDENCY_RULES_NOT_COMPLETE")));
});
test("18 no active dependency rules, stock, printer, fiscal or spooler are modified",()=>{
 const r=classify([sushi(0,"Temaki Ebiten",2)]);
 assert.deepEqual(r.effects,{print:false,spooler_write:false,odhen_write:false,stock_write:false});
 assert.equal(r.ready_for_automatic_operational_print,false);
 assert.equal(rules.rules.length,1);
 assert.equal(rules.rules[0].canonical_item_name,"Uramaki Ebiten Especial");
});
console.log("kitchen-sushi-quente-scope-v49: "+passed+"/"+passed+" PASS (SHADOW, no printing)");

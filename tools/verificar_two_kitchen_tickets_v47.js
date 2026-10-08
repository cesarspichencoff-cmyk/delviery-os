"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {splitTwoKitchenTicketsFromRulesV47,splitTwoKitchenTicketsV47}=
  require("../dist/src/production/twoKitchenTicketsV47.js");
const {projectKitchenNeeds}=require("../dist/src/production/kitchenDependencies.js");
const {renderTwoKitchenProofsV47}=
  require("../dist/src/production/twoKitchenTicketEscposV47.js");
const checks=[];
function test(label,fn){fn();checks.push(label);}
const livePartial=JSON.parse(fs.readFileSync(path.join(__dirname,"../data/kitchen_dependency_rules_v1.json"),"utf8"));
const ids={ifood:"9627",teknisa:"0000348850",tata:"001",hour:"19:45"};
function item(index,product,qty){
 return {source_item_index:index,product_code:String(index),quantity:qty,
 print_name:product.toUpperCase(),observations:[],finishing:[],kitchen_dependencies:[]};
}
function makeTicket(station,sourceItem,components=[]){
 const prepared=item(sourceItem.item_index,sourceItem.product_name,sourceItem.quantity);
 prepared.observations=sourceItem.observations.slice();
 prepared.kitchen_dependencies=components;
 return {
  station,fingerprint:station==="COZINHA"?"c".repeat(64):"s".repeat(64),
  identifiers:{...ids},
  boxes:[{position:"C1",model:"650",status:"PROVEN",operator_field:"Op. ________",
          items:[prepared]}],
  items_without_proven_box:[],warnings:[],ready_for_semantic_preview:true,
 };
}
function fixture(){
 const sushi={item_index:0,product_code:"URA8",product_name:"Uramaki Ebiten Especial",
              quantity:2,observations:[],packaging_role:"OTHER"};
 const dish={item_index:1,product_code:"EDM",product_name:"Edamame",
             quantity:1,observations:["SEM SAL"],packaging_role:"OTHER"};
 const production=[makeTicket("COZINHA",dish,["2x EBITEN"]),
  makeTicket("SUSHI",sushi,["2x EBITEN"])];
 return {source:[sushi,dish],ticket:{
  schema:"deliveryos.operational-tickets.v45.shadow.v1",
  production,conference:{identifiers:ids,boxes:[],items_without_proven_box:[],bags:[],kits:[],accompaniments:[],warnings:[],order_id:"DEMO-TEST",revision:null,ready_for_semantic_preview:true},blocking_reasons:[],
  ready_for_semantic_preview:true,ready_for_automatic_operational_print:false,
  effects:{print:false,spooler_write:false,odhen_write:false,stock_write:false},
 }};
}
function completeRules(){
 return {schema:"deliveryos.kitchen-dependency-rules.v1",coverage:"COMPLETE",
 coverage_proof:"HUMAN_CONFIRMED",
 rules:[
  {canonical_item_name:"Uramaki Ebiten Especial",proof:"HUMAN_CONFIRMED",
   yields:{EBITEN:1}},
  {canonical_item_name:"Edamame",proof:"HUMAN_CONFIRMED",yields:{}},
 ]};
}
test("01 source rule is partial, not an approved total",()=>{
 assert.equal(livePartial.coverage,"PARTIAL");
 assert.equal(livePartial.rules.find(x=>x.canonical_item_name==="Uramaki Ebiten Especial").yields.EBITEN,1);
});
test("02 two distinct logical kitchen tickets, one for components and other for dishes",()=>{
 const f=fixture(),result=splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,livePartial);
 assert.equal(result.components.channel,"KITCHEN_COMPONENTS");
 assert.equal(result.dishes.channel,"KITCHEN_DISHES");
 assert.equal(result.dishes.source.boxes[0].items[0].print_name,"EDAMAME");
 assert.deepEqual(result.components.tasks.map(t=>({name:t.kind,qty:t.quantity})),[{name:"EBITEN",qty:2}]);
 assert.equal(result.components.status,"PARTIAL_REVIEW_REQUIRED");
});
test("03 partial source produces no component printing bytes",()=>{
 const f=fixture(),r=renderTwoKitchenProofsV47(
  splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,livePartial));
 assert.equal(r.components.ready_for_offline_preview,false);
 assert.equal(r.components.byte_count,0);
 assert.equal(r.dishes.ready_for_offline_preview,true);
 assert.ok(!r.dishes.text_trace.includes("AGUARDAR COZINHA"));
 assert.equal(r.dishes.text_trace.includes("2  EBITEN"),false);
 assert.equal(r.effects.print,false);
});
test("04 complete explicit test fixture yields two separately renderable tickets",()=>{
 const f=fixture();
 const r=renderTwoKitchenProofsV47(splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,completeRules()));
 assert.equal(r.components.ready_for_offline_preview,true);
 assert.equal(r.dishes.ready_for_offline_preview,true);
 assert.ok(r.components.text_trace.includes("COZINHA - HOT / EBITEN / SHISO"));
 assert.ok(r.components.text_trace.includes("2  EBITEN"));
 assert.ok(!r.components.text_trace.includes("EDAMAME"));
 assert.ok(r.dishes.text_trace.includes("PRODUCAO COZINHA - PRATOS"));
 assert.ok(r.dishes.text_trace.includes("1  EDAMAME"));
 assert.ok(r.dishes.text_trace.includes("OBS: SEM SAL"));
});
test("05 HOT, EBITEN, SHISO share a preparation ticket, never dishes",()=>{
 const f=fixture(),rules=completeRules();
 rules.rules[0].yields={HOT:1,EBITEN:1,SHISO:2};
 const r=splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,rules);
 assert.deepEqual(r.components.tasks.map(x=>x.kind),["HOT","EBITEN","SHISO"]);
 assert.deepEqual(r.components.tasks.map(x=>x.quantity),[2,2,4]);
 assert.equal(r.dishes.source.boxes.length,1);
});
test("06 source only, no count multiplication when product has multiple printer intents",()=>{
 const f=fixture();
 f.ticket.production.push({...f.ticket.production[1],station:"BALCAOSUSHI1"});
 const r=splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,completeRules());
 assert.deepEqual(r.components.tasks.map(x=>x.quantity),[2]);
 assert.equal(r.dishes.source.boxes[0].items[0].quantity,1);
});
test("07 no empty preparation ticket when proven totals are zero",()=>{
 const f=fixture(),rules=completeRules();
 rules.rules[0].yields={};
 const r=splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,rules);
 assert.equal(r.components,null);
 assert.ok(r.dishes);
});
test("08 real archived delivery order routes kitchen dishes but doesn't invent components",()=>{
 const result=archivedResult();
 const source=[
  {item_index:0,product_code:"x1",product_name:"Combinado Kids",quantity:3,observations:[]},
  {item_index:1,product_code:"x2",product_name:"Edamame",quantity:1,observations:[]},
  {item_index:2,product_code:"x3",product_name:"Nasu no Misso",quantity:1,observations:[]},
  {item_index:3,product_code:"x4",product_name:"Sushi de Unagui",quantity:1,observations:[]},
 ];
 const split=splitTwoKitchenTicketsV47(source,result,null);
 assert.equal(split.components,null);
 assert.equal(split.dishes.channel,"KITCHEN_DISHES");
 assert.ok(split.review_reasons.includes("KITCHEN_NEEDS_MISSING"));
 const rendered=renderTwoKitchenProofsV47(split);
 assert.equal(rendered.components,null);
 assert.ok(rendered.dishes.text_trace.includes("1  EDAMAME"));
 assert.ok(rendered.dishes.text_trace.includes("1  NASU NO MISSO"));
});
test("09 invalid duplicate item indexes prevent component approval",()=>{
 const f=fixture();f.source[1].item_index=0;
 const r=splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,completeRules());
 assert.equal(r.ready_for_complete_components,false);
 assert.ok(r.review_reasons.includes("DUPLICATE_ITEM_INDEX"));
});
test("10 mismatched station identifiers block printing both ticket types",()=>{
 const f=fixture();f.ticket.production[1].identifiers={...ids,tata:"017"};
 const r=splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,completeRules());
 assert.equal(r.ready_for_complete_components,false);
 const proof=renderTwoKitchenProofsV47(r);
 assert.equal(proof.dishes.bytes.length,0);
 assert.equal(proof.components,null);
});
test("11 internal preparation quantity tampering triggers mismatch",()=>{
 const f=fixture();
 const needs=projectKitchenNeeds(f.source.map(s=>({nome:s.product_name,quantidade:s.quantity})),completeRules());
 needs.totals.ebiten=11;
 const r=splitTwoKitchenTicketsV47(f.source,f.ticket,needs);
 assert.ok(r.review_reasons.includes("TOTAL_MISMATCH:EBITEN"));
 assert.equal(renderTwoKitchenProofsV47(r).components.bytes.length,0);
});
test("12 kitchen dishes never include the dependency trace even when source had it",()=>{
 const f=fixture();
 const proof=renderTwoKitchenProofsV47(splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,completeRules()));
 assert.equal(proof.dishes.text_trace.includes("AGUARDAR COZINHA"),false);
 assert.equal(proof.components.text_trace.includes("OBS: SEM SAL"),false);
});
test("13 no print, cut or spooler side effects",()=>{
 const f=fixture();const split=splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,completeRules());
 const p=renderTwoKitchenProofsV47(split);
 assert.deepEqual(split.effects,{print:false,spooler_write:false,odhen_write:false,stock_write:false});
 for(const v of [p.components,p.dishes]){
  assert.equal(v.ready_for_operational_print,false);
  assert.equal(v.effects.cut,false);
  for(let i=0;i<v.bytes.length-1;i++)assert.ok(!(v.bytes[i]===0x1d&&v.bytes[i+1]===0x56));
 }
});
const {buildKitchenSeparatedBundleV47}=require("../dist/src/production/kitchenSeparatedOfflineBundleV47.js");
test("14 bundle replaces original kitchen paper with dishes and components",()=>{
 const f=fixture();
 const split=splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,completeRules());
 const bundle=buildKitchenSeparatedBundleV47(f.ticket,split);
 assert.deepEqual(bundle.jobs.map(j=>j.channel).sort(),
    ["OTHER_PRODUCTION","KITCHEN_COMPONENTS","KITCHEN_DISHES","CONFERENCE"].sort());
 assert.equal(bundle.jobs.filter(j=>j.channel==="KITCHEN_DISHES").length,1);
 assert.equal(bundle.jobs.filter(j=>j.channel==="KITCHEN_COMPONENTS").length,1);
 assert.equal(bundle.jobs.filter(j=>j.proof.text_trace.includes("PRODUCAO COZINHA\n")).length,0);
 assert.equal(bundle.ready_for_automatic_operational_print,false);
});
test("15 partial rules do not generate a speculative kitchen components print job",()=>{
 const f=fixture();
 const split=splitTwoKitchenTicketsFromRulesV47(f.source,f.ticket,livePartial);
 const bundle=buildKitchenSeparatedBundleV47(f.ticket,split);
 assert.equal(bundle.jobs.filter(j=>j.channel==="KITCHEN_COMPONENTS").length,0);
 assert.equal(bundle.blocked_proofs.filter(j=>j.channel==="KITCHEN_COMPONENTS").length,1);
 assert.equal(bundle.jobs.filter(j=>j.channel==="KITCHEN_DISHES").length,1);
});
test("16 real archived source makes only one kitchen dishes job; no imaginary components",()=>{
 const result=archivedResult();
 const source=[
 {item_index:0,product_name:"Combinado Kids",quantity:3},
 {item_index:1,product_name:"Edamame",quantity:1},
 {item_index:2,product_name:"Nasu no Misso",quantity:1},
 {item_index:3,product_name:"Sushi de Unagui",quantity:1},
 ];
 const split=splitTwoKitchenTicketsV47(source,result,null);
 const b=buildKitchenSeparatedBundleV47(result,split);
 assert.equal(b.jobs.filter(j=>j.channel==="KITCHEN_DISHES").length,1);
 assert.equal(b.jobs.filter(j=>j.channel==="KITCHEN_COMPONENTS").length,0);
 assert.equal(b.jobs.filter(j=>j.channel==="OTHER_PRODUCTION").length,1);
 assert.equal(b.jobs.filter(j=>j.channel==="CONFERENCE").length,1);
});
console.log("kitchen-two-tickets-v47: "+checks.length+"/"+checks.length+" offline/shadow checks PASS");
for(const c of checks)console.log("PASS "+c);

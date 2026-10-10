"use strict";
/** Reconciles upstream packaging truth with all three offline ticket projections.
 * Synthetic fixture only; no live reader, printer, stock or device connection.
 */
const assert=require("node:assert/strict");
const {projectTicketsFromCurrentPackagingV63,PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
let passed=0;
function check(name,fn){fn();passed++;console.log("PASS "+passed+" "+name)}
const source=[
 {item_index:0,product_code:"TEST-D",product_name:"SUSHI SALMAO",quantity:2,
  observations:[],packaging_role:"OTHER"},
 {item_index:1,product_code:"TEST-S",product_name:"SASHIMI ATUM",quantity:1,
  observations:["SEM PIMENTA"],packaging_role:"OTHER"},
];
const entries=source.map(s=>({source_item_index:s.item_index,quantity:s.quantity,
 station_proof:"CURRENT_MOTOR_PROVEN",
 product:{nome:s.product_name,classification:{station:"duplas",family:"dupla"}}}));
const packageData=()=>({
 total_items:3,has_unknown:false,
 groups:[{kind:"faixa",station:"duplas",box:"450",boxes:1,
   status:"DERIVED_FROM_PROVEN_CAPACITIES",
   products:source.map(s=>({name:s.product_name,quantity:s.quantity}))}],
 bags:{size:"P",status:"PROVEN_OPERATIONAL_DOCUMENT",size_status:"FACT",
   exact_bag_count:1,exact_bag_count_status:"FACT",
   group_sizes:[{group:"cold",size:"P",status:"FACT"}]},
});
const kits=()=>({status:"FACT",kits:[{kit:"Kit p/1",quantidade:1}]});
const motor=(p=packageData(),k=kits())=>({packComanda:()=>p,kitVerdict:()=>k});
const kit_registry={schema:"deliveryos.kit-component-registry.v1",kits:{
 "Kit p/1":{proof:"HUMAN_CONFIRMED",components:[
  {resource_key:"HASHI",label:"Hashi",quantity:1,uom:"EA"},
  {resource_key:"SHOYUZARA",label:"Shoyuzara",quantity:1,uom:"EA"}]}
}};
function fixture(){
 const order_id="SYNTHETIC-V64-NOT-REAL";
 const production_plan={
  schema:"deliveryos.production-print-plan.v1",order_id,
  ready_for_shadow_payload:true,blocking_reasons:[],
  print_intents:[{printer:{printer_name:"DUPLAS",printer_code:"SIMULATED"},
   identifiers:{ifood_sequence:"SYNTH",teknisa_sequence:"TEST",tata_sequence:"996",order_time:"12:00"},
   intent_fingerprint:"4".repeat(64),
   lines:source.map((s,i)=>({item_index:s.item_index,product_code:s.product_code,
     product_name:s.product_name,quantity:s.quantity,
     item_observations:s.observations,mount_group_id:"OLD_"+i,box_label:"CX 450",prep_components:[]}))}],
 };
 return {order_id,source_items:structuredClone(source),production_plan,
  resource_input:{order_id,
   sold_items:source.map(s=>({product_code:s.product_code,product_name:s.product_name,
      quantity:s.quantity,cmv_basis:"NON_STOCK"})),
   kit_registry:structuredClone(kit_registry)}};
}
const run=(input=fixture(),e=entries,m=motor())=>projectTicketsFromCurrentPackagingV63(
 input,e,m,PACKAGING_SOURCE_BLOB_V63);
check("one box two products reaches production AND conference",()=>{
 const f=fixture(),before=structuredClone(f.production_plan);
 const out=run(f);assert.equal(out.bridge.status,"VERIFIED_INPUT",JSON.stringify(out.bridge.reasons));
 assert.ok(out.tickets,JSON.stringify(out.coherence_reasons));
 assert.equal(out.tickets.ready_for_semantic_preview,true);
 assert.equal(out.tickets.production.length,1);
 assert.equal(out.tickets.production[0].boxes.length,1);
 assert.equal(out.tickets.conference.boxes.length,1);
 assert.equal(out.tickets.conference.boxes[0].items.length,2);
 assert.deepEqual(out.tickets.conference.boxes[0].items[1].observations,["SEM PIMENTA"]);
 assert.equal(out.tickets.conference.bags[0].label,"Sacola P");
 assert.equal(out.tickets.conference.kits[0].label,"Kit p/1");
 assert.deepEqual(f.production_plan,before,"Original routing/fingerprint must remain unchanged");
 assert.equal(out.ready_for_automatic_operational_print,false);
 const renders=renderOperationalTicketsProofV46(out.tickets);
 assert.ok(renders.production[0].ready_for_offline_preview);
 assert.ok(renders.conference.text_trace.includes("1 CAIXA | 2 PRODUTOS"));
 assert.ok(renders.conference.text_trace.includes("OBS: SEM PIMENTA"));
 assert.equal(renders.conference.ready_for_operational_print,false);
});
check("missing core kit registry blocks rather than invents consumption",()=>{
 const f=fixture();delete f.resource_input.kit_registry;
 const r=run(f);assert.equal(r.tickets,null);
 assert.ok(r.coherence_reasons.includes("CURRENT_KIT_COMPONENT_REGISTRY_REQUIRED"));
});
check("uncertain box membership blocks projection",()=>{
 const m=packageData();m.groups[0].status="UNKNOWN";
 const r=run(fixture(),entries,motor(m));
 assert.equal(r.tickets,null);
 assert.equal(r.bridge.status,"BLOCKED");
});
check("motor box across two distinct stations cannot be treated as one production block",()=>{
 const f=fixture();f.production_plan.print_intents=[
  {...f.production_plan.print_intents[0],lines:[f.production_plan.print_intents[0].lines[0]]},
  {...f.production_plan.print_intents[0],printer:{printer_name:"SUSHI",printer_code:"SIM-B"},
   intent_fingerprint:"5".repeat(64),lines:[f.production_plan.print_intents[0].lines[1]]}
 ];
 const r=run(f);
 assert.equal(r.tickets,null);
 assert.ok(r.coherence_reasons.some(s=>s.includes("STATION_SPLITS_PHYSICAL_BOX")));
});
check("same product quantity two counts as one product line",()=>{
 const f=fixture();f.source_items=f.source_items.slice(0,1);
 f.resource_input.sold_items=f.resource_input.sold_items.slice(0,1);
 f.production_plan.print_intents[0].lines=f.production_plan.print_intents[0].lines.slice(0,1);
 const e=entries.slice(0,1), m=packageData();
 m.total_items=2;m.groups[0].box="750";m.groups[0].products=m.groups[0].products.slice(0,1);
 const r=run(f,e,motor(m));
 assert.ok(r.tickets,JSON.stringify(r.coherence_reasons));
 assert.equal(r.tickets.conference.boxes.length,1);
 assert.equal(r.tickets.conference.boxes[0].items[0].quantity,2);
 const proof=renderOperationalTicketsProofV46(r.tickets).conference.text_trace;
 assert.ok(proof.includes("1 CAIXA | 1 PRODUTO"));
 assert.ok(proof.includes("2  SUSHI SALMAO"));
});
check("two bag sizes must each be evidenced",()=>{
 const m=packageData();m.bags.exact_bag_count=2;
 m.bags.group_sizes=[{group:"A",size:"P",status:"FACT"},{group:"B",size:"M",status:"FACT"}];
 const r=run(fixture(),entries,motor(m));
 assert.ok(r.tickets,JSON.stringify(r.coherence_reasons));
 assert.deepEqual(r.tickets.conference.bags.map(b=>b.label),["Sacola M","Sacola P"]);
});
check("two bag count with one size proof is blocked",()=>{
 const m=packageData();m.bags.exact_bag_count=2;m.bags.group_sizes=[{group:"A",size:"P",status:"FACT"}];
 const r=run(fixture(),entries,motor(m));
 assert.equal(r.tickets,null);
 assert.ok(r.bridge.reasons.includes("PER_BAG_SIZE_DISTRIBUTION_NOT_PROVEN"));
});
check("unverified extra kit cannot produce a conference item",()=>{
 const r=run(fixture(),entries,motor(packageData(),{status:"UNKNOWN",kits:[]}));
 assert.equal(r.tickets,null);assert.ok(r.bridge.reasons.includes("KIT_ASSIGNMENT_NOT_PROVEN"));
});
console.log("THREE_WAY_MOTOR_COHERENCE_V64="+passed+"/"+passed+" OFFLINE; PRINT=false");

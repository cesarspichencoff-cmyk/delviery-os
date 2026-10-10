"use strict";
const assert=require("node:assert/strict");
const {pinnedUnifiedCoreKitRegistryV66,UNIFIED_KIT_CORE_SOURCE_BLOB_V66}=
 require("../dist/src/production/pinnedUnifiedKitsV66.js");
const {compileJoinedReaderIngressV66,projectJoinedReaderTicketsV66}=
 require("../dist/src/production/readerIngressV66.js");
const {joinDeliveryAndProduction}=
 require("../dist/src/production/deliveryProductionJoin.js");
const {PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log("PASS "+checks+" "+name)};
const copy=v=>structuredClone(v);
const kitRegistry=pinnedUnifiedCoreKitRegistryV66;
const items=[
 {item_index:0,codigo:"D1",nome:"SUSHI SALMAO",quantidade:2,observacoes:[]},
 {item_index:1,codigo:"S1",nome:"SASHIMI ATUM",quantidade:1,observacoes:["SEM PIMENTA"]},
];
function fixture(){
 const delivery={pedido_interno:"0000349922",pedido_externo:"2841",
  items:copy(items),order_observations:[]};
 const production={join_key_proof:"DLV_NRCOMANDA_PROVEN",
  pedido_interno_from_dlv:"0000349922",
  lines:items.map(i=>({nome:i.nome,quantidade:i.quantidade,
   tx_prod_com_ven:[],printer_key:"00009"}))};
 const plan={schema:"deliveryos.production-print-plan.v1",order_id:"0000349922",
  ready_for_shadow_payload:true,blocking_reasons:[],
  print_intents:[{printer:{printer_name:"BALCAOSUSHI1",printer_code:"00009"},
   intent_fingerprint:"7".repeat(64),
   identifiers:{ifood_sequence:"2841",teknisa_sequence:"0000349922",
    tata_sequence:"995",order_time:"12:07"},
   lines:items.map((i,n)=>({item_index:i.item_index,product_code:i.codigo,
    product_name:i.nome,quantity:i.quantidade,item_observations:copy(i.observacoes),
    mount_group_id:"OLD_"+n,box_label:"CX 450",prep_components:[]}))}]};
 const identities=items.map(i=>({item_index:i.item_index,product_code:i.codigo,
  product_name:i.nome,quantity:i.quantidade,
  classification:{station:"duplas",family:"duplas"},
  packaging_role:"OTHER",station_proof:"CURRENT_MOTOR_PROVEN",
  proof:"CURRENT_PRODUCT_IDENTITY_CROSSWALK_PROVEN",
  source_ref:"sanitized-current-cdarvprod:"+i.codigo}));
 const packaging=()=>({total_items:3,has_unknown:false,
  groups:[{kind:"faixa",station:"duplas",box:"450",boxes:1,
    status:"DERIVED_FROM_PROVEN_CAPACITIES",
    products:items.map(i=>({name:i.nome,quantity:i.quantidade}))}],
  bags:{size:"P",size_status:"FACT",status:"PROVEN_OPERATIONAL_DOCUMENT",
   exact_bag_count:1,exact_bag_count_status:"FACT"}});
 const motor={packComanda:packaging,
  kitVerdict:()=>({status:"FACT",kits:[{kit:"Kit Simples",quantidade:1}]})};
 return {delivery,production,plan,identities,motor};
}
const joined=f=>joinDeliveryAndProduction(f.delivery,f.production);
const ingress=f=>compileJoinedReaderIngressV66(joined(f),f.plan,f.identities);
test("pinned Unified Kit Core source and exact six definitions verified",()=>{
 const registry=kitRegistry();
 assert.equal(UNIFIED_KIT_CORE_SOURCE_BLOB_V66,"42d69fea73e830bd6517e1230a0ec4c7fc9737a4");
 assert.equal(Object.keys(registry.kits).length,6);
 assert.deepEqual(registry.kits["Kit Quente"].components.map(c=>c.resource_key),
 ["HASHI","GUARDANAPO","SHOYU_SACHE_8ML"]);
 registry.kits["Kit Kids"].components.pop();
 assert.equal(kitRegistry().kits["Kit Kids"].components.length,5,"must return unmutated copy");
});
test("joined source is aligned, canonical kits forced and notes preserved",()=>{
 const f=fixture(),before=copy(f.plan);
 const s=ingress(f);assert.equal(s.status,"ALIGNED",JSON.stringify(s.blockers));
 assert.equal(s.input.resource_input.kit_registry.kits["Kit p/1"].components.length,4);
 assert.deepEqual(s.input.source_items[1].observations,["SEM PIMENTA"]);
 assert.deepEqual(f.plan,before,"no mutation of print fingerprint or station");
});
test("reconciled source projects real semantic 2-product box to production and conference",()=>{
 const f=fixture();
 const r=projectJoinedReaderTicketsV66(f.delivery,f.production,f.plan,f.identities,
  f.motor,PACKAGING_SOURCE_BLOB_V63);
 assert.ok(r.tickets,JSON.stringify(r.reasons));
 assert.equal(r.tickets.ready_for_semantic_preview,true);
 assert.equal(r.tickets.production[0].boxes.length,1);
 assert.equal(r.tickets.conference.boxes.length,1);
 assert.equal(r.tickets.conference.boxes[0].items.length,2);
 assert.deepEqual(r.tickets.conference.boxes[0].items[1].observations,["SEM PIMENTA"]);
 assert.equal(r.tickets.conference.kits[0].label,"Kit Simples");
 const proof=renderOperationalTicketsProofV46(r.tickets);
 assert.equal(proof.conference.ready_for_offline_preview,true);
 assert.ok(proof.conference.text_trace.includes("1 CAIXA | 2 PRODUTOS"));
 assert.ok(proof.conference.text_trace.includes("OBS: SEM PIMENTA"));
 assert.equal(r.print_authorized,false);
});
test("JOIN DLV identifier not proven blocks",()=>{
 const f=fixture();f.production.join_key_proof="UNPROVEN";
 assert.equal(ingress(f).status,"BLOCKED");
});
test("foreign order cannot borrow current print plan",()=>{
 const f=fixture();f.plan.order_id="0000349923";
 assert.ok(ingress(f).blockers.includes("ORDER_JOIN_PRINT_PLAN_ID_MISMATCH"));
});
test("unverified/current product crosswalk missing blocks",()=>{
 const f=fixture();f.identities.pop();
 assert.equal(ingress(f).status,"BLOCKED");
});
test("contradictory observation SEM vs COM blocks",()=>{
 const f=fixture();
 f.plan.print_intents[0].lines[1].item_observations=["COM PIMENTA"];
 assert.ok(ingress(f).blockers.includes("PRODUCTION_CUSTOMER_OBSERVATION_DIVERGENCE:1"));
});
test("new TXPRODCOMVEN cannot be omitted from production ticket",()=>{
 const f=fixture();f.production.lines[1].tx_prod_com_ven=["SEM WASABI"];
 const x=ingress(f);assert.equal(x.status,"BLOCKED");
 assert.ok(x.blockers.includes("PRODUCTION_CUSTOMER_OBSERVATION_DIVERGENCE:1"));
});
test("delivery and production duplicate source cannot be counted twice",()=>{
 const f=fixture();f.production.lines.push({...f.production.lines[1]});
 assert.equal(joined(f).items.length,2);
 assert.equal(ingress(f).status,"ALIGNED");
});
test("printer mismatch is blocked; never reroute based on name",()=>{
 const f=fixture();f.production.lines[0].printer_key="00006";
 assert.ok(ingress(f).blockers.includes("PRODUCTION_PRINTER_NOT_IN_CURRENT_SOURCE_ROUTE:0"));
});
test("order-wide observations require proof before displaying anything",()=>{
 const f=fixture();f.delivery.order_observations=["ALERGIA AO AMENDOIM"];
 assert.ok(ingress(f).blockers.includes("ORDER_LEVEL_OBSERVATIONS_REQUIRE_ITEM_RELEVANCE_PROOF"));
});
test("unknown family is not assigned a box",()=>{
 const f=fixture();f.identities[1].station_proof="UNKNOWN";
 assert.ok(ingress(f).blockers.includes("CURRENT_STATION_OR_FAMILY_NOT_PROVEN:1"));
});
test("no print despite successful offline assembly",()=>{
 const f=fixture();const r=projectJoinedReaderTicketsV66(f.delivery,f.production,f.plan,
  f.identities,f.motor,PACKAGING_SOURCE_BLOB_V63);
 assert.equal(r.print_authorized,false);
 assert.equal(r.ingress.effects.print,false);
 assert.equal(r.tickets.effects.print,false);
});
console.log("READER_INGRESS_V66="+checks+"/"+checks+" SHADOW ONLY; NO LIVE ACCESS");

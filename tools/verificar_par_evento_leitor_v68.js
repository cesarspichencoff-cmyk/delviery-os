"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {verifyLiveReaderPairV68,projectVerifiedReaderPairV68}=
 require("../dist/src/production/stableReaderShadowPairV68.js");
const {PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
let count=0;const check=(name,fn)=>{fn();count++;console.log("PASS "+count+" "+name)};
const deep=v=>structuredClone(v);
const hex="a".repeat(64);
const source=[
 {item_index:0,canonical:"9.20.00.010.00",internal:"0000001234",
  name:"SUSHI SALMAO",quantity:2,obs:[]},
 {item_index:1,canonical:"9.30.00.010.00",internal:"0000001235",
  name:"SASHIMI ATUM",quantity:1,obs:["SEM PIMENTA"]},
];
const fingerprint=d=>{
 const core={order_key:d.order_key,snapshot_hash:d.snapshot_hash,
  ifood_sequence:d.ifood_sequence,teknisa_sequence:d.teknisa_sequence,
  service:d.service,items:d.items,packaging:d.packaging,kits:d.kits,
  sequence:d.sequence};
 return crypto.createHash("sha256").update(JSON.stringify(core)).digest("hex");
};
function fixture(){
 const service={service:"LUNCH",evidence:"HUMAN_CONFIRMED_RULE",
  source_ref:"fixture:proof:service-date-specific",blockers:[]};
 const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:"0001|01|0000123456",snapshot_hash:hex,
  ready_for_downstream_shadow:true,blockers:[],service_resolution:service,
  order:{CDFILIAL:"0001",CDLOJA:"01",NRCOMANDA:"0000123456",
   NRCOMANDAEXT:"2841",IDORGCMDVENDA:"DLV_IFO",
   items:source.map((s,i)=>({NRPRODCOMVEN:String(i+1).padStart(6,"0"),
    CDPRODUTO:s.internal,CDARVPROD:s.canonical.replace(/\./g,""),
    QTPRODCOMVEN:s.quantity+".000",IDSTPRCOMVEN:"A"}))}};
 const decision={schema:"deliveryos.live-shadow-decision.v1",
  ready:true,blocking_reasons:[],order_key:event.order_key,
  snapshot_hash:event.snapshot_hash,ifood_sequence:"2841",teknisa_sequence:"0000123456",
  service:deep(service),items:source.map((s,i)=>({item_index:i+1,CDPRODUTO:s.internal,
   canonical_code:s.canonical,product_name:s.name,quantity:s.quantity,
   routing_status:"ROUTED",
   targets:[{printer_code:"00009",printer_name:"BALCAOSUSHI1"}],
   classification:{family:"dupla",station:"duplas",review_required:false},
   classification_source:"ACADEMIA_EXACT_NAME"})),
  packaging:{has_unknown:false,total_items:3},
  kits:{status:"FACT"},sequence:{shadow_candidate:"001",binding_written:false},
  rule_lineage:{academy_rule_refs:["fixture:academy:sha256:exact"],delivery_rule_refs:["fixture:routing:sha256:exact"]},
 };
 decision.fingerprint=fingerprint(decision);
 const delivery={pedido_interno:"0000123456",pedido_externo:"2841",
  items:source.map(s=>({item_index:s.item_index,codigo:s.canonical,nome:s.name,
   quantidade:s.quantity,observacoes:deep(s.obs)})),order_observations:[]};
 const production={join_key_proof:"DLV_NRCOMANDA_PROVEN",
  pedido_interno_from_dlv:"0000123456",
  lines:source.map(s=>({nome:s.name,quantidade:s.quantity,
   tx_prod_com_ven:[],printer_key:"00009"}))};
 const plan={schema:"deliveryos.production-print-plan.v1",order_id:"0000123456",
  ready_for_shadow_payload:true,blocking_reasons:[],
  print_intents:[{printer:{printer_name:"BALCAOSUSHI1",printer_code:"00009"},
   intent_fingerprint:"7".repeat(64),
   identifiers:{ifood_sequence:"2841",teknisa_sequence:"0000123456",
    tata_sequence:"996",order_time:"12:07"},
   lines:source.map((s,i)=>({item_index:i,product_code:s.canonical,
    product_name:s.name,quantity:s.quantity,item_observations:deep(s.obs),
    mount_group_id:"OLD_"+i,box_label:"CX 450",prep_components:[]}))}]};
 const identities=source.map(s=>({item_index:s.item_index,product_code:s.canonical,
  product_name:s.name,quantity:s.quantity,
  classification:{station:"duplas",family:"dupla"},packaging_role:"OTHER",
  station_proof:"CURRENT_MOTOR_PROVEN",
  proof:"CURRENT_PRODUCT_IDENTITY_CROSSWALK_PROVEN",
  source_ref:"fixture:current:product-identity:"+s.canonical}));
 const observation_proofs=source.map(s=>({item_index:s.item_index,canonical_code:s.canonical,
  snapshot_hash:hex,source_ref:"fixture:observations:"+s.internal,
  status:s.obs.length?"OBSERVED_EXACT_ITEM_OBSERVATIONS":"PROVEN_NONE_FOR_THIS_ITEM"}));
 const pack=()=>({total_items:3,has_unknown:false,
  groups:[{kind:"faixa",station:"duplas",box:"450",boxes:1,
   status:"DERIVED_FROM_PROVEN_CAPACITIES",
   products:source.map(s=>({name:s.name,quantity:s.quantity}))}],
  bags:{size:"P",size_status:"FACT",status:"PROVEN_OPERATIONAL_DOCUMENT",
   exact_bag_count:1,exact_bag_count_status:"FACT"}});
 const motor={packComanda:pack,kitVerdict:()=>({status:"FACT",
  kits:[{kit:"Kit Simples",quantidade:1}]})};
 return {event,decision,ctx:{delivery,production,production_plan:plan,identities,
  observation_proofs,motor,motor_blob_sha:PACKAGING_SOURCE_BLOB_V63}};
}
check("actual reader v1-shaped event and decision pair verified by content fingerprint",()=>{
 const {event,decision}=fixture();
 const result=verifyLiveReaderPairV68(event,decision);
 assert.equal(result.status,"PAIRED_SOURCE_VERIFIED",result.reasons.join(","));
 assert.equal(result.items.length,2);
 assert.equal(result.items[0].quantity,2);
 assert.equal(result.effects.print,false);
});
check("full synthetic source-paired replay yields one proven 2-product box",()=>{
 const f=fixture();const r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx);
 assert.equal(r.status,"OFFLINE_PREVIEW_PROVEN",r.reasons.join(","));
 assert.equal(r.tickets.conference.boxes.length,1);
 assert.equal(r.tickets.conference.boxes[0].items.length,2);
 assert.deepEqual(r.tickets.conference.boxes[0].items[1].observations,["SEM PIMENTA"]);
 assert.equal(r.print_authorized,false);
});
check("decision cannot be borrowed from older order snapshot",()=>{
 const f=fixture();f.event.snapshot_hash="b".repeat(64);
 const r=verifyLiveReaderPairV68(f.event,f.decision);
 assert.ok(r.reasons.includes("SHADOW_DECISION_EVENT_REVISION_MISMATCH"));
});
check("fingerprint detects decision item tampering independent of ready flag",()=>{
 const f=fixture();f.decision.items[0].quantity=8;
 const r=verifyLiveReaderPairV68(f.event,f.decision);
 assert.ok(r.reasons.includes("SHADOW_DECISION_CONTENT_FINGERPRINT_MISMATCH"));
});
check("invalid numeric 0 or noninteger cannot be coerced into one product",()=>{
 for(const q of ["0.000","1.5","NaN","", "-2.000"]){
  const f=fixture();f.event.order.items[0].QTPRODCOMVEN=q;
  const r=verifyLiveReaderPairV68(f.event,f.decision);
  assert.equal(r.status,"BLOCKED",q);
  assert.ok(r.reasons.some(x=>x.startsWith("READER_EVENT_DECISION_PRODUCT_IDENTITY")));
 }
});
check("internal SQL code and routing code both must match",()=>{
 const f=fixture();f.event.order.items[0].CDPRODUTO="OTHER";
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.some(x=>
 x.startsWith("READER_EVENT_DECISION_PRODUCT_IDENTITY")));
});
check("duplicate NRPRODCOMVEN is rejected",()=>{
 const f=fixture();f.event.order.items[1].NRPRODCOMVEN=f.event.order.items[0].NRPRODCOMVEN;
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.some(x=>
 x.startsWith("READER_ITEM_INDEX_OR_ID_AMBIGUOUS")));
});
check("a shadow service mismatch blocks all projection",()=>{
 const f=fixture();f.event.service_resolution.service="DINNER";
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
 "EVENT_DECISION_SERVICE_PROOF_MISMATCH"));
});
check("fake sequence side effect invalidates pair",()=>{
 const f=fixture();f.decision.sequence.binding_written=true;
 f.decision.fingerprint=fingerprint(f.decision);
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
 "SHADOW_SEQUENCE_NOT_READ_ONLY"));
});
check("missing observation source rejects even otherwise ready event",()=>{
 const f=fixture();f.ctx.observation_proofs=[];
 const r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.reasons.includes("JOINED_INPUT_OR_PROOF_COVERAGE_MISMATCH"));
});
check("observation proof from a different revision is prohibited",()=>{
 const f=fixture();f.ctx.observation_proofs[1].snapshot_hash="b".repeat(64);
 assert.ok(projectVerifiedReaderPairV68(f.event,f.decision,f.ctx).reasons.some(x=>
 x.startsWith("ITEM_OBSERVATION_PROOF_MISSING_OR_WRONG_REVISION")));
});
check("customer instruction cannot disappear just by claiming PROVEN_NONE",()=>{
 const f=fixture();f.ctx.observation_proofs[1].status="PROVEN_NONE_FOR_THIS_ITEM";
 assert.ok(projectVerifiedReaderPairV68(f.event,f.decision,f.ctx).reasons.some(x=>
 x.startsWith("ITEM_OBSERVATION_PROOF_MISSING_OR_WRONG_REVISION")));
});
check("reader decision routing and actual production targets must agree",()=>{
 const f=fixture();f.ctx.production.lines[0].printer_key="00006";
 assert.ok(projectVerifiedReaderPairV68(f.event,f.decision,f.ctx).reasons.some(x=>
 x.startsWith("PRODUCTION_ROUTE_NOT_SAME_SHADOW_DECISION")));
});
check("classification drift from real consumer fails independently of packet validity",()=>{
 const f=fixture();f.ctx.identities[0].classification.family="temaki";
 assert.ok(projectVerifiedReaderPairV68(f.event,f.decision,f.ctx).reasons.some(x=>
 x.startsWith("CURRENT_IDENTITY_NOT_BOUND_TO_SHADOW_ITEM")));
});
check("nonproduction access is never authorized by proof runner",()=>{
 const f=fixture();const r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx);
 assert.equal(r.print_authorized,false);
 assert.equal(r.tickets.ready_for_automatic_operational_print,false);
 assert.deepEqual(verifyLiveReaderPairV68(f.event,f.decision).effects,{
  database_read:false,database_write:false,print:false,spooler:false,odhen_write:false});
});
console.log("STABLE_READER_SHADOW_PAIR_V68="+count+"/"+count+" SHADOW ONLY; NO PHYSICAL EFFECT");

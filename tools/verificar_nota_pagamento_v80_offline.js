"use strict";
/** Separate synthetic V8.0 contract tests. No original note, real order or printer. */
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {PACKAGING_SOURCE_BLOB_V63,PACKAGING_SOURCE_SHA256_V78}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const {preparePaymentOnlyOfflineViewV80,PAYMENT_NOTE_POLICY_V80,
 projectVerifiedReaderPairV68,verifyLiveReaderPairV68,
 prepareOrderNoteReviewPacketV77}=
 require("../dist/src/production/stableReaderShadowPairV68.js");
const deep=v=>structuredClone(v);
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log("PASS V80 "+checks+" "+name)};
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
  service:d.service,items:d.items};
 if(d.observation_scan_complete!==undefined){
   core.order_observations=d.order_observations;
   core.observation_scan_complete=d.observation_scan_complete;
 }
 core.packaging=d.packaging;core.kits=d.kits;core.sequence=d.sequence;
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
  rule_lineage:{
    academy_rule_refs:[
      "tata-academia:installed/packaging-current.js#sha256="+PACKAGING_SOURCE_SHA256_V78,
      "tata-academia:installed/app-data.json#sha256="+"a".repeat(64)
    ],
    delivery_rule_refs:[
      "deliveryos:installed/routing.json#sha256="+"b".repeat(64),
      "deliveryos:installed/printer-map.json#sha256="+"c".repeat(64),
      "deliveryos:installed/non-production.json#sha256="+"d".repeat(64),
      "deliveryos:installed/product-identity-cache-v1.json#sha256="+"e".repeat(64)
    ]
  },
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
  delivery_observations:deep(s.obs),production_observations:[],
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

function asWatcherV2(f,rows){
 const old=f.event.order;
 f.event.order={CDFILIAL:old.CDFILIAL,CDLOJA:old.CDLOJA,
  NRVENDAREST:"0000123400",NRCOMANDA:old.NRCOMANDA,
  NRCOMANDAEXT:old.NRCOMANDAEXT,IDORGCMDVENDA:old.IDORGCMDVENDA,
  IDSTCOMANDA:"A",DTHRABERMESA:"2026-10-10T12:07:00.0000000",
  items:deep(old.items),observation_scan_complete:true,
  observation_rows:deep(rows)};
 const src=f.event.order;
 const core={CDFILIAL:src.CDFILIAL,CDLOJA:src.CDLOJA,
  NRVENDAREST:src.NRVENDAREST,NRCOMANDA:src.NRCOMANDA,
  NRCOMANDAEXT:src.NRCOMANDAEXT,IDORGCMDVENDA:src.IDORGCMDVENDA,
  IDSTCOMANDA:src.IDSTCOMANDA,DTHRABERMESA:src.DTHRABERMESA,
  items:src.items};
 if(rows.length)core.observation_rows=deep(rows);
 const hashed=crypto.createHash("sha256").update(JSON.stringify(core)).digest("hex");
 f.event.snapshot_hash=hashed;f.decision.snapshot_hash=hashed;
 // Exact deployed V2 decision core: each item carries [{source_field,value}],
 // order notes and scan flag precede packaging/kits/sequence in fingerprint.
 // V2 installed consumer reads eight identity/rule files, including two
 // human/alias surfaces. Legacy V1 keeps its original six refs.
 f.decision.rule_lineage.delivery_rule_refs.push(
   "deliveryos:installed/product-aliases-v1.json#sha256="+"f".repeat(64),
   "deliveryos:installed/human-order-overrides-v1.json#sha256="+"0".repeat(64)
 );
 f.decision.observation_scan_complete=true;
 f.decision.order_observations=rows.filter(r=>r.scope_hint==="order")
   .map(r=>({source_field:r.source_field,value:r.value}));
 f.decision.items=f.decision.items.map((item,i)=>({...item,
   observations:rows.filter(r=>r.scope_hint==="item"&&r.item_index===i)
      .map(r=>({source_field:r.source_field,value:r.value}))}));
 f.decision.fingerprint=fingerprint(f.decision);
 for(const p of f.ctx.observation_proofs)p.snapshot_hash=hashed;
 return f;
}


const day="2026-10-14T12:07:00.0000000";
const paymentNote=(value="PAGO ONLINE (VALOR: 69.48) ID: 100123 - COD. P/ CANCELAMENTO: 456789")=>
 ({source_field:"DSOBSCOMANDA",value,scope_hint:"order",join_proven:true});
function scenario(value=paymentNote().value){
 const item={source_field:"DSOBSDESCIT",value:"SEM PIMENTA",
  item_index:1,CDPRODUTO:source[1].internal,scope_hint:"item",join_proven:true};
 const f=asWatcherV2(fixture(),[paymentNote(value),item]);
 // A real watcher hashes the four-field order identity and exact origin day.
 const order=f.event.order;
 order.DTHRABERMESA=day;
 f.event.order_key=[order.CDFILIAL,order.CDLOJA,order.NRVENDAREST,order.NRCOMANDA].join("|");
 f.decision.order_key=f.event.order_key;
 const core={CDFILIAL:order.CDFILIAL,CDLOJA:order.CDLOJA,
  NRVENDAREST:order.NRVENDAREST,NRCOMANDA:order.NRCOMANDA,
  NRCOMANDAEXT:order.NRCOMANDAEXT,IDORGCMDVENDA:order.IDORGCMDVENDA,
  IDSTCOMANDA:order.IDSTCOMANDA,DTHRABERMESA:order.DTHRABERMESA,
  items:order.items,observation_rows:order.observation_rows};
 const snapshot=crypto.createHash("sha256").update(JSON.stringify(core)).digest("hex");
 f.event.snapshot_hash=f.decision.snapshot_hash=snapshot;
 f.decision.fingerprint=fingerprint(f.decision);
 f.ctx.observation_proofs.forEach(p=>p.snapshot_hash=snapshot);
 f.ctx.delivery.order_observations=[value];
 return f;
}
check("strict approved payment note: original unchanged and ticket view excludes ONLY order note",()=>{
 const f=scenario(),before=JSON.stringify(f);
 const packet=prepareOrderNoteReviewPacketV77(f.event,f.decision);
 assert.equal(packet.status,"REVIEW_REQUIRED",packet.reasons.join(","));
 const result=preparePaymentOnlyOfflineViewV80(f.event,f.decision,f.ctx.delivery,PAYMENT_NOTE_POLICY_V80);
 assert.equal(result.status,"REVIEWED_PAYMENT_OFFLINE_VIEW",result.reason);
 assert.equal(result.original_preserved,true);
 assert.equal(result.print_authorized,false);
 assert.equal(result.operator_authenticated,false);
 assert.deepEqual(result.delivery_for_tickets.order_observations,[]);
 assert.deepEqual(result.delivery_for_tickets.items[1].observacoes,["SEM PIMENTA"]);
 assert.deepEqual(f.ctx.delivery.order_observations,[paymentNote().value]);
 assert.equal(JSON.stringify(f),before);
});
check("without explicit reviewed policy original V6.8 guard remains BLOCKED",()=>{
 const f=scenario(),r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.reasons.includes("WATCHER_V2_ORDER_NOTE_REQUIRES_OPERATIONAL_RELEVANCE_PROOF"));
 assert.equal(r.print_authorized,false);
});
check("approved payment note projects three offline tickets preserving item preparation",()=>{
 const f=scenario(),original=JSON.stringify(f);
 const pair=verifyLiveReaderPairV68(f.event,f.decision);
 assert.equal(pair.status,"PAIRED_SOURCE_VERIFIED",pair.reasons.join(","));
 const r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx,PAYMENT_NOTE_POLICY_V80);
 assert.equal(r.status,"OFFLINE_PREVIEW_PROVEN",r.reasons.join(","));
 assert.ok(r.tickets?.ready_for_semantic_preview);
 assert.deepEqual(r.tickets.conference.boxes[0].items[1].observations,["SEM PIMENTA"]);
 assert.equal(r.print_authorized,false);
 assert.equal(JSON.stringify(f),original);
});
check("payment note cannot hide extra prep or allergy; no ticket generated",()=>{
 for(const note of [
  paymentNote().value+"; SEM CEBOLINHA",
  paymentNote().value+"\nALERGIA A CAMARAO",
  "SEM PIMENTA",
  "PAGO ONLINE (VALOR: 69.48) ID: abc - COD. P/ CANCELAMENTO: 456789",
  "PAGO ONLINE (VALOR: -1.00) ID: 100123 - COD. P/ CANCELAMENTO: 456789"
 ]){
  const f=scenario(note),r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx,PAYMENT_NOTE_POLICY_V80);
  assert.equal(r.status,"BLOCKED",note.slice(0,25));
  assert.equal(r.tickets,null);
  assert.ok(r.reasons.includes("WATCHER_V2_ORDER_NOTE_REQUIRES_OPERATIONAL_RELEVANCE_PROOF"));
 }
});
check("wrong day, extra delivery notes and mismatched content fail closed",()=>{
 const a=scenario();a.event.order.DTHRABERMESA="2026-10-13T12:07:00.0000000";
 assert.equal(preparePaymentOnlyOfflineViewV80(a.event,a.decision,a.ctx.delivery,PAYMENT_NOTE_POLICY_V80).status,"BLOCKED");
 const b=scenario();b.ctx.delivery.order_observations=["NOT_THE_SOURCE_NOTE"];
 assert.equal(preparePaymentOnlyOfflineViewV80(b.event,b.decision,b.ctx.delivery,PAYMENT_NOTE_POLICY_V80).status,"BLOCKED");
 assert.equal(projectVerifiedReaderPairV68(b.event,b.decision,b.ctx,PAYMENT_NOTE_POLICY_V80).status,"BLOCKED");
 const c=scenario();c.ctx.delivery.order_observations.push("EXTRA");
 assert.equal(preparePaymentOnlyOfflineViewV80(c.event,c.decision,c.ctx.delivery,PAYMENT_NOTE_POLICY_V80).status,"BLOCKED");
});
check("snapshot or fingerprint tampering cannot create reviewed ticket view",()=>{
 const a=scenario();a.event.order.observation_rows[0].value="PAGO ONLINE (VALOR: 50.00) ID: 100123 - COD. P/ CANCELAMENTO: 456789";
 assert.equal(preparePaymentOnlyOfflineViewV80(a.event,a.decision,a.ctx.delivery,PAYMENT_NOTE_POLICY_V80).status,"BLOCKED");
 const b=scenario();b.decision.order_observations[0].value="OTHER";
 assert.equal(preparePaymentOnlyOfflineViewV80(b.event,b.decision,b.ctx.delivery,PAYMENT_NOTE_POLICY_V80).status,"BLOCKED");
 const c=scenario();c.decision.fingerprint="0".repeat(64);
 assert.equal(preparePaymentOnlyOfflineViewV80(c.event,c.decision,c.ctx.delivery,PAYMENT_NOTE_POLICY_V80).status,"BLOCKED");
});
check("missing V2 readiness or item proof does not authorize three tickets",()=>{
 const a=scenario();a.decision.ready=false;a.decision.blocking_reasons=["BAG_SIZE_NOT_FACT"];
 a.decision.fingerprint=fingerprint(a.decision);
 const r=projectVerifiedReaderPairV68(a.event,a.decision,a.ctx,PAYMENT_NOTE_POLICY_V80);
 assert.equal(r.status,"BLOCKED");assert.equal(r.tickets,null);assert.equal(r.print_authorized,false);
 const b=scenario();b.ctx.observation_proofs[1].delivery_observations=[];
 const q=projectVerifiedReaderPairV68(b.event,b.decision,b.ctx,PAYMENT_NOTE_POLICY_V80);
 assert.equal(q.status,"BLOCKED");assert.equal(q.tickets,null);
});
console.log(JSON.stringify({status:"PASS",synthetic_only:true,checks,
  print_authorized:false,original_customer_notes_used:false}));

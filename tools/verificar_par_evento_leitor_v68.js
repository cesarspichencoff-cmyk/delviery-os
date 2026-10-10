"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {verifyLiveReaderPairV68,projectVerifiedReaderPairV68,
 prepareOrderNoteReviewPacketV77,inspectOrderNoteDispositionClaimV77}=
 require("../dist/src/production/stableReaderShadowPairV68.js");
const {PACKAGING_SOURCE_BLOB_V63,PACKAGING_SOURCE_SHA256_V78}=
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
check("observation status alone is insufficient when customer notes differ",()=>{
 const f=fixture();f.ctx.observation_proofs[1].delivery_observations=["COM PIMENTA"];
 assert.ok(projectVerifiedReaderPairV68(f.event,f.decision,f.ctx).reasons.some(x=>
 x.startsWith("ITEM_OBSERVATION_PROOF_MISSING_OR_WRONG_REVISION")));
});
check("an unrecorded TXPRODCOMVEN note blocks pair even if order text matches",()=>{
 const f=fixture();f.ctx.production.lines[1].tx_prod_com_ven=["SEM WASABI"];
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

/** V7.6: the installed V2 watcher adds a scan marker and observation_rows
 * to the SAME event.v1 envelope, hashes rows only when nonempty. Synthetic
 * notes only; never use customer text, SQL or a real print path here.
 */
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
const general=()=>({source_field:"DSOBSCOMANDA",
 value:"FICTIONAL_NOTE_PAYMENT_METADATA_NO_RENDER",
 scope_hint:"order",join_proven:true});
const itemNote=(field,value,i=1)=>({source_field:field,value,
 item_index:i,CDPRODUTO:source[i].internal,scope_hint:"item",join_proven:true});
check("V7.6: V2 with a general note has valid pair but cannot project 3 tickets",()=>{
 const f=asWatcherV2(fixture(),[general()]);
 assert.equal(verifyLiveReaderPairV68(f.event,f.decision).status,"PAIRED_SOURCE_VERIFIED");
 // Even if the downstream projection silently omitted the general note.
 assert.deepEqual(f.ctx.delivery.order_observations,[]);
 const r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx);
 assert.equal(r.status,"BLOCKED");assert.equal(r.tickets,null);
 assert.ok(r.reasons.includes("WATCHER_V2_ORDER_NOTE_REQUIRES_OPERATIONAL_RELEVANCE_PROOF"));
 assert.equal(r.print_authorized,false);
});
check("V7.6: tampering note value after event hash blocks pair",()=>{
 const f=asWatcherV2(fixture(),[general()]);
 f.event.order.observation_rows[0].value="ALTERED_FAKE_NOTE";
 const r=verifyLiveReaderPairV68(f.event,f.decision);
 assert.ok(r.reasons.includes("WATCHER_V2_NOTE_SNAPSHOT_HASH_MISMATCH"));
});
check("V7.6: exact hashed item note plus independent proof keeps old good output",()=>{
 const f=asWatcherV2(fixture(),[itemNote("DSOBSDESCIT","SEM PIMENTA")]);
 assert.equal(verifyLiveReaderPairV68(f.event,f.decision).status,"PAIRED_SOURCE_VERIFIED");
 const r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx);
 assert.equal(r.status,"OFFLINE_PREVIEW_PROVEN",r.reasons.join(","));
 assert.deepEqual(r.tickets.conference.boxes[0].items[1].observations,["SEM PIMENTA"]);
 assert.equal(r.print_authorized,false);
});
check("V7.6: item note present in V2 but omitted in joined/proof is blocked",()=>{
 const f=asWatcherV2(fixture(),[itemNote("DSOBSDESCIT","SEM PIMENTA")]);
 f.ctx.observation_proofs[1].delivery_observations=[];
 f.ctx.delivery.items[1].observacoes=[];
 const r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx);
 assert.ok(r.reasons.includes("WATCHER_V2_ITEM_NOTE_NOT_RECONCILED:2"));
 assert.equal(r.tickets,null);
});
check("V7.6: extra note not in V2 event cannot be invented by independent proof",()=>{
 const f=asWatcherV2(fixture(),[]);
 const r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx);
 assert.ok(r.reasons.includes("WATCHER_V2_ITEM_NOTE_NOT_RECONCILED:2"));
});
check("V7.6: unknown note source rejects event even if hash recomputed",()=>{
 const f=asWatcherV2(fixture(),[{source_field:"UNKNOWN_FIELD",
  value:"FICTIONAL",item_index:1,CDPRODUTO:source[1].internal,
  scope_hint:"item",join_proven:true}]);
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "WATCHER_V2_ITEM_NOTE_IDENTITY_INVALID"));
});
check("V7.6: V2 scan missing with note rows blocks instead of treating as old V1",()=>{
 const f=asWatcherV2(fixture(),[general()]);
 delete f.event.order.observation_scan_complete;
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "WATCHER_V2_OBSERVATION_SCAN_INCOMPLETE"));
});
check("V7.6: wrong item index cannot borrow note even with updated hash",()=>{
 const f=asWatcherV2(fixture(),[itemNote("DSOBSDESCIT","SEM PIMENTA",1)]);
 f.event.order.observation_rows[0].item_index=0;
 const r=verifyLiveReaderPairV68(f.event,f.decision);
 assert.ok(r.reasons.includes("WATCHER_V2_ITEM_NOTE_IDENTITY_INVALID"));
});
check("V7.6: TXPRODCOMVEN requires exact production-side note proof",()=>{
 const f=asWatcherV2(fixture(),[itemNote("TXPRODCOMVEN","SEM WASABI")]);
 f.ctx.observation_proofs[1].production_observations=["SEM WASABI"];
 // Delivery note already exists in legacy fixture, but not in V2.
 assert.ok(projectVerifiedReaderPairV68(f.event,f.decision,f.ctx).reasons.includes(
  "WATCHER_V2_ITEM_NOTE_NOT_RECONCILED:2"));
});
check("V7.6: general + item notes never become print approval",()=>{
 const f=asWatcherV2(fixture(),[general(),itemNote("DSOBSDESCIT","SEM PIMENTA")]);
 const r=projectVerifiedReaderPairV68(f.event,f.decision,f.ctx);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.reasons.includes("WATCHER_V2_ORDER_NOTE_REQUIRES_OPERATIONAL_RELEVANCE_PROOF"));
 assert.equal(r.print_authorized,false);
});


const packetFor=(rows=[general()])=>{
 const f=asWatcherV2(fixture(),rows);
 return {f,packet:prepareOrderNoteReviewPacketV77(f.event,f.decision)};
};
const claimFor=(packet,overrides={})=>({
 schema:"deliveryos.order-note-disposition-claim.v1",
 order_key_digest:packet.order_key_digest,
 snapshot_hash:packet.snapshot_hash,
 note_content_sha256:packet.general_note?.content_sha256,
 classification:"NON_PRODUCTION_SENSITIVE_PAYMENT_CANCEL_METADATA",
 action:"EXCLUDE_FROM_PRODUCTION_TICKETS",
 human_review_reference:"human-review:fictional-operative:case-001",
 ...overrides,
});
check("V7.7 valid V2 general note yields blinded exact-revision human review packet",()=>{
 const {packet}=packetFor();
 assert.equal(packet.status,"REVIEW_REQUIRED");
 assert.equal(packet.general_note.source_field,"DSOBSCOMANDA");
 assert.equal(packet.general_note.utf8_bytes,Buffer.byteLength(general().value,"utf8"));
 assert.equal(packet.general_note.content_sha256,
  crypto.createHash("sha256").update(general().value).digest("hex"));
 assert.equal(packet.order_key_digest.length,64);
 assert.equal(packet.safeguards.authorizes_tickets,false);
 assert.ok(!JSON.stringify(packet).includes("FICTIONAL_NOTE"));
});
check("V7.7 no general note means no human exclusion packet",()=>{
 const {packet}=packetFor([]);
 assert.equal(packet.status,"NO_GENERAL_NOTE");
 assert.equal(packet.general_note,null);
 assert.equal(packet.safeguards.prints,false);
});
check("V7.7 legacy V1 cannot borrow V2 authenticated scan",()=>{
 const f=fixture();
 const packet=prepareOrderNoteReviewPacketV77(f.event,f.decision);
 assert.equal(packet.status,"BLOCKED");
 assert.ok(packet.reasons.includes("NOTE_REVIEW_WATCHER_V2_SOURCE_HASH_NOT_VERIFIED"));
});
check("V7.7 changed note bytes after V2 snapshot cannot become reviewer payload",()=>{
 const {f}=packetFor();
 f.event.order.observation_rows[0].value="CHANGED_SECRET_NOTE";
 const packet=prepareOrderNoteReviewPacketV77(f.event,f.decision);
 assert.equal(packet.status,"BLOCKED");
 assert.equal(packet.general_note,null);
 assert.ok(!JSON.stringify(packet).includes("CHANGED_SECRET"));
});
check("V7.7 changed decision fingerprint fails review packet even without print",()=>{
 const {f}=packetFor();
 f.decision.items[0].quantity=44;
 const packet=prepareOrderNoteReviewPacketV77(f.event,f.decision);
 assert.equal(packet.status,"BLOCKED");
 assert.ok(packet.reasons.includes("NOTE_REVIEW_DECISION_FINGERPRINT_CHANGED"));
});
check("V7.7 event-decision revision mismatch fails request",()=>{
 const {f}=packetFor();f.decision.snapshot_hash="b".repeat(64);
 assert.ok(prepareOrderNoteReviewPacketV77(f.event,f.decision).reasons.includes(
  "NOTE_REVIEW_EVENT_DECISION_IDENTITY_MISMATCH"));
});
check("V7.7 matching *claim* never authenticates the human or authorizes tickets",()=>{
 const {packet}=packetFor();
 const status=inspectOrderNoteDispositionClaimV77(packet,claimFor(packet));
 assert.equal(status.status,"MATCHED_REVIEW_CLAIM_NOT_AUTHORIZED");
 assert.equal(status.ticket_authorized,false);
 assert.equal(status.print_authorized,false);
 assert.equal(status.human_identity_authenticated,false);
});
check("V7.7 reuse claim for another order identity blocked",()=>{
 const {packet}=packetFor();
 const status=inspectOrderNoteDispositionClaimV77(packet,claimFor(packet,{
  order_key_digest:"c".repeat(64)}));
 assert.equal(status.status,"BLOCKED");
});
check("V7.7 stale snapshot is blocked even with same review reference",()=>{
 const {packet}=packetFor();
 assert.equal(inspectOrderNoteDispositionClaimV77(packet,
  claimFor(packet,{snapshot_hash:"d".repeat(64)})).status,"BLOCKED");
});
check("V7.7 text digest mismatch from same order blocks",()=>{
 const {packet}=packetFor();
 assert.equal(inspectOrderNoteDispositionClaimV77(packet,
  claimFor(packet,{note_content_sha256:"e".repeat(64)})).status,"BLOCKED");
});
check("V7.7 production meaning unresolved cannot turn into an exclusion",()=>{
 const {packet}=packetFor();
 const status=inspectOrderNoteDispositionClaimV77(packet,claimFor(packet,{
  classification:"REQUIRES_PRODUCTION_RELEVANCE_REVIEW",
  action:"KEEP_BLOCKED"}));
 assert.ok(status.reasons.includes("NOTE_REVIEW_PRODUCTION_MEANING_UNRESOLVED"));
});
check("V7.7 contradictory action and classification blocked",()=>{
 const {packet}=packetFor();
 const status=inspectOrderNoteDispositionClaimV77(packet,claimFor(packet,{action:"KEEP_BLOCKED"}));
 assert.ok(status.reasons.includes("NOTE_REVIEW_ACTION_CLASSIFICATION_CONFLICT"));
});
check("V7.7 review evidence reference must be bounded and cannot hold customer text",()=>{
 const {packet}=packetFor();
 for(const ref of ["","human-review:SECRET CUSTOMER MESSAGE","http://outside.test",
  "human-review:"+"X".repeat(300)]){
  const result=inspectOrderNoteDispositionClaimV77(packet,
   claimFor(packet,{human_review_reference:ref}));
  assert.equal(result.status,"BLOCKED");
  assert.ok(!JSON.stringify(result).includes("SECRET CUSTOMER"));
 }
});
check("V7.7 even structurally valid request with shadow blocked needs review, not tickets",()=>{
 const {f,packet}=packetFor();
 assert.equal(f.event.ready_for_downstream_shadow,true);
 f.event.ready_for_downstream_shadow=false;
 const revised=prepareOrderNoteReviewPacketV77(f.event,f.decision);
 assert.equal(revised.status,"REVIEW_REQUIRED");
 assert.equal(revised.safeguards.authorizes_tickets,false);
 assert.equal(projectVerifiedReaderPairV68(f.event,f.decision,f.ctx).status,"BLOCKED");
 assert.equal(packet.snapshot_hash,revised.snapshot_hash);
});


check("V7.8 exact pinned SHA-256 corresponds to the canonically verified motor source",()=>{
 assert.equal(PACKAGING_SOURCE_BLOB_V63,"3167c309f02a0ad5a84fb43043b8866e3bee873c");
 assert.equal(PACKAGING_SOURCE_SHA256_V78,"1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e");
 assert.equal(verifyLiveReaderPairV68(fixture().event,fixture().decision).status,"PAIRED_SOURCE_VERIFIED");
});
check("V7.8 missing lineage as observed on CAIXA deployed consumer cannot prove pair",()=>{
 const f=fixture();delete f.decision.rule_lineage;
 const r=verifyLiveReaderPairV68(f.event,f.decision);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.reasons.includes("SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
 assert.equal(projectVerifiedReaderPairV68(f.event,f.decision,f.ctx).tickets,null);
});
check("V7.8 old placeholder lineage is not accepted as source proof",()=>{
 const f=fixture();f.decision.rule_lineage={
  academy_rule_refs:["fixture:academy:sha256:exact"],
  delivery_rule_refs:["fixture:routing:sha256:exact"]};
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
 "SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
});
check("V7.8 wrong packaging engine SHA-256 cannot borrow the current motor proof",()=>{
 const f=fixture();f.decision.rule_lineage.academy_rule_refs[0]=
  "tata-academia:installed/packaging-current.js#sha256="+"f".repeat(64);
 const r=verifyLiveReaderPairV68(f.event,f.decision);
 assert.ok(r.reasons.includes("SHADOW_DECISION_PACKAGING_SOURCE_NOT_PINNED_V78"));
});
check("V7.8 deleted academy app-data ref fails closed",()=>{
 const f=fixture();f.decision.rule_lineage.academy_rule_refs.pop();
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
});
check("V7.8 deleted product identity cache lineage fails closed",()=>{
 const f=fixture();f.decision.rule_lineage.delivery_rule_refs.pop();
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
});
check("V7.8 malformed digest and duplicate ref are not proof of origin",()=>{
 const f=fixture();f.decision.rule_lineage.delivery_rule_refs[0]=
   "deliveryos:installed/routing.json#sha256=NOT_A_SHA";
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
 const h=fixture();h.decision.rule_lineage.delivery_rule_refs[0]=
  h.decision.rule_lineage.delivery_rule_refs[1];
 assert.ok(verifyLiveReaderPairV68(h.event,h.decision).reasons.includes(
  "SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
});
check("V7.8 forged source SHA-256 string is not independent filesystem attestation",()=>{
 const f=fixture();
 const r=verifyLiveReaderPairV68(f.event,f.decision);
 assert.equal(r.status,"PAIRED_SOURCE_VERIFIED");
 // Deliberate limitation: structure and a claimed checksum do not prove
 // the live runtime file was read by this pure verifier.
 assert.deepEqual(r.effects,{database_read:false,database_write:false,print:false,
  spooler:false,odhen_write:false});
});


check("V7.9 watcher V2 decision note-bearing fingerprint matches exactly",()=>{
 const f=asWatcherV2(fixture(),[general(),itemNote("DSOBSDESCIT","SEM PIMENTA")]);
 const r=verifyLiveReaderPairV68(f.event,f.decision);
 assert.equal(r.status,"PAIRED_SOURCE_VERIFIED",r.reasons.join(","));
 assert.equal(f.decision.observation_scan_complete,true);
 assert.equal(f.decision.order_observations.length,1);
 assert.equal(f.decision.items[1].observations.length,1);
});
check("V7.9 order note changed in decision but SHA not recomputed is rejected",()=>{
 const f=asWatcherV2(fixture(),[general()]);
 f.decision.order_observations[0].value="OTHER_FICTIONAL_METADATA";
 const r=verifyLiveReaderPairV68(f.event,f.decision);
 assert.ok(r.reasons.includes("SHADOW_DECISION_CONTENT_FINGERPRINT_MISMATCH"));
});
check("V7.9 order note changed with recomputed fingerprint still differs from event",()=>{
 const f=asWatcherV2(fixture(),[general()]);
 f.decision.order_observations[0].value="OTHER_FICTIONAL_METADATA";
 f.decision.fingerprint=fingerprint(f.decision);
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "WATCHER_V2_OBSERVATIONS_NOT_IDENTICAL_IN_DECISION"));
});
check("V7.9 item note dropped and re-fingerprinted is not silently valid",()=>{
 const f=asWatcherV2(fixture(),[itemNote("DSOBSDESCIT","SEM PIMENTA")]);
 f.decision.items[1].observations=[];f.decision.fingerprint=fingerprint(f.decision);
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "WATCHER_V2_OBSERVATIONS_NOT_IDENTICAL_IN_DECISION"));
});
check("V7.9 downgrade V2 decision to legacy without notes is blocked",()=>{
 const f=asWatcherV2(fixture(),[general()]);
 delete f.decision.observation_scan_complete;
 delete f.decision.order_observations;
 for(const item of f.decision.items)delete item.observations;
 f.decision.fingerprint=fingerprint(f.decision);
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "WATCHER_V2_DECISION_OBSERVATION_CONTRACT_INCOMPLETE"));
});
check("V7.9 V1 event with unexpected V2 decision must be rejected",()=>{
 const f=fixture();
 f.decision.observation_scan_complete=true;
 f.decision.order_observations=[];
 f.decision.items=f.decision.items.map(item=>({...item,observations:[]}));
 f.decision.fingerprint=fingerprint(f.decision);
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "LEGACY_WATCHER_V1_DECISION_HAS_UNPROVEN_V2_OBSERVATIONS"));
});
check("V7.9 scan=false in V2 decision invalid despite all notes matching",()=>{
 const f=asWatcherV2(fixture(),[general()]);
 f.decision.observation_scan_complete=false;
 f.decision.fingerprint=fingerprint(f.decision);
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "WATCHER_V2_DECISION_OBSERVATION_CONTRACT_INCOMPLETE"));
});
check("V7.9 human note packet takes V2 fingerprint and never authorizes output",()=>{
 const f=asWatcherV2(fixture(),[general()]);
 const p=prepareOrderNoteReviewPacketV77(f.event,f.decision);
 assert.equal(p.status,"REVIEW_REQUIRED",p.reasons.join(","));
 assert.equal(p.safeguards.authorizes_tickets,false);
 assert.equal(projectVerifiedReaderPairV68(f.event,f.decision,f.ctx).status,"BLOCKED");
});


check("V7.10 V2 requires alias and human override input SHA256, not V1 six-file refs",()=>{
 const f=asWatcherV2(fixture(),[]);
 assert.equal(verifyLiveReaderPairV68(f.event,f.decision).status,"PAIRED_SOURCE_VERIFIED");
 f.decision.rule_lineage.delivery_rule_refs=f.decision.rule_lineage.delivery_rule_refs.slice(0,4);
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
});
check("V7.10 alias SHA cannot be missing or malformed in V2",()=>{
 const f=asWatcherV2(fixture(),[]);
 f.decision.rule_lineage.delivery_rule_refs[4]=
  "deliveryos:installed/product-aliases-v1.json#sha256=UNVERIFIED";
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
});
check("V7.10 human override source SHA must not be replaced by an alias",()=>{
 const f=asWatcherV2(fixture(),[]);
 f.decision.rule_lineage.delivery_rule_refs[5]=
  f.decision.rule_lineage.delivery_rule_refs[4];
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
});
check("V7.10 old watcher V1 six-source contract stays valid",()=>{
 const f=fixture();
 assert.equal(verifyLiveReaderPairV68(f.event,f.decision).status,"PAIRED_SOURCE_VERIFIED");
});
check("V7.10 V2 extra unsolicited ninth source is refused",()=>{
 const f=asWatcherV2(fixture(),[]);
 f.decision.rule_lineage.delivery_rule_refs.push(
  "deliveryos:installed/unknown.json#sha256="+"9".repeat(64));
 assert.ok(verifyLiveReaderPairV68(f.event,f.decision).reasons.includes(
  "SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78"));
});

console.log("STABLE_READER_SHADOW_PAIR_V68="+count+"/"+count+" SHADOW ONLY; NO PHYSICAL EFFECT");

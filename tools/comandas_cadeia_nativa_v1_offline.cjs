"use strict";
/**
 * TATÁ Comandas — native chain V1 (offline, no physical effect).
 *
 *   native watcher event + V2 consumer decision (same revision)
 *     L1 origin/identity/revision   assessNativeReaderV2 (real states 3/P/X, item 4)
 *     L2 watcher/state              legacy daily service-state is DIAGNOSTIC;
 *                                   window comes from the NATIVE order time
 *     L3 items/notes/motor          native same-snapshot join + proven identities
 *                                   + pinned Academy motor (V6.6 ingress, V6.3 bridge)
 *     L4 three views                existing V4.5 tickets + V4.6 render
 *     L5 sequence                   only a persisted, attested binding shows a
 *                                   TATÁ number; otherwise no number and HOLD
 *
 * Reuses existing modules only; it adds the native join and the layer matrix.
 * No SQL, host, spooler, queue, sequence write or print. Outputs are virtual.
 */
const crypto=require("node:crypto"),vm=require("node:vm");
const {assessNativeReaderV2}=require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {windowOf,planWindowReview}=require("./comandas_window_station_select_v1_offline.cjs");
const {projectExpectedRouting}=require("../dist/src/shadow/expectedRouting.js");
const {compileJoinedReaderIngressV66}=require("../dist/src/production/readerIngressV66.js");
const {projectTicketsFromCurrentPackagingV63,PACKAGING_SOURCE_BLOB_V63,PACKAGING_SOURCE_SHA256_V78}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const {renderOperationalTicketsProofV46}=require("../dist/src/production/operationalTicketEscposV46.js");
const N=require("../dist/src/production/nativeReaderChainV1.js");

const SCHEMA="tata.comandas.native-chain.v1.offline";
const EFFECTS=Object.freeze({sql:false,host:false,network:false,spooler:false,
 queue:false,print:false,sequence_write:false,service_change:false,fiscal:false,deploy:false});
const NO_SEQUENCE="SEM_SEQUENCIA_PERSISTIDA";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const gitBlob=b=>crypto.createHash("sha1")
 .update(Buffer.concat([Buffer.from("blob "+b.length+"\0"),b])).digest("hex");

function loadPinnedMotor(source){
 const bytes=Buffer.isBuffer(source)?source:Buffer.from(source||"");
 if(gitBlob(bytes)!==PACKAGING_SOURCE_BLOB_V63||sha(bytes)!==PACKAGING_SOURCE_SHA256_V78)
  return {motor:null,reason:"PINNED_ACADEMY_MOTOR_BYTES_MISMATCH"};
 const ctx=Object.create(null);
 vm.runInNewContext(bytes.toString("utf8"),ctx,{timeout:1500});
 const motor=ctx.TATAPackaging;
 if(typeof motor?.packComanda!=="function"||typeof motor.kitVerdict!=="function")
  return {motor:null,reason:"PINNED_ACADEMY_MOTOR_EXPORTS_ABSENT"};
 return {motor,blob:gitBlob(bytes)};
}
// A binding shows a number ONLY when persisted AND independently attested for
// this exact revision. No attestation protocol exists yet, so today every
// binding is refused; the field exists so the gate is explicit, not implicit.
function sequenceVerdict(binding,event){
 if(!binding)return {number:null,reason:"TATA_SEQUENCE_NOT_BOUND"};
 if(binding.persisted!==true||binding.attested_independently!==true)
  return {number:null,reason:"TATA_SEQUENCE_BINDING_NOT_ATTESTED"};
 if(binding.order_key!==event.order_key||binding.snapshot_sha256!==event.snapshot_hash||
    !/^\d{3}$/.test(String(binding.tata_sequence))||binding.tata_sequence==="000")
  return {number:null,reason:"TATA_SEQUENCE_BINDING_SCOPE_MISMATCH"};
 return {number:binding.tata_sequence,reason:null};
}
function layer(status,reasons,extra={}){
 return {status,reasons:[...new Set(reasons)].sort(),...extra};
}

/**
 * @param {object} i
 *  event, decision         native watcher event + V2 consumer decision
 *  routing, printer_map    committed Retail routing (compact) + printer registry
 *  calibration             production printer calibration registry
 *  motor_source            bytes of the pinned Academy motor
 *  sequence_binding        optional persisted binding claim
 */
function runNativeChainV1(i){
 const L={};
 const out=()=>({schema:SCHEMA,layers:L,
  views:L.L4?.views??[],physical_effect_authorized:false,
  paper_proven:false,first_native_dispatch_proven:false,effects:EFFECTS});
 const e=i?.event,d=i?.decision;
 // L1 ── origin, identity, revision
 const native=assessNativeReaderV2({event:e,decision:d});
 if(native.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY"){
  L.L1=layer("HOLD",native.reasons);return out();
 }
 L.L1=layer("NATIVE_REVISION_CONSISTENT",[],{order_key:e.order_key,
  snapshot_sha256:e.snapshot_hash,header_status:e.order.IDSTCOMANDA,
  independent_source_attested:false});
 // L2 ── watcher state: the daily service-state is not a content source
 const cls=N.classifyConsumerBlockersV1(d.blocking_reasons,e.blockers);
 const [day,clock]=String(e.order.DTHRABERMESA).split("T");
 const hm=(clock||"").slice(0,5),period=windowOf(day,hm);
 L.L2=layer(!period?"HOLD":period==="OUTSIDE_REPORTED_WINDOW"?"OUTSIDE_DOCUMENTED_WINDOW":"NATIVE_ORDER_TIME_WINDOW",
  period?[]:["NATIVE_ORDER_TIME_INVALID"],{window:period,order_local_hm:hm,
   legacy_service_state_ignored_for_content:cls.legacy_service_state});
 // L3 ── items, notes, motor (content)
 const sequence=sequenceVerdict(i.sequence_binding,e);
 const ids=N.nativeIdentitiesV1(d);
 const routes=i.routing?.products||{};
 const join=N.joinNativeReaderSnapshotV1(e,d,routes);
 const contentReasons=[...cls.content,...join.reasons,
  ...ids.held.map(x=>"CLASSIFICATION_NOT_PROVEN_ITEM:"+(x+1))];
 if(contentReasons.length||!period){
  L.L3=layer("HOLD",contentReasons,{join:join.provenance});
  L.L4=layer("HOLD",["CONTENT_NOT_PROVEN"],{views:[]});
  L.L5=layer("HOLD",[sequence.reason||"CONTENT_NOT_PROVEN"],{tata_number:null});
  return out();
 }
 const pinned=loadPinnedMotor(i.motor_source);
 if(!pinned.motor){L.L3=layer("HOLD",[pinned.reason]);return out();}
 // L4 ── destinations by native time + reviewed station rule, then three views
 const projection=projectExpectedRouting({ids:{pedido_interno:e.order.NRCOMANDA},
  items:join.join.items.map(x=>({item_index:x.delivery_item_index,codigo:x.codigo,
   nome:x.nome,quantidade:x.quantidade}))},i.routing,i.printer_map);
 const pairCodes=new Set(["00009","00003","00006","00004"]);
 const roles=projection.items.filter(x=>x.routing_status==="ROUTED").map(x=>{
  const id=ids.identities.find(z=>z.item_index===x.item_index);
  let category=N.stationWindowCategoryV1(id?.classification.station);
  if(category==="INDEPENDENT_IF_UNPAIRED")
   category=x.targets.some(t=>pairCodes.has(t.printer_code))?"UNKNOWN":"INDEPENDENT";
  return {item_index:x.item_index,category,product_code:x.product_code,
   rule_ref:N.STATION_WINDOW_RULE_REF_V1,rule_source:"REVIEWED_CATALOG_RULE_CLAIM"};
 });
 const claim={schema:"tata.comandas.window-evidence-claim.v1",store_id:e.order.CDFILIAL,
  store_unit:e.order.CDLOJA,timestamp_origin:"TEKNISA_ORDER_SOURCE_CLAIM",
  snapshot_sha256:e.snapshot_hash,source_ref:"native-event:"+e.snapshot_hash.slice(0,16),
  order_local_day:day,order_local_hm:hm,item_roles:roles};
 const context={tata_sequence:sequence.number||NO_SEQUENCE,
  teknisa_sequence:e.order.NRCOMANDA,ifood_sequence:e.order.NRCOMANDAEXT,order_time:hm,
  template_version:"production-ticket-v2-shadow",ticket_items:[],
  order_observations:join.join.order_observations.map(v=>({value:v,scope:"ORDER",proof:"NATIVE_SOURCE"}))};
 const review=planWindowReview(projection,claim,context,i.calibration);
 if(!review.plan||!review.plan.ready_for_shadow_payload){
  L.L3=layer("NATIVE_CONTENT_PROVEN",[],{join:join.provenance,motor_blob:pinned.blob});
  L.L4=layer("HOLD",[...(review.reasons||[]),...(review.plan?.blocking_reasons||[])],
   {views:[],window:review.period??period,suppressed:review.suppressed??[]});
  L.L5=layer("HOLD",[sequence.reason||"VIEWS_NOT_PROJECTED"],{tata_number:sequence.number});
  return out();
 }
 const ingress=compileJoinedReaderIngressV66(join.join,review.plan,ids.identities);
 if(ingress.status!=="ALIGNED"){
  L.L3=layer("HOLD",ingress.blockers,{join:join.provenance});return out();
 }
 const projected=projectTicketsFromCurrentPackagingV63(ingress.input,ingress.entries,pinned.motor,pinned.blob);
 L.L3=layer(projected.tickets?"NATIVE_CONTENT_PROVEN":"HOLD",projected.coherence_reasons||[],
  {join:join.provenance,motor_blob:pinned.blob});
 if(!projected.tickets){L.L4=layer("HOLD",["MOTOR_PROJECTION_NOT_READY"],{views:[]});return out();}
 const t=projected.tickets,r=renderOperationalTicketsProofV46(t);
 const views=[...t.production.map((p,k)=>({kind:"PRODUCAO",station:p.station,
   semantic_ready:p.ready_for_semantic_preview,lines:p.boxes.reduce((s,b)=>s+b.items.length,0)+
    p.items_without_proven_box.length,render:r.production[k]})),
  {kind:"CONFERENCIA",station:"CONFERENCIA",semantic_ready:t.conference.ready_for_semantic_preview,
   lines:t.conference.boxes.reduce((s,b)=>s+b.items.length,0),render:r.conference}]
  .map(v=>({kind:v.kind,station:v.station,semantic_ready:v.semantic_ready,lines:v.lines,
   render_blockers:v.render.blocking_reasons,escpos_bytes:v.render.byte_count,
   text_trace_sha256:sha(Buffer.from(v.render.text_trace)),text_trace:v.render.text_trace}));
 L.L4=layer(views.length>=2&&views.every(v=>v.semantic_ready)?"THREE_VIEWS_VIRTUAL":"HOLD",
  views.flatMap(v=>v.semantic_ready?[]:["VIEW_NOT_SEMANTICALLY_READY:"+v.station]),
  {views,window:review.period,suppressed:review.suppressed,selected:review.selected,
   // iFood x Teknisa belongs to the CONFERENCE only; production never waits on it.
   conference_ifood_crosscheck:native.source_review?.conference?.status??"UNKNOWN"});
 L.L5=layer(sequence.number?"BOUND":"HOLD",sequence.number?[]:[sequence.reason],
  {tata_number:sequence.number,physical_bytes_require_number:true});
 return out();
}
module.exports={SCHEMA,EFFECTS,NO_SEQUENCE,runNativeChainV1,loadPinnedMotor};

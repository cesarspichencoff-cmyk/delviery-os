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
 *     L4 three views                existing V4.5 tickets + V4.8 render (Figma
 *                                   V4.4/V4.3 layout over V4.6 semantics)
 *     L5 sequence                   only a LIVE_ATTESTED binding of this order and
 *                                   Itaim day shows a TATÁ number; PREVIEW and
 *                                   lab numbers are reported, never printed
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
// Figma V4.4/V4.3 layout (César 02/11) with V4.6 semantics and vetoes inherited.
const {renderOperationalTicketsFigmaV48}=require("../dist/src/production/operationalTicketEscposFigmaV48.js");
const N=require("../dist/src/production/nativeReaderChainV1.js");
const {inspectStrongKeySequence}=require("./comandas_strong_key_sequence_v2_review_only.cjs");

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
// L5 levels (N.sequenceVerdictV1): only LIVE_ATTESTED for this order and its
// Itaim day puts a number on paper. No LIVE_ATTESTED producer exists yet, so
// today the number never reaches the context; PREVIEW / lab numbers are
// reported as candidate_number for review only.
function sequenceLayer(sequence){
 return {tata_number:sequence.number,sequence_level:sequence.level,
  candidate_number:sequence.candidate_number,sequence_scope:sequence.scope_id,
  sequence_rule_ref:sequence.rule_ref};
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
 *  kit_rules               optional data/comandas_kit_rules_human_v1.json (exact compositions)
 *  sequence_binding        optional level claim {level,persisted,attested_independently,
 *                          order_key,scope_id,tata_sequence,attestation?}
 *  sequence_attesters      trusted attester set (data/tata_sequence_attesters_v1.json)
 *  sequence_ledger_day     the store day ledger read back (V2 state), rechecked here
 *  now_s                   clock for the attestation window
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
 // Store-local clock only: a converted ("Z"/offset) or malformed time has no
 // trustworthy Itaim window or day, so it HOLDs instead of being guessed.
 const local=N.storeLocalTimeV1(e.order.DTHRABERMESA);
 const day=local?.day??null,hm=local?.hm??null,period=local?windowOf(day,hm):null;
 L.L2=layer(!period?"HOLD":period==="OUTSIDE_REPORTED_WINDOW"?"OUTSIDE_DOCUMENTED_WINDOW":"NATIVE_ORDER_TIME_WINDOW",
  period?[]:["NATIVE_ORDER_TIME_NOT_STORE_LOCAL"],{window:period,order_local_hm:hm,
   legacy_service_state_ignored_for_content:cls.legacy_service_state});
 // L3 ── items, notes, motor (content)
 // The day ledger the caller read back is re-inspected with the SAME V2 policy
 // (contiguous, one number per order) before any number can be used.
 const ledgerDay=i.sequence_ledger_day;
 const inspection=ledgerDay?inspectStrongKeySequence({pair:{event:e,decision:d},state:ledgerDay}):null;
 const v2Scope="STORE:"+e.order.CDFILIAL+"/"+e.order.CDLOJA+"|DATE:"+(day??"");
 const sequence=N.sequenceVerdictV1(i.sequence_binding,e,{attesters:i.sequence_attesters,now_s:i.now_s,
  ledger:inspection?{inspection_status:inspection.status,review_binding_number:inspection.review_binding_number??null,
   rows:(Array.isArray(ledgerDay.bindings)?ledgerDay.bindings:[]).filter(b=>b&&b.scope_id===v2Scope)}:null});
 const pinned=loadPinnedMotor(i.motor_source);
 if(!pinned.motor){L.L3=layer("HOLD",[pinned.reason]);return out();}
 // Catalog-equivalence identity (never "human"): only for an item the
 // consumer named CLASSIFICATION_UNKNOWN_<code>, on an exact native match.
 const resolution=N.resolveCatalogEquivalenceV1(e,d,
  i.catalog_equivalence?.records??[],d.blocking_reasons);
 let motorPackaging=null,kitRule=null;const motorReasons=[];
 if(resolution.motor_rerun_required){
  // The consumer never ran the motor for this revision: run the SAME pinned
  // bytes here; its own verdict replaces the explained packaging blockers.
  const entries=d.items.map(x=>{
   const r=resolution.resolved.find(z=>z.item_index===x.item_index);
   return {product:{nome:x.product_name,classification:r?r.classification:x.classification},
    quantity:x.quantity};});
  const pack=pinned.motor.packComanda(entries),kits=pinned.motor.kitVerdict(entries);
  motorPackaging={groups:pack.groups};
  if(pack.has_unknown)motorReasons.push("MOTOR_PACKAGING_UNKNOWN");
  if(pack.bags?.size_status!=="FACT"||pack.bags?.exact_bag_count_status!=="FACT")
   motorReasons.push("MOTOR_BAG_NOT_FACT");
  if(kits?.status!=="FACT"){
   // César's exact kit decisions fill ONLY a composition the motor leaves unjudged.
   kitRule=N.resolveHumanKitRuleV1(d,resolution,i.kit_rules?.rules??[],kits);
   if(kitRule.reason)motorReasons.push(kitRule.reason);
   if(!kitRule.rule)motorReasons.push("MOTOR_KITS_NOT_FACT:"+String(kits?.why||"").slice(0,160));
  }
 }
 const ids=N.nativeIdentitiesV1(d,resolution,motorPackaging);
 const explained=new Set(resolution.explained_blockers);
 const routes=i.routing?.products||{};
 const join=N.joinNativeReaderSnapshotV1(e,d,routes);
 const catalog={resolved:resolution.resolved.map(x=>x.record_id),
  motor_rerun:resolution.motor_rerun_required,refused:resolution.refused};
 const kitRuleRef=kitRule?.rule?{id:kitRule.rule.id,evidence:kitRule.rule.evidence,
  source_ref:kitRule.rule.source_ref,kits:kitRule.rule.kits}:null;
 const contentReasons=[...cls.content.filter(b=>!explained.has(b)),...resolution.refused,
  ...motorReasons,...join.reasons,...ids.held.map(x=>"CLASSIFICATION_NOT_PROVEN_ITEM:"+(x+1))];
 if(contentReasons.length||!period){
  // Content may be fine while the window is not: say so instead of a bare HOLD.
  L.L3=layer("HOLD",[...contentReasons,...(period?[]:["L2_WINDOW_NOT_ESTABLISHED"])],
   {join:join.provenance,catalog_resolution:catalog,kit_rule:kitRuleRef});
  L.L4=layer("HOLD",["CONTENT_NOT_PROVEN"],{views:[]});
  L.L5=layer("HOLD",[sequence.reason||"CONTENT_NOT_PROVEN"],{...sequenceLayer(sequence),tata_number:null});
  return out();
 }
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
 // Item notes ride with their item; a general note keeps relevance UNKNOWN
 // (it may carry payment text) and the plan holds it, as V7.6/V7.7 require.
 const context={tata_sequence:sequence.number||NO_SEQUENCE,
  teknisa_sequence:e.order.NRCOMANDA,ifood_sequence:e.order.NRCOMANDAEXT,order_time:hm,
  template_version:"production-ticket-v2-shadow",ticket_items:N.nativeTicketItemsV1(join.join),
  order_observations:join.join.order_observations.map(v=>({value:v,
   source_ref:"native-event:"+e.snapshot_hash.slice(0,16)+":DSOBSCOMANDA",relevance:"UNKNOWN",proof:"REAL_OBSERVED"}))};
 const review=planWindowReview(projection,claim,context,i.calibration);
 if(!review.plan||!review.plan.ready_for_shadow_payload){
  L.L3=layer("NATIVE_CONTENT_PROVEN",[],{join:join.provenance,motor_blob:pinned.blob,catalog_resolution:catalog,kit_rule:kitRuleRef});
  L.L4=layer("HOLD",[...(review.reasons||[]),...(review.plan?.blocking_reasons||[])],
   {views:[],window:review.period??period,suppressed:review.suppressed??[]});
  L.L5=layer("HOLD",[sequence.reason||"VIEWS_NOT_PROJECTED"],sequenceLayer(sequence));
  return out();
 }
 const ingress=compileJoinedReaderIngressV66(join.join,review.plan,ids.identities);
 if(ingress.status!=="ALIGNED"){
  L.L3=layer("HOLD",ingress.blockers,{join:join.provenance,kit_rule:kitRuleRef});return out();
 }
 // Same pinned motor; only the approved composition's kit verdict is filled.
 const bridgeMotor=kitRule?.rule?N.withHumanKitRuleV1(pinned.motor,kitRule):pinned.motor;
 const projected=projectTicketsFromCurrentPackagingV63(ingress.input,ingress.entries,bridgeMotor,pinned.blob);
 L.L3=layer(projected.tickets?"NATIVE_CONTENT_PROVEN":"HOLD",projected.coherence_reasons||[],
  {join:join.provenance,motor_blob:pinned.blob,catalog_resolution:catalog,kit_rule:kitRuleRef});
 if(!projected.tickets){L.L4=layer("HOLD",["MOTOR_PROJECTION_NOT_READY"],{views:[]});return out();}
 const t=projected.tickets,r=renderOperationalTicketsFigmaV48(t);
 const views=[...t.production.map((p,k)=>({kind:"PRODUCAO",station:p.station,
   semantic_ready:p.ready_for_semantic_preview,lines:p.boxes.reduce((s,b)=>s+b.items.length,0)+
    p.items_without_proven_box.length,render:r.production[k]})),
  {kind:"CONFERENCIA",station:"CONFERENCIA",semantic_ready:t.conference.ready_for_semantic_preview,
   lines:t.conference.boxes.reduce((s,b)=>s+b.items.length,0),render:r.conference}]
  .map(v=>({kind:v.kind,station:v.station,semantic_ready:v.semantic_ready,lines:v.lines,
   render_blockers:v.render.blocking_reasons,escpos_bytes:v.render.byte_count,
   // The exact bytes (virtual: nothing is sent) so layout can be measured
   // from what a printer would receive, not from the text trace.
   escpos:[...v.render.bytes],escpos_sha256:sha(Buffer.from(v.render.bytes)),
   text_trace_sha256:sha(Buffer.from(v.render.text_trace)),text_trace:v.render.text_trace}));
 L.L4=layer(views.length>=2&&views.every(v=>v.semantic_ready)?"THREE_VIEWS_VIRTUAL":"HOLD",
  views.flatMap(v=>v.semantic_ready?[]:["VIEW_NOT_SEMANTICALLY_READY:"+v.station]),
  {views,window:review.period,suppressed:review.suppressed,selected:review.selected,
   // iFood x Teknisa belongs to the CONFERENCE only; production never waits on it.
   conference_ifood_crosscheck:native.source_review?.conference?.status??"UNKNOWN"});
 L.L5=layer(sequence.number?"BOUND":"HOLD",sequence.number?[]:[sequence.reason],
  {...sequenceLayer(sequence),physical_bytes_require_number:true});
 return out();
}
module.exports={SCHEMA,EFFECTS,NO_SEQUENCE,runNativeChainV1,loadPinnedMotor};

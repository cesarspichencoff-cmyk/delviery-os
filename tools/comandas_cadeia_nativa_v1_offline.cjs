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
const {isDeepStrictEqual}=require("node:util");
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
 * A claim is a narrowly scoped USER-REVIEW ASSERTION, not an authenticated
 * signature or permission for any physical effect. Only one DSOBSCOMANDA
 * of the exact already-verified native revision can be omitted from virtual
 * tickets. The original event, decision and join remain unchanged.
 */
function shadowNoteDispositionV1(event,decision,joined,claim,sourceFiles){
 const hold=reason=>({status:"HOLD",reasons:[reason],ticket_join:joined});
 if(claim==null)return {status:"NOT_PROVIDED",reasons:[],ticket_join:joined};
 const hex=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
 if(!claim||typeof claim!=="object"||Array.isArray(claim)||
  claim.schema!=="tata.comandas.note-disposition-claim.v1"||
  claim.scope!=="SHADOW_VIEW_ONLY"||
  claim.action!=="EXCLUDE_FROM_PRODUCTION_TICKETS"||
  claim.classification!=="NON_PRODUCTION_SENSITIVE_PAYMENT_CANCEL_METADATA"||
  claim.source_field!=="DSOBSCOMANDA"||
  !/^human-review:[A-Za-z0-9._:/-]{12,150}$/.test(claim.human_review_reference||""))
  return hold("NOTE_DISPOSITION_SCOPE_OR_HUMAN_REVIEW_REF_INVALID");
 const fields=["order_key_digest","snapshot_hash","decision_fingerprint",
  "note_content_sha256","event_file_sha256","decision_file_sha256"];
 if(fields.some(f=>!hex(claim[f]))||
  claim.order_key_digest!==sha(Buffer.from(event.order_key,"utf8"))||
  claim.snapshot_hash!==String(event.snapshot_hash).toLowerCase()||
  claim.snapshot_hash!==String(decision.snapshot_hash).toLowerCase()||
  claim.decision_fingerprint!==String(decision.fingerprint).toLowerCase())
  return hold("NOTE_DISPOSITION_NOT_BOUND_TO_NATIVE_REVISION");
 // The two file digests in the human claim MUST name actual supplied raw JSON
 // bytes of this exact pair. They are not proof of independent file provenance;
 // however, without bytes they were merely 64-hex decorative fields and a
 // forged value could suppress a general note even in the virtual view.
 const exactFiles=sourceFiles&&typeof sourceFiles==="object"&&
  !Array.isArray(sourceFiles)&&
  Object.keys(sourceFiles).sort().join("|")==="decision_json|event_json";
 if(!exactFiles||typeof sourceFiles.event_json!=="string"||
    typeof sourceFiles.decision_json!=="string"||
    !sourceFiles.event_json.length||!sourceFiles.decision_json.length||
    Buffer.byteLength(sourceFiles.event_json,"utf8")>2_000_000||
    Buffer.byteLength(sourceFiles.decision_json,"utf8")>2_000_000)
  return hold("NOTE_SOURCE_FILE_BYTES_REQUIRED_FOR_SHADOW");
 if(claim.event_file_sha256!==sha(Buffer.from(sourceFiles.event_json,"utf8"))||
    claim.decision_file_sha256!==sha(Buffer.from(sourceFiles.decision_json,"utf8")))
  return hold("NOTE_SOURCE_FILE_SHA256_MISMATCH");
 let parsedEvent,parsedDecision;
 try{
  parsedEvent=JSON.parse(sourceFiles.event_json);
  parsedDecision=JSON.parse(sourceFiles.decision_json);
 }catch{return hold("NOTE_SOURCE_FILE_JSON_INVALID");}
 if(!isDeepStrictEqual(parsedEvent,event)||
    !isDeepStrictEqual(parsedDecision,decision))
  return hold("NOTE_SOURCE_FILES_NOT_SAME_NATIVE_PAIR");
 const notes=event.order.observation_rows.filter(x=>x?.scope_hint==="order");
 const dnotes=decision.order_observations;
 const jnotes=joined.order_observations;
 if(notes.length!==1||notes[0].source_field!=="DSOBSCOMANDA"||
  notes[0].join_proven!==true||typeof notes[0].value!=="string"||
  !notes[0].value.trim()||
  !Array.isArray(dnotes)||dnotes.length!==1||
  dnotes[0].source_field!=="DSOBSCOMANDA"||
  dnotes[0].value!==notes[0].value||
  !Array.isArray(jnotes)||jnotes.length!==1||jnotes[0]!==notes[0].value||
  claim.note_content_sha256!==sha(Buffer.from(notes[0].value,"utf8")))
  return hold("NOTE_DISPOSITION_NOT_BOUND_TO_EXACT_GENERAL_NOTE");
 return {status:"EXCLUDED_FOR_SHADOW_ONLY",reasons:[],
  ticket_join:{...joined,order_observations:[]},
  original_preserved:true,physical_note_authorized:false};
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
 const noteReview=join.join?shadowNoteDispositionV1(e,d,join.join,
  i.note_disposition_claim,i.note_source_file_pair):null;
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
 // A mismatched user-review claim never strips the note or unlocks a view.
 // No claim means the original order-level note still follows the HOLD path.
 if(noteReview?.status==="HOLD"){
  L.L3=layer("NATIVE_CONTENT_PROVEN",[],{join:join.provenance,motor_blob:pinned.blob});
  L.L4=layer("HOLD",noteReview.reasons,{views:[],note_disposition:"HOLD"});
  L.L5=layer("HOLD",[sequence.reason||"VIEWS_NOT_PROJECTED"],sequenceLayer(sequence));
  return out();
 }
 const ticketJoin=noteReview?.ticket_join??join.join;
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
  template_version:"production-ticket-v2-shadow",ticket_items:N.nativeTicketItemsV1(ticketJoin),
  order_observations:ticketJoin.order_observations.map(v=>({value:v,
   source_ref:"native-event:"+e.snapshot_hash.slice(0,16)+":DSOBSCOMANDA",relevance:"UNKNOWN",proof:"REAL_OBSERVED"}))};
 const review=planWindowReview(projection,claim,context,i.calibration);
 // An installed V1 SERVICE_REQUIRED_SUSHI blocker meant that its obsolete
 // shift-state could not pick one of two configured stations. The native
 // order clock can replace that choice only for a virtual review AND only
 // when the exact source product, both configured endpoints and selected
 // single destination are all rechecked. Unknown/mismatched claims HOLD.
 const legacyPairs=cls.paired_destination.filter(x=>x.blocker.startsWith("SERVICE_REQUIRED_SUSHI"));
 const legacyPairReasons=[];
 const expectedPairCodes={SUSHI_1:["00009","00003"],SUSHI_2:["00006","00004"]};
 for(const req of legacyPairs){
  const pair=expectedPairCodes[req.pair];
  const configured=routes[req.canonical_code];
  const matching=projection.items.filter(x=>x.product_code===req.canonical_code);
  if(!pair||!matching.length){
   legacyPairReasons.push("LEGACY_SERVICE_PAIR_PRODUCT_NOT_IN_NATIVE_REVISION");continue;
  }
  if(!Array.isArray(configured)||pair.some(code=>!configured.includes(code))||
     new Set(configured).size!==configured.length){
   legacyPairReasons.push("LEGACY_SERVICE_PAIR_DESTINATIONS_NOT_PROVEN");continue;
  }
  const wanted=period==="LUNCH_CANDIDATE"?pair[0]:
   period==="DINNER_CANDIDATE"?pair[1]:null;
  const opposite=wanted===pair[0]?pair[1]:pair[0];
  if(!wanted){
   legacyPairReasons.push("LEGACY_SERVICE_PAIR_WINDOW_NOT_PROVEN");continue;
  }
  for(const item of matching){
   const selected=(review.selected||[]).filter(x=>x.item_index===item.item_index);
   if(!selected.some(x=>x.printer_code===wanted)||
      selected.some(x=>x.printer_code===opposite)){
    legacyPairReasons.push("LEGACY_SERVICE_PAIR_EXACT_STATION_NOT_PROVEN");break;
   }
  }
 }
 if(!review.plan||!review.plan.ready_for_shadow_payload||legacyPairReasons.length){
  L.L3=layer("NATIVE_CONTENT_PROVEN",[],{join:join.provenance,motor_blob:pinned.blob,catalog_resolution:catalog,kit_rule:kitRuleRef});
  L.L4=layer("HOLD",[...(review.reasons||[]),...(review.plan?.blocking_reasons||[]),
    ...new Set(legacyPairReasons)],
   {views:[],window:review.period??period,suppressed:review.suppressed??[]});
  L.L5=layer("HOLD",[sequence.reason||"VIEWS_NOT_PROJECTED"],sequenceLayer(sequence));
  return out();
 }
 const ingress=compileJoinedReaderIngressV66(ticketJoin,review.plan,ids.identities);
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
 // A valid result has >=1 actual production station plus exactly one
 // CONFERENCIA view. Do not imply that every order always produces 3 views.
 const productionViewCount=views.filter(v=>v.kind==="PRODUCAO").length;
 const conferenceViewCount=views.filter(v=>v.kind==="CONFERENCIA").length;
 const stationNames=views.map(v=>v.station);
 const stationSet=new Set(stationNames);
 const virtualViewsReady=productionViewCount>=1&&conferenceViewCount===1&&
  stationSet.size===views.length&&views.every(v=>v.semantic_ready);
 const viewReasons=views.flatMap(v=>v.semantic_ready?[]:
  ["VIEW_NOT_SEMANTICALLY_READY:"+v.station]);
 if(productionViewCount<1)viewReasons.push("PRODUCTION_VIEW_MISSING");
 if(conferenceViewCount!==1)viewReasons.push("CONFERENCE_VIEW_COUNT_INVALID");
 if(stationSet.size!==views.length)viewReasons.push("DUPLICATE_VIEW_STATION");
 L.L4=layer(virtualViewsReady?"VIRTUAL_VIEWS_READY":"HOLD",viewReasons,
  {views,view_count:views.length,production_view_count:productionViewCount,
   conference_view_count:conferenceViewCount,stations:stationNames,
   window:review.period,suppressed:review.suppressed,selected:review.selected,
   note_disposition:noteReview?.status??"NOT_PROVIDED",
   // iFood x Teknisa belongs to the CONFERENCE only; production never waits on it.
   conference_ifood_crosscheck:native.source_review?.conference?.status??"UNKNOWN"});
 L.L5=layer(sequence.number?"BOUND":"HOLD",sequence.number?[]:[sequence.reason],
  {...sequenceLayer(sequence),physical_bytes_require_number:true});
 return out();
}
module.exports={SCHEMA,EFFECTS,NO_SEQUENCE,runNativeChainV1,loadPinnedMotor};

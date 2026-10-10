import {createHash} from "node:crypto";
import type {DeliveryJoinProjection,ProductionJoinProjection} from "./deliveryProductionJoin";
import type {ProductionPrintPlan} from "./productionPrintPlan";
import type {ProvenReaderProductV66} from "./readerIngressV66";
import {projectJoinedReaderTicketsV66} from "./readerIngressV66";
import {PACKAGING_SOURCE_SHA256_V78, type MotorInterfaceV63} from "./currentPackagingBridgeV63";
import type {OperationalTicketsResultV45} from "./operationalTicketsV45";

/** V6.8 observes the ACTUAL watcher/consumer v1 contracts.
 * It does not fetch live events, poll, write decisions, invoke printers,
 * allocate a TATÁ sequence or add any Windows service hook.
 */
type RawEventItem={NRPRODCOMVEN:string;CDPRODUTO:string;
 CDARVPROD:string|null;QTPRODCOMVEN:string;IDSTPRCOMVEN:string};
type WatcherNoteRowV76={source_field:string;value:string;scope_hint:string;
 join_proven:boolean;item_index?:number;CDPRODUTO?:string};
export interface StableReaderEventV68 {
 schema:string;order_key:string;snapshot_hash:string;
 ready_for_downstream_shadow:boolean;blockers:string[];
 order:{CDFILIAL:string;CDLOJA:string;NRCOMANDA:string;
  NRCOMANDAEXT:string|null;IDORGCMDVENDA:string;items:RawEventItem[];
  NRVENDAREST?:string;IDSTCOMANDA?:string;DTHRABERMESA?:string;
  observation_scan_complete?:boolean;observation_rows?:WatcherNoteRowV76[]};
 service_resolution:{service:string|null;evidence:string;source_ref:string|null;blockers:string[]};
}
type ShadowItem={
 item_index:number;CDPRODUTO:string;canonical_code:string;product_name:string;
 quantity:number;routing_status:string;
 targets:Array<{printer_code:string;printer_name:string}>;
 classification:{family:string;station:string|null;review_required:boolean};
 classification_source:string;
};
export interface LiveShadowDecisionV68 {
 schema:string;ready:boolean;blocking_reasons:string[];
 order_key:string;snapshot_hash:string;
 ifood_sequence:string;teknisa_sequence:string;fingerprint:string;
 service:StableReaderEventV68["service_resolution"];
 items:ShadowItem[];
 packaging:{has_unknown:boolean;total_items:number}|null;
 kits:{status:string}|null;
 sequence:{shadow_candidate:string;binding_written:false}|null;
 rule_lineage:{academy_rule_refs:string[];delivery_rule_refs:string[]};
}
export interface ReaderObservationProofV68 {
 item_index:number;
 canonical_code:string;
 snapshot_hash:string;
 status:"OBSERVED_EXACT_ITEM_OBSERVATIONS"|"PROVEN_NONE_FOR_THIS_ITEM";
 source_ref:string;
 /** Independent captured notes from delivery and production source surfaces. */
 delivery_observations:string[];
 production_observations:string[];
}
type ReadinessV68={
 status:"PAIRED_SOURCE_VERIFIED"|"BLOCKED";
 reasons:string[];
 items:Array<{item_index:number;internal_product_id:string;canonical_code:string;
  name:string;quantity:number;routes:string[];classification:ShadowItem["classification"]}>;
 effects:{database_read:false;database_write:false;print:false;spooler:false;odhen_write:false};
};
const EFFECTS={database_read:false,database_write:false,print:false,spooler:false,odhen_write:false} as const;
const clean=(v:unknown)=>String(v??"").trim();
const norm=(v:unknown)=>clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");
const hex64=(s:unknown)=>/^[0-9a-f]{64}$/i.test(clean(s));
const decimalQuantity=(s:unknown):number|null=>{
 if(typeof s!=="string"||!/^\d+(?:\.0+)?$/.test(s))return null;
 const n=Number(s);
 return Number.isSafeInteger(n)&&n>0?n:null;
};
function canon(code:unknown):string|null {
 const compact=clean(code).toUpperCase().replace(/\./g,"");
 if(!/^[A-Z0-9]{10}$/.test(compact))return null;
 return [compact.slice(0,1),compact.slice(1,3),compact.slice(3,5),
  compact.slice(5,8),compact.slice(8,10)].join(".");
}
const sameStrings=(a:string[],b:string[])=>
 a.length===b.length&&JSON.stringify([...a].sort())===JSON.stringify([...b].sort());

/**
 * V7.6 — same V2 hashBasis as the INSTALLED watcher. The envelope still says
 * event.v1, so detection must use the marker & rows, not the schema name.
 * Source truth: CAIXA_MOOCA read-only inspection, 10/10. Never print notes.
 * Self-hash checks integrity but DOES NOT authenticate SQL or classify notes.
 */
function inspectV2WatcherNotesV76(event:StableReaderEventV68):
 {detected:boolean;reasons:string[];rows:WatcherNoteRowV76[]} {
 const order=event?.order;
 const hasMarker=order?.observation_scan_complete!==undefined||
   order?.observation_rows!==undefined;
 if(!hasMarker)return {detected:false,reasons:[],rows:[]};
 const reasons=new Set<string>(),rows=order?.observation_rows;
 const block=(why:string)=>{reasons.add(why);
  return {detected:true,reasons:[...reasons],rows:[] as WatcherNoteRowV76[]};};
 if(order.observation_scan_complete!==true||!Array.isArray(rows))
   return block("WATCHER_V2_OBSERVATION_SCAN_INCOMPLETE");
 const header=["CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA",
   "NRCOMANDAEXT","IDORGCMDVENDA","IDSTCOMANDA","DTHRABERMESA"] as const;
 const itemFields=["NRPRODCOMVEN","CDPRODUTO","CDARVPROD",
   "QTPRODCOMVEN","IDSTPRCOMVEN"] as const;
 if(header.some(k=>!Object.prototype.hasOwnProperty.call(order,k))||
   !Array.isArray(order.items)||order.items.some(item=>!item||
    itemFields.some(k=>!Object.prototype.hasOwnProperty.call(item,k))))
   return block("WATCHER_V2_SNAPSHOT_STRUCTURE_INCOMPLETE");
 const cleanItems=order.items.map(item=>({
  NRPRODCOMVEN:item.NRPRODCOMVEN,CDPRODUTO:item.CDPRODUTO,
  CDARVPROD:item.CDARVPROD,QTPRODCOMVEN:item.QTPRODCOMVEN,
  IDSTPRCOMVEN:item.IDSTPRCOMVEN,
 }));
 const snapshot:Record<string,unknown>={
  CDFILIAL:order.CDFILIAL,CDLOJA:order.CDLOJA,NRVENDAREST:order.NRVENDAREST,
  NRCOMANDA:order.NRCOMANDA,NRCOMANDAEXT:order.NRCOMANDAEXT,
  IDORGCMDVENDA:order.IDORGCMDVENDA,IDSTCOMANDA:order.IDSTCOMANDA,
  DTHRABERMESA:order.DTHRABERMESA,items:cleanItems,
 };
 const mapped:WatcherNoteRowV76[]=[],seen=new Set<string>();
 let orderNotes=0;
 for(const row of rows){
  if(!row||typeof row.value!=="string"||!row.value.trim()||
   row.value!==row.value.trim()||row.join_proven!==true)
   return block("WATCHER_V2_NOTE_ROW_INVALID");
  if(row.scope_hint==="order"){
   if(row.source_field!=="DSOBSCOMANDA"||++orderNotes>1)
     return block("WATCHER_V2_ORDER_NOTE_SOURCE_INVALID");
   mapped.push({source_field:row.source_field,value:row.value,
    scope_hint:"order",join_proven:true});
  }else if(row.scope_hint==="item"){
   if(!["DSOBSDESCIT","DSOBSPEDDIGCMD","TXPRODCOMVEN"].includes(row.source_field)||
      !Number.isSafeInteger(row.item_index)||row.item_index===undefined||
      row.item_index<0||row.item_index>=cleanItems.length||
      row.CDPRODUTO!==cleanItems[row.item_index].CDPRODUTO)
     return block("WATCHER_V2_ITEM_NOTE_IDENTITY_INVALID");
   const key=row.item_index+":"+row.source_field;
   if(seen.has(key))return block("WATCHER_V2_ITEM_NOTE_DUPLICATE_SOURCE");
   seen.add(key);
   mapped.push({source_field:row.source_field,value:row.value,
    item_index:row.item_index,CDPRODUTO:row.CDPRODUTO,
    scope_hint:"item",join_proven:true});
  }else return block("WATCHER_V2_NOTE_SCOPE_UNKNOWN");
 }
 if(mapped.length)snapshot.observation_rows=mapped;
 const hash=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
 if(!hex64(event.snapshot_hash)||hash!==event.snapshot_hash.toLowerCase())
  return block("WATCHER_V2_NOTE_SNAPSHOT_HASH_MISMATCH");
 return {detected:true,reasons:[],rows:mapped};
}


/**
 * V7.7: Prepare a scoped human review WITHOUT exporting a customer's
 * DSOBSCOMANDA text or granting print/semantic-readiness privileges.
 * This is the missing proof workflow, not a text classifier.
 */
export interface OrderNoteReviewPacketV77 {
 schema:"deliveryos.order-note-review-packet.v1";
 status:"REVIEW_REQUIRED"|"NO_GENERAL_NOTE"|"BLOCKED";
 reasons:string[];
 order_key_digest:string|null;
 snapshot_hash:string|null;
 general_note:{
  source_field:"DSOBSCOMANDA";
  content_sha256:string;
  utf8_bytes:number;
  human_classification_required:true;
 }|null;
 safeguards:{
  human_identity_authenticated:false;
  classifies_note_automatically:false;
  verifies_sql_currentness:false;
  authorizes_tickets:false;
  writes_state:false;
  prints:false;
 };
}
const NOTE_REVIEW_GUARD_V77={
 human_identity_authenticated:false,classifies_note_automatically:false,
 verifies_sql_currentness:false,authorizes_tickets:false,
 writes_state:false,prints:false,
} as const;

export function prepareOrderNoteReviewPacketV77(
 event:StableReaderEventV68,decision:LiveShadowDecisionV68,
):OrderNoteReviewPacketV77 {
 const errors=new Set<string>();
 const blocked=():OrderNoteReviewPacketV77=>({
  schema:"deliveryos.order-note-review-packet.v1",
  status:"BLOCKED",reasons:[...errors].sort(),
  order_key_digest:null,snapshot_hash:null,general_note:null,
  safeguards:NOTE_REVIEW_GUARD_V77,
 });
 if(!event||!decision||event.schema!=="deliveryos.tata-reader-stable-order-event.v1"||
   decision.schema!=="deliveryos.live-shadow-decision.v1"||
   !clean(event.order_key)||event.order_key!==decision.order_key||
   !hex64(event.snapshot_hash)||event.snapshot_hash!==decision.snapshot_hash)
   errors.add("NOTE_REVIEW_EVENT_DECISION_IDENTITY_MISMATCH");
 const note=event?inspectV2WatcherNotesV76(event):null;
 if(!note?.detected||note.reasons.length)
   errors.add("NOTE_REVIEW_WATCHER_V2_SOURCE_HASH_NOT_VERIFIED");
 if(!hex64(decision?.fingerprint))errors.add("NOTE_REVIEW_DECISION_FINGERPRINT_INVALID");
 else {
   const core={order_key:decision.order_key,snapshot_hash:decision.snapshot_hash,
     ifood_sequence:decision.ifood_sequence,teknisa_sequence:decision.teknisa_sequence,
     service:decision.service,items:decision.items,packaging:decision.packaging,
     kits:decision.kits,sequence:decision.sequence};
   const digest=createHash("sha256").update(JSON.stringify(core)).digest("hex");
   if(digest!==decision.fingerprint)errors.add("NOTE_REVIEW_DECISION_FINGERPRINT_CHANGED");
 }
 if(errors.size)return blocked();
 const general=note!.rows.filter(r=>r.scope_hint==="order");
 const idHash=createHash("sha256").update(event.order_key).digest("hex");
 const summary:OrderNoteReviewPacketV77={
  schema:"deliveryos.order-note-review-packet.v1",
  status:general.length?"REVIEW_REQUIRED":"NO_GENERAL_NOTE",
  reasons:[],order_key_digest:idHash,snapshot_hash:event.snapshot_hash,
  general_note:null,safeguards:NOTE_REVIEW_GUARD_V77,
 };
 if(general.length===1){
  const raw=general[0].value;
  summary.general_note={
   source_field:"DSOBSCOMANDA",
   content_sha256:createHash("sha256").update(raw,"utf8").digest("hex"),
   utf8_bytes:Buffer.byteLength(raw,"utf8"),
   human_classification_required:true,
  };
 }
 return summary;
}

export interface OrderNoteDispositionClaimV77 {
 schema:"deliveryos.order-note-disposition-claim.v1";
 order_key_digest:string;
 snapshot_hash:string;
 note_content_sha256:string;
 classification:"NON_PRODUCTION_SENSITIVE_PAYMENT_CANCEL_METADATA"|
  "REQUIRES_PRODUCTION_RELEVANCE_REVIEW";
 action:"EXCLUDE_FROM_PRODUCTION_TICKETS"|"KEEP_BLOCKED";
 human_review_reference:string;
}
export function inspectOrderNoteDispositionClaimV77(
 packet:OrderNoteReviewPacketV77,claim:OrderNoteDispositionClaimV77|undefined,
):{status:"MATCHED_REVIEW_CLAIM_NOT_AUTHORIZED"|"BLOCKED";
  reasons:string[];ticket_authorized:false;print_authorized:false;
  human_identity_authenticated:false} {
 const reasons=new Set<string>();
 const block=()=>({status:"BLOCKED" as const,reasons:[...reasons].sort(),
  ticket_authorized:false as const,print_authorized:false as const,
  human_identity_authenticated:false as const});
 if(packet?.status!=="REVIEW_REQUIRED"||!packet.general_note||
   packet.reasons.length||!claim){
   reasons.add("NOTE_REVIEW_PACKET_OR_CLAIM_MISSING");return block();
 }
 if(claim.schema!=="deliveryos.order-note-disposition-claim.v1"||
   !hex64(claim.order_key_digest)||claim.order_key_digest!==packet.order_key_digest||
   !hex64(claim.snapshot_hash)||claim.snapshot_hash!==packet.snapshot_hash||
   !hex64(claim.note_content_sha256)||
   claim.note_content_sha256!==packet.general_note.content_sha256)
   reasons.add("NOTE_REVIEW_CLAIM_NOT_BOUND_TO_EXACT_ORDER_SNAPSHOT_AND_TEXT");
 if(!/^(?:human-review|human-evidence):[A-Za-z0-9._:/-]{8,160}$/.test(
   String(claim.human_review_reference??"")))
   reasons.add("NOTE_REVIEW_HUMAN_EVIDENCE_REFERENCE_INVALID");
 if(claim.classification==="NON_PRODUCTION_SENSITIVE_PAYMENT_CANCEL_METADATA"){
   if(claim.action!=="EXCLUDE_FROM_PRODUCTION_TICKETS")
     reasons.add("NOTE_REVIEW_ACTION_CLASSIFICATION_CONFLICT");
 }else if(claim.classification==="REQUIRES_PRODUCTION_RELEVANCE_REVIEW"){
   reasons.add("NOTE_REVIEW_PRODUCTION_MEANING_UNRESOLVED");
 }else reasons.add("NOTE_REVIEW_CLASSIFICATION_UNSUPPORTED");
 if(reasons.size)return block();
 // A self-declared record is never human authentication or permission.
 return {status:"MATCHED_REVIEW_CLAIM_NOT_AUTHORIZED",reasons:[],
  ticket_authorized:false,print_authorized:false,
  human_identity_authenticated:false};
}

/** Verifies that the decision describes exactly the stable event.
 * Crucially SOURCE_VERIFIED is NOT permission to make or print tickets.
 */
export function verifyLiveReaderPairV68(
 event:StableReaderEventV68,decision:LiveShadowDecisionV68,
):ReadinessV68 {
 const reasons=new Set<string>();
 const fail=()=>({status:"BLOCKED" as const,reasons:[...reasons].sort(),
  items:[] as ReadinessV68["items"],effects:EFFECTS});
 if(!event||!decision||event.schema!=="deliveryos.tata-reader-stable-order-event.v1"||
    decision.schema!=="deliveryos.live-shadow-decision.v1"){
    reasons.add("READER_EVENT_OR_DECISION_SCHEMA_MISMATCH");return fail();
 }
 if(!event.order||!Array.isArray(event.order.items)||!Array.isArray(decision.items)||
    !Array.isArray(event.blockers)||!Array.isArray(decision.blocking_reasons)||
    !event.service_resolution||!decision.service){
    reasons.add("READER_EVENT_OR_DECISION_STRUCTURE_MALFORMED");return fail();
 }
 const v2Notes=inspectV2WatcherNotesV76(event);
 for(const reason of v2Notes.reasons)reasons.add(reason);
 if(!clean(event.order_key)||!hex64(event.snapshot_hash)||
    event.order_key!==decision.order_key||event.snapshot_hash!==decision.snapshot_hash)
    reasons.add("SHADOW_DECISION_EVENT_REVISION_MISMATCH");
 if(event.order.CDFILIAL!=="0001"||event.order.CDLOJA!=="01"||
    !clean(event.order.NRCOMANDA)||!clean(event.order.NRCOMANDAEXT)||
    !/^DLV_/.test(event.order.IDORGCMDVENDA))
    reasons.add("SHADOW_EVENT_STORE_OR_ORIGIN_NOT_PROVEN");
 if(event.order.NRCOMANDA!==decision.teknisa_sequence||
    event.order.NRCOMANDAEXT!==decision.ifood_sequence)
    reasons.add("SHADOW_DECISION_ORDER_IDENTIFIERS_MISMATCH");
 if(!event.ready_for_downstream_shadow||event.blockers.length||
    !decision.ready||decision.blocking_reasons.length)
    reasons.add("EVENT_OR_DECISION_NOT_READY_FOR_SHADOW");
 if(event.service_resolution.service!==decision.service.service||
    event.service_resolution.evidence!==decision.service.evidence||
    event.service_resolution.source_ref!==decision.service.source_ref||
    event.service_resolution.blockers.length||
    !["LUNCH","DINNER"].includes(clean(event.service_resolution.service))||
    !["HUMAN_CONFIRMED_RULE","REAL_OBSERVED"].includes(clean(event.service_resolution.evidence))||
    !clean(event.service_resolution.source_ref))
    reasons.add("EVENT_DECISION_SERVICE_PROOF_MISMATCH");
 // V7.8: a nonempty lineage list is NOT evidence that the installed
 // consumer used the exact packaging engine. The CAIXA installed consumer
 // currently omits lineage altogether; require all six origin-bearing hashes
 // and the SHA-256 of the V6.3 pinned source before a 3-ticket preview.
 const academy=decision.rule_lineage?.academy_rule_refs;
 const delivery=decision.rule_lineage?.delivery_rule_refs;
 const requiredAcademy=[
   "tata-academia:installed/packaging-current.js",
   "tata-academia:installed/app-data.json",
 ];
 const requiredDelivery=[
   "deliveryos:installed/routing.json",
   "deliveryos:installed/printer-map.json",
   "deliveryos:installed/non-production.json",
   "deliveryos:installed/product-identity-cache-v1.json",
 ];
 const valid=(refs:string[]|undefined,names:string[])=>
   Array.isArray(refs)&&refs.length===names.length&&
   names.every(prefix=>refs.some(ref=>typeof ref==="string"&&
      ref.startsWith(prefix+"#sha256=")&&
      /^[a-f0-9]{64}$/.test(ref.slice((prefix+"#sha256=").length))))&&
   new Set(refs).size===refs.length;
 if(!valid(academy,requiredAcademy)||!valid(delivery,requiredDelivery))
   reasons.add("SHADOW_DECISION_LINEAGE_MISSING_OR_MALFORMED_V78");
 else if(!academy!.includes(
   requiredAcademy[0]+"#sha256="+PACKAGING_SOURCE_SHA256_V78))
   reasons.add("SHADOW_DECISION_PACKAGING_SOURCE_NOT_PINNED_V78");
 if(!decision.packaging||decision.packaging.has_unknown||
    !decision.kits||decision.kits.status!=="FACT")
    reasons.add("SHADOW_PACKAGING_OR_KITS_NOT_PROVEN");
 if(!decision.sequence||decision.sequence.binding_written!==false||
    !/^\d{3}$/.test(clean(decision.sequence.shadow_candidate)))
    reasons.add("SHADOW_SEQUENCE_NOT_READ_ONLY");
 if(!hex64(decision.fingerprint))reasons.add("SHADOW_DECISION_FINGERPRINT_INVALID");
 else {
   const core={order_key:decision.order_key,snapshot_hash:decision.snapshot_hash,
     ifood_sequence:decision.ifood_sequence,teknisa_sequence:decision.teknisa_sequence,
     service:decision.service,items:decision.items,packaging:decision.packaging,
     kits:decision.kits,sequence:decision.sequence};
   const sha=createHash("sha256").update(JSON.stringify(core)).digest("hex");
   if(sha!==decision.fingerprint)reasons.add("SHADOW_DECISION_CONTENT_FINGERPRINT_MISMATCH");
 }
 if(!event.order.items.length||event.order.items.length!==decision.items.length)
    reasons.add("STABLE_EVENT_DECISION_ITEM_COUNT_MISMATCH");
 const out:ReadinessV68["items"]=[],ids=new Set<string>(),positions=new Set<number>();
 for(const [i,raw] of event.order.items.entries()){
   const d=decision.items[i];
   if(!d||!raw){reasons.add("EVENT_ITEM_NOT_PAIRED:"+i);continue;}
   const n=decimalQuantity(raw.QTPRODCOMVEN),code=canon(raw.CDARVPROD);
   if(!clean(raw.NRPRODCOMVEN)||ids.has(raw.NRPRODCOMVEN)||
      !Number.isSafeInteger(d.item_index)||positions.has(d.item_index)||
      d.item_index!==i+1)
     reasons.add("READER_ITEM_INDEX_OR_ID_AMBIGUOUS:"+i);
   ids.add(raw.NRPRODCOMVEN);positions.add(d.item_index);
   if(n===null||code===null||raw.CDPRODUTO!==d.CDPRODUTO||
      code!==d.canonical_code||n!==d.quantity||!clean(d.product_name))
     reasons.add("READER_EVENT_DECISION_PRODUCT_IDENTITY_OR_QUANTITY_MISMATCH:"+i);
   if(d.classification?.review_required!==false||
      !clean(d.classification?.family)||!clean(d.classification_source)||
      !Array.isArray(d.targets))
     reasons.add("READER_DECISION_CLASSIFICATION_NOT_PROVEN:"+i);
   if(!["ROUTED","NO_OWN_PRODUCTION_TICKET"].includes(d.routing_status)||
      (d.routing_status==="ROUTED"&&!d.targets.length)||
      d.targets.some(t=>!/^\d{5}$/.test(clean(t.printer_code))||
        !clean(t.printer_name))||
      new Set(d.targets.map(t=>t.printer_code)).size!==d.targets.length)
     reasons.add("READER_DECISION_ROUTE_NOT_VERIFIED:"+i);
   out.push({item_index:d.item_index,internal_product_id:raw.CDPRODUTO,
    canonical_code:d.canonical_code,name:d.product_name,quantity:d.quantity,
    routes:d.targets.map(t=>t.printer_code),classification:d.classification});
 }
 if(decision.packaging?.total_items!==out.reduce((s,i)=>s+i.quantity,0))
   reasons.add("READER_DECISION_PACKING_QUANTITY_MISMATCH");
 if(reasons.size)return fail();
 return {status:"PAIRED_SOURCE_VERIFIED",reasons:[],items:out,effects:EFFECTS};
}

export interface ReaderPairContextV68 {
 delivery:DeliveryJoinProjection;
 production:ProductionJoinProjection;
 production_plan:ProductionPrintPlan;
 identities:ProvenReaderProductV66[];
 observation_proofs:ReaderObservationProofV68[];
 motor:MotorInterfaceV63;
 motor_blob_sha:string;
}
export function projectVerifiedReaderPairV68(
 event:StableReaderEventV68,decision:LiveShadowDecisionV68,context:ReaderPairContextV68,
):{status:"OFFLINE_PREVIEW_PROVEN"|"BLOCKED";reasons:string[];
  tickets:OperationalTicketsResultV45|null;print_authorized:false} {
 const pair=verifyLiveReaderPairV68(event,decision),errors=new Set(pair.reasons);
 const v2Notes=inspectV2WatcherNotesV76(event);
 // An order-level note cannot be dropped to make a clean-looking ticket.
 // No general observation gains item/station relevance from its text alone.
 if(v2Notes.detected&&v2Notes.rows.some(r=>r.scope_hint==="order"))
   errors.add("WATCHER_V2_ORDER_NOTE_REQUIRES_OPERATIONAL_RELEVANCE_PROOF");
 const block=()=>({status:"BLOCKED" as const,reasons:[...errors].sort(),
   tickets:null,print_authorized:false as const});
 if(pair.status!=="PAIRED_SOURCE_VERIFIED")return block();
 if(context.delivery.pedido_interno!==decision.teknisa_sequence||
    context.delivery.pedido_externo!==decision.ifood_sequence||
    context.production.pedido_interno_from_dlv!==decision.teknisa_sequence)
   errors.add("JOINED_INPUT_ORDER_NOT_SAME_SHADOW_EVENT");
 if(context.delivery.items.length!==pair.items.length||
    context.identities.length!==pair.items.length||
    context.observation_proofs.length!==pair.items.length)
   errors.add("JOINED_INPUT_OR_PROOF_COVERAGE_MISMATCH");
 const matched=new Set<number>();
 for(const observed of pair.items){
   const found=context.delivery.items.filter(d=>canon(d.codigo)===observed.canonical_code&&
     norm(d.nome)===norm(observed.name)&&d.quantidade===observed.quantity);
   if(found.length!==1||matched.has(found[0].item_index)){
     errors.add("JOINED_ITEM_NOT_UNIQUELY_BONDED_TO_EVENT:"+observed.item_index);
     continue;
   }
   const selected=found[0];matched.add(selected.item_index);
   const identity=context.identities.find(i=>i.item_index===selected.item_index);
   if(!identity||canon(identity.product_code)!==observed.canonical_code||
      norm(identity.product_name)!==norm(observed.name)||
      norm(identity.classification.family)!==norm(observed.classification.family)||
      norm(identity.classification.station)!==norm(observed.classification.station))
     errors.add("CURRENT_IDENTITY_NOT_BOUND_TO_SHADOW_ITEM:"+selected.item_index);
   const proof=context.observation_proofs.find(p=>p.item_index===selected.item_index);
   // The installed V2 snapshot includes exact SQL note values. Independent
   // item proof must account for EVERY V2 note, and may not invent extras.
   // DSOBS* comes from delivery/item; TXPRODCOMVEN from production.
   if(v2Notes.detected&&v2Notes.reasons.length===0){
     const own=v2Notes.rows.filter(row=>row.scope_hint==="item"&&
      row.item_index===observed.item_index-1);
     const expectedDelivery=own.filter(row=>row.source_field!=="TXPRODCOMVEN")
       .map(row=>row.value),expectedProduction=own
       .filter(row=>row.source_field==="TXPRODCOMVEN").map(row=>row.value);
     const exactly=(a:string[],b:string[])=>
       JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
     if(!proof||!exactly(expectedDelivery,proof.delivery_observations??[])||
       !exactly(expectedProduction,proof.production_observations??[])||
       (own.length>0&&proof.status!=="OBSERVED_EXACT_ITEM_OBSERVATIONS")||
       (own.length===0&&proof.status!=="PROVEN_NONE_FOR_THIS_ITEM"))
       errors.add("WATCHER_V2_ITEM_NOTE_NOT_RECONCILED:"+observed.item_index);
   }
   const correspondingProduction=context.production.lines.filter(p=>
     norm(p.nome)===norm(observed.name)&&p.quantidade===observed.quantity);
   const productionNotes:string[]=[];
   for(const p of correspondingProduction)for(const note of p.tx_prod_com_ven??[]){
     if(!productionNotes.some(x=>norm(x)===norm(note)))productionNotes.push(note);
   }
   const noteSignature=(values:string[])=>JSON.stringify(values.map(norm));
   if(!proof||proof.snapshot_hash!==event.snapshot_hash||
      proof.canonical_code!==observed.canonical_code||!clean(proof.source_ref)||
      !["OBSERVED_EXACT_ITEM_OBSERVATIONS","PROVEN_NONE_FOR_THIS_ITEM"].includes(proof.status)||
      !Array.isArray(proof.delivery_observations)||
      !Array.isArray(proof.production_observations)||
      (proof.status==="PROVEN_NONE_FOR_THIS_ITEM"&&
        (selected.observacoes.length>0||productionNotes.length>0))||
      (proof.delivery_observations&&
        noteSignature(proof.delivery_observations)!==noteSignature(selected.observacoes))||
      (proof.production_observations&&
        noteSignature(proof.production_observations)!==noteSignature(productionNotes)))
     errors.add("ITEM_OBSERVATION_PROOF_MISSING_OR_WRONG_REVISION:"+selected.item_index);
   const routes=correspondingProduction.map(p=>clean(p.printer_key)).filter(Boolean);
   if(!sameStrings([...new Set(routes)],observed.routes))
     errors.add("PRODUCTION_ROUTE_NOT_SAME_SHADOW_DECISION:"+selected.item_index);
 }
 if(errors.size)return block();
 const projected=projectJoinedReaderTicketsV66(
    context.delivery,context.production,context.production_plan,context.identities,
    context.motor,context.motor_blob_sha);
 if(!projected.tickets||!projected.tickets.ready_for_semantic_preview){
   for(const reason of projected.reasons)errors.add(reason);
   if(!errors.size)errors.add("THREE_WAY_OFFLINE_PROJECTION_NOT_READY");
   return block();
 }
 return {status:"OFFLINE_PREVIEW_PROVEN",reasons:[],tickets:projected.tickets,
  print_authorized:false};
}

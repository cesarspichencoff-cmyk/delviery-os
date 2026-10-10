import {createHash} from "node:crypto";
import type {DeliveryJoinProjection,ProductionJoinProjection} from "./deliveryProductionJoin";
import type {ProductionPrintPlan} from "./productionPrintPlan";
import type {ProvenReaderProductV66} from "./readerIngressV66";
import {projectJoinedReaderTicketsV66} from "./readerIngressV66";
import type {MotorInterfaceV63} from "./currentPackagingBridgeV63";
import type {OperationalTicketsResultV45} from "./operationalTicketsV45";

/** V6.8 observes the ACTUAL watcher/consumer v1 contracts.
 * It does not fetch live events, poll, write decisions, invoke printers,
 * allocate a TATÁ sequence or add any Windows service hook.
 */
type RawEventItem={NRPRODCOMVEN:string;CDPRODUTO:string;
 CDARVPROD:string|null;QTPRODCOMVEN:string;IDSTPRCOMVEN:string};
export interface StableReaderEventV68 {
 schema:string;order_key:string;snapshot_hash:string;
 ready_for_downstream_shadow:boolean;blockers:string[];
 order:{CDFILIAL:string;CDLOJA:string;NRCOMANDA:string;
  NRCOMANDAEXT:string|null;IDORGCMDVENDA:string;items:RawEventItem[]};
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
 if(!decision.rule_lineage||
    !Array.isArray(decision.rule_lineage.academy_rule_refs)||
    !Array.isArray(decision.rule_lineage.delivery_rule_refs)||
    !decision.rule_lineage.academy_rule_refs.length||
    !decision.rule_lineage.delivery_rule_refs.length||
    [...decision.rule_lineage.academy_rule_refs,
     ...decision.rule_lineage.delivery_rule_refs].some(s=>!clean(s)))
    reasons.add("SHADOW_DECISION_LINEAGE_ABSENT");
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
   if(!proof||proof.snapshot_hash!==event.snapshot_hash||
      proof.canonical_code!==observed.canonical_code||!clean(proof.source_ref)||
      !["OBSERVED_EXACT_ITEM_OBSERVATIONS","PROVEN_NONE_FOR_THIS_ITEM"].includes(proof.status)||
      (proof.status==="PROVEN_NONE_FOR_THIS_ITEM"&&selected.observacoes.length>0))
     errors.add("ITEM_OBSERVATION_PROOF_MISSING_OR_WRONG_REVISION:"+selected.item_index);
   const routes=context.production.lines.filter(p=>norm(p.nome)===norm(observed.name)&&
      p.quantidade===observed.quantity).map(p=>clean(p.printer_key)).filter(Boolean);
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

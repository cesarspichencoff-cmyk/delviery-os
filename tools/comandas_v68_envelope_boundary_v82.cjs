'use strict';
/**
 * V8.2 fail-closed source-boundary inspector.
 * A TATÁ Reporting V1 envelope is only event+shadow-decision lineage.
 * In particular source_event.order is an intentionally lossy projection:
 * observations are NOT included there. It is not proof of independent
 * delivery, production, production-plan, identity or item-note sources.
 *
 * The inspector is PURE: no file I/O, no mutation, no client text output,
 * no print permission, no inferred SQL source or historical V2 promotion.
 */
const SOURCE_SCHEMA='tata.delivery-report-source-envelope.v1';
const V68_SCHEMA='deliveryos.reconciled-reader-pair-proof.v68.offline';
const NEED=['delivery','production','production_plan',
  'current_product_identities','item_observation_proofs'];
const EFFECTS=Object.freeze({printer:false,spooler_write:false,
  service_write:false,database_write:false,sequence_write:false});
function hold(code){
 return {schema:'deliveryos.v68-reader-envelope-boundary.v82',
  status:'HOLD',reason:code,reader_source_only:true,
  independent_production_verified:false,independent_delivery_verified:false,
  independent_plan_verified:false,independent_identity_verified:false,
  independent_item_notes_verified:false,complete_v68_proof:false,
  source_raw_notes_retained_for_v68:false,
  source_text_exposed:false,print_authorized:false,effects:EFFECTS};
}
function inspect(envelope){
 try{
  if(envelope?.schema!==SOURCE_SCHEMA)return hold('NOT_A_NATIVE_READER_SOURCE_ENVELOPE');
  const event=envelope.source_event,decision=envelope.shadow_decision,id=envelope.identity;
  if(!event||!decision||!id||event.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
    decision.schema!=='deliveryos.live-shadow-decision.v1'||
    typeof id.order_key!=='string'||!id.order_key||
    typeof id.snapshot_hash!=='string'||!/^[a-f0-9]{64}$/i.test(id.snapshot_hash)||
    event.order_key!==id.order_key||decision.order_key!==id.order_key||
    event.snapshot_hash!==id.snapshot_hash||decision.snapshot_hash!==id.snapshot_hash)
   return hold('READER_ENVELOPE_IDENTITY_OR_REVISION_INVALID');
  const columns=Object.keys(envelope),included=NEED.filter(k=>columns.includes(k));
  // Even extra fields attached by a caller are not separate provider evidence.
  if(included.length) return hold('ENVELOPE_ADDED_FIELDS_ARE_NOT_INDEPENDENT_SOURCES');
  const sourceNoteRows=event.order?.observation_rows;
  if(sourceNoteRows!==undefined) return hold('READER_SOURCE_PROJECTION_CONTRACT_CHANGED_REAUDIT');
  const shadowHasNotes=Array.isArray(decision.order_observations)||
    decision.items?.some(x=>Array.isArray(x.observations))===true;
  const rawOrderNotes=(decision.order_observations||[]).some(x=>typeof x?.value==="string"&&x.value.trim());
  const rawItemNotes=(decision.items||[]).some(x=>(x.observations||[]).some(y=>typeof y?.value==="string"&&y.value.trim()));
  const rawNoteValues=rawOrderNotes||rawItemNotes;
  // Metadata privacy claims do NOT inspect note content and cannot prove
  // absence of customer-sensitive values. Preserve source; require review.
  const privacyClaimRequiresAudit=rawNoteValues&&
    (envelope.privacy?.customer_pii_persisted===false||
     envelope.privacy?.raw_customer_payload_persisted===false);
  return {schema:'deliveryos.v68-reader-envelope-boundary.v82',
   status:'READER_ENVELOPE_VALID_ONLY_V68_HOLD',
   reason:'NATIVE_ENVELOPE_NOT_FIVE_INDEPENDENT_V68_SOURCES',
   reader_source_only:true,
   excluded_from_source_event_observation_rows:true,
   shadow_decision_carries_note_surfaces:Boolean(shadowHasNotes),
   shadow_decision_contains_raw_note_values:rawNoteValues,
   privacy_assertions_require_content_review:privacyClaimRequiresAudit,
   missing_independent_sources:[...NEED],
   independent_production_verified:false,independent_delivery_verified:false,
   independent_plan_verified:false,independent_identity_verified:false,
   independent_item_notes_verified:false,complete_v68_proof:false,
   source_raw_notes_retained_for_v68:false,
   source_text_exposed:false,print_authorized:false,effects:EFFECTS};
 }catch{return hold('SOURCE_INSPECTION_INVALID')}
}
module.exports={inspect,NEED,V68_SCHEMA};

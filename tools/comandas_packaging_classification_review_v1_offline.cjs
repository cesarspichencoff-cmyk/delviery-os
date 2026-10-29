"use strict";
/**
 * Historical, bounded source-data review queue. It NEVER guesses category,
 * packaging, station, kit, authorization or new product identity.
 * The counts are occurrences of a reason across non-unique revisions.
 * Do not infer rates of orders, timestamps for current production or
 * catalog coverage from this archival snapshot.
 */
const SCHEMA="tata.comandas.classification-crosswalk-review.v1.offline";
const EFFECTS=Object.freeze({print:false,sql:false,network:false,
 source_edit:false,catalog_write:false,sequence_write:false,
 service_change:false,spooler_write:false,deploy:false});
const SHAPE=(x,keys)=>x&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const CODE=/^[A-Z0-9]\.[A-Z0-9]{2}\.[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{2}$/;
const FILE="docs/comandas/AUDITORIA_SHADOW_ACADEMIA_20261026_REVIEW_ONLY.md";
function hold(reason){return {schema:SCHEMA,status:"HOLD",
 reason,queue:[],total_reason_occurrences:null,classification_fact:false,
 packaging_fact:false,ready_for_operations:false,reader_current_attested:false,
 academia_candidate_promoted:false,effects:EFFECTS};}
function prioritizeClassificationGaps(input){
 if(!SHAPE(input,["schema","source","observed_on","sample","meaning",
   "evidence_status","entries"])||
 input.schema!=="tata.comandas.classification-gap-snapshot.v1"||
 input.source!==FILE||input.observed_on!=="2026-10-26"||
 input.meaning!=="BLOCK_REASON_OCCURRENCES_NOT_UNIQUE_ORDERS"||
 input.evidence_status!=="HISTORIC_AGGREGATE_NOT_CURRENT_CATALOG_PROOF"||
 !SHAPE(input.sample,["decision_revisions","selection",
  "decisions_with_classification_unknown","unit"])||
 input.sample.decision_revisions!==200||
 input.sample.decisions_with_classification_unknown!==68||
 input.sample.selection!=="MOST_RECENT_200_NOT_RANDOM_NOT_UNIQUE"||
 input.sample.unit!=="ITAIM"||
 !Array.isArray(input.entries)||input.entries.length!==14)
 return hold("SNAPSHOT_SOURCE_OR_SCOPE_UNVERIFIED");
 const seen=new Set();
 let total=0;
 for(const e of input.entries){
  if(!SHAPE(e,["canonical_code","reason_occurrences"])||
   typeof e.canonical_code!=="string"||!CODE.test(e.canonical_code)||
   !Number.isSafeInteger(e.reason_occurrences)||
   e.reason_occurrences<1||e.reason_occurrences>200||
   seen.has(e.canonical_code))return hold("CODE_FREQUENCY_OR_DUPLICATE_INVALID");
  seen.add(e.canonical_code);total+=e.reason_occurrences;
 }
 // Archival source contains precisely 82 reason occurrences among 14 codes.
 // This is NOT 82 distinct decisions or orders (68 decisions had >=1 reason).
 if(total!==82)return hold("ARCHIVED_AGGREGATE_TOTAL_DRIFT");
 const queue=input.entries.map(x=>({
  canonical_code:x.canonical_code,
  reason_occurrences:x.reason_occurrences,
  state:"CROSSWALK_AND_CLASSIFICATION_NEED_INDEPENDENT_REVIEW",
  required_evidence:["EXACT_CDP"
   +"RODUTO_TO_CANONICAL_CODE","APPROVED_CURRENT_FAMILY_AND_STATION",
   "REVIEW_REQUIRED_FALSE_EXPLICIT","PINNED_MOTOR_COMPATIBILITY"]
 })).sort((a,b)=>b.reason_occurrences-a.reason_occurrences||
 a.canonical_code.localeCompare(b.canonical_code));
 return {schema:SCHEMA,status:"HISTORICAL_PRIORITY_QUEUE_NOT_CLASSIFICATION",
  reason:"PRIORITIZE_EXACT_CODE_REVIEW_NO_AUTOMATIC_PRODUCT_MAPPING",
  queue,total_reason_occurrences:82,classification_fact:false,
  packaging_fact:false,ready_for_operations:false,
  reader_current_attested:false,academia_candidate_promoted:false,
  effects:EFFECTS};
}
module.exports={SCHEMA,EFFECTS,prioritizeClassificationGaps};

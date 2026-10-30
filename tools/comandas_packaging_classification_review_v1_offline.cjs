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
/**
 * Future internal-catalog comparison: exact code/ID checks only.
 * This accepts a caller-supplied, potentially self-declared catalog capture.
 * No capture can, by itself, authorize identity, classification or printing.
 * Do not output product names, internal CDPRODUTO or customer data.
 */
const CATALOG_SCHEMA="tata.comandas.itaim-catalog-identity-capture.v1.review-only";
const CATALOG_REVIEW_SCHEMA="tata.comandas.catalog-identity-candidates.v1.review-only";
const VALID_ID=/^[0-9]{1,20}$/;
const dateOnly=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x+"T00:00:00Z"))&&
 new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
const cleanText=x=>typeof x==="string"&&x.length>0&&x.length<=160&&
 x.trim()===x&&!/[\x00-\x1f\x7f]/.test(x);
function catalogHold(reason){
 return {schema:CATALOG_REVIEW_SCHEMA,status:"HOLD",reason,queue:[],
  found_exact_candidates:null,missing_codes:null,ambiguous_codes:null,
  independent_capture_attested:false,current_catalog_freshness_proven:false,
  classification_approved:false,packaging_approved:false,
  ready_for_operations:false,print_authorized:false,effects:EFFECTS};
}
function compareCandidateCatalogCapture(snapshot,capture){
 const baseline=prioritizeClassificationGaps(snapshot);
 if(baseline.status!=="HISTORICAL_PRIORITY_QUEUE_NOT_CLASSIFICATION")
  return catalogHold("HISTORICAL_CLASSIFICATION_SNAPSHOT_NOT_VERIFIED");
 if(!SHAPE(capture,["schema","source_kind","source_ref","store_id",
     "store_unit","captured_local_date","entries"])||
   capture.schema!==CATALOG_SCHEMA||
   capture.source_kind!=="LOCAL_READ_ONLY_CAPTURE_CLAIM"||
   !cleanText(capture.source_ref)||capture.store_id!=="0001"||
   capture.store_unit!=="01"||!dateOnly(capture.captured_local_date)||
   !Array.isArray(capture.entries)||capture.entries.length>1000)
  return catalogHold("CATALOG_CAPTURE_SCOPE_OR_METADATA_INVALID");
 const byCode=new Map(),byId=new Map();
 for(const entry of capture.entries){
  if(!SHAPE(entry,["CDPRODUTO","canonical_code","product_name","active"])||
    !VALID_ID.test(entry.CDPRODUTO)||!CODE.test(entry.canonical_code)||
    !cleanText(entry.product_name)||typeof entry.active!=="boolean")
   return catalogHold("CATALOG_CAPTURE_ROW_INVALID");
  const codeList=byCode.get(entry.canonical_code)||[];
  codeList.push(entry);byCode.set(entry.canonical_code,codeList);
  const codes=byId.get(entry.CDPRODUTO)||new Set();
  codes.add(entry.canonical_code);byId.set(entry.CDPRODUTO,codes);
 }
 let found=0,missing=0,ambiguous=0;
 const queue=baseline.queue.map(entry=>{
  const matches=byCode.get(entry.canonical_code)||[];
  let status;
  if(!matches.length){status="CODE_ABSENT_IN_SUPPLIED_CAPTURE";missing++;}
  else if(matches.length!==1||
          matches.some(row=>byId.get(row.CDPRODUTO).size!==1)){
   status="AMBIGUOUS_CODE_OR_NATIVE_PRODUCT_ID";ambiguous++;
  }else if(matches[0].active!==true){
   status="INACTIVE_IN_SUPPLIED_CAPTURE";
  }else{status="EXACT_IDENTITY_CANDIDATE_ONLY";found++;}
  return {canonical_code:entry.canonical_code,
   historical_reason_occurrences:entry.reason_occurrences,
   status,classification_status:"UNKNOWN_NOT_HOMOLOGATED",
   station_status:"UNKNOWN_NOT_ATTESTED",
   packaging_status:"UNKNOWN_NOT_EVALUATED"};
 });
 return {schema:CATALOG_REVIEW_SCHEMA,
  status:"CATALOG_COMPARISON_REVIEW_ONLY",
  reason:"SUPPLIED_CAPTURE_IS_NOT_INDEPENDENT_ATTESTATION_OR_APPROVAL",
  queue,found_exact_candidates:found,missing_codes:missing,
  ambiguous_codes:ambiguous,independent_capture_attested:false,
  current_catalog_freshness_proven:false,classification_approved:false,
  packaging_approved:false,ready_for_operations:false,
  print_authorized:false,effects:EFFECTS};
}
module.exports={SCHEMA,EFFECTS,prioritizeClassificationGaps,
 CATALOG_SCHEMA,CATALOG_REVIEW_SCHEMA,compareCandidateCatalogCapture};

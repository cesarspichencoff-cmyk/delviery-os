"use strict";
/**
 * Review-only source segregation for the three TATÁ Comandas views.
 *
 * BOTH production views depend exclusively on one native Teknisa/Reader V2
 * revision. The official iFood vs Teknisa presence cross-check belongs ONLY
 * to the conference view. No cross-check (or its failure) may change a
 * production-source verdict. This is not a release/printing authorization.
 *
 * Pure calculation: no filesystem, database, network, printer or queue APIs.
 */
const SCHEMA="tata.comandas.view-source-scope.v1.review-only";
const EFFECTS=Object.freeze({
 print:false,reprint:false,spooler:false,sql_read:false,sql_write:false,
 api:false,network:false,sequence_allocate:false,sequence_write:false,
 fiscal:false,service:false,install:false,deploy:false
});
const SHA=/^[a-f0-9]{64}$/i;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const ids=["PRODUCTION_1","PRODUCTION_2","CONFERENCE"];
function validDay(s){
 if(typeof s!=="string"||!datePattern.test(s))return false;
 const d=new Date(s+"T00:00:00Z");
 return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===s;
}
function validText(s){
 return typeof s==="string"&&s.length>0&&s.length<=128&&
   s===s.trim()&&!/[\x00-\x1f\x7f]/.test(s);
}
function view(id,status,reasons){
 return {id,status,reasons:[...reasons],requires_ifood_teknisa_crosscheck:id==="CONFERENCE",
   native_revision_evidence_only:status==="NATIVE_ONLY_REVIEW",
   ifood_source_authenticated_here:false,ifood_item_parity_proven:false,
   ready_for_operational_print:false,print_authorized:false,
   automatic_retry_allowed:false,bytes:[]};
}
function result(status,production,conference){
 return {schema:SCHEMA,status,production,conference,
   independent_ifood_source_attested_here:false,
   source_store_mapping_attested_here:false,
   physical_print_proven:false,effects:EFFECTS};
}
function allHold(reason){
 return result("HOLD",ids.slice(0,2).map(id=>view(id,"HOLD",[reason])),
   view("CONFERENCE","HOLD",[reason]));
}
function assessViewSourceScopes(input){
 if(!input||typeof input!=="object"||Array.isArray(input))
  return allHold("INPUT_INVALID");
 if(input.print_authorized===true||input.ready_for_operational_print===true)
  return allHold("SELF_AUTHORIZATION_FORBIDDEN");
 const n=input.native;
 if(!n||n.schema!=="tata.comandas.native-revision-claim.v1"||
   n.origin!=="DLV_IFO"||!validText(n.store_id)||!validText(n.store_unit)||
   !validDay(n.operational_date)||!validText(n.order_key)||
   n.order_key.split("|").length!==4||
   n.order_key.split("|")[0]!==n.store_id||
   n.order_key.split("|")[1]!==n.store_unit||
   n.order_key.split("|").some(x=>!validText(x))||
   !SHA.test(n.snapshot_sha256||"")||
   typeof n.short_id!=="string"||!/^[0-9]{1,12}$/.test(n.short_id)||
   n.item_rows_complete!==true||n.observation_scan_complete!==true)
  return allHold("NATIVE_REVISION_STRUCTURE_OR_COVERAGE_UNPROVEN");
 const v=input.views;
 if(!Array.isArray(v)||v.length!==3||
   new Set(v.map(x=>x?.id)).size!==3||
   ids.some(id=>!v.some(x=>x?.id===id))||
   v.some(x=>!x||x.native_snapshot_sha256!==n.snapshot_sha256||
     x.source_kind!=="TEKNISA_READER_V2"))
  return allHold("THREE_VIEWS_NATIVE_REVISION_NOT_IDENTICAL");
 const prod=ids.slice(0,2).map(id=>view(id,"NATIVE_ONLY_REVIEW",[
   "NATIVE_CONTENT_REQUIRES_INDEPENDENT_RUNTIME_ATTESTATION",
   "PRINT_EFFECT_REQUIRES_SEPARATE_APPROVAL"
 ]));
 const x=input.ifood;
 if(x===undefined||x===null){
  return result("EVIDENCE_ONLY",prod,
   view("CONFERENCE","HOLD",["INDEPENDENT_IFOOD_CROSSCHECK_NOT_AVAILABLE"]));
 }
 if(!x||typeof x!=="object"||Array.isArray(x)||
   x.schema!=="tata.comandas.ifood-export-claim.v1"||
   x.source_kind!=="OFFICIAL_IFOOD_EXPORT"||
   !SHA.test(x.source_fingerprint||"")||!validText(x.source_ref)||
   x.short_id_unique_for_day!==true){
  return result("EVIDENCE_ONLY",prod,
   view("CONFERENCE","HOLD",["INDEPENDENT_IFOOD_CROSSCHECK_NOT_ATTESTED"]));
 }
 // External iFood merchant ID and native CDFILIAL/CDLOJA are DIFFERENT
 // namespaces (observed: 53069 versus 0001/01). An equal string is NOT a
 // mapping. An explicit historical mapping is a review CANDIDATE, never
 // independent attestation or printing authority.
 const m=input.store_mapping;
 if(!m||typeof m!=="object"||Array.isArray(m)||
   m.schema!=="tata.comandas.cross-system-store-candidate.v1"||
   m.source_kind!=="HUMAN_RECONCILIATION_CANDIDATE"||
   !validText(m.source_ref)||
   m.ifood_store_id!==x.store_id||
   m.native_store_id!==n.store_id||
   m.native_store_unit!==n.store_unit){
  return result("EVIDENCE_ONLY",prod,
   view("CONFERENCE","HOLD",["CROSS_SYSTEM_STORE_MAPPING_CANDIDATE_REQUIRED"]));
 }
 if(x.operational_date!==n.operational_date||x.short_id!==n.short_id){
  return result("EVIDENCE_ONLY",prod,
   view("CONFERENCE","HOLD",["IFood_TEK_DAY_OR_SHORT_ID_CONFLICT"]));
 }
 return result("EVIDENCE_ONLY",prod,view("CONFERENCE",
    "IFOOD_TEK_CANDIDATE_MATCH_REVIEW_ONLY",[
      "SHORT_ID_DAY_MAPPED_STORES_CANDIDATE_NOT_FULL_UUID_PROOF",
      "CROSS_SYSTEM_STORE_MAPPING_NOT_INDEPENDENTLY_ATTESTED",
      "OFFICIAL_EXPORT_DOES_NOT_PROVE_ITEM_CONTENT",
      "CONFERENCE_PRINT_REQUIRES_SEPARATE_APPROVAL"
    ]));
}
module.exports={assessViewSourceScopes,SCHEMA,EFFECTS};

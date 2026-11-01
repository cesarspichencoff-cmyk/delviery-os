"use strict";
/**
 * Bind confirmed exact-scope human rules to ONE Reader V2 revision after
 * crosschecking caller-supplied candidate catalog identities.
 * No trusted current-catalog provenance or printer authority is created.
 */
const {crosscheckReaderCatalogIdentity}=require("./comandas_reader_catalog_identity_crosscheck_v1_offline.cjs");
const {reviewHumanRuleItem}=require("./comandas_cesar_clarificacoes_20261101_review_only.cjs");
const SCHEMA="tata.comandas.reader-human-six-rule-projection.v1.review-only";
const EFFECTS=Object.freeze({print:false,spooler_write:false,sql_read:false,
 sql_write:false,filesystem_read:false,filesystem_write:false,
 network:false,sequence_write:false,service_change:false,deploy:false});
function result(status,reason,items=[]){
 return {schema:SCHEMA,status,reason,items,
  catalog_current_independently_attested:false,live_product_status_proven:false,
  native_first_dispatch_proven:false,station_destination_currently_attested:false,
  packaging_currently_attested:false,conference_print_authorized:false,
  production_print_authorized:false,print_authorized:false,effects:EFFECTS};
}
function projectHumanRulesForReader(pair,catalogCapture){
 let cross;
 try{cross=crosscheckReaderCatalogIdentity(pair,catalogCapture);}
 catch{return result("HOLD","INVALID_OR_UNTRUSTED_INPUT");}
 if(cross.status!=="IDENTITY_CANDIDATES_REVIEW_ONLY")
  return result("HOLD","NATIVE_OR_CATALOG_SCOPE_HOLD");
 if(cross.unresolved_count!==0||
   cross.candidate_count!==pair.decision.items.length)
  return result("HOLD","CATALOG_ITEMS_NOT_EXACTLY_BOUND");
 const items=[];
 for(let index=0;index<pair.decision.items.length;index++){
  const item=pair.decision.items[index];
  const human=reviewHumanRuleItem({
   canonical_code:item.canonical_code,product_name:item.product_name
  });
  if(human.status!=="HUMAN_RULE_CAPTURED_CATALOG_PENDING")
   return result("HOLD","HUMAN_RULE_MISSING_FOR_SOURCE_ITEM");
  items.push({
   item_index:index+1,
   decision_kind:human.proposed_conference_only
    ?"CONFERENCE_ONLY_CANDIDATE":"PRODUCTION_ROUTE_CANDIDATE",
   stated_area:human.stated_area,
   item_temperature:human.stated_item_temperature,
   source_revision_sha256:pair.event.snapshot_hash,
   route_currently_proven:false,production_print_authorized:false,
   conference_print_authorized:false
  });
 }
 return result("ALL_ITEMS_EXACT_REVIEW_ONLY",
  "SELF_DECLARED_CAPTURE_NOT_CURRENT_OR_INDEPENDENT_ATTESTATION",items);
}
module.exports={SCHEMA,EFFECTS,projectHumanRulesForReader};

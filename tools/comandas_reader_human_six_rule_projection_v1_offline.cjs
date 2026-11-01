"use strict";
/**
 * Bind confirmed exact-scope human rules to ONE Reader V2 revision after
 * crosschecking caller-supplied candidate catalog identities.
 * No trusted current-catalog provenance or printer authority is created.
 */
const {createHash}=require("node:crypto");
const sourceRules=require("../data/comandas_cesar_clarificacoes_20261101_review_only.json");
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const {crosscheckReaderCatalogIdentity}=require("./comandas_reader_catalog_identity_crosscheck_v1_offline.cjs");
const {reviewHumanRuleItem}=require("./comandas_cesar_clarificacoes_20261101_review_only.cjs");
const SCHEMA="tata.comandas.reader-human-six-rule-projection.v1.review-only";
const EFFECTS=Object.freeze({print:false,spooler_write:false,sql_read:false,
 sql_write:false,filesystem_read:false,filesystem_write:false,
 network:false,sequence_write:false,service_change:false,deploy:false});
function result(status,reason,items=[]){
 return {schema:SCHEMA,status,reason,items,
  review_receipt_sha256:null,
  catalog_current_independently_attested:false,live_product_status_proven:false,
  native_first_dispatch_proven:false,station_destination_currently_attested:false,
  packaging_currently_attested:false,conference_print_authorized:false,
  production_print_authorized:false,print_authorized:false,effects:EFFECTS};
}
function projectHumanRulesForReader(pair,catalogCapture){
 let cross;
 try{cross=crosscheckReaderCatalogIdentity(pair,catalogCapture);}
 catch{return result("HOLD","INVALID_OR_UNTRUSTED_INPUT");}
 // Identity matching alone is not enough when native order or item
 // instructions still need disposition. Do not emit a production-role
 // candidate while an allergy, omission or general note is unclassified.
 if(pair?.event?.order?.observation_rows?.length>0||
    pair?.decision?.order_observations?.length>0||
    pair?.decision?.items?.some(x=>x.observations?.length>0))
  return result("HOLD","NATIVE_OBSERVATIONS_REQUIRE_EXPLICIT_DISPOSITION");
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
   stated_container:human.stated_container,
   stated_reference:human.stated_reference,
   source_revision_sha256:pair.event.snapshot_hash,
   route_currently_proven:false,production_print_authorized:false,
   conference_print_authorized:false
  });
 }
 // Stable ordering of the supplied catalog makes the digest invariant
 // to row order; a changed capture source/date/status or changed human
 // rule file cannot reuse the former informational receipt.
 // These hashes establish consistency ONLY, never independent authority.
 const claimedCatalog={
  schema:catalogCapture.schema,source_kind:catalogCapture.source_kind,
  source_ref:catalogCapture.source_ref,store_id:catalogCapture.store_id,
  store_unit:catalogCapture.store_unit,
  captured_local_date:catalogCapture.captured_local_date,
  entries:catalogCapture.entries.map(e=>[
   e.CDPRODUTO,e.canonical_code,e.product_name,e.active
  ]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
 };
 const receipt=digest({schema:SCHEMA,
  native_snapshot_sha256:pair.event.snapshot_hash,
  native_decision_fingerprint_sha256:pair.decision.fingerprint,
  claimed_catalog_sha256:digest(claimedCatalog),
  human_rule_scope_sha256:digest(sourceRules),
  item_roles:items.map(i=>[i.item_index,i.decision_kind,i.stated_area,
   i.item_temperature,i.stated_container,i.stated_reference])
 });
 return {...result("ALL_ITEMS_EXACT_REVIEW_ONLY",
  "SELF_DECLARED_CAPTURE_NOT_CURRENT_OR_INDEPENDENT_ATTESTATION",items),
  review_receipt_sha256:receipt};
}
module.exports={SCHEMA,EFFECTS,projectHumanRulesForReader};

"use strict";
/**
 * B0.5 Retail IFO -> Loja/Caixa mapping review, OFFLINE.
 * Input is a supplied transcription, never a verified Retail observation.
 * This module NEVER reads the host, authenticates a UI, chooses a dispatcher,
 * prints, changes settings, or confers approval for a production effect.
 */
const SCHEMA="tata.comandas.ifo-retail-mapping.v1.review-only";
const CODE=/^[A-Z0-9_-]{1,32}$/;
const EFFECTS=Object.freeze({host_read:false,sql_read:false,sql_write:false,
 retail_login:false,retail_config_read:false,retail_config_write:false,
 token_read:false,network:false,service:false,print:false,reprint:false,
 spooler:false,sequence_write:false,deploy:false,merge:false});
const DENIAL=Object.freeze({input_is_self_reported:true,
 live_retail_mapping_independently_attested:false,
 active_retail_integration_proven:false,
 live_native_first_dispatch_proven:false,
 real_cashbox_or_dispatcher_host_identified:false,
 paper_printed_proven:false,can_authorize_cutover:false,
 can_print:false,can_auto_retry:false});
function result(status,reason,more={}){
 return {schema:SCHEMA,status,reason,...DENIAL,effects:EFFECTS,...more};
}
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const only=(o,keys)=>obj(o)&&Object.keys(o).every(k=>keys.includes(k));
const code=x=>typeof x==="string"&&CODE.test(x);
function validDate(x){
 if(typeof x!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const d=new Date(x+"T00:00:00Z");
 return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===x;
}
function reviewIfoRetailMapping(input){
 if(!only(input,["schema","source","integration","mapping","centralized"])||
    input.schema!==SCHEMA||
    !only(input.source,["kind","observed_date","read_only_claim"])||
    input.source.kind!=="RETAIL_UI_TRANSCRIPTION_NOT_ATTESTED"||
    !validDate(input.source.observed_date)||
    input.source.read_only_claim!==true)
  return result("HOLD","UNTRUSTED_SOURCE_ENVELOPE_OR_UNKNOWN_FIELDS");
 const it=input.integration;
 if(!only(it,["project","filial","mapping_mode"])||
    it.project!=="IFO"||it.filial!=="0001"||
    !["DEFAULT_SELLER","PER_UNIT","UNKNOWN"].includes(it.mapping_mode))
  return result("HOLD","IFO_INTEGRATION_AND_ITAIM_SCOPE_UNKNOWN");
 const centralized=input.centralized===undefined?"UNKNOWN":input.centralized;
 if(!["YES","NO","UNKNOWN"].includes(centralized))
  return result("HOLD","CENTRAL_DELIVERY_SETTING_UNKNOWN_FORMAT");
 const m=input.mapping;
 if(!only(m,["per_unit","default_seller","seller_cashboxes"])||
    !Array.isArray(m.per_unit)||m.per_unit.length>40||
    !Array.isArray(m.seller_cashboxes)||m.seller_cashboxes.length>80)
  return result("HOLD","IFO_MAPPING_COLLECTIONS_INVALID");
 if(m.per_unit.some(x=>!only(x,["filial","loja","caixa"])||
    !code(x.filial)||!code(x.loja)||!code(x.caixa))||
    m.seller_cashboxes.some(x=>!only(x,["filial","loja","caixa","seller"])||
    !code(x.filial)||!code(x.loja)||!code(x.caixa)||!code(x.seller)))
  return result("HOLD","IFO_MAPPING_ROW_INVALID");
 if(it.mapping_mode==="UNKNOWN")
  return result("HOLD","IFO_MAPPING_MODE_NOT_OBSERVED");
 let eligible=[];
 if(it.mapping_mode==="PER_UNIT"){
  if(m.default_seller!==null||m.seller_cashboxes.length!==0)
   return result("HOLD","MAPPING_BRANCHES_CONTRADICT");
  eligible=m.per_unit.filter(x=>x.filial===it.filial);
 }else{
  if(m.per_unit.length!==0)
   return result("HOLD","MAPPING_BRANCHES_CONTRADICT");
  if(!only(m.default_seller,["filial","seller"])||
     m.default_seller.filial!==it.filial||
     !code(m.default_seller.seller))
   return result("HOLD","DEFAULT_SELLER_NOT_SCOPED_OR_BRANCH_CONTRADICTED");
  eligible=m.seller_cashboxes.filter(x=>
   x.filial===it.filial&&x.seller===m.default_seller.seller);
 }
 // A native Reader order is scoped to CDFILIAL=0001/CDLOJA=01. A different
 // shop belonging to the same filial must not manufacture a cashbox collision.
 // Still refuse two eligible cashboxes in *this exact shop*.
 const candidates=eligible.filter(x=>x.loja==="01");
 const count=candidates.length;
 const checked={mapping_branch_reviewed:it.mapping_mode,
  retail_candidate_count:count,centralized_delivery_flag_claim:centralized};
 if(count===0)
  return result("HOLD",eligible.length===0
   ?"IFO_RETAIL_CASHBOX_ASSOCIATION_MISSING"
   :"IFO_RETAIL_LOJA_CONFLICTS_WITH_READER_NATIVE_SCOPE",checked);
 if(count!==1)
  return result("HOLD","IFO_RETAIL_CASHBOX_ASSOCIATION_AMBIGUOUS",checked);
 // No candidate store/cashbox codes are exported or treated as host identity.
 // The centralized-sync flag is a separate topology clue, NOT a
 // prerequisite to identifying a unit/store/cashbox mapping candidate.
 // Do not force access to another protected Retail screen just for this flag.
 // UNKNOWN keeps first-dispatch host and transport entirely unattested.
 return result("MAPPING_CANDIDATE_REVIEW_ONLY",
  "TRANSCRIBED_MAPPING_COHERENT_BUT_NEITHER_LIVE_RETAIL_NOR_DISPATCH_ATTESTED",{
   ...checked,scoped_retail_loja_cashbox_candidate_present:true,
   next_gate:"SOURCE_AUTHORIZED_UI_ATTESTATION_THEN_NATIVE_FIRST_DISPATCH_READONLY"
  });
}
module.exports={reviewIfoRetailMapping,SCHEMA,EFFECTS,DENIAL};

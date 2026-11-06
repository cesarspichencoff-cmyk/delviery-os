'use strict';
/**
 * Review of EXACT static TATÁ Academia references only.
 * A catalog product name is not a verified Teknisa CDPRODUTO/CDARVPROD.
 * Never identify a native order, resolve a live SKU or authorize packaging.
 * Consumer of this module must not treat catalog recognition as native fact.
 */
const data=require('../data/comandas_assembly_academy_identity_reference_review_v1.json');
const SCHEMA='tata.comandas.assembly-academy-reference-request.v1';
const OUTPUT='tata.comandas.assembly-academy-reference-hold.v1';
const EFFECTS=Object.freeze({database_read:false,database_write:false,
 network:false,filesystem_write:false,catalog_write:false,printer:false,
 spooler:false,sequence_write:false,service_change:false,deploy:false,cutover:false});
const isObj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const exact=(o,fields)=>isObj(o)&&
 Object.keys(o).sort().join('|')===fields.slice().sort().join('|');
const records=new Map(data.records.map(x=>[x.id,x]));
const roles=new Set(['MISSOSHIRO','SALMAO_ATUM_P1','NONE']);
function hold(reason,record=null){
 return Object.freeze({
   schema:OUTPUT,status:'HOLD',reason,
   catalog_git_blob_sha1:data.source.git_blob_sha1,
   catalog_entry_id:record?.id??null,
   catalog_entry_name:record?.name??null,
   catalog_entry_observed_in_pinned_source:record!==null,
   academy_classification_needs_review:record?.review_required??null,
   human_rule_scope:'SYNTHETIC_ONLY_NOT_BOUND_TO_NATIVE_PRODUCT',
   distinct_products_preserved:true,
   native_cdproduto_bound:false,native_cdarvprod_bound:false,
   native_order_identity_proven:false,source_freshness_proven:false,
   operational_assembly_plan_authorized:false,
   complete_bag_plan_proven:false,conference_print_authorized:false,
   effect_permissions:EFFECTS
 });
}
function review(input){
 try{
  if(!exact(input,['schema','academy_entry_id','academy_entry_name','human_rule_role'])||
     input.schema!==SCHEMA||!roles.has(input.human_rule_role)||
     typeof input.academy_entry_id!=='string'||
     typeof input.academy_entry_name!=='string')
   return hold('REVIEW_ENVELOPE_INVALID');
  const record=records.get(input.academy_entry_id);
  if(!record)return hold('ACADEMY_ENTRY_ID_NOT_PINNED');
  if(record.name!==input.academy_entry_name)
   return hold('ACADEMY_ID_AND_NAME_NOT_SAME_RECORD');
  if(input.human_rule_role==='SALMAO_ATUM_P1' &&
     record.id==='combinado_salmao_1_pessoa')
   return hold('SALMAO_1_DISTINCT_FROM_SALMAO_ATUM_1',record);
  if(input.human_rule_role!==record.human_assembly_rule_role &&
      !(input.human_rule_role==='NONE'&&record.human_assembly_rule_role===null))
   return hold('HUMAN_ASSEMBLY_RULE_ROLE_MISMATCH',record);
  if(record.review_required)
   return hold('ACADEMY_CLASSIFICATION_REVIEW_AND_NATIVE_ID_PENDING',record);
  if(record.human_assembly_rule_role===null)
   return hold('NO_EXACT_HUMAN_ASSEMBLY_RULE_FOR_THIS_ENTRY',record);
  return hold('CATALOG_REFERENCE_MATCHES_HUMAN_ROLE_BUT_NATIVE_ID_UNKNOWN',record);
 }catch{return hold('REVIEW_EXCEPTION');}
}
module.exports={SCHEMA,OUTPUT,review};

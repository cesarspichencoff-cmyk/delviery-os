'use strict';
const assert=require('node:assert/strict');
const C=require('../data/comandas_assembly_academy_identity_reference_review_v1.json');
const {SCHEMA,OUTPUT,review}=require('./comandas_assembly_catalog_identity_hold_v1_offline.cjs');
const m={schema:SCHEMA,academy_entry_id:'missoshiro',
 academy_entry_name:'Missoshiro',human_rule_role:'MISSOSHIRO'};
const a={schema:SCHEMA,academy_entry_id:'combinado_salmao_atum_1_pessoa',
 academy_entry_name:'Combinado Salmão/Atum 1 pessoa',human_rule_role:'SALMAO_ATUM_P1'};
const s={schema:SCHEMA,academy_entry_id:'combinado_salmao_1_pessoa',
 academy_entry_name:'Combinado Salmão 1 pessoa',human_rule_role:'NONE'};
const copy=x=>JSON.parse(JSON.stringify(x));
const change=(source,key,value)=>Object.assign(copy(source),{[key]:value});
let count=0;
function t(label,action){action();count++;console.log('PASS '+count+' '+label)}
function check(input,reason,id=null){
 const result=review(input);
 assert.equal(result.schema,OUTPUT);
 assert.equal(result.status,'HOLD');
 assert.equal(result.reason,reason);
 assert.equal(result.catalog_entry_id,id);
 assert.equal(result.catalog_git_blob_sha1,C.source.git_blob_sha1);
 for(const k of ['native_cdproduto_bound','native_cdarvprod_bound',
  'native_order_identity_proven','source_freshness_proven',
  'operational_assembly_plan_authorized','complete_bag_plan_proven',
  'conference_print_authorized'])assert.equal(result[k],false,k);
 assert.ok(Object.values(result.effect_permissions).every(x=>x===false));
 assert.equal(result.distinct_products_preserved,true);
 assert.ok(!JSON.stringify(result).includes('CUSTOMER_SECRET'));
 return result;
}
t('pinned catalog source is the reviewed Academy blob',()=>{
 assert.equal(C.source.git_blob_sha1,'d4cc9ba91c850314ffa9bd45fb9dfd1dea3d3c22');
 assert.equal(C.source.repository,'cesarspichencoff-cmyk/tata-academia');
 assert.equal(C.native_product_ids_observed_for_these_three,false);
 assert.equal(C.records.length,3);
});
t('two one-person salmon products remain distinct despite matching station',()=>{
 const x=C.records.find(x=>x.id===s.academy_entry_id);
 const y=C.records.find(x=>x.id===a.academy_entry_id);
 assert.notEqual(x.id,y.id);assert.notEqual(x.name,y.name);
 assert.notEqual(x.description,y.description);
 assert.equal(x.family,y.family);assert.equal(x.subfamily,y.subfamily);
 assert.equal(x.station,y.station);
});
t('Academy Missoshiro was name-only and classification review-required',()=>{
 const x=C.records.find(x=>x.id===m.academy_entry_id);
 assert.equal(x.menu_status,'PROVEN_PUBLISHED_NAME_ONLY');
 assert.equal(x.classification_truth_class,'UNKNOWN_REVIEW_REQUIRED');
 assert.equal(x.review_required,true);
});
t('exact Salmao Atum p1 reference still cannot bind a native code',()=>{
 const v=check(a,'CATALOG_REFERENCE_MATCHES_HUMAN_ROLE_BUT_NATIVE_ID_UNKNOWN',a.academy_entry_id);
 assert.equal(v.catalog_entry_observed_in_pinned_source,true);
});
t('Missoshiro known name cannot bypass pending classification review',()=>{
 const v=check(m,'ACADEMY_CLASSIFICATION_REVIEW_AND_NATIVE_ID_PENDING',m.academy_entry_id);
 assert.equal(v.academy_classification_needs_review,true);
});
t('distinct Salmao-only p1 cannot inherit Salmao Atum packaging',()=>{
 const x=change(s,'human_rule_role','SALMAO_ATUM_P1');
 check(x,'SALMAO_1_DISTINCT_FROM_SALMAO_ATUM_1',s.academy_entry_id);
});
t('Salmao-only p1 has no specific human kit/bag rule',()=>{
 check(s,'NO_EXACT_HUMAN_ASSEMBLY_RULE_FOR_THIS_ENTRY',s.academy_entry_id);
});
t('Salmao Atum as NONE is wrong rule role',()=>{
 check(change(a,'human_rule_role','NONE'),'HUMAN_ASSEMBLY_RULE_ROLE_MISMATCH',a.academy_entry_id);
});
t('Salmao Atum as MISSOSHIRO is wrong rule role',()=>{
 check(change(a,'human_rule_role','MISSOSHIRO'),'HUMAN_ASSEMBLY_RULE_ROLE_MISMATCH',a.academy_entry_id);
});
t('Missoshiro as Salmao Atum is wrong rule role',()=>{
 check(change(m,'human_rule_role','SALMAO_ATUM_P1'),'HUMAN_ASSEMBLY_RULE_ROLE_MISMATCH',m.academy_entry_id);
});
t('Salmao-only as MISSOSHIRO is wrong rule role',()=>{
 check(change(s,'human_rule_role','MISSOSHIRO'),'HUMAN_ASSEMBLY_RULE_ROLE_MISMATCH',s.academy_entry_id);
});
t('correct name but wrong Academy ID not accepted',()=>{
 const x=change(a,'academy_entry_id',s.academy_entry_id);
 check(x,'ACADEMY_ID_AND_NAME_NOT_SAME_RECORD');
});
t('correct ID but Salmao-only name not accepted',()=>{
 const x=change(a,'academy_entry_name',s.academy_entry_name);
 check(x,'ACADEMY_ID_AND_NAME_NOT_SAME_RECORD');
});
t('human shortened Salmao p1 alias not promoted',()=>{
 const x=change(a,'academy_entry_name','Combinado salmão p/1');
 check(x,'ACADEMY_ID_AND_NAME_NOT_SAME_RECORD');
});
t('Missoshiru spelling is not Missoshiro',()=>{
 check(change(m,'academy_entry_name','Missoshiru'),'ACADEMY_ID_AND_NAME_NOT_SAME_RECORD');
});
t('uppercase name is not exact binding',()=>{
 check(change(m,'academy_entry_name','MISSOSHIRO'),'ACADEMY_ID_AND_NAME_NOT_SAME_RECORD');
});
t('unknown Academy ID is held',()=>{
 check(change(a,'academy_entry_id','totally_fake'),'ACADEMY_ENTRY_ID_NOT_PINNED');
});
t('case-changed Academy ID is held',()=>{
 check(change(a,'academy_entry_id','COMBINADO_SALMAO_ATUM_1_PESSOA'),'ACADEMY_ENTRY_ID_NOT_PINNED');
});
t('different two-person SKU cannot be inferred from one person',()=>{
 check(change(a,'academy_entry_id','combinado_salmao_atum_2_pessoas'),'ACADEMY_ENTRY_ID_NOT_PINNED');
});
t('native product ID is forbidden as proof injection',()=>{
 const x=copy(a);x.native_cdproduto='0000001459';
 check(x,'REVIEW_ENVELOPE_INVALID');
});
t('native compact code is forbidden as proof injection',()=>{
 const x=copy(m);x.CDARVPROD='9150003000';
 check(x,'REVIEW_ENVELOPE_INVALID');
});
t('customer names are not accepted',()=>{
 const x=copy(a);x.customer_name='CUSTOMER_SECRET';
 check(x,'REVIEW_ENVELOPE_INVALID');
});
t('false print authorization field rejected',()=>{
 const x=copy(a);x.print_authorized=true;
 check(x,'REVIEW_ENVELOPE_INVALID');
});
t('extra generic alias signal rejected',()=>{
 const x=copy(a);x.name_similarity_score=1;
 check(x,'REVIEW_ENVELOPE_INVALID');
});
t('missing human role rejected',()=>{
 const x=copy(a);delete x.human_rule_role;
 check(x,'REVIEW_ENVELOPE_INVALID');
});
t('unknown human role rejected',()=>{
 check(change(a,'human_rule_role','ANY_COMBO'),'REVIEW_ENVELOPE_INVALID');
});
t('wrong schema held',()=>{
 check(change(a,'schema','native.ready.v999'),'REVIEW_ENVELOPE_INVALID');
});
t('null object held',()=>check(null,'REVIEW_ENVELOPE_INVALID'));
t('arrays held',()=>check([],'REVIEW_ENVELOPE_INVALID'));
t('numeric name held',()=>check(change(a,'academy_entry_name',5),'REVIEW_ENVELOPE_INVALID'));
t('null Academy ID held',()=>check(change(a,'academy_entry_id',null),'REVIEW_ENVELOPE_INVALID'));
if(count!==31)throw Error('IDENTITY_REVIEW_CASE_COUNT_'+count);
console.log('COMANDAS_ASSEMBLY_ACADEMY_IDENTITY='+count+'/'+count+
 ' PINNED_CATALOG_ONLY NO_NATIVE_SKU NO_ASSEMBLY_RELEASE NO_PRINT');

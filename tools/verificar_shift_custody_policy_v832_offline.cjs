'use strict';
const assert=require('node:assert/strict');
const {evaluate,SCHEMA,RESULT_SCHEMA,PROOFS}=require('./comandas_shift_custody_policy_v832_offline.cjs');
const all={
 schema:SCHEMA,observation_read_only:true,
 service_identity_virtual:true,observer_distinct_from_service:true,
 protected_shift_exists:true,
 protected_shift_reader_readonly_token_proven:true,
 protected_shift_writer_separate_token_proven:true,
 human_approval_authenticated:true,
 protected_shift_history_proven:true,
 legacy_fallback_disabled_proven:true,
 supervisor_quiescent_cutover_proven:true,
 rollback_actual_bytes_proven:true,
 legacy_shift_service_modify_allow:false,
 protected_shift_service_modify_allow:false
};
let checks=0;
function check(title,fn){try{fn();checks++}catch(e){e.message=title+': '+e.message;throw e}}
function hold(o,reason){
 const z=evaluate(o);
 assert.equal(z.schema,RESULT_SCHEMA);
 assert.equal(z.status,'HOLD');
 assert.ok(z.reasons.includes(reason),JSON.stringify(z));
 assert.equal(z.operational_activation_allowed,false);
 assert.equal(z.human_authorization_inferred,false);
 assert.equal(z.effective_token_permissions_inferred,false);
 assert.equal(z.physical_print_authorized,false);
 assert.equal(z.host_effects,false);
}
check('complete evidence is review only and never approval',()=>{
 const r=evaluate(all);
 assert.equal(r.status,'REVIEW_ONLY_NOT_AUTHORIZED');
 assert.deepEqual(r.reasons,[]);
 assert.equal(r.operational_activation_allowed,false);
 assert.equal(r.physical_print_authorized,false);
});
check('current CAIXA facts remain hold with independent visitor only',()=>{
 const r=evaluate({
  schema:SCHEMA,observation_read_only:true,
  service_identity_virtual:true,observer_distinct_from_service:true,
  protected_shift_exists:false,legacy_shift_service_modify_allow:true,
  protected_shift_service_modify_allow:null,local_enabled_nonbuiltin_accounts:4
 });
 assert.equal(r.status,'HOLD');
 assert.ok(r.reasons.includes('PROTECTED_SHIFT_NOT_PRESENT'));
 assert.ok(r.reasons.includes('LEGACY_SHIFT_SERVICE_WRITE_RISK'));
 assert.ok(r.reasons.includes('HUMAN_APPROVAL_NOT_AUTHENTICATED'));
 assert.ok(r.reasons.includes('READER_EFFECTIVE_READONLY_NOT_PROVEN'));
});
check('null snapshot rejected',()=>hold(null,'SNAPSHOT_INVALID'));
check('empty snapshot rejected',()=>hold({},'SNAPSHOT_INVALID'));
check('array rejected',()=>hold([],'SNAPSHOT_INVALID'));
check('schema mismatch rejected',()=>hold({...all,schema:'attacker-schema'},'SNAPSHOT_INVALID'));
for(const [key,reason] of PROOFS){
 check(key+' false',()=>hold({...all,[key]:false},reason));
 check(key+' missing',()=>{
  const t={...all};delete t[key];hold(t,reason);
 });
 check(key+' string true',()=>hold({...all,[key]:'true'},reason));
}
check('legacy service direct Modify blocks',()=>hold({...all,legacy_shift_service_modify_allow:true},'LEGACY_SHIFT_SERVICE_WRITE_RISK'));
check('legacy service permission unknown blocks',()=>hold({...all,legacy_shift_service_modify_allow:null},'LEGACY_SHIFT_SERVICE_WRITE_RISK'));
check('protected service direct Modify blocks',()=>hold({...all,protected_shift_service_modify_allow:true},'PROTECTED_SHIFT_SERVICE_WRITE_RISK_OR_UNKNOWN'));
check('protected service permission unknown blocks',()=>hold({...all,protected_shift_service_modify_allow:null},'PROTECTED_SHIFT_SERVICE_WRITE_RISK_OR_UNKNOWN'));
check('observation with writes is inadmissible',()=>hold({...all,observation_read_only:false},'OBSERVATION_EFFECT_BOUNDARY_NOT_CONFIRMED'));
check('missing read-only assurance is inadmissible',()=>hold({...all,observation_read_only:undefined},'OBSERVATION_EFFECT_BOUNDARY_NOT_CONFIRMED'));
check('local user account count cannot replace human authorization',()=>{
 const x={...all,human_approval_authenticated:false,local_enabled_nonbuiltin_accounts:400};
 hold(x,'HUMAN_APPROVAL_NOT_AUTHENTICATED');
});
check('local administrator SID cannot replace independent writer',()=>{
 const x={...all,protected_shift_writer_separate_token_proven:false,
  local_admin_identity:'administrator',is_admin:true};
 hold(x,'WRITER_INDEPENDENCE_NOT_PROVEN');
});
check('synthetic token proof cannot replace effective token',()=>{
 const x={...all,protected_shift_reader_readonly_token_proven:null,
  runner_hosted_test_passed:true,ntfs_synthetic_token_test_passed:true};
 hold(x,'READER_EFFECTIVE_READONLY_NOT_PROVEN');
});
check('signed data field cannot replace verified human attestation',()=>{
 const x={...all,human_approval_authenticated:false,
  signature:'pretend-human-sig',source_ref:'HUMAN_CONFIRMED_RULE'};
 hold(x,'HUMAN_APPROVAL_NOT_AUTHENTICATED');
});
check('policy does not read filesystem',()=>{
 const fs=require('node:fs');
 const old=fs.readFileSync;
 try{fs.readFileSync=()=>{throw Error('should never inspect host')};const x=evaluate(all);assert.equal(x.status,'REVIEW_ONLY_NOT_AUTHORIZED')}
 finally{fs.readFileSync=old}
});
console.log(JSON.stringify({
 schema:'deliveryos.comandas.v832.custody-policy-tests',
 status:'PASS',checks,synthetic_evidence_only:true,
 real_human_not_authenticated:true,real_reader_acl_not_tested:true,
 operational_activation_allowed:false,files_modified:false,
 sql:false,printer:false,service:false
}));

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {SCHEMA,RESULT,expected,evaluate}=require('./comandas_custody_layout_v841_offline.cjs');
const good={schema:SCHEMA,...expected};
let checks=0;
function check(name,fn){try{fn();checks++}catch(e){e.message='V841 '+name+': '+e.message;throw e}}
function noAction(r){
 assert.equal(r.schema,RESULT);
 for(const f of [
  'actual_protected_ledger_installed','actual_protected_shift_installed',
  'real_service_effective_token_verified','actual_custodian_authenticated',
  'independent_external_witness_proven','independent_revocation_and_clock_proven',
  'durable_external_nonce_retention_proven','operational_activation_authorized',
  'production_shift_changed','host_effects','sql','teknisa','printer','service'])
  assert.equal(r[f],false);
}
function hold(input,reason){const x=evaluate(input);noAction(x);assert.equal(x.status,'HOLD');assert.ok(x.reasons.includes(reason),JSON.stringify(x))}
function review(input){const x=evaluate(input);noAction(x);assert.equal(x.status,'REVIEW_ONLY_LAYOUT_NO_HOST_PROOF');assert.deepEqual(x.reasons,[])}
check('known proposed layout is only review',()=>review(good));
check('all user-declared authority booleans do not grant operational trust',()=>review({...good,human_approved:true,live_acl_verified:true,nonce_durable:true}));
check('null is HOLD',()=>hold(null,'LAYOUT_SCHEMA_INVALID'));
check('array is HOLD',()=>hold([],'LAYOUT_SCHEMA_INVALID'));
check('invalid schema is HOLD',()=>hold({...good,schema:'PRODUCTION_AUTHORIZED'},'LAYOUT_SCHEMA_INVALID'));
check('legacy file cannot be protected file',()=>hold({...good,protected_shift_file:good.legacy_shift_file},'PATH_CUSTODY_COLLIDES_WITH_WRITABLE_OPERATIONAL_TREE'));
check('operational evidence cannot host nonce ledger',()=>hold({...good,nonce_ledger_dir:good.operational_evidence_dir+'\\shift-nonces'},'PATH_CUSTODY_COLLIDES_WITH_WRITABLE_OPERATIONAL_TREE'));
check('legacy state cannot host nonce ledger',()=>hold({...good,nonce_ledger_dir:'C:\\ProgramData\\TataComandaReader\\state\\nonce'},'PATH_CUSTODY_COLLIDES_WITH_WRITABLE_OPERATIONAL_TREE'));
check('protected state cannot share nonce custody subtree',()=>hold({...good,nonce_ledger_dir:'C:\\ProgramData\\TataComandaReader\\approved-shift\\nonces'},'PATH_CUSTODY_COLLIDES_WITH_WRITABLE_OPERATIONAL_TREE'));
check('protected shift cannot be operational evidence child',()=>hold({...good,protected_shift_file:good.operational_evidence_dir+'\\production-service-state.json'},'PATH_CUSTODY_COLLIDES_WITH_WRITABLE_OPERATIONAL_TREE'));
check('relative target rejected',()=>hold({...good,nonce_ledger_dir:'custody\\shift-authorization-nonces'},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('UNC target rejected',()=>hold({...good,nonce_ledger_dir:'\\\\network\\share\\nonce'},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('alternate drive rejected',()=>hold({...good,nonce_ledger_dir:'D:\\ProgramData\\TataComandaReader\\custody\\shift-authorization-nonces'},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('dot-dot traversal rejected',()=>hold({...good,nonce_ledger_dir:good.operational_evidence_dir+'\\..\\custody\\shift-authorization-nonces'},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('dot traversal rejected',()=>hold({...good,nonce_ledger_dir:'C:\\ProgramData\\TataComandaReader\\.\\custody\\shift-authorization-nonces'},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('forward slash alias rejected',()=>hold({...good,nonce_ledger_dir:good.nonce_ledger_dir.replaceAll('\\','/')},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('alternate short path rejected without assuming filesystem alias safety',()=>hold({...good,nonce_ledger_dir:'C:\\PROGRA~1\\TataComandaReader\\custody\\shift-authorization-nonces'},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('unexpected subfolder rejected',()=>hold({...good,nonce_ledger_dir:good.nonce_ledger_dir+'\\extra'},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('empty path rejected',()=>hold({...good,nonce_ledger_dir:''},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('path null rejected',()=>hold({...good,nonce_ledger_dir:null},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('very long path rejected',()=>hold({...good,nonce_ledger_dir:'C:\\'+('x'.repeat(500))},'PATH_NONCE_LEDGER_DIR_UNTRUSTED_OR_CHANGED'));
check('service evidence and approved state can never be conflated',()=>hold({...good,operational_evidence_dir:good.protected_shift_file},'PATH_OPERATIONAL_EVIDENCE_DIR_UNTRUSTED_OR_CHANGED'));
check('path case-folding on Windows is not operational authorization',()=>review({...good,nonce_ledger_dir:good.nonce_ledger_dir.toUpperCase()}));
check('source module has no dependency on machine host data',()=>{
 const file=fs.readFileSync,stat=fs.statSync,exists=fs.existsSync;
 try{fs.readFileSync=()=>{throw Error('UNEXPECTED_HOST_READ')};fs.statSync=()=>{throw Error('UNEXPECTED_HOST_STAT')};fs.existsSync=()=>{throw Error('UNEXPECTED_HOST_EXISTS')};review(good)}
 finally{fs.readFileSync=file;fs.statSync=stat;fs.existsSync=exists}
});
assert.equal(checks,24,'V841_NUMBER_OF_CASES_DRIFT');
console.log(JSON.stringify({schema:'deliveryos.comandas.v841.layout-adversarial-tests',
 status:'PASS',checks,plan_only:true,live_ledger_proven:false,
 custodian_human_authenticated:false,production_shift_authorized:false,
 external_failure_domain_proven:false,host_effects:false,teknisa:false,
 sql:false,service:false,printer:false}));

'use strict';
/**
 * V8.41: PURE static namespace separation for proposed shift custody.
 * Do not confuse a clean path design with an installed protected directory,
 * an independent external witness, a service token, or human authorization.
 */
const path=require('node:path');
const SCHEMA='deliveryos.comandas.v841.proposed-custody-layout';
const RESULT='deliveryos.comandas.v841.layout-review';
const ROOT=String.raw`C:\ProgramData\TataComandaReader`;
const expected=Object.freeze({
 legacy_shift_file:ROOT+String.raw`\state\production-service-state.json`,
 operational_evidence_dir:ROOT+String.raw`\evidence`,
 protected_shift_file:ROOT+String.raw`\approved-shift\production-service-state.json`,
 nonce_ledger_dir:ROOT+String.raw`\custody\shift-authorization-nonces`
});
const KEYS=Object.freeze(Object.keys(expected));
const fail=(reasons)=>Object.freeze({
 schema:RESULT,
 status:reasons.length?'HOLD':'REVIEW_ONLY_LAYOUT_NO_HOST_PROOF',
 reasons:Object.freeze([...new Set(reasons)]),
 actual_protected_ledger_installed:false,
 actual_protected_shift_installed:false,
 real_service_effective_token_verified:false,
 actual_custodian_authenticated:false,
 independent_external_witness_proven:false,
 independent_revocation_and_clock_proven:false,
 durable_external_nonce_retention_proven:false,
 operational_activation_authorized:false,
 production_shift_changed:false,
 host_effects:false,
 sql:false,teknisa:false,printer:false,service:false
});
function normalize(value){
 if(typeof value!=='string'||value.length<10||value.length>400||
    value.includes('\0')||value.includes('/')||value.startsWith('\\\\')||
    !path.win32.isAbsolute(value)||!/^C:\\/.test(value)||
    value.split('\\').some(x=>x==='.'||x==='..'||x==='')||
    /[?*<>|"^]/.test(value))return null;
 return path.win32.normalize(value).toLowerCase();
}
function within(child,parent){
 return child!==null&&parent!==null&&
  (child===parent||child.startsWith(parent+'\\'));
}
function evaluate(layout){
 const reasons=[];
 if(!layout||typeof layout!=='object'||Array.isArray(layout)||
    layout.schema!==SCHEMA){return fail(['LAYOUT_SCHEMA_INVALID'])}
 const v={};
 for(const key of KEYS){
  v[key]=normalize(layout[key]);
  const target=normalize(expected[key]);
  if(v[key]===null||v[key]!==target){
   reasons.push('PATH_'+key.toUpperCase()+'_UNTRUSTED_OR_CHANGED')
  }
 }
 const legacyParent=v.legacy_shift_file?path.win32.dirname(v.legacy_shift_file):null;
 const protectedParent=v.protected_shift_file?path.win32.dirname(v.protected_shift_file):null;
 if(within(v.nonce_ledger_dir,v.operational_evidence_dir)||
    within(v.nonce_ledger_dir,legacyParent)||
    within(v.nonce_ledger_dir,protectedParent)||
    within(v.operational_evidence_dir,v.nonce_ledger_dir)||
    within(v.protected_shift_file,v.operational_evidence_dir)||
    within(v.protected_shift_file,legacyParent)||
    within(v.legacy_shift_file,protectedParent)||
    (v.legacy_shift_file!==null&&v.legacy_shift_file===v.protected_shift_file)){
  reasons.push('PATH_CUSTODY_COLLIDES_WITH_WRITABLE_OPERATIONAL_TREE')
 }
 // Even if caller adds 'all approved' booleans, this code has no trust anchor
 // or Windows access to prove them. Clean topology is a proposal only.
 return fail(reasons);
}
module.exports={SCHEMA,RESULT,ROOT,expected,evaluate};

'use strict';
/**
 * V8.32 custody gate: evidence classification ONLY.
 * No file, account, ACL, service, database, network, printer or host actions.
 * Even a complete evidence snapshot yields REVIEW_ONLY, NEVER authorization.
 *
 * All "proven" inputs must be independently attested: caller declarations and
 * Windows account names, synthetic tokens, or local account counts are not proof.
 */
const SCHEMA='deliveryos.comandas.v832.shift-custody-observation';
const RESULT_SCHEMA='deliveryos.comandas.v832.shift-custody-evidence-gate';
const PROOFS=Object.freeze([
 ['service_identity_virtual','SERVICE_IDENTITY_NOT_CONFIRMED'],
 ['observer_distinct_from_service','OBSERVING_PRINCIPAL_NOT_DISTINCT'],
 ['protected_shift_exists','PROTECTED_SHIFT_NOT_PRESENT'],
 ['protected_shift_reader_readonly_token_proven','READER_EFFECTIVE_READONLY_NOT_PROVEN'],
 ['protected_shift_writer_separate_token_proven','WRITER_INDEPENDENCE_NOT_PROVEN'],
 ['human_approval_authenticated','HUMAN_APPROVAL_NOT_AUTHENTICATED'],
 ['protected_shift_history_proven','HUMAN_TRANSITION_HISTORY_NOT_PROVEN'],
 ['legacy_fallback_disabled_proven','LEGACY_SHIFT_FALLBACK_NOT_DISABLED'],
 ['supervisor_quiescent_cutover_proven','CUTOVER_QUIESCENCE_NOT_PROVEN'],
 ['rollback_actual_bytes_proven','ACTUAL_HOST_ROLLBACK_NOT_PROVEN']
]);
const uniq=(a)=>[...new Set(a)];
function evaluate(input){
 const reasons=[];
 if(!input||typeof input!=='object'||Array.isArray(input)||
    input.schema!==SCHEMA){
  return Object.freeze({
   schema:RESULT_SCHEMA,status:'HOLD',
   reasons:['SNAPSHOT_INVALID'],
   operational_activation_allowed:false,
   human_authorization_inferred:false,
   effective_token_permissions_inferred:false,
   physical_print_authorized:false,
   host_effects:false
  });
 }
 // Missing, false and malformed booleans all fail closed.
 for(const [key,reason] of PROOFS){
  if(input[key]!==true)reasons.push(reason);
 }
 if(input.legacy_shift_service_modify_allow!==false)
  reasons.push('LEGACY_SHIFT_SERVICE_WRITE_RISK');
 if(input.protected_shift_service_modify_allow!==false)
  reasons.push('PROTECTED_SHIFT_SERVICE_WRITE_RISK_OR_UNKNOWN');
 if(input.observation_read_only!==true)
  reasons.push('OBSERVATION_EFFECT_BOUNDARY_NOT_CONFIRMED');
 // An explicitly observed third-party approver name is not authentication.
 // User counts, owner IDs, attestations in JSON, and token labels cannot
 // silently replace an authorized human signature or independent witness.
 const r=uniq(reasons);
 return Object.freeze({
  schema:RESULT_SCHEMA,
  status:r.length?'HOLD':'REVIEW_ONLY_NOT_AUTHORIZED',
  reasons:r,
  operational_activation_allowed:false,
  human_authorization_inferred:false,
  effective_token_permissions_inferred:false,
  physical_print_authorized:false,
  host_effects:false
 });
}
module.exports={evaluate,SCHEMA,RESULT_SCHEMA,PROOFS};

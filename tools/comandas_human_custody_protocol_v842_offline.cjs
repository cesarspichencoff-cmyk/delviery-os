'use strict';
/**
 * V8.42: PURE, OFFLINE review of an UNTRUSTED event timeline.
 * Shape, ordering, request scope and replay-ID consistency only.
 * It does NOT authenticate a human/passkey, verify witness signatures,
 * establish an external failure domain, reserve a real nonce, make any
 * change to a shift or authorize an operational effect.
 */
const crypto = require('node:crypto');
const SCHEMA = 'deliveryos.comandas.v842.proposed-human-custody-protocol';
const RESULT = 'deliveryos.comandas.v842.protocol-review';
const STAGES = Object.freeze([
  ['REQUEST_CREATED', 'READER'],
  ['HUMAN_CONFIRMED', 'EXTERNAL_CUSTODY'],
  ['EXTERNAL_RESERVED', 'EXTERNAL_CUSTODY'],
  ['PROTECTED_WRITER_APPLIED', 'PROTECTED_WRITER'],
  ['EXTERNAL_SETTLED', 'EXTERNAL_CUSTODY'],
]);
const REQUEST_KEYS = Object.freeze(['request_id','store_id','shift_record_id','from_revision','to_revision','from_sha256','to_sha256','target_shift']);
const EVENT_KEYS = Object.freeze(['kind','actor_domain','request_sha256','authorization_id','observed_at_s','receipt_sha256','expires_at_s']);
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9:_-]{2,95}$/;
const equalsKeys=(o,ks)=>o && typeof o==='object' && !Array.isArray(o) &&
 Object.keys(o).length===ks.length && ks.every(k=>Object.hasOwn(o,k));
function digest(request){
 return crypto.createHash('sha256').update(Buffer.from(
   'DELIVERYOS-V842-REQUEST-SCOPE\n'+JSON.stringify(REQUEST_KEYS.map(k=>[k,request[k]]))+'\n','utf8')).digest('hex');
}
function review(input){
 const reasons=[];
 const add=(r)=>{if(!reasons.includes(r))reasons.push(r)};
 const answer=()=>Object.freeze({
  schema:RESULT,
  status:reasons.length?'HOLD':input.events.length===STAGES.length?'REVIEW_ONLY_UNTRUSTED_SEQUENCE_COHERENT':'HOLD',
  reasons:Object.freeze(reasons.slice()),
  requested_stages:STAGES.length,observed_stages:input&&Array.isArray(input.events)?input.events.length:0,
  authenticated_human_proven:false,
  transaction_display_binding_proven:false,
  cryptographic_witness_signature_verified:false,
  independent_failure_domain_proven:false,
  independent_clock_and_revocation_proven:false,
  atomic_external_nonce_reservation_proven:false,
  real_protected_writer_verified:false,
  local_state_change_proven:false,
  durable_external_settlement_proven:false,
  operational_authorization:false,
  production_shift_changed:false,
  host_effects:false,filesystem:false,network:false,sql:false,printer:false,service:false,teknisa:false
 });
 if(!equalsKeys(input,['schema','request','events'])||input.schema!==SCHEMA){add('ENVELOPE_INVALID');return answer()}
 const req=input.request;
 if(!equalsKeys(req,REQUEST_KEYS)){add('REQUEST_SHAPE_INVALID');return answer()}
 for(const k of ['request_id','store_id','shift_record_id'])if(typeof req[k]!=='string'||!ID.test(req[k]))add('REQUEST_ID_INVALID');
 if(!Number.isSafeInteger(req.from_revision)||req.from_revision<0||
   !Number.isSafeInteger(req.to_revision)||req.to_revision!==req.from_revision+1)add('REVISION_INVALID');
 if(!HEX.test(req.from_sha256)||!HEX.test(req.to_sha256)||req.from_sha256===req.to_sha256)add('PREPOST_HASH_INVALID');
 if(!['ALMOCO','JANTAR'].includes(req.target_shift))add('TARGET_SHIFT_INVALID');
 if(!Array.isArray(input.events)||input.events.length>STAGES.length){add('EVENT_COUNT_INVALID');return answer()}
 const d=digest(req);
 let auth=null, previousTime=0, expiration=null;
 for(let i=0;i<input.events.length;i++){
  const e=input.events[i];
  if(!equalsKeys(e,EVENT_KEYS)){add('EVENT_SHAPE_INVALID');continue}
  const [kind,domain]=STAGES[i];
  if(e.kind!==kind)add('ORDER_OR_DUPLICATE_INVALID');
  if(e.actor_domain!==domain)add('ROLE_CLAIM_MISMATCH');
  if(e.request_sha256!==d)add('SCOPE_DIGEST_MISMATCH');
  if(typeof e.receipt_sha256!=='string'||!HEX.test(e.receipt_sha256))add('RECEIPT_DIGEST_INVALID');
  if(!Number.isSafeInteger(e.observed_at_s)||e.observed_at_s<=previousTime){add('CLAIMED_TIME_ORDER_INVALID')}
  else previousTime=e.observed_at_s;
  if(i===0){if(e.authorization_id!==null||e.expires_at_s!==null)add('REQUEST_MUST_NOT_CONTAIN_GRANT')}
  else {
   if(typeof e.authorization_id!=='string'||!ID.test(e.authorization_id))add('AUTHORIZATION_ID_INVALID');
   if(auth===null)auth=e.authorization_id;
   else if(auth!==e.authorization_id)add('AUTHORIZATION_ID_CHANGED');
   if(i===2){
    if(!Number.isSafeInteger(e.expires_at_s)||e.expires_at_s<=e.observed_at_s||e.expires_at_s-e.observed_at_s>900)add('EXPIRY_INVALID');
    else expiration=e.expires_at_s;
   }else if(e.expires_at_s!==null)add('EXPIRY_FIELD_UNEXPECTED');
   if(i>=3&&expiration!==null&&e.observed_at_s>=expiration)add('CLAIMED_GRANT_EXPIRED');
  }
 }
 if(input.events.length<STAGES.length)add('PROTOCOL_INCOMPLETE_REQUIRES_RECONCILIATION');
 return answer();
}
module.exports={SCHEMA,RESULT,STAGES,digest,review};

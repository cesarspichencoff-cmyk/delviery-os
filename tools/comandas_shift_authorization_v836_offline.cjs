'use strict';
/**
 * V8.36 — OFFLINE and PURE review of shift-specific, synthetically signed evidence.
 * No human identity, independent timestamp, external revocation source, host ACL
 * or shift mutation is established by this module. Even a valid signature can
 * yield only REVIEW_ONLY; never activate production or print.
 *
 * The trusted request/key/clock/revocation/replay state must come from OUTSIDE
 * the signed input. This module does not authenticate their provenance.
 */
const crypto=require('node:crypto');
const SCHEMA='deliveryos.comandas.shift-authorization.v836.offline';
const TRUST='deliveryos.comandas.shift-trust.v836.offline';
const RESULT='deliveryos.comandas.shift-authorization-review.v836.offline';
const KEYS=Object.freeze([
 'schema','store_id','shift_record_id','from_revision','to_revision',
 'from_sha256','to_sha256','target_shift','authorization_id',
 'signer_id','key_id','issued_at_s','expires_at_s','signature_base64'
]);
const HEX=/^[a-f0-9]{64}$/;
const TOKEN=/^[a-zA-Z0-9][a-zA-Z0-9:_-]{2,95}$/;
const SHIFTS=new Set(['ALMOCO','JANTAR']);
const fields=Object.freeze(KEYS.filter(x=>x!=='signature_base64'));
const SIG=/^(?:[A-Za-z0-9+/]{4}){21}(?:[A-Za-z0-9+/]{2}==)$/; // Ed25519 64-byte signature
const badRecord=v=>!v||typeof v!=='object'||Array.isArray(v)||
 Object.keys(v).length!==KEYS.length||
 KEYS.some(k=>!Object.prototype.hasOwnProperty.call(v,k));
const equalRequest=(a,b)=>a.store_id===b.store_id&&
 a.shift_record_id===b.shift_record_id&&
 a.from_revision===b.from_revision&&a.to_revision===b.to_revision&&
 a.from_sha256===b.from_sha256&&a.to_sha256===b.to_sha256&&
 a.target_shift===b.target_shift;
function payloadBytes(record){
 if(!record||typeof record!=='object')throw Error('V836_NOT_AN_OBJECT');
 return Buffer.from('V836-SHIFT-AUTHORIZATION-OFFLINE\n'+
  JSON.stringify(fields.map(k=>[k,record[k]])),'utf8');
}
function keyDigest(publicKey){
 return crypto.createHash('sha256').update(
  crypto.createPublicKey(publicKey).export({type:'spki',format:'der'})).digest('hex');
}
function evaluate(record,trust){
 const reasons=[];
 const add=(reason)=>{if(!reasons.includes(reason))reasons.push(reason)};
 const answer=()=>Object.freeze({
  schema:RESULT,status:reasons.length?'HOLD':'REVIEW_ONLY_SYNTHETIC_SIGNATURE_VALID',
  reasons:Object.freeze([...reasons]),
  signature_verified:!reasons.length,operational_authorization:false,
  shift_update_authorized:false,real_human_authentication_proven:false,
  independent_revocation_proven:false,independent_clock_proven:false,
  replay_reservation_persisted:false,host_effects:false,
  sql:false,printer:false,service_modified:false
 });
 if(badRecord(record)||record.schema!==SCHEMA){add('ENVELOPE_INVALID');return answer()}
 if(!trust||typeof trust!=='object'||Array.isArray(trust)||
  trust.schema!==TRUST||trust.authority!=='EPHEMERAL_CI_TEST_CONTEXT_ONLY'){
  add('TRUST_NOT_INDEPENDENTLY_GROUNDED');return answer()
 }
 // Exact types/shape, no implicit number conversions or unapproved fields.
 for(const k of ['store_id','shift_record_id','authorization_id','signer_id','key_id']){
  if(typeof record[k]!=='string'||!TOKEN.test(record[k]))add('IDENTITY_OR_SCOPE_INVALID')
 }
 for(const k of ['from_sha256','to_sha256']){
  if(typeof record[k]!=='string'||!HEX.test(record[k]))add('DIGEST_INVALID')
 }
 if(!Number.isSafeInteger(record.from_revision)||record.from_revision<0||
    !Number.isSafeInteger(record.to_revision)||
    record.to_revision!==record.from_revision+1)add('REVISION_INVALID');
 if(!SHIFTS.has(record.target_shift))add('SHIFT_INVALID');
 if(!Number.isSafeInteger(record.issued_at_s)||
    !Number.isSafeInteger(record.expires_at_s)||
    record.issued_at_s<1||record.expires_at_s<=record.issued_at_s||
    record.expires_at_s-record.issued_at_s>900)add('WINDOW_INVALID');
 if(typeof record.signature_base64!=='string'||!SIG.test(record.signature_base64)||
    Buffer.from(record.signature_base64||'','base64').length!==64)
  add('SIGNATURE_ENCODING_INVALID');
 if(!trust.request||typeof trust.request!=='object'||Array.isArray(trust.request)||
    !equalRequest(record,trust.request))add('TRUSTED_REQUEST_MISMATCH');
 if(!Number.isSafeInteger(trust.now_s)||trust.now_s<1||
    !Number.isSafeInteger(trust.min_clock_s)||
    trust.now_s<trust.min_clock_s)add('TRUSTED_CLOCK_INVALID');
 else{
  if(trust.now_s<record.issued_at_s)add('AUTHORIZATION_NOT_YET_VALID');
  if(trust.now_s>=record.expires_at_s)add('AUTHORIZATION_EXPIRED');
 }
 if(!Number.isSafeInteger(trust.revocation_epoch)||trust.revocation_epoch<0||
    !Number.isSafeInteger(trust.required_revocation_epoch)||
    trust.revocation_epoch<trust.required_revocation_epoch)
  add('REVOCATION_SNAPSHOT_STALE');
 if(!Array.isArray(trust.revoked_signer_ids)||!Array.isArray(trust.revoked_key_ids)||
    !Array.isArray(trust.consumed_authorization_ids)||
    ![...trust.revoked_signer_ids,...trust.revoked_key_ids,...trust.consumed_authorization_ids]
    .every(s=>typeof s==='string'&&TOKEN.test(s)))add('TRUSTED_LISTS_INVALID');
 else{
  if(trust.revoked_signer_ids.includes(record.signer_id)||
     trust.revoked_key_ids.includes(record.key_id))add('SIGNER_REVOKED');
  if(trust.consumed_authorization_ids.includes(record.authorization_id))
   add('AUTHORIZATION_REPLAY');
 }
 if(trust.signer_id!==record.signer_id||trust.key_id!==record.key_id||
    trust.expected_authorization_id!==record.authorization_id)
  add('TRUSTED_SIGNER_OR_NONCE_MISMATCH');
 if(typeof trust.public_key_spki_pem!=='string'||
    typeof trust.public_key_sha256!=='string'||!HEX.test(trust.public_key_sha256)){
  add('TRUSTED_KEY_PIN_INVALID');
 }else{
  try{
   const key=crypto.createPublicKey(trust.public_key_spki_pem);
   if(key.asymmetricKeyType!=='ed25519'||keyDigest(key)!==trust.public_key_sha256){
    add('TRUSTED_KEY_PIN_MISMATCH');
   }else if(!reasons.includes('SIGNATURE_ENCODING_INVALID')){
    if(!crypto.verify(null,payloadBytes(record),key,
        Buffer.from(record.signature_base64,'base64')))
      add('SIGNATURE_INVALID');
   }
  }catch{add('TRUSTED_KEY_INVALID')}
 }
 // A valid signed envelope is NOT evidence that trusted state is authentic,
 // that the signer is a human, or that a nonce was atomically reserved.
 return answer();
}
module.exports={SCHEMA,TRUST,RESULT,fields,payloadBytes,keyDigest,evaluate};

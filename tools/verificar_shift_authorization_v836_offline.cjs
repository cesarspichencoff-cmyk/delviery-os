'use strict';
// V8.36 — adversarial ephemeral Ed25519 signatures; NO real authorizations.
// Private keys exist only in this process and never in repository files.
const assert=require('node:assert/strict'),c=require('node:crypto');
const {SCHEMA,TRUST,RESULT,payloadBytes,keyDigest,evaluate}=require('./comandas_shift_authorization_v836_offline.cjs');
const hash=x=>c.createHash('sha256').update(x).digest('hex');
const keys=c.generateKeyPairSync('ed25519'),other=c.generateKeyPairSync('ed25519');
const pem=k=>k.export({format:'pem',type:'spki'}).toString();
const now=1800000000; // fixture time, NOT wall clock
const unsigned={
 schema:SCHEMA,store_id:'TATA_TEST_MOOCA',shift_record_id:'SHIFT_TEST_001',
 from_revision:15,to_revision:16,from_sha256:hash('fictional-before'),
 to_sha256:hash('fictional-after'),target_shift:'JANTAR',
 authorization_id:'test_shift_auth_001',signer_id:'test_person_001',
 key_id:'test_key_001',issued_at_s:now-20,expires_at_s:now+240
};
const sign=(v,privateKey=keys.privateKey)=>({...v,
 signature_base64:c.sign(null,payloadBytes(v),privateKey).toString('base64')});
const signed=sign(unsigned);
const trust={
 schema:TRUST,authority:'EPHEMERAL_CI_TEST_CONTEXT_ONLY',
 request:{store_id:unsigned.store_id,shift_record_id:unsigned.shift_record_id,
  from_revision:unsigned.from_revision,to_revision:unsigned.to_revision,
  from_sha256:unsigned.from_sha256,to_sha256:unsigned.to_sha256,
  target_shift:unsigned.target_shift},
 now_s:now,min_clock_s:now-30,
 revocation_epoch:18,required_revocation_epoch:18,
 revoked_signer_ids:[],revoked_key_ids:[],consumed_authorization_ids:[],
 signer_id:unsigned.signer_id,key_id:unsigned.key_id,
 expected_authorization_id:unsigned.authorization_id,
 public_key_spki_pem:pem(keys.publicKey),
 public_key_sha256:keyDigest(keys.publicKey)
};
let count=0;
function check(name,fn){try{fn();count++}catch(e){e.message='CASE '+(count+1)+' '+name+': '+e.message;throw e}}
function noAction(r){
 assert.equal(r.schema,RESULT);
 for(const field of ['operational_authorization','shift_update_authorized',
  'real_human_authentication_proven','independent_revocation_proven',
  'independent_clock_proven','replay_reservation_persisted','host_effects',
  'sql','printer','service_modified'])assert.equal(r[field],false);
}
function blocked(record,t,reason){
 const r=evaluate(record,t);noAction(r);
 assert.equal(r.status,'HOLD',JSON.stringify(r));
 assert.ok(r.reasons.includes(reason),JSON.stringify(r));
 assert.equal(r.signature_verified,false);
}
function review(record,t){
 const r=evaluate(record,t);noAction(r);
 assert.equal(r.status,'REVIEW_ONLY_SYNTHETIC_SIGNATURE_VALID',JSON.stringify(r));
 assert.equal(r.signature_verified,true);assert.deepEqual(r.reasons,[]);
}
const env=x=>({...signed,...x}),ctx=x=>({...trust,...x});
check('valid signature can only be reviewed',()=>review(signed,trust));
check('missing trust blocks',()=>blocked(signed,null,'TRUST_NOT_INDEPENDENTLY_GROUNDED'));
check('empty trust blocks',()=>blocked(signed,{},'TRUST_NOT_INDEPENDENTLY_GROUNDED'));
check('fake production authority label blocks',()=>blocked(signed,ctx({authority:'PRODUCTION_APPROVED'}),'TRUST_NOT_INDEPENDENTLY_GROUNDED'));
check('wrong schema blocks',()=>blocked(env({schema:'bad'}),trust,'ENVELOPE_INVALID'));
check('missing signature blocks',()=>{const e={...signed};delete e.signature_base64;blocked(e,trust,'ENVELOPE_INVALID')});
check('extra human approved field blocks',()=>blocked(env({human_approved:true}),trust,'ENVELOPE_INVALID'));
check('array blocks',()=>blocked([],trust,'ENVELOPE_INVALID'));
check('null blocks',()=>blocked(null,trust,'ENVELOPE_INVALID'));
check('wrong signing key blocks',()=>blocked(sign(unsigned,other.privateKey),trust,'SIGNATURE_INVALID'));
check('public key swap without pin blocks',()=>blocked(signed,ctx({public_key_spki_pem:pem(other.publicKey)}),'TRUSTED_KEY_PIN_MISMATCH'));
check('malformed pin blocks',()=>blocked(signed,ctx({public_key_sha256:'not-a-pin'}),'TRUSTED_KEY_PIN_INVALID'));
check('incorrect pin blocks',()=>blocked(signed,ctx({public_key_sha256:hash('fake')}),'TRUSTED_KEY_PIN_MISMATCH'));
check('missing key blocks',()=>blocked(signed,ctx({public_key_spki_pem:null}),'TRUSTED_KEY_PIN_INVALID'));
check('entire substituted signer context remains only review',()=>{
 const fake=sign({...unsigned,authorization_id:'fake_context_001'},other.privateKey);
 review(fake,ctx({expected_authorization_id:'fake_context_001',
  public_key_spki_pem:pem(other.publicKey),public_key_sha256:keyDigest(other.publicKey)}))
});
check('changed signature blocks',()=>blocked(env({signature_base64:
 (signed.signature_base64[0]==='A'?'B':'A')+signed.signature_base64.slice(1)}),
 trust,'SIGNATURE_INVALID'));
check('malformed base64 blocks',()=>blocked(env({signature_base64:'not-base64'}),trust,'SIGNATURE_ENCODING_INVALID'));
check('null signer blocks',()=>blocked(env({signer_id:null}),trust,'IDENTITY_OR_SCOPE_INVALID'));
check('short authorization ID blocks',()=>blocked(env({authorization_id:'x'}),trust,'IDENTITY_OR_SCOPE_INVALID'));
for(const [field,badValue,reason] of [
 ['store_id','OTHER_STORE_001','TRUSTED_REQUEST_MISMATCH'],
 ['shift_record_id','OTHER_SHIFT_001','TRUSTED_REQUEST_MISMATCH'],
 ['target_shift','ALMOCO','TRUSTED_REQUEST_MISMATCH'],
 ['target_shift','INVALID','SHIFT_INVALID'],
 ['from_sha256',hash('tampered'), 'TRUSTED_REQUEST_MISMATCH'],
 ['to_sha256',hash('tampered'), 'TRUSTED_REQUEST_MISMATCH'],
 ['from_revision',14,'TRUSTED_REQUEST_MISMATCH'],
 ['to_revision',19,'REVISION_INVALID'],
 ['to_revision','16','REVISION_INVALID'],
 ['from_sha256','','DIGEST_INVALID']
]){
 check(field+' altered blocks',()=>blocked(env({[field]:badValue}),trust,reason));
}
check('consumed nonce blocks',()=>blocked(signed,ctx({consumed_authorization_ids:[signed.authorization_id]}),'AUTHORIZATION_REPLAY'));
check('revoked signer blocks',()=>blocked(signed,ctx({revoked_signer_ids:[signed.signer_id]}),'SIGNER_REVOKED'));
check('revoked key blocks',()=>blocked(signed,ctx({revoked_key_ids:[signed.key_id]}),'SIGNER_REVOKED'));
check('stale revocation epoch blocks',()=>blocked(signed,ctx({revocation_epoch:17}),'REVOCATION_SNAPSHOT_STALE'));
check('missing revocation data blocks',()=>blocked(signed,ctx({revoked_key_ids:null}),'TRUSTED_LISTS_INVALID'));
check('invalid replay list blocks',()=>blocked(signed,ctx({consumed_authorization_ids:['']}),'TRUSTED_LISTS_INVALID'));
check('wrong trust signer blocks',()=>blocked(signed,ctx({signer_id:'other_signer_001'}),'TRUSTED_SIGNER_OR_NONCE_MISMATCH'));
check('wrong trust key id blocks',()=>blocked(signed,ctx({key_id:'other_key_001'}),'TRUSTED_SIGNER_OR_NONCE_MISMATCH'));
check('wrong expected nonce blocks',()=>blocked(signed,ctx({expected_authorization_id:'test_shift_auth_002'}),'TRUSTED_SIGNER_OR_NONCE_MISMATCH'));
check('missing request blocks',()=>blocked(signed,ctx({request:null}),'TRUSTED_REQUEST_MISMATCH'));
check('at expiry blocks',()=>blocked(signed,ctx({now_s:signed.expires_at_s}),'AUTHORIZATION_EXPIRED'));
check('past expiry blocks',()=>blocked(signed,ctx({now_s:signed.expires_at_s+1}),'AUTHORIZATION_EXPIRED'));
check('future issued blocks',()=>blocked(signed,ctx({now_s:signed.issued_at_s-1,min_clock_s:signed.issued_at_s-2}),'AUTHORIZATION_NOT_YET_VALID'));
check('missing trusted clock blocks',()=>blocked(signed,ctx({now_s:null}),'TRUSTED_CLOCK_INVALID'));
check('clock behind pin blocks',()=>blocked(signed,ctx({now_s:now-50}),'TRUSTED_CLOCK_INVALID'));
check('clock typed string blocks',()=>blocked(signed,ctx({now_s:String(now)}),'TRUSTED_CLOCK_INVALID'));
check('too long authorization window blocks',()=>blocked(sign({...unsigned,expires_at_s:now+999}),trust,'WINDOW_INVALID'));
check('expiry before issued blocks',()=>blocked(sign({...unsigned,expires_at_s:unsigned.issued_at_s}),trust,'WINDOW_INVALID'));
check('nonintegral issued time blocks',()=>blocked(sign({...unsigned,issued_at_s:now+0.5}),trust,'WINDOW_INVALID'));
check('one second before expiry still only review',()=>review(signed,ctx({now_s:signed.expires_at_s-1})));
check('new signed authorization for next revision still only review',()=>{
 const next={...unsigned,authorization_id:'test_shift_auth_004',
  from_revision:16,to_revision:17,from_sha256:unsigned.to_sha256,
  to_sha256:hash('synthetic-revision-17')};
 review(sign(next),ctx({request:{...trust.request,
  from_revision:16,to_revision:17,from_sha256:next.from_sha256,to_sha256:next.to_sha256},
  expected_authorization_id:next.authorization_id}));
});
check('old signature moved to new revision blocks',()=>blocked(signed,
 ctx({request:{...trust.request,from_revision:16,to_revision:17}}),'TRUSTED_REQUEST_MISMATCH'));
check('changed target with matching request invalidates signature',()=>blocked(
 env({target_shift:'ALMOCO'}),ctx({request:{...trust.request,target_shift:'ALMOCO'}}),'SIGNATURE_INVALID'));
check('changed signer with matching trust invalidates signature',()=>blocked(
 env({signer_id:'other_signer_001'}),ctx({signer_id:'other_signer_001'}),'SIGNATURE_INVALID'));
check('valid nonce repeated without durable reservation is NEVER actual approval',()=>review(signed,trust));
check('pure verifier requires no filesystem',()=>{
 const fs=require('node:fs'),read=fs.readFileSync;
 try{fs.readFileSync=()=>{throw Error('DISK_FORBIDDEN')};review(signed,trust)}
 finally{fs.readFileSync=read}
});
console.log(JSON.stringify({
 schema:'deliveryos.comandas.v836.signed-shift-authorization-adversarial',
 status:'PASS',checks:count,keys_disposable_in_memory:true,
 real_human_identity_authenticated:false,independent_revocation_source_proven:false,
 trusted_clock_proven:false,persistent_nonce_reservation_proven:false,
 operational_shift_authorized:false,actual_host_token_tested:false,
 sql:false,service:false,printer:false,teknisa:false
}));

'use strict';
/**
 * V8.39 integrated V8.36 + V8.37 + V8.38 Windows actual-token exercise.
 * Test modes are controlled by the parent PowerShell runner in ephemeral CI.
 * No private signing key is saved. All receipts are review-only synthetic.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {SCHEMA:AUTH,TRUST,payloadBytes,keyDigest,evaluate}=
 require('./comandas_shift_authorization_v836_offline.cjs');
const {reserve,inspect,rootGuard}=require('./comandas_shift_nonce_v837_sandbox.cjs');
const mode=process.argv[2],root=process.argv[3];
const manifest=path.join(root,'signed-fixture.json');
const evidence=path.join(root,'runtime');
const ledger=rootGuard(root);
if(!ledger)throw Error('V839_HOST_AND_MARKER_UNVERIFIED');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const fp=s=>crypto.createHash('sha256').update(s).digest('hex');
function fileOf(record){return path.join(ledger,sha(record.authorization_id)+'.json')}
function load(){return JSON.parse(fs.readFileSync(manifest,'utf8'))}
function writeEvidence(name,data){
 fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(data),{flag:'wx'});
}
function isPermissionDenied(call){
 try{call();return false}catch(e){
  if(e&&['EACCES','EPERM'].includes(e.code))return true;
  throw e;
 }
}
function noProduction(result){
 assert.equal(result.operational_shift_authorized,false);
 assert.equal(result.real_human_authentication_proven,false);
 assert.equal(result.production_effects,false);
 assert.equal(result.shift_update_authorized,false);
}
function assertNoReceipt(id){
 assert.equal(fs.existsSync(path.join(ledger,sha(id)+'.json')),false);
}
if(mode==='setup'){
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const now=1800000000; // NOT the current clock.
 const unsigned={
  schema:AUTH,store_id:'TATA_TEST_ITAM_FAKE',shift_record_id:'LAB_SHIFT_001',
  from_revision:2,to_revision:3,from_sha256:sha('lab-before'),
  to_sha256:sha('lab-after'),target_shift:'JANTAR',
  authorization_id:'v839_synthetic_single_use_001',
  signer_id:'v839_not_real_human',key_id:'v839_ephemeral_key_001',
  issued_at_s:now-30,expires_at_s:now+300
 };
 const signed={...unsigned,signature_base64:
  crypto.sign(null,payloadBytes(unsigned),privateKey).toString('base64')};
 const trust={
  schema:TRUST,authority:'EPHEMERAL_CI_TEST_CONTEXT_ONLY',
  request:{store_id:unsigned.store_id,
   shift_record_id:unsigned.shift_record_id,
   from_revision:unsigned.from_revision,to_revision:unsigned.to_revision,
   from_sha256:unsigned.from_sha256,to_sha256:unsigned.to_sha256,
   target_shift:unsigned.target_shift},
  now_s:now,min_clock_s:now-80,
  revocation_epoch:3,required_revocation_epoch:3,
  revoked_signer_ids:[],revoked_key_ids:[],consumed_authorization_ids:[],
  signer_id:unsigned.signer_id,key_id:unsigned.key_id,
  expected_authorization_id:unsigned.authorization_id,
  public_key_spki_pem:publicKey.export({type:'spki',format:'pem'}).toString(),
  public_key_sha256:keyDigest(publicKey)
 };
 assert.equal(evaluate(signed,trust).status,'REVIEW_ONLY_SYNTHETIC_SIGNATURE_VALID');
 fs.writeFileSync(manifest,JSON.stringify({signed,trust}),{flag:'wx'});
 // Key material deliberately released with the parent node process.
 console.log(JSON.stringify({schema:'deliveryos.v839.setup',
  signed_fixture_created:true,private_signing_key_written:false,
  signature_verified_for_review_only:true}));
 process.exit(0);
}
const {signed,trust}=load();
const dest=fileOf(signed);
assert.equal(evaluate(signed,trust).status,'REVIEW_ONLY_SYNTHETIC_SIGNATURE_VALID');
if(mode==='reader-before'){
 const result=reserve(root,signed,trust);
 noProduction(result);
 assert.equal(result.status,'HOLD');
 assert.equal(result.reason,'EXCLUSIVE_CREATE_FAILED');
 assertNoReceipt(signed.authorization_id);
 const sibling=path.join(ledger,'v839-forged-sibling.json');
 const blocked=isPermissionDenied(()=>fs.writeFileSync(sibling,'FORGED',{flag:'wx'}));
 assert.equal(blocked,true);
 assert.equal(fs.existsSync(sibling),false);
 writeEvidence('reader-before',{reader_reserve_hold:true,
  reader_cannot_create_nonce:true,reader_cannot_forge_sibling:true,
  no_production_authorization:true});
}else if(mode==='custodian-negative'){
 const unsignedWrong={...signed,to_sha256:sha('scope-tampered')};
 const tampered=reserve(root,unsignedWrong,trust);
 noProduction(tampered);
 assert.equal(tampered.status,'HOLD');
 assert.equal(tampered.reason,'SIGNED_SCOPE_OR_TRUST_NOT_VALID');
 const expired=reserve(root,signed,{...trust,now_s:signed.expires_at_s});
 noProduction(expired);
 assert.equal(expired.reason,'SIGNED_SCOPE_OR_TRUST_NOT_VALID');
 const revoked=reserve(root,signed,{...trust,revoked_key_ids:[signed.key_id]});
 noProduction(revoked);
 assert.equal(revoked.reason,'SIGNED_SCOPE_OR_TRUST_NOT_VALID');
 const stale=reserve(root,signed,{...trust,required_revocation_epoch:4});
 noProduction(stale);
 assert.equal(stale.reason,'SIGNED_SCOPE_OR_TRUST_NOT_VALID');
 assertNoReceipt(signed.authorization_id);
 writeEvidence('custodian-negative',{tampered_signature_hold:true,
  expired_hold:true,revoked_hold:true,stale_revocation_hold:true,
  no_unverified_reservation:true});
}else if(mode==='custodian-reserve'){
 const result=reserve(root,signed,trust);
 noProduction(result);
 assert.equal(result.status,'SYNTHETIC_NONCE_RESERVED_REVIEW_ONLY');
 assert.equal(result.reservation_recorded_locally,true);
 assert.equal(inspect(root,signed).reason,'NONCE_ALREADY_RESERVED');
 const data=JSON.parse(fs.readFileSync(dest,'utf8'));
 assert.equal(data.envelope_sha256,sha(JSON.stringify(signed)));
 assert.equal(data.human_authorization_proven,false);
 assert.equal(data.operational_authorized,false);
 writeEvidence('custodian-reserve',{v836_signed_scope_validated:true,
  v837_exclusive_nonce_created:true,reservation_review_only:true,
  no_human_authorization:true,no_shift_mutation:true});
}else if(mode==='reader-after'){
 assert.equal(inspect(root,signed).reason,'NONCE_ALREADY_RESERVED');
 const before=fp(fs.readFileSync(dest));
 const readable=fs.readFileSync(dest,'utf8').includes('RESERVED_UNCONFIRMED');
 const writeDenied=isPermissionDenied(()=>fs.writeFileSync(dest,'CORRUPTED'));
 const deleteDenied=isPermissionDenied(()=>fs.unlinkSync(dest));
 const renameDenied=isPermissionDenied(()=>fs.renameSync(dest,path.join(ledger,'other.json')));
 const siblingDenied=isPermissionDenied(()=>fs.writeFileSync(
  path.join(ledger,'v839-forged-sibling.json'),'FORGED',{flag:'wx'}));
 const reserveReplay=reserve(root,signed,trust);
 noProduction(reserveReplay);
 assert.equal(reserveReplay.reason,'NONCE_ALREADY_RESERVED');
 const unchanged=fp(fs.readFileSync(dest))===before;
 assert.ok(readable&&writeDenied&&deleteDenied&&renameDenied&&siblingDenied&&unchanged);
 assert.equal(fs.readdirSync(ledger).length,1);
 writeEvidence('reader-after',{can_read:true,cannot_overwrite:true,
  cannot_delete:true,cannot_rename:true,cannot_create_sibling:true,
  sha_unchanged:true,reader_replay_refused:true});
}else if(mode==='custodian-replay'){
 const before=fp(fs.readFileSync(dest));
 const result=reserve(root,signed,trust);
 noProduction(result);
 assert.equal(result.status,'HOLD');
 assert.equal(result.reason,'NONCE_ALREADY_RESERVED');
 assert.equal(before,fp(fs.readFileSync(dest)));
 assert.equal(fs.readdirSync(ledger).length,1);
 writeEvidence('custodian-replay',{second_consumption_refused:true,
  unchanged:true});
}else{
 throw Error('V839_UNKNOWN_ROLE');
}

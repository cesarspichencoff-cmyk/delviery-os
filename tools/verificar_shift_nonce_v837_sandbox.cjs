'use strict';
// V8.37 - real concurrent and hard-crash Node processes on GitHub hosted runners.
// Ephemeral Ed25519 signing keys only in this parent process. No real shift.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {SCHEMA:AUTH,TRUST,payloadBytes,keyDigest}=
 require('./comandas_shift_authorization_v836_offline.cjs');
const {inspect,reserve}=require('./comandas_shift_nonce_v837_sandbox.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const now=1800000000;
const toPem=key=>key.export({type:'spki',format:'pem'}).toString();
const pair=crypto.generateKeyPairSync('ed25519');
const other=crypto.generateKeyPairSync('ed25519');
const report={schema:'deliveryos.comandas.v837.hosted-single-use-nonce',
 status:'PASS',checks:0,
 simultaneous_node_processes_tested:true,
 atomic_exclusive_file_creation_tested:true,
 crash_after_open_fails_closed:true,
 crash_after_fsync_replay_refused:true,
 signed_scope_verified_before_local_reservation:true,
 replay_prevented_across_process_restart:true,
 corrupt_receipts_never_auto_repaired:true,
 actual_windows_distinct_user_tokens_tested:false,
 power_loss_durability_proven:false,
 real_human_authentication_proven:false,
 independent_external_ledger_proven:false,
 operational_shift_authorized:false,
 temp_root_removed:false,production_effects:false,teknisa:false,
 sql:false,printer:false,service:false
};
let root='';
function check(name,fn){try{fn();report.checks++}catch(e){e.message='V837 CHECK '+(report.checks+1)+' '+name+': '+e.message;throw e}}
function identity(id){
 const unsigned={
  schema:AUTH,store_id:'TEST_TATA_MOOCA',shift_record_id:'TEST_SHIFT_001',
  from_revision:7,to_revision:8,from_sha256:sha('synthetic-shift-before'),
  to_sha256:sha('synthetic-shift-after'),target_shift:'JANTAR',
  authorization_id:id,signer_id:'test_approver_only',
  key_id:'test_ephemeral_key',issued_at_s:now-50,expires_at_s:now+150
 };
 const signed={...unsigned,signature_base64:
  crypto.sign(null,payloadBytes(unsigned),pair.privateKey).toString('base64')};
 const trust={
  schema:TRUST,authority:'EPHEMERAL_CI_TEST_CONTEXT_ONLY',
  request:{
   store_id:unsigned.store_id,shift_record_id:unsigned.shift_record_id,
   from_revision:unsigned.from_revision,to_revision:unsigned.to_revision,
   from_sha256:unsigned.from_sha256,to_sha256:unsigned.to_sha256,
   target_shift:unsigned.target_shift
  },
  now_s:now,min_clock_s:now-100,
  revocation_epoch:20,required_revocation_epoch:20,
  revoked_signer_ids:[],revoked_key_ids:[],consumed_authorization_ids:[],
  signer_id:unsigned.signer_id,key_id:unsigned.key_id,
  expected_authorization_id:unsigned.authorization_id,
  public_key_spki_pem:toPem(pair.publicKey),
  public_key_sha256:keyDigest(pair.publicKey)
 };
 return {signed,trust};
}
function childProcess(caseId,mode='none'){
 return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[__filename,'child',root,caseId,mode],{
   cwd:__dirname,windowsHide:true,env:process.env,stdio:['ignore','pipe','pipe']});
  let out='',err='';
  const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('V837_CHILD_TIMEOUT'))},17000);
  p.stdout.on('data',b=>out+=b.toString());
  p.stderr.on('data',b=>err+=b.toString());
  p.on('error',e=>{clearTimeout(timer);reject(e)});
  p.on('close',(exit,signal)=>{
   clearTimeout(timer);
   const lines=out.trim().split(/\r?\n/).filter(Boolean);
   let json=null;
   try{if(lines.length)json=JSON.parse(lines[lines.length-1])}catch{}
   resolve({exit,signal,json,stderr:err.slice(0,250)});
  });
 });
}
function saveFixture(tag,entry){
 fs.writeFileSync(path.join(root,tag+'.json'),JSON.stringify(entry),{flag:'wx'});
}
function fixture(tag){
 return JSON.parse(fs.readFileSync(path.join(root,tag+'.json'),'utf8'));
}
function noAction(result){
 assert.equal(result.operational_shift_authorized,false);
 assert.equal(result.real_human_authentication_proven,false);
 assert.equal(result.independent_trust_proven,false);
 assert.equal(result.production_effects,false);
}
if(process.argv[2]==='child'){
 const [, , ,sandbox,tag,mode]=process.argv;
 const v=JSON.parse(fs.readFileSync(path.join(sandbox,tag+'.json'),'utf8'));
 const result=reserve(sandbox,v.signed,v.trust,{testCrashAt:mode});
 process.stdout.write(JSON.stringify(result)+'\n');
 process.exit(result.status==='SYNTHETIC_NONCE_RESERVED_REVIEW_ONLY'?0:75);
}
async function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||
    process.env.RUNNER_ENVIRONMENT!=='github-hosted'||
    !process.env.RUNNER_TEMP)throw Error('V837_HOSTED_RUNNER_ONLY');
 root=path.join(process.env.RUNNER_TEMP,'vertice_nonce_v837_'+crypto.randomBytes(6).toString('hex'));
 const base=path.resolve(process.env.RUNNER_TEMP)+path.sep;
 assert.ok(path.resolve(root).startsWith(base));
 fs.mkdirSync(root,{recursive:false});
 fs.mkdirSync(path.join(root,'nonce-ledger'));
 fs.writeFileSync(path.join(root,'V837_TEST_ONLY'),'EPHEMERAL_REVIEW_ONLY',{flag:'wx'});
 let complete=false;
 try{
  const concurrent=identity('test_auth_race_001');
  saveFixture('race',concurrent);
  check('missing external trust cannot create receipt',()=>{
   const r=reserve(root,concurrent.signed,null);noAction(r);
   assert.equal(r.status,'HOLD');
   assert.equal(fs.readdirSync(path.join(root,'nonce-ledger')).length,0);
  });
  check('altered signature cannot create receipt',()=>{
   const invalid={...concurrent.signed,store_id:'OTHER_TEST_STORE'};
   const r=reserve(root,invalid,concurrent.trust);noAction(r);
   assert.equal(r.status,'HOLD');
   assert.equal(fs.readdirSync(path.join(root,'nonce-ledger')).length,0);
  });
  check('expired signature cannot create receipt',()=>{
   const r=reserve(root,concurrent.signed,{
    ...concurrent.trust,now_s:concurrent.signed.expires_at_s
   });noAction(r);assert.equal(r.status,'HOLD');
   assert.equal(fs.readdirSync(path.join(root,'nonce-ledger')).length,0);
  });
  check('revoked signer cannot create receipt',()=>{
   const r=reserve(root,concurrent.signed,{
    ...concurrent.trust,revoked_signer_ids:[concurrent.signed.signer_id]
   });noAction(r);assert.equal(r.status,'HOLD');
   assert.equal(fs.readdirSync(path.join(root,'nonce-ledger')).length,0);
  });
  check('stale revocation cannot create receipt',()=>{
   const r=reserve(root,concurrent.signed,{
    ...concurrent.trust,required_revocation_epoch:21
   });noAction(r);assert.equal(r.status,'HOLD');
   assert.equal(fs.readdirSync(path.join(root,'nonce-ledger')).length,0);
  });
  check('pre-consumed authorization blocks before local reserve',()=>{
   const r=reserve(root,concurrent.signed,{
    ...concurrent.trust,consumed_authorization_ids:[concurrent.signed.authorization_id]
   });noAction(r);assert.equal(r.status,'HOLD');
   assert.equal(fs.readdirSync(path.join(root,'nonce-ledger')).length,0);
  });
  check('out-of-temp route always HOLD',()=>{
   const r=reserve(path.dirname(root),concurrent.signed,concurrent.trust);
   assert.equal(r.status,'HOLD');noAction(r);
  });
  const racing=await Promise.all(Array.from({length:6},()=>childProcess('race')));
  check('6 actual simultaneous processes produce exactly ONE reservation',()=>{
   const winner=racing.filter(x=>x.exit===0&&
    x.json?.status==='SYNTHETIC_NONCE_RESERVED_REVIEW_ONLY');
   const losers=racing.filter(x=>x.exit===75&&x.json?.reason==='NONCE_ALREADY_RESERVED');
   assert.equal(winner.length,1,JSON.stringify(racing));
   assert.equal(losers.length,5,JSON.stringify(racing));
   for(const x of racing)noAction(x.json);
  });
  check('read-only inspection denies all subsequent use',()=>{
   const r=inspect(root,concurrent.signed);noAction(r);
   assert.equal(r.reason,'NONCE_ALREADY_RESERVED');
  });
  const retry=await childProcess('race');
  check('process restart cannot replay existing nonce',()=>{
   assert.equal(retry.exit,75);
   assert.equal(retry.json?.reason,'NONCE_ALREADY_RESERVED');
  });
  // The *same* ID but another correctly re-signed scoped request must not
  // consume or replace the already-reserved authorization.
  const altered={...concurrent.signed,to_revision:9};
  // Mutate old/new revision while retaining the same authorization id.
  const newPayload={...concurrent.signed,from_revision:8,to_revision:9,
   from_sha256:concurrent.signed.to_sha256,to_sha256:sha('test-future-shift')};
  delete newPayload.signature_base64;
  const newSigned={...newPayload,signature_base64:
   crypto.sign(null,payloadBytes(newPayload),pair.privateKey).toString('base64')};
  const newTrust={...concurrent.trust,request:{...concurrent.trust.request,
   from_revision:8,to_revision:9,from_sha256:newPayload.from_sha256,
   to_sha256:newPayload.to_sha256}};
  saveFixture('borrowed',{signed:newSigned,trust:newTrust});
  const borrowed=await childProcess('borrowed');
  check('nonce cannot be borrowed by a different valid signed revision',()=>{
   assert.equal(borrowed.exit,75);
   assert.equal(borrowed.json?.reason,'EXISTING_RECEIPT_UNTRUSTED_OR_AMBIGUOUS');
  });
  const corrupt=identity('test_auth_corrupt_001');
  saveFixture('corrupt',corrupt);
  const ok=await childProcess('corrupt');
  check('ordinary independent reservation succeeds only as review',()=>{
   assert.equal(ok.exit,0);assert.equal(ok.json?.shift_update_authorized,false);
  });
  const destination=path.join(root,'nonce-ledger',sha(corrupt.signed.authorization_id)+'.json');
  fs.writeFileSync(destination,'CORRUPTED_EXISTING_RECEIPT');
  const damaged=await childProcess('corrupt');
  check('corrupted receipt stays HOLD and is never automatically repaired',()=>{
   assert.equal(damaged.exit,75);
   assert.equal(damaged.json?.reason,'EXISTING_RECEIPT_UNTRUSTED_OR_AMBIGUOUS');
   assert.equal(fs.readFileSync(destination,'utf8'),'CORRUPTED_EXISTING_RECEIPT');
  });
  const open=identity('test_auth_crash_open_001');
  saveFixture('crashOpen',open);
  const killedDuringOpen=await childProcess('crashOpen','after_open');
  check('hard crash after exclusive OPEN leaves ambiguity, never permission',()=>{
   assert.notEqual(killedDuringOpen.exit,0);
   assert.equal(inspect(root,open.signed).reason,'RECEIPT_AMBIGUOUS');
  });
  const deniedOpen=await childProcess('crashOpen');
  check('post-open crash cannot retry or delete ambiguous receipt',()=>{
   assert.equal(deniedOpen.exit,75);
   assert.equal(deniedOpen.json?.reason,'EXISTING_RECEIPT_UNTRUSTED_OR_AMBIGUOUS');
  });
  const flushed=identity('test_auth_crash_fsync_001');
  saveFixture('crashFsync',flushed);
  const killedAfterFsync=await childProcess('crashFsync','after_fsync');
  check('hard crash AFTER fsync preserves consumed nonce across process death',()=>{
   assert.notEqual(killedAfterFsync.exit,0);
   assert.equal(inspect(root,flushed.signed).reason,'NONCE_ALREADY_RESERVED');
  });
  const deniedFsync=await childProcess('crashFsync');
  check('post-fsync crash restart never treats reservation as free',()=>{
   assert.equal(deniedFsync.exit,75);
   assert.equal(deniedFsync.json?.reason,'NONCE_ALREADY_RESERVED');
  });
  check('no receipt ever grants shift or print authorization',()=>{
   for(const tag of ['race','corrupt','crashOpen','crashFsync']){
    const {signed}=fixture(tag);noAction(inspect(root,signed));
   }
  });
  check('all local ledger files are isolated within temporary sandbox',()=>{
   const names=fs.readdirSync(path.join(root,'nonce-ledger'));
   assert.equal(names.length,4);
   assert.ok(names.every(n=>/^[a-f0-9]{64}\.json$/.test(n)));
  });
  complete=true;
 }finally{
  // Removing only a marker-pinned fresh directory under RUNNER_TEMP.
  if(fs.existsSync(root)&&fs.readFileSync(path.join(root,'V837_TEST_ONLY'),'utf8')==='EPHEMERAL_REVIEW_ONLY'){
   fs.rmSync(root,{recursive:true,force:true});
  }
  report.temp_root_removed=!fs.existsSync(root);
 }
 if(!complete||!report.temp_root_removed)throw Error('V837_PROOF_OR_CLEANUP_INCOMPLETE');
 assert.equal(report.checks,18,'V837_CASE_COUNT_DRIFT');
 console.log(JSON.stringify(report));
}
if(process.argv[2]!=='child')main().catch(e=>{console.error(e.stack||String(e));process.exitCode=1});

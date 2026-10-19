'use strict';
/**
 * V8.37: EPHEMERAL CI-ONLY local nonce-reservation fixture.
 * Combines V8.36 signature REVIEW with atomic O_EXCL (wx) admission.
 * If a crash leaves an empty or partial receipt, fail CLOSED; never repair.
 *
 * Caller-controlled files are NOT independent human custody, time, revocation,
 * power-loss durability, a real reader token, or production authorization.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {evaluate}=require('./comandas_shift_authorization_v836_offline.cjs');
const SCHEMA='deliveryos.comandas.v837.synthetic-nonce-record';
const RESULT='deliveryos.comandas.v837.nonce-reservation-result';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const status=(state,reason,extra={})=>Object.freeze({
 schema:RESULT,status:state,reason,...extra,
 independent_trust_proven:false,human_authenticated:false,
 clock_authority_proven:false,external_revocation_proven:false,
 power_failure_durability_proven:false,
 operational_shift_authorized:false,
 process_crash_persistence_only:true,production_effects:false,
 sql:false,printer:false,teknisa:false,service:false
});
function rootGuard(root){
 if(process.env.GITHUB_ACTIONS!=='true'||
    process.env.RUNNER_ENVIRONMENT!=='github-hosted'||
    !process.env.RUNNER_TEMP)return null;
 const base=path.resolve(process.env.RUNNER_TEMP);
 const target=typeof root==='string'?path.resolve(root):'';
 if(!target.startsWith(base+path.sep)||
    !/^vertice_nonce_v837_[a-f0-9]{12}$/.test(path.basename(target)))return null;
 try{
  if(!fs.statSync(base).isDirectory()||fs.lstatSync(target).isSymbolicLink())return null;
  const marker=path.join(target,'V837_TEST_ONLY');
  if(!fs.lstatSync(marker).isFile()||fs.readFileSync(marker,'utf8')!=='EPHEMERAL_REVIEW_ONLY')return null;
  const ledger=path.join(target,'nonce-ledger');
  if(!fs.lstatSync(ledger).isDirectory()||fs.lstatSync(ledger).isSymbolicLink())return null;
  return ledger;
 }catch{return null}
}
function inspect(root,record){
 const ledger=rootGuard(root);
 if(!ledger)return status('HOLD','HOSTED_SANDBOX_UNVERIFIED');
 if(!record||typeof record.authorization_id!=='string')return status('HOLD','NONCE_INVALID');
 const destination=path.join(ledger,sha(record.authorization_id)+'.json');
 const expected=sha(JSON.stringify(record));
 try{
  const st=fs.lstatSync(destination);
  if(!st.isFile()||st.isSymbolicLink())return status('HOLD','RECEIPT_UNTRUSTED');
  const raw=fs.readFileSync(destination,'utf8');
  const obj=JSON.parse(raw);
  if(Object.keys(obj).length!==6||obj.schema!==SCHEMA||
     obj.authorization_id!==record.authorization_id||
     obj.envelope_sha256!==expected||
     obj.state!=='RESERVED_UNCONFIRMED'||
     obj.human_authorization_proven!==false||
     obj.operational_authorized!==false)return status('HOLD','RECEIPT_AMBIGUOUS');
  return status('HOLD','NONCE_ALREADY_RESERVED');
 }catch(e){
  if(e&&e.code==='ENOENT')return status('HOLD','NONCE_NOT_YET_RESERVED');
  return status('HOLD','RECEIPT_AMBIGUOUS');
 }
}
function reserve(root,record,trust,{testCrashAt='none'}={}){
 const ledger=rootGuard(root);
 if(!ledger)return status('HOLD','HOSTED_SANDBOX_UNVERIFIED');
 const evidence=evaluate(record,trust);
 if(evidence.status!=='REVIEW_ONLY_SYNTHETIC_SIGNATURE_VALID'||
    evidence.signature_verified!==true)return status('HOLD','SIGNED_SCOPE_OR_TRUST_NOT_VALID');
 if(!['none','after_open','after_fsync'].includes(testCrashAt))
  return status('HOLD','UNKNOWN_TEST_MODE');
 const destination=path.join(ledger,sha(record.authorization_id)+'.json');
 const obj={
  schema:SCHEMA,authorization_id:record.authorization_id,
  envelope_sha256:sha(JSON.stringify(record)),
  state:'RESERVED_UNCONFIRMED',human_authorization_proven:false,
  operational_authorized:false
 };
 let fd=null;
 try{
  fd=fs.openSync(destination,'wx',0o600);
 }catch(e){
  if(e&&e.code==='EEXIST'){
   const found=inspect(root,record);
   return found.reason==='NONCE_ALREADY_RESERVED'
    ?status('HOLD','NONCE_ALREADY_RESERVED')
    :status('HOLD','EXISTING_RECEIPT_UNTRUSTED_OR_AMBIGUOUS');
  }
  return status('HOLD','EXCLUSIVE_CREATE_FAILED');
 }
 try{
  if(testCrashAt==='after_open')process.kill(process.pid,'SIGKILL');
  const payload=Buffer.from(JSON.stringify(obj),'utf8');
  let offset=0;
  while(offset<payload.length){
   const n=fs.writeSync(fd,payload,offset,payload.length-offset,offset);
   if(n<=0)throw Error('ZERO_BYTE_WRITE');
   offset+=n;
  }
  fs.fsyncSync(fd);
  if(testCrashAt==='after_fsync')process.kill(process.pid,'SIGKILL');
 }catch{
  // A partial/ambiguous file is deliberately retained, NEVER removed/retried.
  return status('HOLD','RECEIPT_WRITE_INCOMPLETE');
 }finally{if(fd!==null){try{fs.closeSync(fd)}catch{}}}
 const found=inspect(root,record);
 if(found.reason!=='NONCE_ALREADY_RESERVED')return status('HOLD','POST_WRITE_RECEIPT_UNVERIFIED');
 return status('SYNTHETIC_NONCE_RESERVED_REVIEW_ONLY','SINGLE_LOCAL_RESERVATION_OBSERVED',{
  reservation_recorded_locally:true,shift_update_authorized:false
 });
}
module.exports={SCHEMA,RESULT,rootGuard,inspect,reserve};

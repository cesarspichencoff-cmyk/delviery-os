'use strict';
// Fail-closed candidate for replacing the installed age-based projector lock.
// DISPOSABLE GITHUB LAB ONLY. No production installation / no field authority.
// Stale locks are NEVER removed automatically. Only the writer who knows a
// private per-acquisition nonce may release a lock it still owns.
// All cooperating workers must adopt the protocol before any field use.
// External/legacy deleters defeat file-level fencing: NO cross-protocol proof.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const MARKER='DELIVERYOS_PROJECTOR_LAB_ONLY_V1';
const NAME='deliveryos-projector-lab';
function forbid(){
 if(os.hostname().toUpperCase()==='CAIXA_MOOCA'||
    process.env.GITHUB_ACTIONS!=='true'||
    process.env.GITHUB_REPOSITORY!=='cesarspichencoff-cmyk/delviery-os')
  throw Error('PROJECTOR_LOCK_LAB_ONLY');
}
function secureRoot(root){
 forbid();
 if(typeof root!=='string'||!path.isAbsolute(root)||
    path.basename(root)!==NAME)throw Error('PROJECTOR_LOCK_INVALID_ROOT');
 const absolute=path.resolve(root);
 if(fs.realpathSync(absolute)!==absolute||
    fs.lstatSync(absolute).isSymbolicLink()||
    !fs.lstatSync(absolute).isDirectory())
  throw Error('PROJECTOR_LOCK_ROOT_ALIAS');
 const marker=path.join(absolute,'LAB_ONLY.txt');
 const st=fs.lstatSync(marker);
 if(!st.isFile()||st.isSymbolicLink()||st.size>80||
    fs.readFileSync(marker,'utf8').trim()!==MARKER)
  throw Error('PROJECTOR_LOCK_MARKER_INVALID');
 const state=path.join(absolute,'state');
 const report=path.join(state,'reporting-v1');
 for(const dir of [state,report]){
  if(!fs.existsSync(dir))fs.mkdirSync(dir);
  if(fs.lstatSync(dir).isSymbolicLink()||
     !fs.lstatSync(dir).isDirectory()||
     fs.realpathSync(dir)!==dir)
   throw Error('PROJECTOR_LOCK_DIRECTORY_ALIAS');
 }
 return path.join(report,'projector.lock');
}
function output(state,reason,lease){
 const data={schema:'deliveryos.projector-owner-lock-lab.v1',state,reason,
  staleLockReclaimed:false,legacyWriterInteroperabilityProven:false,
  releaseAtomicAgainstExternalUnlink:false,fieldAuthorized:false,
  processOrServiceStarted:false,sqlExecuted:false,printAuthorized:false};
 if(lease)Object.defineProperty(data,'privateLease',{
  enumerable:false,configurable:false,writable:false,value:Object.freeze(lease)
 });
 return Object.freeze(data);
}
function acquire(root){
 try{
  const filename=secureRoot(root);
  let fd;
  try{fd=fs.openSync(filename,'wx',0o600);}
  catch(err){
   if(err&&err.code==='EEXIST')return output('HOLD','EXISTING_LOCK_UNVERIFIED');
   return output('HOLD','ATOMIC_CREATE_FAILED');
  }
  const token=crypto.randomBytes(32).toString('hex');
  const owner={schema:'deliveryos.projector-owner-lock-file.v1',
    pid:process.pid,token,createdAt:new Date().toISOString()};
  try{
   fs.writeFileSync(fd,JSON.stringify(owner)+'\n','utf8');
   fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   return output('PRIVATE_LOCK_ACQUIRED',null,{filename,token,pid:process.pid});
  }catch{
   // If writing fails, leave the uncertain lock for explicit maintenance.
   // A different process must NEVER remove it from this failure branch.
   if(fd!==undefined){try{fs.closeSync(fd)}catch{}}
   return output('HOLD','LOCK_CREATE_INDETERMINATE');
  }
 }catch{return output('HOLD','LAB_GUARD_FAILED')}
}
function release(root,lease){
 try{
  const filename=secureRoot(root);
  if(!lease||typeof lease!=='object'||
     lease.filename!==filename||
     !/^[0-9a-f]{64}$/.test(lease.token)||
     lease.pid!==process.pid)
   return output('HOLD','OWNER_IDENTITY_MISSING');
  const st=fs.lstatSync(filename);
  if(!st.isFile()||st.isSymbolicLink()||st.size>512||
     st.size<75)return output('HOLD','LOCK_FILE_INVALID');
  const owner=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(!owner||owner.schema!=='deliveryos.projector-owner-lock-file.v1'||
    owner.token!==lease.token||owner.pid!==lease.pid)
   return output('HOLD','OWNER_IDENTITY_CHANGED');
  // The lock never ages out or gets replaced by this protocol. This unlink
  // is safe only under cooperating writers; external deleters need OS fencing.
  fs.unlinkSync(filename);
  return output('RELEASED_OWN_LOCK',null);
 }catch{return output('HOLD','LOCK_RELEASE_UNVERIFIED')}
}
module.exports=Object.freeze({MARKER,acquire,release});

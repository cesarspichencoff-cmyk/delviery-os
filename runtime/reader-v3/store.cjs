'use strict';
// Durable local-only store. No fallback that exposes partially copied JSON.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function directory(p) {
  if (!path.isAbsolute(p)) throw Error('ABSOLUTE_PATH_REQUIRED');
  fs.mkdirSync(p, {recursive:true});
  for(let q=p;;q=path.dirname(q)) {
    const s=fs.lstatSync(q); if(!s.isDirectory()||s.isSymbolicLink()) throw Error('UNSAFE_DIRECTORY');
    if(path.dirname(q)===q)break;
  }
}
function read(p, max=32*1024*1024) {
  const s=fs.lstatSync(p); if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('UNSAFE_FILE');
  const x=JSON.parse(fs.readFileSync(p,'utf8'));
  if(!x||x.digest!==hash(x.data))throw Error('DIGEST_MISMATCH');return x.data;
}
function atomic(p, data) {
  const tmp=p+'.tmp-'+crypto.randomUUID();
  let fd;
  try {
    fd=fs.openSync(tmp,'wx',0o600);
    fs.writeFileSync(fd,JSON.stringify({digest:hash(data),data}));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(tmp,p);
    if(process.platform!=='win32'){const d=fs.openSync(path.dirname(p),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
  }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
function readOrNew(p, fresh) {try{return read(p);}catch(e){if(e.code==='ENOENT')return fresh();throw e;}}
function lock(root, role) {
  directory(root);const p=path.join(root,role+'.lock');const token=crypto.randomUUID();
  let fd;try{fd=fs.openSync(p,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('OWNER_LOCKED');throw e;}
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token}));fs.fsyncSync(fd);fs.closeSync(fd);
  return ()=>{const x=JSON.parse(fs.readFileSync(p,'utf8'));if(x.token!==token)throw Error('LOCK_OWNER_CHANGED');fs.unlinkSync(p);};
}
// Explicit recovery only, never age-based. A reused/live PID always keeps HOLD.
function recoverLock(root,role) {
  const release=lock(root,role+'-recovery');
  try{const p=path.join(root,role+'.lock'),x=JSON.parse(fs.readFileSync(p,'utf8'));
    if(!Number.isSafeInteger(x.pid)||x.pid<1)throw Error('LOCK_INVALID');
    try{process.kill(x.pid,0);throw Error('OWNER_ALIVE');}catch(e){if(e.code!=='ESRCH')throw e;}
    fs.renameSync(p,p+'.recovered-'+crypto.randomUUID());
  }finally{release();}
}
const eventName=n=>{if(!Number.isSafeInteger(n)||n<1)throw Error('SEQUENCE_INVALID');return String(n).padStart(16,'0')+'.json';};
module.exports={hash,directory,read,readOrNew,atomic,lock,recoverLock,eventName};

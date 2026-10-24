"use strict";
/** V7.55: disposable, synthetic-only attempt ledger journal.
 * Never install/use as Windows service. Never open operational dirs.
 * No external print call; filesystem effects confined to os.tmpdir fixture.
 * Windows power-loss durability, real printer idempotency and recovery are UNKNOWN.
 */
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {fresh,reserve,validLedger}=require("./comandas_idempotencia_v754_offline.js");
const h=x=>crypto.createHash("sha256").update(x).digest("hex");
const RE=/^state-(\d{6})\.json$/;
function hold(reason){return {status:"HOLD",reasons:[reason],authorize_print:false,
 effects:{print:false,spooler_write:false,service_change:false}};}
function rootGuard(root){
 if(typeof root!=="string"||!root)return false;
 const actual=path.resolve(root),tmp=fs.realpathSync(os.tmpdir());
 if(!/^deliveryos-v755-[a-zA-Z0-9_-]{3,64}$/.test(path.basename(actual)))return false;
 try{
  const canon=fs.realpathSync(actual);
  const eq=(a,b)=>process.platform==="win32"?a.toLowerCase()===b.toLowerCase():a===b;
  if(!eq(canon,actual)||!eq(path.dirname(canon),tmp)||
    !fs.lstatSync(actual).isDirectory())return false;
 }catch{return false;}
 return true;
}
function readSnapshots(root,allowHeldLock=false){
 if(!rootGuard(root))throw Error("SYNTHETIC_SANDBOX_REQUIRED");
 if(!allowHeldLock&&fs.existsSync(path.join(root,".attempt-lock")))
  throw Error("UNRESOLVED_ATTEMPT_LOCK_NO_AUTO_RECOVERY");
 const names=fs.readdirSync(root);
 const revisions=names.filter(x=>RE.test(x)).sort();
 if(names.some(x=>x!==".attempt-lock"&&!RE.test(x)))
  throw Error("UNKNOWN_SANDBOX_ARTIFACT_HOLD");
 let last=fresh(),previous=h("V755_GENESIS"),count=0;
 for(const name of revisions){
  const m=RE.exec(name);
  if(Number(m[1])!==++count)throw Error("JOURNAL_GAP_OR_REORDER");
  const p=path.join(root,name);
  const st=fs.lstatSync(p);
  if(!st.isFile()||st.isSymbolicLink()||st.size>5000000)
   throw Error("JOURNAL_ENTRY_INVALID");
  const raw=fs.readFileSync(p);
  let record;try{record=JSON.parse(raw.toString("utf8"));}
  catch{throw Error("JOURNAL_TORN_COMMIT_HOLD");}
  if(record?.schema!=="deliveryos.synthetic-durable-journal.v755"||
     record.previous_sha256!==previous||record.revision!==count||
     !validLedger(record.ledger)||record.ledger.revision!==count)
   throw Error("JOURNAL_CHAIN_DIVERGENCE_HOLD");
  // This V7.55 fixture persists ONE RESERVATION per revision, never a spool
  // ACK or a paper claim. A reconstructed/tampered first snapshot must not be
  // able to assert that physical output has already been verified.
  // Observation transitions require a separately reviewed append-only log.
  if(record.ledger.entries.length!==last.entries.length+1||
     last.entries.some((old,i)=>JSON.stringify(record.ledger.entries[i])!==JSON.stringify(old))||
     record.ledger.entries[record.ledger.entries.length-1]?.state!=="ATTEMPT_RESERVED_UNVERIFIED"||
     record.ledger.entries[record.ledger.entries.length-1]?.reserved_revision!==count)
   throw Error("JOURNAL_UNSUPPORTED_TRANSITION_OR_HISTORY_REWRITE_HOLD");
  previous=h(raw);last=record.ledger;
 }
 return {ledger:last,last_hash:previous,revision:count};
}
function snapshot(root){
 try{const s=readSnapshots(root);return {status:"SYNTHETIC_SNAPSHOT_ONLY",
  ledger:s.ledger,revision:s.revision,journal_head_sha256:s.last_hash,
  authorize_print:false};}
 catch(e){return hold(String(e.message).replace(/[^A-Z0-9_]/gi,"_"))}
}
/** Never returns an authorization to dispatch. Failure after exclusive lock
 * acquisition leaves the lock in place to force manual lab reconciliation.
 */
function reserveDurablyInSyntheticSandbox(root,descriptor,expectedRevision){
 if(!rootGuard(root))return hold("SYNTHETIC_SANDBOX_REQUIRED");
 const lock=path.join(root,".attempt-lock");
 try{fs.mkdirSync(lock);}catch{return hold("LOCK_HELD_OR_UNAVAILABLE_NO_RETRY");}
 let safeUnlock=false;
 try{
  const old=readSnapshots(root,true);
  const proposed=reserve(old.ledger,descriptor,expectedRevision);
  if(proposed.status!=="RESERVATION_PROPOSAL_ONLY"){
   safeUnlock=true;return proposed;
  }
  if(old.revision!==expectedRevision||proposed.next_state.revision!==old.revision+1)
   throw Error("REVISION_RACE_HOLD");
  const number=String(old.revision+1).padStart(6,"0");
  const name=path.join(root,"state-"+number+".json");
  const bytes=Buffer.from(JSON.stringify({schema:"deliveryos.synthetic-durable-journal.v755",
   previous_sha256:old.last_hash,revision:old.revision+1,
   ledger:proposed.next_state}),"utf8");
  let fd;
  try{
   fd=fs.openSync(name,"wx",0o600);
   fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);
  }finally{if(fd!==undefined)fs.closeSync(fd);}
  // On Windows, fsync(dir) is not consistently supported; durability in
  // power loss remains UNKNOWN. A successful sandbox read is not world proof.
  if(process.platform!=="win32"){
   const dirfd=fs.openSync(root,"r");
   try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}
  }
  const verify=readSnapshots(root,true);
  if(verify.revision!==old.revision+1||
    JSON.stringify(verify.ledger)!==JSON.stringify(proposed.next_state))
   throw Error("POST_COMMIT_READBACK_FAILED_HOLD");
  safeUnlock=true;
  return {status:"SYNTHETIC_JOURNAL_COMMIT_OBSERVED",
   revision:verify.revision,commit_sha256:verify.last_hash,
   disk_fsync_attempted:true,windows_power_loss_durability_proven:false,
   authorize_print:false,effects:{print:false,spooler_write:false}};
 }catch{return hold("COMMIT_UNCERTAIN_LOCK_PRESERVED");}
 finally{if(safeUnlock){try{fs.rmdirSync(lock);}catch{ /* hold on next call */ }}}
}
module.exports={snapshot,reserveDurablyInSyntheticSandbox,rootGuard};

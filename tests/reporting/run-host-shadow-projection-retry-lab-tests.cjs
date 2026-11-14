"use strict";
// Deterministic sandbox replay of installed loop scheduling; fake files only.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const candidate=path.resolve(__dirname,"../../labs/reporting/host-shadow-loop-lab-recovery-v1.cjs");
let cases=0;
function check(name,fn){fn();cases++;console.log("PASS "+name);}
function replay({mode="RECOVER_ON_SECOND",baseline=false,cycles=5,lockAgeMs=null}={}){
  const outer=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-projection-"));
  const root=path.join(outer,"deliveryos-projector-lab");
  try{
    fs.mkdirSync(path.join(root,"shadow"),{recursive:true});
    fs.mkdirSync(path.join(root,"evidence"),{recursive:true});
    fs.writeFileSync(path.join(root,"LAB_ONLY.txt"),"DELIVERYOS_PROJECTOR_LAB_ONLY_V1\n");
    if(lockAgeMs!==null){
      const lockDir=path.join(root,"state","reporting-v1");
      fs.mkdirSync(lockDir,{recursive:true});
      const lock=path.join(lockDir,"projector.lock");
      fs.writeFileSync(lock,"99991"); // fake PID, never used to kill or authorize removal
      const age=new Date(Date.now()-lockAgeMs);
      fs.utimesSync(lock,age,age);
    }
    fs.writeFileSync(path.join(root,"shadow","report_source_envelope_v1.cjs"),
      "module.exports={buildReportSourceEnvelope:()=>({schema:'FAKE_LAB'})};\n");
    const stub=[
      "const fs=require('node:fs');const path=require('node:path');",
      "const root=process.env.DELIVERYOS_PROJECTOR_LAB_ROOT;",
      "const counter=path.join(root,'attempts.txt');",
      "const count=(fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8')):0)+1;",
      "fs.writeFileSync(counter,String(count));",
      "const mode=process.env.DELIVERYOS_LAB_PROJECTOR_MODE;",
      "if(mode==='INVALID_JSON'){process.stdout.write('not-json');process.exit(0);}",
      "if(mode==='UNKNOWN_RESULT'){process.stdout.write(JSON.stringify({status:'UNRECOGNIZED'}));process.exit(0);}",
      "const status=(mode==='ALWAYS_LOCKED'||count===1)?'SKIPPED_LOCKED':",
      "  mode==='CURRENT_AFTER_RETRY'?'CURRENT':'PROJECTED';",
      "process.stdout.write(JSON.stringify({status}));"
    ].join("\n")+"\n";
    fs.writeFileSync(path.join(root,"shadow","continuous_reporting_projector_v1.cjs"),stub);
    const res=spawnSync(process.execPath,[candidate],{encoding:"utf8",timeout:15000,
      env:{...process.env,DELIVERYOS_PROJECTOR_LAB_ROOT:root,
       DELIVERYOS_PROJECTOR_LAB_CYCLES:String(cycles),
       DELIVERYOS_LAB_REPRODUCE_BASELINE:baseline?"1":"0",
       DELIVERYOS_LAB_PROJECTOR_MODE:mode,TATA_SHADOW_POLL_MS:"500"}});
    assert.equal(res.status,0,res.stdout+"\n"+res.stderr);
    assert.equal(res.stderr,"");
    const status=JSON.parse(fs.readFileSync(path.join(root,"evidence","shadow-consumer-status.json"),"utf8"));
    const attempts=fs.existsSync(path.join(root,"attempts.txt")) ?
      Number(fs.readFileSync(path.join(root,"attempts.txt"),"utf8")) : 0;
    if(lockAgeMs!==null){
      assert.equal(fs.readFileSync(path.join(root,"state","reporting-v1","projector.lock"),"utf8"),"99991");
    }
    assert.equal(status.schema,"deliveryos.live-shadow-consumer-status.v2");
    assert.equal(status.state,"STOPPED");
    assert.equal(status.processed,0);
    assert.equal(status.reporting_envelopes_written,0);
    assert.equal(status.projection_runs,attempts);
    assert.equal(status.effects.database_write,false);
    assert.equal(status.effects.print,false);
    return {attempts,lastProjection:status.last_projection_status};
  }finally{fs.rmSync(outer,{recursive:true,force:true});}
}
check("host baseline reproduces deadlock after SKIPPED_LOCKED with no new events",()=>{
  const r=replay({baseline:true,cycles:5});
  assert.deepEqual(r,{attempts:1,lastProjection:"SKIPPED_LOCKED"});
});
check("lab candidate retries after bounded backoff and recovers without new events",()=>{
  const r=replay({cycles:5});
  assert.deepEqual(r,{attempts:2,lastProjection:"PROJECTED"});
});
check("persistent lock causes bounded retries, no every-poll process storm",()=>{
  const r=replay({mode:"ALWAYS_LOCKED",cycles:6});
  assert(r.attempts>=2 && r.attempts<=3,JSON.stringify(r));
  assert.equal(r.lastProjection,"SKIPPED_LOCKED");
});
check("stale lock remains intact, no projector execution and explicit HOLD",()=>{
  const r=replay({cycles:4,lockAgeMs:200000});
  assert.deepEqual(r,{attempts:0,lastProjection:"HOLD_STALE_LOCK_UNVERIFIED"});
});
check("fresh lock remains intact and no repeated projector child is launched",()=>{
  const r=replay({cycles:3,lockAgeMs:1000});
  assert.deepEqual(r,{attempts:0,lastProjection:"SKIPPED_LOCKED"});
});
check("malformed JSON stdout cannot claim projector OK",()=>{
  const r=replay({mode:"INVALID_JSON",cycles:4});
  assert.deepEqual(r,{attempts:1,lastProjection:"HOLD_PROJECTOR_OUTPUT_INVALID"});
});
check("unknown projector result cannot claim success",()=>{
  const r=replay({mode:"UNKNOWN_RESULT",cycles:4});
  assert.deepEqual(r,{attempts:1,lastProjection:"HOLD_PROJECTOR_RESULT_UNRECOGNIZED"});
});
check("actual native CURRENT status is accepted after unlocked retry",()=>{
  const r=replay({mode:"CURRENT_AFTER_RETRY",cycles:5});
  assert.deepEqual(r,{attempts:2,lastProjection:"CURRENT"});
});
check("lab candidate refuses execution without explicit sandbox root and marker",()=>{
  const r=spawnSync(process.execPath,[candidate],{encoding:"utf8",timeout:3000,
     env:{...process.env,DELIVERYOS_PROJECTOR_LAB_ROOT:"",
       DELIVERYOS_PROJECTOR_LAB_CYCLES:"1"}});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/LAB_ONLY_OR_INVALID_SANDBOX/);
});
check("lab candidate has no direct production root or unbounded service loop",()=>{
  const s=fs.readFileSync(candidate,"utf8");
  assert.equal(s.includes("C:\\ProgramData\\TataComandaReader"),false);
  assert(s.includes("LAB_CYCLE_BOUND_REQUIRED"));
  assert(s.includes("CAIXA_MOOCA"));
});
// NEW DIFFERENCE: tests actual ownership protocol, not another retry simulation.
// Installs no service and never reads production paths; uses disposable /tmp only.
const ownerLock=require("../../labs/reporting/projector_owner_lock_lab_v1.cjs");
function ownerLab(fn){
 const outer=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-owner-lock-"));
 const root=path.join(outer,"deliveryos-projector-lab");
 fs.mkdirSync(root);
 fs.writeFileSync(path.join(root,"LAB_ONLY.txt"),ownerLock.MARKER+"\n");
 try{return fn(root,path.join(root,"state","reporting-v1","projector.lock"))}
 finally{fs.rmSync(outer,{recursive:true,force:true})}
}
check("atomic lock admits one owner and blocks second without deletion",()=>ownerLab((root,lock)=>{
 const a=ownerLock.acquire(root),b=ownerLock.acquire(root);
 assert.equal(a.state,"PRIVATE_LOCK_ACQUIRED");
 assert.equal(b.state,"HOLD");
 assert.equal(b.reason,"EXISTING_LOCK_UNVERIFIED");
 assert.equal(fs.existsSync(lock),true);
 assert.equal(ownerLock.release(root,a.privateLease).state,"RELEASED_OWN_LOCK");
 assert.equal(fs.existsSync(lock),false);
}));
check("120-second stale lock remains intact even though old projector would evict",()=>ownerLab((root,lock)=>{
 const a=ownerLock.acquire(root);
 const bytes=fs.readFileSync(lock,"utf8");
 const old=new Date(Date.now()-210000);
 fs.utimesSync(lock,old,old);
 const b=ownerLock.acquire(root);
 assert.equal(b.reason,"EXISTING_LOCK_UNVERIFIED");
 assert.equal(fs.readFileSync(lock,"utf8"),bytes);
 assert.equal(ownerLock.release(root,a.privateLease).state,"RELEASED_OWN_LOCK");
}));
check("release without current ownership never removes lock",()=>ownerLab((root,lock)=>{
 const a=ownerLock.acquire(root);
 const forged={...a.privateLease,token:"a".repeat(64)};
 assert.equal(ownerLock.release(root,forged).reason,"OWNER_IDENTITY_CHANGED");
 assert.equal(fs.existsSync(lock),true);
 assert.equal(ownerLock.release(root,a.privateLease).state,"RELEASED_OWN_LOCK");
}));
check("modified owner file cannot be deleted by original holder",()=>ownerLab((root,lock)=>{
 const a=ownerLock.acquire(root);
 const copy=JSON.parse(fs.readFileSync(lock,"utf8"));
 copy.token="b".repeat(64);
 fs.writeFileSync(lock,JSON.stringify(copy)+"\n");
 const old=fs.readFileSync(lock,"utf8");
 assert.equal(ownerLock.release(root,a.privateLease).reason,"OWNER_IDENTITY_CHANGED");
 assert.equal(fs.readFileSync(lock,"utf8"),old);
}));
check("a malformed existing lock is never reset by the candidate",()=>ownerLab((root,lock)=>{
 const a=ownerLock.acquire(root);
 fs.writeFileSync(lock,"DO_NOT_REMOVE");
 const b=ownerLock.acquire(root);
 assert.equal(b.reason,"EXISTING_LOCK_UNVERIFIED");
 assert.equal(ownerLock.release(root,a.privateLease).state,"HOLD");
 assert.equal(fs.readFileSync(lock,"utf8"),"DO_NOT_REMOVE");
}));
check("new acquisition succeeds after an authorized same-owner release",()=>ownerLab((root,lock)=>{
 const a=ownerLock.acquire(root);
 assert.equal(ownerLock.release(root,a.privateLease).state,"RELEASED_OWN_LOCK");
 const b=ownerLock.acquire(root);
 assert.equal(b.state,"PRIVATE_LOCK_ACQUIRED");
 assert.notEqual(b.privateLease.token,a.privateLease.token);
 assert.equal(ownerLock.release(root,b.privateLease).state,"RELEASED_OWN_LOCK");
}));
check("nonce and sandbox path never enter a serialized decision",()=>ownerLab((root,lock)=>{
 const a=ownerLock.acquire(root),v=JSON.stringify(a);
 assert.equal(v.includes(a.privateLease.token),false);
 assert.equal(v.includes(root),false);
 assert.equal(a.staleLockReclaimed,false);
 assert.equal(a.releaseAtomicAgainstExternalUnlink,false);
 assert.equal(a.fieldAuthorized,false);
 assert.equal(a.sqlExecuted,false);
 assert.equal(a.printAuthorized,false);
 assert.equal(ownerLock.release(root,a.privateLease).state,"RELEASED_OWN_LOCK");
}));
check("unsafe root or missing marker is denied without creating a lock",()=>{
 const r=ownerLock.acquire(path.resolve(os.tmpdir(),"not-approved"));
 assert.equal(r.state,"HOLD");
 assert.equal(r.reason,"LAB_GUARD_FAILED");
});
console.log("TATA_REPORTING_LOCKED_RETRY_LAB_PASS "+cases+"/"+cases+" SYNTHETIC_ONLY");

"use strict";
/**
 * Windows CI: isolated reproduction of installed watcher v2 shift function
 * against fictional v3 state. No SQL, service, print or live watcher execution.
 * The fixture is the repository's v1 shift function, confirmed structurally
 * equal to the v2 installed shift function in passive inspection (12 Oct).
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),os=require("node:os"),{spawnSync}=require("node:child_process");
const {transformWatcher,extractShiftFunction,prepare}=require(
 "./preparar_turno_prospectivo_v731.js");
assert.equal(process.platform,"win32","WINDOWS_CI_REQUIRED");
assert.equal(process.env.GITHUB_ACTIONS,"true","EPHEMERAL_CI_ONLY");
assert.equal(process.env.RUNNER_OS,"Windows","WINDOWS_CI_ONLY");
const oldPath=path.join(__dirname,"tata_reader_continuous_watch_candidate_v1.ps1");
const oldSource=fs.readFileSync(oldPath,"utf8");
const nextSource=transformWatcher(oldSource);
const origFn=extractShiftFunction(oldSource);
const newFn=extractShiftFunction(nextSource);
assert.notEqual(origFn,newFn);
assert.ok(newFn.includes("SERVICE_STATE_NOT_YET_EFFECTIVE_FOR_ORDER"));
assert.ok(newFn.includes("deliveryos.production-service-shift-state.v3"));
assert.ok(!newFn.includes("deliveryos.production-service-shift-state.v2"));
assert.equal(nextSource.indexOf(origFn),-1);
assert.equal(nextSource.split("function Read-ServiceState(").length-1,1);
assert.ok(nextSource.includes("observation_scan_complete")===
  oldSource.includes("observation_scan_complete"));
let checks=0;
function check(label,condition){
 assert.ok(condition,label);checks++;
 console.log("PASS V731 "+checks+" "+label);
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tata-shift-v731-"));
const statePath=path.join(dir,"fictional-shift-state.json");
function assess(state,at){
 fs.writeFileSync(statePath,JSON.stringify(state,null,2)+"\n");
 const p=statePath.replace(/'/g,"''");
 const script=[
 "$ErrorActionPreference='Stop'",
 "$ServiceStatePath='"+p+"'",
 newFn,
 "$stamp=[datetime]::ParseExact('"+at+"','yyyy-MM-ddTHH:mm:ss',",
 " [Globalization.CultureInfo]::InvariantCulture)",
 "$r=Read-ServiceState $stamp",
 "$r | ConvertTo-Json -Depth 8 -Compress"
 ].join("\n");
 const response=spawnSync("pwsh",["-NoProfile","-NonInteractive","-EncodedCommand",
  Buffer.from(script,"utf16le").toString("base64")],{
    encoding:"utf8",timeout:15000,maxBuffer:65536,windowsHide:true
  });
 assert.equal(response.status,0,
  "isolated pure shift function failed: "+response.stderr.slice(0,600));
 return JSON.parse(response.stdout.trim());
}
const base={
 schema:"deliveryos.production-service-shift-state.v3",
 store_id:"0001",operational_date:"2026-10-12",
 service:"DINNER",evidence:"HUMAN_CONFIRMED_RULE",
 source_ref:"fixture:fictional-untrusted-human-claim",
 confirmed_at_local:"2026-10-12T16:59:59",
 valid_from_local:"2026-10-12T17:00:00",
 valid_until_local:"2026-10-12T22:00:00",
 clock_inference_used:false,
 updated_at:"2026-10-12T16:59:59"
};
const at="2026-10-12T17:30:00";
let completed=false;
try{
 let r=assess(base,at);
 check("fictional prospective time passes schema only, not human authentication",
  r.blockers.length===0&&r.service==="DINNER");
 r=assess(base,"2026-10-12T16:59:59");
 check("past order blocked even on matching operational date",
  r.blockers.includes("SERVICE_STATE_NOT_YET_EFFECTIVE_FOR_ORDER"));
 r=assess({...base,valid_from_local:"2026-10-12T16:00:00"},at);
 check("backdated valid-from before declared confirmation rejected",
  r.blockers.includes("SERVICE_STATE_RETROACTIVE_WINDOW_FORBIDDEN"));
 r=assess({...base,valid_from_local:null},at);
 check("missing start window blocked",
  r.blockers.includes("SERVICE_STATE_VALID_FROM_REQUIRED"));
 r=assess({...base,confirmed_at_local:null},at);
 check("missing confirmed-at blocked",
  r.blockers.includes("SERVICE_STATE_CONFIRMED_AT_REQUIRED"));
 r=assess({...base,schema:"deliveryos.production-service-shift-state.v2"},at);
 check("legacy state never silently acquires v3 authority",
  r.blockers.includes("SERVICE_STATE_SCHEMA_MISMATCH"));
 r=assess({...base,valid_until_local:"2026-10-12T17:15:00"},at);
 check("expired upper window blocked",
  r.blockers.includes("SERVICE_STATE_EXPIRED_FOR_ORDER"));
 r=assess({...base,valid_until_local:"2026-10-13T01:00:00"},at);
 check("unsupported cross-midnight valid-until is blocked",
  r.blockers.includes("SERVICE_STATE_VALID_UNTIL_DAY_MISMATCH"));
 r=assess({...base,valid_from_local:"2026-10-12T23:00:00"},at);
 check("reversed start-end interval blocked",
  r.blockers.includes("SERVICE_STATE_INTERVAL_INVALID"));
 r=assess({...base,store_id:"0002"},at);
 check("wrong store cannot inherit the shift",
  r.blockers.includes("SERVICE_STATE_STORE_MISMATCH"));
 const src=path.join(dir,"watcher-v1-fixture.ps1");
 fs.copyFileSync(oldPath,src);
 let rejected=false;
 try{prepare(["--source",src,"--output-dir",dir]);}
 catch(e){rejected=e.message==="INSTALLED_WATCHER_SHA256_NOT_PINNED";}
 check("unapproved non-pinned watcher cannot produce a v3 candidate",rejected);
 rejected=false;
 try{transformWatcher(nextSource);}
 catch(e){rejected=e.message==="INSTALLED_SHIFT_BODY_DRIFT";}
 check("double patch fails closed",rejected);
 completed=true;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
if(completed)console.log("THERMAL_PROSPECTIVE_SHIFT_V731="+checks+"/"+checks+
 " WINDOWS_CI_READ_ONLY_RUNTIME_NO_SERVICE_NO_PRINT");

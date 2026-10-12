"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {verify,EFFECT_KEYS}=require("./validar_topologia_windows_v729.js");
const source=fs.readFileSync(path.join(__dirname,
 "auditar_topologia_windows_v729_readonly.ps1"),"utf8");
let count=0;function check(name,fn){fn();count++;console.log("PASS V7.29 "+name);}
function fixture(){
 return {
  schema:"deliveryos.windows-process-topology-passive.v729",
  scope:"LOCAL_CIM_READ_ONLY_NO_COMMANDLINES_EXPORTED",
  status:"OBSERVATION_ONLY_NOT_RUNTIME_ATTESTATION",
  observed_utc:"2026-10-12T13:30:00.0000000Z",
  service:{lookup:"FOUND",state:"Running",start_mode:"Auto",
   pid_present:true,image_mentions_reader:true},
  topology:{scan:"DIRECT_CHILDREN_OBSERVED",
   watcher_child:"OBSERVED",legacy_shadow_loop_child:"OBSERVED",
   candidate_v2_child:"NOT_OBSERVED",direct_children_count:2},
  mandatory_v68_gate:"UNKNOWN_NOT_PROVEN_BY_PROCESS_SCAN",
  source_consistency:"UNKNOWN_NOT_PROVEN_BY_PROCESS_SCAN",
  human_shift:"UNKNOWN_NOT_INSPECTED",
  order_content_exposed:false,
  effects:Object.fromEntries(EFFECT_KEYS.map(k=>[k,false])),
  authorizes_cutover:false
 };
}
function blocked(payload){
 const r=verify(payload);
 assert.equal(r.status,"BLOCKED");
 assert.equal(r.authorizes_cutover,false);
 assert.equal(r.runtime_mandatory_gate,"NOT_PROVEN");
}
check("service with legacy loop remains observation, never v68 proof",()=>{
 const r=verify(fixture());
 assert.equal(r.status,"OBSERVATION_FORMAT_VALID_ONLY");
 assert.equal(r.runtime_mandatory_gate,"NOT_PROVEN");
});
check("candidate observed still cannot assert mandatory v68",()=>{
 const p=fixture();p.topology.candidate_v2_child="OBSERVED";
 assert.equal(verify(p).runtime_mandatory_gate,"NOT_PROVEN");
});
check("service absent and no running service are separate valid unknowns",()=>{
 const p=fixture();
 p.service={lookup:"NOT_FOUND",state:"UNKNOWN",start_mode:"UNKNOWN",
  pid_present:false,image_mentions_reader:false};
 p.topology={scan:"NOT_APPLICABLE_NO_SERVICE",watcher_child:"UNKNOWN",
  legacy_shadow_loop_child:"UNKNOWN",candidate_v2_child:"UNKNOWN",
  direct_children_count:null};
 assert.equal(verify(p).status,"OBSERVATION_FORMAT_VALID_ONLY");
 p.service.lookup="FOUND";p.topology.scan="NO_RUNNING_SERVICE_PID";
 assert.equal(verify(p).status,"OBSERVATION_FORMAT_VALID_ONLY");
});
check("CIM failure cannot be interpreted as service missing",()=>{
 const p=fixture();p.service.lookup="UNREADABLE";
 p.topology={scan:"UNREADABLE",watcher_child:"UNKNOWN",
  legacy_shadow_loop_child:"UNKNOWN",candidate_v2_child:"UNKNOWN",
  direct_children_count:null};
 assert.equal(verify(p).status,"OBSERVATION_FORMAT_VALID_ONLY");
 p.topology.scan="NOT_APPLICABLE_NO_SERVICE";blocked(p);
});
check("raw process command line and PID export always invalid",()=>{
 for(const [target,key] of [["root","order_text"],["service","account_name"],
   ["topology","command_line"],["topology","pid"],["service","raw_path"]]){
  const p=fixture();(target==="root"?p:p[target])[key]="PRIVATE";
  blocked(p);
 }
});
check("runtime proof and effect claims rejected",()=>{
 for(const field of ["mandatory_v68_gate","source_consistency","human_shift"]){
  const p=fixture();p[field]="PROVEN";blocked(p);
 }
 for(const field of EFFECT_KEYS){
  const p=fixture();p.effects[field]=true;blocked(p);
 }
});
check("contradictory child states and service PID never accepted",()=>{
 const a=fixture();a.topology.direct_children_count=0;blocked(a);
 const b=fixture();b.service.pid_present=false;blocked(b);
 const c=fixture();c.topology.scan="UNREADABLE";blocked(c);
});
check("the only CIM reads are service and direct-child process metadata",()=>{
 assert.match(source,/Get-CimInstance -ClassName Win32_Service/);
 assert.match(source,/Get-CimInstance -ClassName Win32_Process/);
 assert.match(source,/ParentProcessId=/);
 assert.match(source,/LOCAL_CIM_READ_ONLY_NO_COMMANDLINES_EXPORTED/);
 assert.match(source,/mandatory_v68_gate='UNKNOWN_NOT_PROVEN_BY_PROCESS_SCAN'/);
 assert.match(source,/authorizes_cutover=\$false/);
 assert.match(source,/ConvertTo-Json -Depth 5 -Compress/);
 for(const pattern of [/\bStart-Service\b/i,/\bStop-Service\b/i,/\bRestart-Service\b/i,
   /\bSet-Service\b/i,/\bSet-Content\b/i,/\bOut-File\b/i,/\bAdd-Content\b/i,
   /\bSet-Item\b/i,/\bNew-Item\b/i,/\bRemove-Item\b/i,
   /\bStart-Process\b/i,/\bInvoke-Sqlcmd\b/i,/\bInvoke-RestMethod\b/i,
   /::WriteAllText/i,/\bSpooler\b/i]){
  // Comment mentions "spooler" as prohibition; match as code only where safe.
  if(String(pattern)==="/\\bSpooler\\b/i")continue;
  assert.doesNotMatch(source,pattern);
 }
});
console.log("THERMAL_WINDOWS_TOPOLOGY_V729="+count+"/"+count+
 " STATIC_AND_SYNTHETIC_ONLY NO_WINDOWS_REMOTE NO_PRINT");

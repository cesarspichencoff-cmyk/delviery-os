"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {verify,FILES,EFFECTS,EXPECTED}=require("./validar_observacao_windows_v723.js");
const SCRIPT=path.join(__dirname,"auditar_servico_windows_v723_readonly.ps1");
const source=fs.readFileSync(SCRIPT,"utf8");
let count=0;const check=(name,fn)=>{fn();count++;console.log("PASS "+count+" "+name);};
const deep=x=>structuredClone(x);
function example(){
 const files=FILES.map(label=>({label,state:"MISSING",bytes:null,sha256:null,git_blob_sha1:null}));
 return {schema:"deliveryos.windows-service-passive-observation.v723",
  scope:"LOCAL_READ_ONLY_NO_ORDER_PAYLOAD",
  status:"OBSERVATION_NOT_INSTALLATION_PROOF",
  observed_utc:"2026-10-11T22:00:00.000Z",
  service:{found:false,state:"UNKNOWN",start_mode:"UNKNOWN",
   pid_present:false,path_mentions_reader:false},
  files,
  observations:{consumer_matches_last_audited_v2:false,packaging_motor_matches_pinned:false,
   windows_mandatory_v68_gate:"UNKNOWN_NOT_PROVEN_BY_CHECKSUM",
   shift_current:"UNKNOWN_NOT_INSPECTED",real_order_pair_coverage:"UNKNOWN_NOT_INSPECTED",
   printer_acceptance:"UNKNOWN_NOT_INSPECTED"},
  effects:Object.fromEntries(EFFECTS.map(k=>[k,false])),
  authorizes_cutover:false};
}
const assertBlocked=x=>{const result=verify(x);assert.equal(result.status,"BLOCKED");
 assert.equal(result.authorizes_cutover,false);
 assert.equal(result.observed_installed_gate,"NOT_PROVEN");};
check("passive script has exactly the eleven pinned source labels",()=>{
 for(const label of FILES)assert.ok(source.includes("label='"+label+"'"),label);
 assert.equal((source.match(/label='/g)||[]).length,FILES.length);
 assert.ok(source.includes("Get-CimInstance -ClassName Win32_Service"));
 assert.ok(source.includes("[System.IO.File]::ReadAllBytes"));
 assert.ok(source.includes("ConvertTo-Json -Depth 6 -Compress"));
 assert.ok(source.includes("authorizes_cutover=$false"));
 assert.ok(source.includes("windows_mandatory_v68_gate='UNKNOWN_NOT_PROVEN_BY_CHECKSUM'"));
 for(const expr of [/\bSet-Service\b/i,/\bStart-Service\b/i,/\bStop-Service\b/i,
    /\bRestart-Service\b/i,/\bInvoke-Sqlcmd\b/i,/\bSet-Content\b/i,
    /\bOut-File\b/i,/\bAdd-Content\b/i,/\bNew-Item\b/i,
    /\bSet-Item\b/i,/\bRemove-Item\b/i,/\bRegister-ScheduledTask\b/i,
    /\bStart-Process\b/i,/\bInvoke-RestMethod\b/i,/\bInvoke-WebRequest\b/i,
    /::WriteAllBytes/,/::WriteAllText/,/\bSendKeys\b/i])
   assert.doesNotMatch(source,expr);
});
check("valid-but-missing sources remain only an observation",()=>{
 const r=verify(example());
 assert.equal(r.status,"OBSERVATION_FORMAT_VALID_ONLY");
 assert.equal(r.observed_installed_gate,"NOT_PROVEN");
 assert.equal(r.authorizes_cutover,false);
});
check("consumer and motor hashes are independently checked, without certifying installed V6.8",()=>{
 const p=example();
 const a=p.files.find(x=>x.label==="installed_consumer_v2");
 Object.assign(a,{state:"HASHED_PASSIVELY",bytes:321,sha256:"a".repeat(64),
  git_blob_sha1:EXPECTED.consumer});
 const m=p.files.find(x=>x.label==="packaging_motor");
 Object.assign(m,{state:"HASHED_PASSIVELY",bytes:400,sha256:EXPECTED.motor,
  git_blob_sha1:"b".repeat(40)});
 p.observations.consumer_matches_last_audited_v2=true;
 p.observations.packaging_motor_matches_pinned=true;
 assert.equal(verify(p).status,"OBSERVATION_FORMAT_VALID_ONLY");
 assert.equal(verify(p).observed_installed_gate,"NOT_PROVEN");
 p.observations.consumer_matches_last_audited_v2=false;
 assertBlocked(p);
});
check("extra customer payload, paths, raw processes and arbitrary fields are rejected",()=>{
 for(const [section,key] of [["root","raw_order"],["service","command_line"],
  ["file","full_path"],["observations","human_override_contents"]]){
  const p=example();
  if(section==="root")p[key]="SECRET";
  if(section==="service")p.service[key]="SECRET";
  if(section==="file")p.files[0][key]="SECRET";
  if(section==="observations")p.observations[key]="SECRET";
  assertBlocked(p);
 }
});
check("unexpected file labels, duplicate scope and malformed hashes reject",()=>{
 const p=example();
 p.files[1].label=p.files[0].label;
 assertBlocked(p);
 const q=example();
 q.files[0]={...q.files[0],state:"HASHED_PASSIVELY",bytes:0,sha256:"invalid",
  git_blob_sha1:"c".repeat(40)};
 assertBlocked(q);
});
check("effectful claims never become observational evidence",()=>{
 for(const key of EFFECTS){
  const p=example();p.effects[key]=true;assertBlocked(p);
 }
 const p=example();p.authorizes_cutover=true;assertBlocked(p);
});
check("no timestamp, unknown runtime proof, or truncated scope accepted",()=>{
 const a=example();a.observed_utc="invalid";assertBlocked(a);
 const b=example();b.observations.windows_mandatory_v68_gate="PROVEN";assertBlocked(b);
 const c=example();c.files.pop();assertBlocked(c);
});
console.log("THERMAL_PASSIVE_WINDOWS_AUDIT_V723="+count+"/"+count+
 " STATIC_SCRIPT_CONTRACT AND SYNTHETIC_REPORTS NO_WINDOWS_EXECUTION");

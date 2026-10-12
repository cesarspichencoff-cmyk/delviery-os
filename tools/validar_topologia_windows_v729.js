"use strict";
/** V7.29 strict report-envelope validation, never attests an installed hook. */
const fs=require("node:fs"),path=require("node:path");
const EFFECT_KEYS=["service_start","service_stop","service_restart","file_write",
 "database_write","printer","spooler_write","sequence_write","deploy"];
const KEYS={
 root:["schema","scope","status","observed_utc","service","topology",
  "mandatory_v68_gate","source_consistency","human_shift",
  "order_content_exposed","effects","authorizes_cutover"],
 service:["lookup","state","start_mode","pid_present","image_mentions_reader"],
 topology:["scan","watcher_child","legacy_shadow_loop_child","candidate_v2_child",
  "direct_children_count"]
};
const choices={
 lookup:["UNKNOWN","FOUND","NOT_FOUND","UNREADABLE"],
 scan:["UNKNOWN","DIRECT_CHILDREN_OBSERVED","NOT_APPLICABLE_NO_SERVICE",
  "NO_RUNNING_SERVICE_PID","UNREADABLE"],
 child:["UNKNOWN","NOT_OBSERVED","OBSERVED"]
};
const isObj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,fields)=>isObj(x)&&Object.keys(x).length===fields.length&&
 fields.every(k=>Object.hasOwn(x,k));
function verify(p){
 const reasons=[];
 const fail=s=>reasons.push(s);
 const response=()=>({
  schema:"deliveryos.windows-process-topology-verdict.v729",
  status:reasons.length?"BLOCKED":"OBSERVATION_FORMAT_VALID_ONLY",
  reasons:[...new Set(reasons)].sort(),runtime_mandatory_gate:"NOT_PROVEN",
  authorizes_cutover:false
 });
 if(!exact(p,KEYS.root)){
  fail("REPORT_FIELDS_INVALID_OR_CUSTOMER_CONTENT");return response();
 }
 if(p.schema!=="deliveryos.windows-process-topology-passive.v729"||
  p.scope!=="LOCAL_CIM_READ_ONLY_NO_COMMANDLINES_EXPORTED"||
  p.status!=="OBSERVATION_ONLY_NOT_RUNTIME_ATTESTATION"||
  p.mandatory_v68_gate!=="UNKNOWN_NOT_PROVEN_BY_PROCESS_SCAN"||
  p.source_consistency!=="UNKNOWN_NOT_PROVEN_BY_PROCESS_SCAN"||
  p.human_shift!=="UNKNOWN_NOT_INSPECTED"||
  p.order_content_exposed!==false||p.authorizes_cutover!==false)
  fail("AUTHORITY_OR_PRIVACY_CLAIMS_INVALID");
 if(typeof p.observed_utc!=="string"||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(p.observed_utc)||
  !Number.isFinite(Date.parse(p.observed_utc)))
  fail("TIMESTAMP_INVALID");
 if(!exact(p.effects,EFFECT_KEYS)||EFFECT_KEYS.some(k=>p.effects[k]!==false))
  fail("EFFECTS_MUST_BE_FALSE");
 const s=p.service,t=p.topology;
 if(!exact(s,KEYS.service)||!choices.lookup.includes(s.lookup)||
  typeof s.state!=="string"||s.state.length>48||
  typeof s.start_mode!=="string"||s.start_mode.length>48||
  typeof s.pid_present!=="boolean"||
  typeof s.image_mentions_reader!=="boolean")
  fail("SERVICE_METADATA_INVALID");
 if(!exact(t,KEYS.topology)||!choices.scan.includes(t.scan)||
  ["watcher_child","legacy_shadow_loop_child","candidate_v2_child"].some(
   k=>!choices.child.includes(t[k]))||
  !(t.direct_children_count===null||(Number.isSafeInteger(t.direct_children_count)&&
   t.direct_children_count>=0&&t.direct_children_count<=100000)))
  fail("TOPOLOGY_METADATA_INVALID");
 if(exact(s,KEYS.service)&&exact(t,KEYS.topology)){
  const observed=t.scan==="DIRECT_CHILDREN_OBSERVED";
  if(observed&&(!s.pid_present||s.lookup!=="FOUND"||
    !Number.isSafeInteger(t.direct_children_count)))
   fail("CHILDREN_SCAN_NOT_BOUND_TO_RUNNING_SERVICE");
  if(!observed&&(t.direct_children_count!==null||
    ["watcher_child","legacy_shadow_loop_child","candidate_v2_child"].some(
     k=>t[k]!=="UNKNOWN")))
   fail("UNOBSERVED_TOPOLOGY_OVERCLAIMED");
  if(t.scan==="NOT_APPLICABLE_NO_SERVICE"&&s.lookup!=="NOT_FOUND")
   fail("ABSENT_SERVICE_INCONSISTENT");
  if(t.scan==="NO_RUNNING_SERVICE_PID"&&
   (s.lookup!=="FOUND"||s.pid_present))
   fail("SERVICE_PID_INCONSISTENT");
  if(s.lookup==="UNREADABLE"&&t.scan!=="UNREADABLE")
   fail("UNREADABLE_SERVICE_OVERCLAIMED");
  if(observed&&t.direct_children_count===0&&
   ["watcher_child","legacy_shadow_loop_child","candidate_v2_child"].some(
    k=>t[k]==="OBSERVED"))
   fail("EMPTY_CHILD_SET_INCONSISTENT");
 }
 return response();
}
function main(argv){
 if(argv.length!==1)throw Error("EXPECTED_ONE_LOCAL_REPORT");
 const p=path.resolve(argv[0]),stat=fs.lstatSync(p);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)
  throw Error("INVALID_LOCAL_REPORT_FILE");
 const verdict=verify(JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")));
 console.log(JSON.stringify(verdict));
 if(verdict.status==="BLOCKED")process.exitCode=2;
}
if(require.main===module)try{main(process.argv.slice(2));}
catch{console.log(JSON.stringify({schema:"deliveryos.windows-process-topology-verdict.v729",
 status:"BLOCKED",reasons:["LOCAL_REPORT_NOT_READABLE_OR_JSON"],
 runtime_mandatory_gate:"NOT_PROVEN",authorizes_cutover:false}));process.exitCode=2;}
module.exports={verify,EFFECT_KEYS,KEYS};

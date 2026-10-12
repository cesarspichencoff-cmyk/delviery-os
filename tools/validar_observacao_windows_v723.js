"use strict";
/**
 * V7.23 read-only local audit-envelope verifier. A caller-supplied Windows
 * report is NOT proof of service identity/attestation or print acceptance.
 * Only validates the privacy-minimized schema and self-consistency.
 */
const fs=require("node:fs");
const path=require("node:path");
const EXPECTED={
 consumer:"22e3bdcbbed1cf245088f32679dd29ffb50766c9",
 motor:"1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e"
};
const FILES=["watcher","shadow_loop","installed_consumer_v2","packaging_motor",
 "academy_app_data","routing","printer_map","non_production",
 "product_identity_cache","product_aliases","human_overrides"];
const EFFECTS=["service_start","service_stop","service_restart","file_write",
 "database_write","printer","spooler_write","sequence_write","deploy"];
const SOURCE_STATES=new Set(["UNKNOWN","MISSING","REPARSE_POINT_REJECTED",
 "SIZE_LIMIT_EXCEEDED","CHANGED_DURING_READ","UNREADABLE","HASHED_PASSIVELY"]);
const EXACT={
 root:["schema","scope","status","observed_utc","service","files",
  "observations","effects","authorizes_cutover"],
 service:["found","state","start_mode","pid_present","path_mentions_reader"],
 file:["label","state","bytes","sha256","git_blob_sha1"],
 observations:["consumer_matches_last_audited_v2","packaging_motor_matches_pinned",
  "windows_mandatory_v68_gate","shift_current","real_order_pair_coverage",
  "printer_acceptance"]
};
const validKeys=(obj,keys)=>obj&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
const hex=(value,n)=>typeof value==="string"&&
 new RegExp("^[0-9a-f]{"+n+"}$").test(value);
function verify(payload){
 const errors=[];
 const fail=why=>{errors.push(why);};
 const block=()=>({schema:"deliveryos.windows-observation-verdict.v723",
  status:errors.length?"BLOCKED":"OBSERVATION_FORMAT_VALID_ONLY",
  reasons:[...new Set(errors)].sort(),observed_installed_gate:"NOT_PROVEN",
  authorizes_cutover:false,effects:{print:false,spooler_write:false,deploy:false}});
 if(!validKeys(payload,EXACT.root)){
  fail("ROOT_SCHEMA_OR_EXTRA_FIELDS_INVALID");return block();
 }
 if(payload.schema!=="deliveryos.windows-service-passive-observation.v723"||
    payload.scope!=="LOCAL_READ_ONLY_NO_ORDER_PAYLOAD"||
    payload.status!=="OBSERVATION_NOT_INSTALLATION_PROOF"||
    payload.authorizes_cutover!==false)
  fail("ROOT_AUTHORITY_SCOPE_INVALID");
 if(typeof payload.observed_utc!=="string"||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(payload.observed_utc)||
    !Number.isFinite(Date.parse(payload.observed_utc)))
  fail("OBSERVED_TIMESTAMP_INVALID");
 const service=payload.service;
 if(!validKeys(service,EXACT.service)||typeof service.found!=="boolean"||
    typeof service.pid_present!=="boolean"||
    typeof service.path_mentions_reader!=="boolean"||
    typeof service.state!=="string"||service.state.length>40||
    typeof service.start_mode!=="string"||service.start_mode.length>40)
  fail("SERVICE_METADATA_UNSAFE_OR_MALFORMED");
 const e=payload.effects;
 if(!validKeys(e,EFFECTS)||EFFECTS.some(k=>e[k]!==false))
  fail("FORBIDDEN_EFFECT_CLAIM");
 const files=payload.files;
 if(!Array.isArray(files)||files.length!==FILES.length){
  fail("INCOMPLETE_FILE_SCOPE");
 }else{
  const seen=new Set();
  for(const x of files){
   if(!validKeys(x,EXACT.file)||!FILES.includes(x?.label)||
      seen.has(x?.label)||!SOURCE_STATES.has(x?.state)){
    fail("FILE_SCHEMA_OR_DUPLICATE_INVALID");continue;
   }
   seen.add(x.label);
   if(x.state==="HASHED_PASSIVELY"){
    if(!Number.isSafeInteger(x.bytes)||x.bytes<0||x.bytes>1048576||
      !hex(x.sha256,64)||!hex(x.git_blob_sha1,40))
      fail("FILE_HASH_OR_BUDGET_INVALID");
   }else if(x.bytes!==null||x.sha256!==null||x.git_blob_sha1!==null)
    fail("UNREADABLE_FILE_CLAIMS_HASH");
  }
  if(seen.size!==FILES.length)fail("FILE_COVERAGE_INVALID");
 }
 const observations=payload.observations;
 if(!validKeys(observations,EXACT.observations)||
   typeof observations.consumer_matches_last_audited_v2!=="boolean"||
   typeof observations.packaging_motor_matches_pinned!=="boolean"||
   ["windows_mandatory_v68_gate","shift_current","real_order_pair_coverage",
    "printer_acceptance"].some(k=>observations?.[k]!=="UNKNOWN_NOT_INSPECTED"&&
    !(k==="windows_mandatory_v68_gate"&&
      observations?.[k]==="UNKNOWN_NOT_PROVEN_BY_CHECKSUM")))
  fail("OBSERVATION_OVERCLAIMS_RUNTIME_PROOF");
 else if(Array.isArray(files)){
  const by=Object.fromEntries(files.filter(x=>x&&typeof x.label==="string")
   .map(x=>[x.label,x]));
  const validConsumer=by.installed_consumer_v2?.state==="HASHED_PASSIVELY"&&
   by.installed_consumer_v2.git_blob_sha1===EXPECTED.consumer;
  const validMotor=by.packaging_motor?.state==="HASHED_PASSIVELY"&&
   by.packaging_motor.sha256===EXPECTED.motor;
  if(observations.consumer_matches_last_audited_v2!==validConsumer||
     observations.packaging_motor_matches_pinned!==validMotor)
    fail("OBSERVATION_CHECKSUM_BOOLEAN_INCONSISTENT");
 }
 return block();
}
function main(argv){
 if(argv.length!==1)throw Error("USAGE: node validar_observacao_windows_v723.js local-audit.json");
 const p=path.resolve(argv[0]),s=fs.lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink()||s.size>262144)
  throw Error("AUDIT_ENVELOPE_FILE_INVALID");
 const result=verify(JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")));
 console.log(JSON.stringify(result));
 if(result.status!=="OBSERVATION_FORMAT_VALID_ONLY")process.exitCode=2;
}
if(require.main===module)try{main(process.argv.slice(2));}
catch(e){console.log(JSON.stringify({schema:"deliveryos.windows-observation-verdict.v723",
 status:"BLOCKED",reasons:["AUDIT_ENVELOPE_NOT_READABLE_OR_JSON"],
 observed_installed_gate:"NOT_PROVEN",authorizes_cutover:false,
 effects:{print:false,spooler_write:false,deploy:false}}));process.exitCode=2;}
module.exports={verify,FILES,EFFECTS,EXPECTED};

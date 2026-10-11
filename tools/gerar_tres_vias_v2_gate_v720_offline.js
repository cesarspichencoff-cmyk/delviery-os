"use strict";
/**
 * V7.20: candidate ONLY, offline pipeline V2 consumer -> existing V6.8 gate
 * -> existing three-ticket offline renderer. Never a Windows service hook.
 * An offline preview is not a release or print authorization.
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),
 crypto=require("node:crypto");
const {spawnSync}=require("node:child_process");
const {verifyLiveReaderPairV68}=
 require("../dist/src/production/stableReaderShadowPairV68.js");
const {run:renderVerifiedOffline,blob}=
 require("./gerar_tres_vias_par_leitor_v68_offline.js");
const MANIFEST=path.join(__dirname,
 "../runtime/shadow/thermal-consumer-release-hold.v1.json");
const NO_EFFECTS=Object.freeze({reader_access:false,database_write:false,
 sequence_binding_write:false,print:false,spooler_write:false,
 deploy:false,fiscal:false,sefaz:false});
function parseArgs(argv){
 const required=["--event","--consumer","--proof","--motor"];
 if(argv.length!==8)throw Error("FOUR_EXPLICIT_LOCAL_SOURCES_REQUIRED");
 const out={};
 for(let i=0;i<argv.length;i+=2){
  if(!required.includes(argv[i])||typeof argv[i+1]!=="string"||
    !argv[i+1]||Object.hasOwn(out,argv[i]))
   throw Error("FOUR_EXPLICIT_LOCAL_SOURCES_REQUIRED");
  out[argv[i]]=path.resolve(argv[i+1]);
 }
 if(required.some(k=>!Object.hasOwn(out,k)))
   throw Error("FOUR_EXPLICIT_LOCAL_SOURCES_REQUIRED");
 return out;
}
function readBound(file){
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>1024*1024)
   throw Error("SOURCE_FILE_BUDGET_EXCEEDED");
 return fs.readFileSync(file);
}
function sha(bytes){
 return crypto.createHash("sha256").update(bytes).digest("hex");
}
function blocked(reasons,stage="V68_PAIR_GATE"){
 const payload={schema:"deliveryos.v2-v68-three-ticket-entry.v720.offline",
  status:"BLOCKED",stage,reasons:[...new Set(reasons)].sort(),
  outputs:[],print_authorized:false,effects:NO_EFFECTS};
 console.log(JSON.stringify(payload));
 return {ok:false,payload};
}
function run(argv=process.argv.slice(2)){
 const args=parseArgs(argv);
 const hold=JSON.parse(readBound(MANIFEST).toString("utf8"));
 if(hold.status!=="DRAFT_HOLD_NOT_INSTALLED"||
    hold.preferred_future_candidate?.installed!==false||
    hold.preferred_future_candidate?.print_authorized!==false||
    hold.effect_boundaries?.printer!==false||
    hold.effect_boundaries?.deploy!==false)
  throw Error("CANDIDATE_HOLD_INVALID");
 const code=readBound(args["--consumer"]);
 if(blob(code)!==hold.preferred_future_candidate.git_blob_sha1)
  throw Error("CONSUMER_GIT_BLOB_NOT_PINNED");
 const source=readBound(args["--event"]);
 const event=JSON.parse(source.toString("utf8").replace(/^\uFEFF/,""));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v720-gated-"));
 try{
  // Consumer reads an immutable local COPY of the exact bytes validated
  // downstream. Never trust a separately supplied decision file.
  const eventPath=path.join(dir,"event.json");
  const decisionPath=path.join(dir,"decision.json");
  fs.writeFileSync(eventPath,source,{flag:"wx"});
  const child=spawnSync(process.execPath,[args["--consumer"],eventPath],{
   encoding:"utf8",timeout:15000,windowsHide:true,maxBuffer:1024*1024
  });
  if(child.error||![0,5].includes(child.status)||
     !child.stdout||Buffer.byteLength(child.stdout)>1024*1024)
   return blocked(["V2_CONSUMER_EXECUTION_FAILED"],"CONSUMER_EXECUTION");
  let decision;
  try{decision=JSON.parse(child.stdout);}
  catch{return blocked(["V2_CONSUMER_DECISION_NOT_JSON"],"CONSUMER_EXECUTION");}
  // Reuse the exact V6.8 implementation, with the V2 decision produced
  // by this child process for THIS event, not a cached report envelope.
  const result=verifyLiveReaderPairV68(event,decision);
  if(result.status!=="PAIRED_SOURCE_VERIFIED")
   return blocked(result.reasons);
  // Consumer may not mutate the event on disk after its read.
  if(sha(readBound(eventPath))!==sha(source)||
     sha(readBound(args["--event"]))!==sha(source))
   return blocked(["V2_EVENT_CHANGED_DURING_PIPELINE"],"SNAPSHOT_IDENTITY");
  fs.writeFileSync(decisionPath,JSON.stringify(decision),{flag:"wx"});
  // The existing renderer independently calls projectVerifiedReaderPairV68,
  // verifies source-pinned motor + reconciliation, and rejects partial tickets.
  // It emits ONLY offline preview files; never print/spool/sequence writes.
  return renderVerifiedOffline(["--event",eventPath,"--decision",decisionPath,
   "--proof",args["--proof"],"--motor",args["--motor"]]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
if(require.main===module){
 try{if(!run().ok)process.exitCode=2;}
 catch(e){
  // Do not leak customer data, local paths or raw consumer stderr.
  blocked(["OFFLINE_PIPELINE_ERROR"],"FAIL_CLOSED");
  process.exitCode=2;
 }
}
module.exports={run,parseArgs,NO_EFFECTS};

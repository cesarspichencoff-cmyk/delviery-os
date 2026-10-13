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
const {PACKAGING_SOURCE_SHA256_V78,PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const MANIFEST=path.join(__dirname,
 "../runtime/shadow/thermal-consumer-release-hold.v1.json");
const RULE_FILES=Object.freeze([
 "app-data.json","routing.json","printer-map.json","non-production.json",
 "product-identity-cache-v1.json","product-aliases-v1.json",
 "human-order-overrides-v1.json"
]);
const ORIGINS=Object.freeze([
 ["tata-academia:installed/packaging-current.js","packaging-current.js"],
 ["tata-academia:installed/app-data.json","app-data.json"],
 ...RULE_FILES.slice(1).map(name=>["deliveryos:installed/"+name,name])
]);
const NO_EFFECTS=Object.freeze({reader_access:false,database_write:false,
 sequence_binding_write:false,print:false,spooler_write:false,
 deploy:false,fiscal:false,sefaz:false});
function parseArgs(argv){
 const required=["--event","--consumer","--proof","--motor","--sequence-fixture"];
 if(argv.length!==10)throw Error("FIVE_EXPLICIT_LOCAL_SOURCES_REQUIRED");
 const out={};
 for(let i=0;i<argv.length;i+=2){
  if(!required.includes(argv[i])||typeof argv[i+1]!=="string"||
    !argv[i+1]||Object.hasOwn(out,argv[i]))
   throw Error("FIVE_EXPLICIT_LOCAL_SOURCES_REQUIRED");
  out[argv[i]]=path.resolve(argv[i+1]);
 }
 if(required.some(k=>!Object.hasOwn(out,k)))
   throw Error("FIVE_EXPLICIT_LOCAL_SOURCES_REQUIRED");
 return out;
}
// V7.25: establish source identity on the OPEN descriptor, not on a
// pathname checked before a second open (lstat/readFile TOCTOU).
// O_NOFOLLOW rejects a leaf symlink even if it is swapped into place before
// open; O_NONBLOCK avoids hanging on a substituted FIFO. Read only bytes
// declared by the original fstat, then verify same open inode/metadata.
// These safeguards apply only to this Linux-only offline entrypoint.
const SOURCE_MAX_BYTES=1024*1024;
function readBound(file){
 let fd;
 try{
  if(process.platform==="win32"&&fs.lstatSync(file).isSymbolicLink())
   throw Error("SOURCE_SYMLINK_NOT_ALLOWED");
  const flags=fs.constants.O_RDONLY|(process.platform==="linux"?
   fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK:0);
  fd=fs.openSync(file,flags);
  const before=fs.fstatSync(fd,{bigint:true});
  if(!before.isFile()||before.size>BigInt(SOURCE_MAX_BYTES)||before.size<0n)
   throw Error("SOURCE_FILE_BUDGET_EXCEEDED");
  const bytes=Buffer.alloc(Number(before.size));
  let position=0;
  while(position<bytes.length){
   const n=fs.readSync(fd,bytes,position,bytes.length-position,position);
   if(n<=0)throw Error("SOURCE_FILE_CHANGED_DURING_READ");
   position+=n;
  }
  const after=fs.fstatSync(fd,{bigint:true});
  if(!after.isFile()||after.size!==before.size||
     after.ino!==before.ino||after.dev!==before.dev||
     after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs)
   throw Error("SOURCE_FILE_CHANGED_DURING_READ");
  return bytes;
 }finally{
  if(fd!==undefined)fs.closeSync(fd);
 }
}
function sha(bytes){
 return crypto.createHash("sha256").update(bytes).digest("hex");
}
const CONSUMER_EFFECT_KEYS=Object.freeze(["database_read","database_write",
 "sequence_binding_write","print","spooler_write","odhen_write",
 "fiscal_action","sefaz_call"]);
function readOnlyConsumerResult(decision,exit){
 if(!decision||typeof decision!=="object"||Array.isArray(decision)||
    typeof decision.ready!=="boolean"||
    (exit===0)!==decision.ready||![0,5].includes(exit))
  return false;
 const effects=decision.effects;
 return !!effects&&typeof effects==="object"&&!Array.isArray(effects)&&
   Object.keys(effects).length===CONSUMER_EFFECT_KEYS.length&&
   CONSUMER_EFFECT_KEYS.every(k=>Object.hasOwn(effects,k)&&effects[k]===false);
}
function lineageMatchesPinnedSources(decision,sources){
 const a=decision?.rule_lineage?.academy_rule_refs;
 const d=decision?.rule_lineage?.delivery_rule_refs;
 if(!Array.isArray(a)||a.length!==2||!Array.isArray(d)||d.length!==6)
  return false;
 const actual=[...a,...d];
 return actual.length===ORIGINS.length&&
  ORIGINS.every(([label,name],i)=>Buffer.isBuffer(sources.get(name))&&
   actual[i]===label+"#sha256="+sha(sources.get(name)));
}
// V7.27: bind event key to its three raw SQL order identifiers.
// A matching event/decision pair alone cannot authenticate a forged key.
function exactOrderIdentity(event){
 const order=event?.order;
 if(!event||!order||event.schema!=="deliveryos.tata-reader-stable-order-event.v1")
  return false;
 // Actual CAIXA_MOOCA watcher snapshot (13/10): filial, loja,
 // NRVENDAREST and NRCOMANDA are all mandatory identity components.
 const fields=["CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA"];
 if(fields.some(k=>typeof order[k]!=="string"||!order[k].length||
    order[k].length>96||/[|\r\n]/.test(order[k])))
  return false;
 return typeof event.order_key==="string"&&
  event.order_key===[order.CDFILIAL,order.CDLOJA,order.NRCOMANDA].join("|");
}
function withoutNodePreloads(environment){
 const copy={...environment};
 // Environment names are case insensitive on Windows. Scrub all spellings.
 for(const key of Object.keys(copy))
  if(/^(?:NODE_OPTIONS|NODE_PATH|NPM_CONFIG_NODE_OPTIONS)$/i.test(key))
   delete copy[key];
 return copy;
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
 // Windows replay is permitted ONLY inside a disposable GitHub pull-request
 // runner, never as a Windows service hook. The source-pinned consumer is
 // copied and its one absolute sequence path is redirected to temp fixtures.
 const windowsCI=process.platform==="win32"&&
   process.env.GITHUB_ACTIONS==="true"&&process.env.CI==="true"&&
   process.env.RUNNER_OS==="Windows"&&
   process.env.GITHUB_EVENT_NAME==="pull_request"&&
   process.env.GITHUB_REPOSITORY==="cesarspichencoff-cmyk/delviery-os";
 if(process.platform!=="linux"&&!windowsCI)
  return blocked(["ISOLATED_CI_REQUIRED"],"ISOLATION");
 const hold=JSON.parse(readBound(MANIFEST).toString("utf8"));
 if(hold.status!=="DRAFT_HOLD_NOT_INSTALLED"||
    hold.preferred_future_candidate?.installed!==false||
    hold.preferred_future_candidate?.print_authorized!==false||
    hold.effect_boundaries?.printer!==false||
    hold.effect_boundaries?.deploy!==false)
  throw Error("CANDIDATE_HOLD_INVALID");
 const code=readBound(args["--consumer"]);
 if(blob(code)!==hold.preferred_future_candidate.git_blob_sha1)
  return blocked(["CONSUMER_GIT_BLOB_NOT_PINNED"],"SOURCE_PREFLIGHT");
 // The V2 consumer requires this JavaScript module at startup. Verify it
 // BEFORE spawn: a post-execution lineage check cannot undo code execution.
 const motorPath=path.join(path.dirname(args["--consumer"]),"packaging-current.js");
 const motorSource=readBound(motorPath);
 if(sha(motorSource)!==PACKAGING_SOURCE_SHA256_V78)
  return blocked(["CANONICAL_PACKAGING_MOTOR_SOURCE_NOT_PINNED_BEFORE_EXEC"],"SOURCE_PREFLIGHT");
 const seqBytes=readBound(args["--sequence-fixture"]);
 const seq=JSON.parse(seqBytes.toString("utf8").replace(/^\uFEFF/,""));
 if(seq?.schema!=="deliveryos.tata-sequence-state.v1"||
    !Number.isSafeInteger(seq.next_value)||seq.next_value<1||seq.next_value>999)
  return blocked(["SYNTHETIC_SEQUENCE_FIXTURE_INVALID"],"SOURCE_PREFLIGHT");
 const source=readBound(args["--event"]);
 const event=JSON.parse(source.toString("utf8").replace(/^\uFEFF/,""));
 if(!exactOrderIdentity(event))
  return blocked(["EVENT_ORDER_KEY_NOT_BOUND_TO_RAW_IDENTIFIERS"],"SOURCE_PREFLIGHT");
 const consumerSourceDir=path.dirname(args["--consumer"]);
 // Copy every source read by V2, avoiding mixed revisions during its run.
 // These are snapshot bytes, not human approvals or trusted business facts.
 const ruleSources=new Map([["packaging-current.js",motorSource]]);
 for(const name of RULE_FILES)
  ruleSources.set(name,readBound(path.join(consumerSourceDir,name)));
 const proofSource=readBound(args["--proof"]);
 const rendererMotor=readBound(args["--motor"]);
 if(blob(rendererMotor)!==PACKAGING_SOURCE_BLOB_V63||
    sha(rendererMotor)!==PACKAGING_SOURCE_SHA256_V78)
  return blocked(["RENDER_MOTOR_SOURCE_NOT_PINNED"],"SOURCE_PREFLIGHT");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v720-gated-"));
 try{
  // Consumer reads an immutable local COPY of the exact bytes validated
  // downstream. Never trust a separately supplied decision file.
  const eventPath=path.join(dir,"event.json");
  const decisionPath=path.join(dir,"decision.json");
  const proofPath=path.join(dir,"proof.json");
  const renderMotorPath=path.join(dir,"render-motor.js");
  const isolatedDir=path.join(dir,"consumer");
  fs.mkdirSync(isolatedDir);
  const isolatedConsumer=path.join(isolatedDir,"consumer.cjs");
  // Preserve original consumer bytes/source pin. On Windows CI only, make
  // a narrowly scoped, audited copy which reads the synthetic local sequence.
  // The original V7.14 candidate and its Git blob are never modified.
  let execCode=code;
  if(windowsCI){
   const needle=String.raw`const seqPath = "C:\\ProgramData\\TataComandaReader\\state\\tata-sequence-state.json";`;
   const replacement='const seqPath = require("node:path").join(__dirname,"..","sequence.json");';
   const src=code.toString("utf8");
   if(src.split(needle).length!==2)
    return blocked(["WINDOWS_SEQUENCE_PATH_ADAPTER_NOT_EXACT"],"ISOLATION");
   execCode=Buffer.from(src.replace(needle,replacement),"utf8");
  }
  fs.writeFileSync(isolatedConsumer,execCode,{flag:"wx"});
  for(const [name,bytes] of ruleSources)
   fs.writeFileSync(path.join(isolatedDir,name),bytes,{flag:"wx"});
  fs.writeFileSync(proofPath,proofSource,{flag:"wx"});
  fs.writeFileSync(renderMotorPath,rendererMotor,{flag:"wx"});
  fs.writeFileSync(eventPath,source,{flag:"wx"});
  // On Linux the *Windows-formatted* hardcoded path is a relative filename.
  // Only inside this disposable sandbox, provide the explicitly supplied
  // synthetic sequence file. No real Windows disk or TATÁ sequence is read.
  const sequenceFilename=windowsCI?"sequence.json":
   String.raw`C:\ProgramData\TataComandaReader\state\tata-sequence-state.json`;
  fs.writeFileSync(path.join(dir,sequenceFilename),seqBytes,{flag:"wx"});
  // Prevent NODE_OPTIONS --require / --import and NODE_PATH from
  // preloading unrelated executable JavaScript outside the pinned entry.
  const childEnv=withoutNodePreloads(process.env);
  const child=spawnSync(process.execPath,[isolatedConsumer,eventPath],{
   encoding:"utf8",timeout:15000,windowsHide:true,maxBuffer:1024*1024,
   env:childEnv,cwd:dir
  });
  if(child.error||![0,5].includes(child.status)||
     !child.stdout||Buffer.byteLength(child.stdout)>1024*1024)
   return blocked(["V2_CONSUMER_EXECUTION_FAILED"],"CONSUMER_EXECUTION");
  let decision;
  try{decision=JSON.parse(child.stdout);}
  catch{return blocked(["V2_CONSUMER_DECISION_NOT_JSON"],"CONSUMER_EXECUTION");}
  if(!readOnlyConsumerResult(decision,child.status))
   return blocked(["V2_CONSUMER_EFFECT_OR_EXIT_INCONSISTENT"],"CONSUMER_EXECUTION");
  if(!lineageMatchesPinnedSources(decision,ruleSources))
   return blocked(["V2_DECISION_SOURCE_LINEAGE_NOT_EXACT_INPUT_BYTES"],"SOURCE_LINEAGE");
  // Reuse the exact V6.8 implementation, with the V2 decision produced
  // by this child process for THIS event, not a cached report envelope.
  const result=verifyLiveReaderPairV68(event,decision);
  if(result.status!=="PAIRED_SOURCE_VERIFIED")
   return blocked(result.reasons);
  // Consumer may not mutate the event on disk after its read.
  const snapshotsIntact=sha(readBound(eventPath))===sha(source)&&
    sha(readBound(args["--event"]))===sha(source)&&
    sha(readBound(args["--consumer"]))===sha(code)&&
    sha(readBound(isolatedConsumer))===sha(execCode)&&
    sha(readBound(motorPath))===sha(motorSource)&&
    sha(readBound(args["--sequence-fixture"]))===sha(seqBytes)&&
    sha(readBound(path.join(dir,sequenceFilename)))===sha(seqBytes)&&
    sha(readBound(args["--proof"]))===sha(proofSource)&&
    sha(readBound(proofPath))===sha(proofSource)&&
    sha(readBound(args["--motor"]))===sha(rendererMotor)&&
    sha(readBound(renderMotorPath))===sha(rendererMotor)&&
    RULE_FILES.every(name=>sha(readBound(path.join(consumerSourceDir,name)))===
      sha(ruleSources.get(name)))&&
    [...ruleSources].every(([name,bytes])=>
      sha(readBound(path.join(isolatedDir,name)))===sha(bytes));
  if(!snapshotsIntact)
   return blocked(["V2_SOURCE_CHANGED_DURING_PIPELINE"],"SNAPSHOT_IDENTITY");
  fs.writeFileSync(decisionPath,JSON.stringify(decision),{flag:"wx"});
  // The existing renderer independently calls projectVerifiedReaderPairV68,
  // verifies source-pinned motor + reconciliation, and rejects partial tickets.
  // It emits ONLY offline preview files; never print/spool/sequence writes.
  return renderVerifiedOffline(["--event",eventPath,"--decision",decisionPath,
   "--proof",proofPath,"--motor",renderMotorPath]);
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
module.exports={run,parseArgs,readOnlyConsumerResult,
 lineageMatchesPinnedSources,exactOrderIdentity,withoutNodePreloads,readBound,RULE_FILES,NO_EFFECTS};

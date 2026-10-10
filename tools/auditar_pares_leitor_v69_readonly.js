"use strict";
/**
 * V6.9, executable only on an explicitly supplied local snapshot directory.
 * Operational audit is READ-ONLY: no service control, SQL, socket, printer,
 * checkout/commit, state update, checkpoint mutation or customer text output.
 *
 * USAGE:
 *   node tools/auditar_pares_leitor_v69_readonly.js \
 *     --events LOCAL_EVENTS --decisions LOCAL_DECISIONS --shift LOCAL_SHIFT_JSON
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const MAX_FILES=5000,MAX_BYTES=512*1024;
const FN=/^[0-9A-Za-z_-]+_[0-9A-Fa-f]{64}\.json$/;
const hex64=x=>typeof x==="string"&&/^[a-f0-9]{64}$/i.test(x);
const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x);
const timestamp=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(x);
const count=(o,k)=>o[k]=(o[k]||0)+1;
function scrubReason(v){
 const s=String(v||"UNKNOWN").toUpperCase();
 // Do not release product ids, order ids or free-form note text.
 const allowed=["SERVICE_STATE_DATE_MISMATCH_ORDER_DATE",
  "SERVICE_STATE_EXPIRED_FOR_ORDER","SERVICE_STATE_MISSING",
  "SERVICE_STATE_SCHEMA_MISMATCH","SERVICE_STATE_CLOCK_INFERENCE_FORBIDDEN",
  "SERVICE_STATE_SERVICE_INVALID","SERVICE_REQUIRED_SUSHI1",
  "SERVICE_REQUIRED_SUSHI2","PACKAGING_UNKNOWN",
  "BAG_SIZE_NOT_FACT","BAG_COUNT_NOT_FACT","KITS_NOT_FACT",
  "TATA_SEQUENCE_STATE_MISSING","TATA_SEQUENCE_STATE_INVALID",
  "PACKAGING_NOT_RUN","CLASSIFICATION_UNKNOWN",
  "ROUTE_NOT_FOUND","IDENTITY_NOT_FOUND","IDENTITY_CANONICAL_MISMATCH",
  "PRINTER_MAP_MISSING","UPSTREAM_SERVICE_STATE_DATE_MISMATCH_ORDER_DATE",
  "UPSTREAM_SERVICE_STATE_EXPIRED_FOR_ORDER"];
 return allowed.find(x=>s===x||s.startsWith(x+"_"))||"OTHER_REDACTED";
}
function readableFile(file){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)
   throw Error("NONREGULAR_OR_OVERSIZED_SNAPSHOT");
 return JSON.parse(fs.readFileSync(file,"utf8").replace(/^\uFEFF/,""));
}
function resolveArgs(args){
 const out={};
 for(let i=0;i<args.length;i+=2){
  if(!["--events","--decisions","--shift"].includes(args[i])||
    !args[i+1]||out[args[i]])
   throw Error("REQUIRED_EXPLICIT_READ_ONLY_PATHS");
  out[args[i]]=path.resolve(args[i+1]);
 }
 if(Object.keys(out).length!==3||out["--events"]===out["--decisions"])
   throw Error("REQUIRED_DISTINCT_EXPLICIT_SOURCE_PATHS");
 for(const dir of ["--events","--decisions"]){
  if(!fs.statSync(out[dir]).isDirectory())throw Error("READER_SOURCE_NOT_DIRECTORY");
 }
 return out;
}
function fingerprint(decision){
 const core={order_key:decision.order_key,snapshot_hash:decision.snapshot_hash,
  ifood_sequence:decision.ifood_sequence,teknisa_sequence:decision.teknisa_sequence,
  service:decision.service,items:decision.items,packaging:decision.packaging,
  kits:decision.kits,sequence:decision.sequence};
 return crypto.createHash("sha256").update(JSON.stringify(core)).digest("hex");
}
function audit(events,decisions,shiftFile){
 const shift=readableFile(shiftFile);
 const filenames=fs.readdirSync(events).filter(f=>FN.test(f));
 if(filenames.length>MAX_FILES)throw Error("AUDIT_FILE_BUDGET_EXCEEDED");
 const selected=filenames.map(f=>({name:f,mtime:fs.statSync(path.join(events,f)).mtimeMs}))
   .sort((a,b)=>b.mtime-a.mtime);
 const evReasons={},decisionReasons={},shiftIssues={};
 let paired=0,missing=0,unreadable=0,matched=0,validFingerprints=0,
     changedFingerprints=0,readyByBoth=0,readySource=0,readyDecision=0,
     revisionMismatches=0,shiftDateMismatch=0,expiredAtOrder=0,
     bothReadyFlagsOnly=0,untrustedReadyClaims=0;
 const newest=[];
 for(const entry of selected){
  const decisionName=entry.name.replace(/\.json$/i,".decision.json");
  const dePath=path.join(decisions,decisionName);
  if(!fs.existsSync(dePath)){missing++;continue}
  try{
   const e=readableFile(path.join(events,entry.name)),d=readableFile(dePath);
   paired++;
   if(e.schema!=="deliveryos.tata-reader-stable-order-event.v1"||
      d.schema!=="deliveryos.live-shadow-decision.v1"||
      !Array.isArray(e.order?.items)||!Array.isArray(d.items)||
      !Array.isArray(e.blockers)||!Array.isArray(d.blocking_reasons)){
     unreadable++;continue;
   }
   const match=!!e.order_key&&hex64(e.snapshot_hash)&&
       e.order_key===d.order_key&&e.snapshot_hash===d.snapshot_hash;
   if(match)matched++;else revisionMismatches++;
   if(e.ready_for_downstream_shadow)readySource++;
   if(d.ready)readyDecision++;
   const fingerprintMatches=hex64(d.fingerprint)&&fingerprint(d)===d.fingerprint;
   if(fingerprintMatches)validFingerprints++;
   else changedFingerprints++;
   const bothFlags=e.ready_for_downstream_shadow===true&&d.ready===true;
   if(bothFlags)bothReadyFlagsOnly++;
   // A decision with valid-looking ready booleans can still be tampered with,
   // based on a stale source, or explicitly blocked.
   const verifiedReady=match&&fingerprintMatches&&bothFlags&&
     e.blockers.length===0&&d.blocking_reasons.length===0&&
     e.service_resolution?.blockers?.length===0&&
     d.service?.blockers?.length===0;
   if(verifiedReady)readyByBoth++;
   else if(bothFlags)untrustedReadyClaims++;
   for(const v of e.blockers)count(evReasons,scrubReason(v));
   for(const v of d.blocking_reasons)count(decisionReasons,scrubReason(v));
   const opened=String(e.order?.DTHRABERMESA||"");
   if(date(shift.operational_date)&&timestamp(opened)&&
      shift.operational_date!==opened.slice(0,10)){
     shiftDateMismatch++;count(shiftIssues,"SHIFT_DATE_NOT_ORDER_DATE");
   }
   if(timestamp(shift.valid_until_local)&&timestamp(opened)&&
      opened.slice(0,19)>shift.valid_until_local.slice(0,19)){
     expiredAtOrder++;count(shiftIssues,"SHIFT_EXPIRED_AT_ORDER");
   }
   if(newest.length<12)newest.push({
     event_revision_matches_decision:match,
     status:verifiedReady?"VERIFIED_ONLY_FOR_EXISTING_SHADOW":"BLOCKED",
     event_reason_classes:[...new Set(e.blockers.map(scrubReason))].sort(),
     decision_reason_classes:[...new Set(d.blocking_reasons.map(scrubReason))].sort()
   });
  }catch{unreadable++}
 }
 const top=map=>Object.entries(map).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
  .slice(0,20).map(([reason,count])=>({reason,count}));
 const snap={schema:"deliveryos.reader-pair-passive-audit.v69",
  mode:"EXPLICIT_LOCAL_FILES_READ_ONLY_NO_CUSTOMER_DATA_OUTPUT",
  observed_file_count:filenames.length,
  paired,missing,unreadable,matching_revisions:matched,revision_mismatches:revisionMismatches,
  content_fingerprints_valid:validFingerprints,content_fingerprints_changed:changedFingerprints,
  event_ready:readySource,decision_ready:readyDecision,
  both_ready_flags_only:bothReadyFlagsOnly,
  untrusted_ready_claims:untrustedReadyClaims,
  both_ready_for_existing_shadow:readyByBoth,
  shift_control:{
   schema_match:shift.schema==="deliveryos.production-service-shift-state.v2",
   service_is_human_proven:["HUMAN_CONFIRMED_RULE","REAL_OBSERVED"].includes(shift.evidence)&&
     !!String(shift.source_ref||"").trim()&&shift.clock_inference_used===false,
   configured_operational_date:date(shift.operational_date)?shift.operational_date:null,
   configured_service:["LUNCH","DINNER"].includes(shift.service)?shift.service:null,
   configured_valid_until:timestamp(shift.valid_until_local)?shift.valid_until_local:null,
   mismatching_event_dates:shiftDateMismatch,expired_for_event_count:expiredAtOrder,
   issues:top(shiftIssues),automatic_shift_selection:false,any_state_write:false,
  },
  event_blocker_classes:top(evReasons),decision_blocker_classes:top(decisionReasons),
  latest_pair_summaries:newest,
  limitations:["SHADOW_READY_IS_NOT_PHYSICAL_PRINT_READINESS",
   "SHADOW_READY_REQUIRES_EXACT_REVISION_AND_VALID_FINGERPRINT_AND_NO_BLOCKERS",
   "NO_OBSERVATION_TEXT_IN_WATCHER_V1",
   "NO_AUTHORITY_TO_RENEW_SHIFT_FROM_CLOCK",
   "NO_LIVE_PRODUCTION_JOIN_OR_PRINT_PROOF"],
  effects:{reader_service_change:false,database_read:false,database_write:false,
   file_write:false,print:false,spooler:false,fiscal:false,cutover:false}
 };
 return snap;
}
if(require.main===module){
 try{
  const p=resolveArgs(process.argv.slice(2));
  console.log(JSON.stringify(audit(p["--events"],p["--decisions"],p["--shift"]),null,2));
 }catch(e){console.error("PASSIVE_READER_AUDIT_V69_BLOCKED:"+String(e.message));process.exitCode=1}
}
module.exports={audit,resolveArgs,scrubReason,fingerprint};

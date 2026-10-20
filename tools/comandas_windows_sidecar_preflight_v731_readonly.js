"use strict";
/**
 * TATÁ Comandas V7.31 — non-installing Windows shadow-sidecar preflight.
 * Observes ONE local watcher snapshot, the current human shift record,
 * the eight preexisting rule sources and the pinned future V2 candidate.
 * No V2 execution, no service control, no sequence allocation, no artifacts.
 * Only sanitized reason codes/booleans escape through stdout.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {checkEvent,RULES,NO_EFFECTS}=require("./auditar_eventos_watcher_v730_readonly.js");
const EXPECTED_MOTOR_SHA256="1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e";
const EXPECTED_CONSUMER_GIT_BLOB="652aae75b3aac314cb0871913658785932e5370a";
const CANDIDATE="live_shadow_consumer_v2_candidate_v714.cjs";
const EVENT_FILENAME=/^[0-9]{10}_[a-f0-9]{64}\.json$/i;
const clean=s=>typeof s==="string"?s:"";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const blob=b=>crypto.createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
function boundFile(p){
 const st=fs.lstatSync(p);
 if(st.isSymbolicLink()||!st.isFile()||st.size<=0||st.size>1024*1024)
  throw Error("BOUNDED_FILE_REQUIRED");
 return fs.readFileSync(p);
}
function date10(s){return /^\d{4}-\d{2}-\d{2}/.test(clean(s))?s.slice(0,10):null;}
function shiftReasons(event,shift){
 const out=[];
 const orderDate=date10(event?.order?.DTHRABERMESA);
 const opDate=date10(shift?.operational_date);
 const limitDate=date10(shift?.valid_until_local);
 const updatedDate=date10(shift?.updated_at);
 if(!orderDate||!opDate||!limitDate||!updatedDate||
   shift?.schema!=="deliveryos.production-service-shift-state.v2")
  return ["SHIFT_RECORD_UNVERIFIED"];
 if(orderDate!==opDate||opDate!==limitDate||updatedDate!==opDate)
  out.push("SHIFT_ORDER_DATE_MISMATCH");
 if(!["LUNCH","DINNER"].includes(shift.service)||
    shift.evidence!=="HUMAN_CONFIRMED_RULE"||
    !clean(shift.source_ref).startsWith("human-confirmed:")||
    shift.clock_inference_used!==false)
  out.push("SHIFT_HUMAN_APPROVAL_UNVERIFIED");
 const r=event?.service_resolution;
 if(!r||!Array.isArray(r.blockers)||r.blockers.length||
    r.service!==shift.service||r.source_ref!==shift.source_ref||
    r.evidence!==shift.evidence)
  out.push("EVENT_SHIFT_NOT_RECONCILED");
 if(typeof shift.valid_until_local!=="string"||
    typeof event?.order?.DTHRABERMESA!=="string"||
    shift.valid_until_local.slice(0,19)<event.order.DTHRABERMESA.slice(0,19))
  out.push("SHIFT_EXPIRED_BEFORE_ORDER");
 // A structurally consistent record DOES NOT authenticate a human.
 return out;
}
function preflight(root,eventName){
 if(typeof root!=="string"||!path.isAbsolute(root))throw Error("ROOT_ABSOLUTE_REQUIRED");
 if(typeof eventName!=="string"||!EVENT_FILENAME.test(eventName))
  throw Error("EVENT_BASENAME_INVALID");
 const blockers=new Set();
 const out={schema:"tata.comandas.windows-sidecar-preflight.v731",
  status:"HOLD",source_consistent:false,event_reconciled:false,
  shift_record_consistent:false,rules_present:0,rules_required:RULES.length,
  canonical_motor_pinned:false,v2_candidate_pinned:false,
  printer_access:false,print_authorized:false,operational_permission:false,
  consumer_executed:false,v68_executed:false,tickets_generated:false,
  effects:NO_EFFECTS,blockers:[]};
 const eventPath=path.join(root,"state","reader-events-v1",eventName);
 let event=null;
 try{event=JSON.parse(boundFile(eventPath).toString("utf8").replace(/^\uFEFF/,""));}
 catch{blockers.add("EVENT_SOURCE_UNAVAILABLE");}
 if(event){
  const err=checkEvent(event);
  for(const e of err)blockers.add(e);
  if(err.length===0)out.event_reconciled=true;
  if(event.ready_for_downstream_shadow!==true)
   blockers.add("WATCHER_EVENT_HOLD");
  if(Array.isArray(event.blockers))
   for(const b of event.blockers)
    if(typeof b==="string"&&/^[A-Z][A-Z0-9_]{2,100}$/.test(b))
     blockers.add(b);
 }
 let shift=null;
 try{shift=JSON.parse(boundFile(path.join(root,"state","production-service-state.json")).toString("utf8"));}
 catch{blockers.add("SHIFT_FILE_UNAVAILABLE");}
 if(event&&shift){
  const err=shiftReasons(event,shift);
  for(const e of err)blockers.add(e);
  out.shift_record_consistent=err.length===0;
 }
 const shadow=path.join(root,"shadow");
 for(const file of RULES){
  try{
   const bytes=boundFile(path.join(shadow,file));
   out.rules_present++;
   if(file==="packaging-current.js")
    out.canonical_motor_pinned=sha(bytes)===EXPECTED_MOTOR_SHA256;
  }catch{blockers.add("RULE_SOURCE_MISSING_OR_INVALID");}
 }
 if(out.rules_present!==RULES.length||!out.canonical_motor_pinned)
  blockers.add("CANONICAL_RULE_SOURCE_UNPROVEN");
 try{
  out.v2_candidate_pinned=blob(boundFile(path.join(shadow,CANDIDATE)))===EXPECTED_CONSUMER_GIT_BLOB;
 }catch{}
 if(!out.v2_candidate_pinned)blockers.add("PINNED_V2_NOT_INSTALLED");
 // Don't imply snapshot consistency proves up-to-date SQL, safe printing or
 // authenticated human authorization. These are separate release barriers.
 out.source_consistent=out.event_reconciled&&out.shift_record_consistent&&
  out.rules_present===RULES.length&&out.canonical_motor_pinned&&
  out.v2_candidate_pinned&&event?.ready_for_downstream_shadow===true&&
  blockers.size===0;
 out.status=out.source_consistent?"ELIGIBLE_FOR_SEPARATE_ISOLATED_REPLAY":"HOLD";
 out.blockers=[...blockers].sort();
 return out;
}
function cli(argv=process.argv.slice(2)){
 if(argv.length!==4||argv[0]!=="--root"||argv[2]!=="--event")
  throw Error("ROOT_AND_EVENT_REQUIRED");
 return {root:argv[1],event:argv[3]};
}
if(require.main===module){
 try{const args=cli();const out=preflight(args.root,args.event);
  process.stdout.write(JSON.stringify(out)+"\n");
  if(out.status!=="ELIGIBLE_FOR_SEPARATE_ISOLATED_REPLAY")process.exitCode=2;
 }catch{
  process.stdout.write(JSON.stringify({schema:"tata.comandas.windows-sidecar-preflight.v731",
    status:"HOLD",blockers:["PREFLIGHT_INPUT_INVALID"],
    operational_permission:false,print_authorized:false,printer_access:false,effects:NO_EFFECTS})+"\n");
  process.exitCode=2;
 }
}
module.exports={preflight,shiftReasons,cli,date10};

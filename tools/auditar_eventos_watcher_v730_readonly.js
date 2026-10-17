"use strict";
/**
 * V7.30 — passive, no-write audit of genuine TataComandaReader V2 event
 * envelopes. Can be invoked with `--root` on a Windows host; NEVER a
 * consumer, print gate, approval mechanism, service installer or spooler.
 * Output has no order numbers, customer notes, paths, filenames or item names.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const EVENT_SCHEMA="deliveryos.tata-reader-stable-order-event.v1";
const MOTOR_SHA="1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e";
const HEADER=["CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA","NRCOMANDAEXT",
 "IDORGCMDVENDA","IDSTCOMANDA","DTHRABERMESA"];
const ITEM=["NRPRODCOMVEN","CDPRODUTO","CDARVPROD","QTPRODCOMVEN","IDSTPRCOMVEN"];
const RULES=["packaging-current.js","app-data.json","routing.json","printer-map.json",
 "non-production.json","product-identity-cache-v1.json",
 "product-aliases-v1.json","human-order-overrides-v1.json"];
const CANDIDATE="live_shadow_consumer_v2_candidate_v714.cjs";
const NO_EFFECTS=Object.freeze({database_read:false,database_write:false,
 service_change:false,local_write:false,print:false,spooler_write:false,
 sequence_write:false,deploy:false,fiscal:false});
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const basenamePattern=/^[0-9]{10}_[0-9a-fA-F]{64}\.json$/;
function regularRead(filename,bytes=1024*1024){
 const st=fs.lstatSync(filename);
 if(st.isSymbolicLink()||!st.isFile()||st.size<1||st.size>bytes)
  throw Error("SOURCE_NOT_BOUNDED_REGULAR_FILE");
 return fs.readFileSync(filename);
}
function exactSnapshotHash(order){
 if(!order||!Array.isArray(order.items)||!Array.isArray(order.observation_rows))
  return null;
 if(HEADER.some(k=>!Object.hasOwn(order,k))||
   order.items.some(i=>!i||ITEM.some(k=>!Object.hasOwn(i,k))))
  return null;
 const basis={};for(const key of HEADER)basis[key]=order[key];
 basis.items=order.items.map(item=>Object.fromEntries(ITEM.map(k=>[k,item[k]])));
 if(order.observation_rows.length)basis.observation_rows=order.observation_rows;
 return sha(Buffer.from(JSON.stringify(basis)));
}
function fourPartIdentity(event){
 const o=event?.order;
 const keys=["CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA"];
 return !!o&&keys.every(k=>typeof o[k]==="string"&&
   o[k].length>0&&o[k].length<=96&&!/[|\r\n]/.test(o[k]))&&
   event.order_key===keys.map(k=>o[k]).join("|");
}
function checkEvent(event){
 const problems=[];
 if(event?.schema!==EVENT_SCHEMA||!event.order||!Array.isArray(event.order.items))
  return ["EVENT_STRUCTURE_INVALID"];
 if(!fourPartIdentity(event))problems.push("ORDER_KEY_IDENTITY_MISMATCH");
 const hash=exactSnapshotHash(event.order);
 if(!hash||typeof event.snapshot_hash!=="string"||
   !/^[a-fA-F0-9]{64}$/.test(event.snapshot_hash)||
   hash!==event.snapshot_hash.toLowerCase())
  problems.push("WATCHER_SNAPSHOT_HASH_MISMATCH");
 if(event.order.observation_scan_complete!==true)
  problems.push("OBSERVATION_SCAN_UNPROVEN");
 if(!Array.isArray(event.blockers)||typeof event.ready_for_downstream_shadow!=="boolean")
  problems.push("READINESS_ENVELOPE_INVALID");
 return problems;
}
function audit(root,limit=15){
 if(typeof root!=="string"||!path.isAbsolute(root)||
    !Number.isSafeInteger(limit)||limit<1||limit>50)
  throw Error("EXPLICIT_ROOT_AND_LIMIT_1_TO_50_REQUIRED");
 const out={schema:"tata.comandas.passive-event-audit.v730",
  status:"BLOCKED",events_checked:0,identity_4_of_4:0,
  snapshot_hash_verified:0,observations_scanned:0,
  ready_reported:0,blocked_reported:0,invalid_events:0,
  blockers:{},rule_sources_present:0,rule_sources_required:RULES.length,
  pinned_academy_motor:false,v2_candidate_present:false,
  operational_permission:false,print_authorized:false,effects:NO_EFFECTS};
 const source=path.join(root,"state","reader-events-v1");
 const shadow=path.join(root,"shadow");
 // Names are not exposed. Only strictly-shaped reader event filenames are read.
 const names=fs.readdirSync(source).filter(x=>basenamePattern.test(x)).sort().slice(-limit);
 for(const name of names){
  let data;
  try{data=JSON.parse(regularRead(path.join(source,name)).toString("utf8").replace(/^\uFEFF/,""));}
  catch{out.invalid_events++;continue;}
  if(data?.schema!==EVENT_SCHEMA){out.invalid_events++;continue;}
  out.events_checked++;
  const problems=checkEvent(data);
  if(problems.length){
   out.invalid_events++;
   for(const p of problems)out.blockers[p]=(out.blockers[p]||0)+1;
   continue;
  }
  out.identity_4_of_4++;
  out.snapshot_hash_verified++;
  out.observations_scanned++;
  if(data.ready_for_downstream_shadow===true)out.ready_reported++;
  else out.blocked_reported++;
  const original=Array.isArray(data.blockers)?data.blockers:[];
  for(const reason of original)
   if(typeof reason==="string"&&/^[A-Z][A-Z0-9_]{2,100}$/.test(reason))
    out.blockers[reason]=(out.blockers[reason]||0)+1;
 }
 for(const file of RULES){
  try{const p=path.join(shadow,file);
   if(fs.lstatSync(p).isFile()&&!fs.lstatSync(p).isSymbolicLink())
    out.rule_sources_present++;
  }catch{}
 }
 try{out.pinned_academy_motor=sha(regularRead(path.join(shadow,RULES[0])))===MOTOR_SHA;}
 catch{}
 try{const p=path.join(shadow,CANDIDATE);
  out.v2_candidate_present=fs.lstatSync(p).isFile()&&!fs.lstatSync(p).isSymbolicLink();}
 catch{}
 const allValid=out.events_checked>0&&out.invalid_events===0&&
   out.identity_4_of_4===out.events_checked&&
   out.snapshot_hash_verified===out.events_checked&&
   out.observations_scanned===out.events_checked;
 out.status=allValid&&out.rule_sources_present===RULES.length&&
   out.pinned_academy_motor?"OBSERVED_CONSISTENT_NO_OPERATIONAL_AUTHORITY":"BLOCKED";
 // Even if all source events say 'ready', this passive tool never authorizes
 // tickets: it has not run V2, reconciled V6.8, or proven current human rules.
 return out;
}
function args(argv){
 if(argv.length!==4||argv[0]!=="--root"||argv[2]!=="--limit")
  throw Error("USAGE_ROOT_LIMIT_REQUIRED");
 const limit=Number(argv[3]);
 if(!/^\d+$/.test(argv[3])||limit<1||limit>50)throw Error("INVALID_AUDIT_LIMIT");
 return {root:argv[1],limit};
}
if(require.main===module){
 try{const {root,limit}=args(process.argv.slice(2));
  const result=audit(root,limit);
  process.stdout.write(JSON.stringify(result)+"\n");
  if(result.status!=="OBSERVED_CONSISTENT_NO_OPERATIONAL_AUTHORITY")process.exitCode=2;
 }catch{process.stdout.write(JSON.stringify({schema:"tata.comandas.passive-event-audit.v730",
   status:"BLOCKED",events_checked:0,print_authorized:false,effects:NO_EFFECTS})+"\n");
  process.exitCode=2;}
}
module.exports={audit,checkEvent,fourPartIdentity,exactSnapshotHash,RULES,NO_EFFECTS};

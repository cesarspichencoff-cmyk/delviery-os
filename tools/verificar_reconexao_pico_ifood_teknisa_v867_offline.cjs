"use strict";
/** 
 * V8.67 synthetic connection-loss backlog & recovery tests.
 * iFood event model, GP state, source replay and reconnect flags are SIMULATED.
 * Uses actual V8.57 source projection and V7.54 reservation planner.
 * No real iFood API, GP, Teknisa, SQL, printer or durable CAS is accessed.
 */
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {projectReaderEssentials,snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {fresh,reserve,observe,validLedger,STATES}=require("./comandas_idempotencia_v754_offline.js");
const sha=x=>crypto.createHash("sha256").update(String(x)).digest("hex");
const cp=x=>JSON.parse(JSON.stringify(x));
const EFFECTS=Object.freeze({print:false,spooler:false,gp:false,sql:false,
 network:false,source_write:false,sequence_write:false,service:false});
const TIME=1000000, MAX_AGE=300000,MAX_BATCH=128;
function pair(i=0,revision=1,day="2026-10-20"){
 const p=cp(syntheticReaderPairV857()),o=p.event.order;
 o.NRVENDAREST=String(349281+i).padStart(10,"0");
 o.NRCOMANDA=String(348850+i).padStart(10,"0");
 o.NRCOMANDAEXT=String(9627+i);
 o.DTHRABERMESA=day+"T12:31:00.0000000";
 if(revision>1){o.items[0].QTPRODCOMVEN=String(revision+1)+".000";
  p.decision.items[0].quantity=revision+1;}
 p.event.order_key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
 p.event.snapshot_hash=snapshotHash(o);
 p.decision.order_key=p.event.order_key;
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.ifood_sequence=o.NRCOMANDAEXT;
 p.decision.teknisa_sequence=o.NRCOMANDA;
 p.decision.fingerprint=decisionHash(p.decision);
 p.sequence_state.bindings[0].scope_id="STORE:0001|DATE:"+day;
 p.sequence_state.bindings[0].teknisa_order_id=o.NRCOMANDA;
 p.sequence_state.bindings[0].tata_sequence=String(7+i).padStart(3,"0");
 return p;
}
function evt(p,id,revision=1,kind="CREATED",at=TIME){
 return {event_id:"sim_"+id,kind,revision,ordinal:revision,
  order_key:p.event.order_key,store:p.event.order.CDFILIAL,
  short_id:p.event.order.NRCOMANDAEXT,
  uuid_claim:"synthetic_uuid_"+p.event.order.NRCOMANDA,
  snapshot:p.event.snapshot_hash,fingerprint:p.decision.fingerprint,
  observed_at:at};
}
function descriptors(p){
 const r=projectReaderEssentials(p);
 if(r.status!=="SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD"||
    r.pair_snapshot_integrity_checked!==true||
    r.decision_fingerprint_checked!==true)return null;
 const base={scope_id:"STORE:"+p.event.order.CDFILIAL+
     "|DATE:"+p.event.order.DTHRABERMESA.slice(0,10),
  scope_evidence:"SYNTHETIC_SCOPE_ONLY",order_key:p.event.order_key,
  tata_sequence:r.essential.tata_sequence,source_sha256:p.event.snapshot_hash};
 return ["COZINHA","SUSHI","CONFERENCIA"].map((station,slot)=>({
  ...base,kind:slot===2?"CONFERENCIA":"PRODUCAO",station,slot,
  payload_sha256:sha("synthetic-escpos:"+p.event.order_key+":"+slot+":"+p.event.snapshot_hash)
 }));
}
function recover(events,pairs,opts={},prior=fresh()){
 const flags={networkStable:true,drainComplete:true,sourceSnapshotCurrent:true,
  gpReconciled:true,clockSynchronized:true,shiftVerified:true,
  maxAge:MAX_AGE,now:TIME,...opts};
 const global=new Set(),holds=new Map(),candidates=new Map();
 const deny=(k,code)=>{if(!holds.has(k))holds.set(k,new Set());holds.get(k).add(code);};
 const result=()=>{
  const proposed=[],byKey=[...new Set([...holds.keys(),...candidates.keys()])];
  for(const k of byKey){
   if(!holds.has(k)){ // planning ONLY, cannot print, never a durable CAS
    let state=safeState;
    for(const d of candidates.get(k)){
     const r=reserve(state,d,state.revision);
     if(r.status!=="RESERVATION_PROPOSAL_ONLY"||r.authorize_print!==false){
      deny(k,(r.reasons||["RESERVATION_NOT_SAFE"])[0]);break;
     }
     state=r.next_state;
    }
    if(!holds.has(k)){safeState=state;proposed.push(k);}
   }
  }
  return {status:global.size?"HOLD":holds.size?"PARTIAL_HOLD":"SIMULATED_REVIEW_ONLY",
   global:[...global].sort(),held:[...holds.entries()].map(([k,s])=>({key:k,reasons:[...s].sort()})),
   proposed,ledger:safeState,source_independently_authenticated:false,
   gp_independently_authenticated:false,spooler_or_paper_proven:false,
   durable_cas_proven:false,ready_for_operational_print:false,effects:EFFECTS};
 };
 let safeState=cp(prior);
 if(!validLedger(safeState)){global.add("PRIOR_LEDGER_INVALID");return result();}
 if(!Array.isArray(events)||events.length===0||events.length>MAX_BATCH||
 !Array.isArray(pairs)||pairs.length===0||pairs.length>MAX_BATCH){
  global.add("BATCH_BOUND_INVALID");return result();
 }
 for(const [flag,reason] of [
  ["networkStable","CONNECTION_NOT_STABLE"],
  ["drainComplete","REPLAY_INCOMPLETE"],
  ["sourceSnapshotCurrent","SOURCE_SNAPSHOT_NOT_CURRENT"],
  ["gpReconciled","GP_OUTCOME_UNRECONCILED"],
  ["clockSynchronized","CLOCK_UNRELIABLE"],
  ["shiftVerified","SHIFT_SCOPE_UNVERIFIED"]]){
  if(flags[flag]!==true)global.add(reason);
 }
 if(!Number.isSafeInteger(flags.now)||!Number.isSafeInteger(flags.maxAge)||
   flags.maxAge<0||flags.maxAge>MAX_AGE)global.add("TIME_POLICY_INVALID");
 const pairByKey=new Map(),shortOwners=new Map(),uuidOwners=new Map(),seen=new Map();
 for(const p of pairs){
  const key=p?.event?.order_key,short=p?.event?.order?.NRCOMANDAEXT;
  if(typeof key!=="string"||typeof short!=="string"){
   global.add("PAIR_SHAPE_INVALID");continue;
  }
  if(pairByKey.has(key))deny(key,"MULTIPLE_LATEST_READER_WITNESSES");
  pairByKey.set(key,p);
  if(!shortOwners.has(short))shortOwners.set(short,new Set());
  shortOwners.get(short).add(key);
 }
 const groups=new Map();
 for(const e of events){
  if(!e||typeof e!=="object"||!/^sim_[a-z0-9_]{1,45}$/.test(e.event_id||"")||
     typeof e.order_key!=="string"||!/^synthetic_uuid_[0-9]{10}$/.test(e.uuid_claim||"")||
     !/^[0-9]{4}$/.test(e.store||"")||!/^[0-9]{1,12}$/.test(e.short_id||"")||
     !Number.isSafeInteger(e.ordinal)||e.ordinal<1||
     !Number.isSafeInteger(e.revision)||e.revision<1||
     !["CREATED","UPDATED","CANCELED"].includes(e.kind)||
     !/^[a-f0-9]{64}$/.test(e.snapshot||"")||
     !/^[a-f0-9]{64}$/.test(e.fingerprint||"")||
     !Number.isSafeInteger(e.observed_at)){
   global.add("EVENT_SCHEMA_UNVERIFIED");continue;
  }
  const old=seen.get(e.event_id);
  if(old){
   deny(e.order_key,old===JSON.stringify(e)?
    "REDELIVERED_EVENT":"EVENT_ID_PAYLOAD_COLLISION");
  }else seen.set(e.event_id,JSON.stringify(e));
  if(!groups.has(e.order_key))groups.set(e.order_key,[]);
  groups.get(e.order_key).push(e);
  if(uuidOwners.has(e.uuid_claim)&&uuidOwners.get(e.uuid_claim)!==e.order_key){
   deny(e.order_key,"UUID_CLAIM_COLLISION");
   deny(uuidOwners.get(e.uuid_claim),"UUID_CLAIM_COLLISION");
  }
  uuidOwners.set(e.uuid_claim,e.order_key);
  if(flags.clockSynchronized===true){
   if(e.observed_at>flags.now+10000)deny(e.order_key,"FUTURE_EVENT");
   if(flags.now-e.observed_at>flags.maxAge)deny(e.order_key,"STALE_AFTER_OUTAGE");
  }
 }
 // Never plan ANY item until complete collection/global policy is valid.
 if(global.size)return result();
 for(const [k,history] of groups){
  const p=pairByKey.get(k);
  if(!p){deny(k,"NO_READER_PAIR");continue;}
  const o=p.event.order,owners=shortOwners.get(o.NRCOMANDAEXT);
  if(!owners||owners.size!==1){deny(k,"SHORT_ID_AMBIGUOUS");continue;}
  const ids=new Set(history.map(e=>e.uuid_claim));
  if(ids.size!==1){deny(k,"MULTIPLE_UUID_CLAIMS_SAME_ORDER");continue;}
  const ordered=history.slice().sort((a,b)=>a.ordinal-b.ordinal);
  if(ordered[0].kind!=="CREATED"||
   ordered[0].ordinal!==1||ordered[0].revision!==1)
    deny(k,"CREATE_OR_INITIAL_REVISION_MISSING");
  for(let i=0;i<ordered.length;i++){
   const e=ordered[i];
   if(e.store!==o.CDFILIAL||e.short_id!==o.NRCOMANDAEXT)
    deny(k,"CROSS_STORE_OR_SHORT_ID_MISMATCH");
   if(i>0&&
    (e.ordinal!==ordered[i-1].ordinal+1||
     e.revision!==ordered[i-1].revision+1))
    deny(k,"OUTAGE_REVISION_GAP_OR_REPLAY");
   if(i>0&&ordered[i-1].kind==="CANCELED")
    deny(k,"LATE_EVENT_AFTER_CANCEL");
  }
  if(ordered.some(e=>e.kind==="CANCELED"))deny(k,"CANCELED_DURING_OUTAGE");
  if(ordered.length>1&&ordered.slice(1).some(e=>e.kind!=="UPDATED"&&e.kind!=="CANCELED"))
   deny(k,"UNEXPECTED_CREATE_DURING_RECOVERY");
  const last=ordered.at(-1);
  if(last.snapshot!==p.event.snapshot_hash||
     last.fingerprint!==p.decision.fingerprint)
    deny(k,"LATEST_READER_REVISION_MISMATCH");
  const d=descriptors(p);
  if(!d)deny(k,"READER_V857_INTEGRITY_HOLD");
  if(d&&!holds.has(k))candidates.set(k,d);
 }
 // No native pair can be treated as safely current if it wasn't in backlog.
 for(const k of pairByKey.keys())
  if(!groups.has(k))deny(k,"UNACCOUNTED_NATIVE_ORDER");
 return result();
}
function verify(x){
 assert.equal(x.ready_for_operational_print,false);
 assert.equal(x.source_independently_authenticated,false);
 assert.equal(x.gp_independently_authenticated,false);
 assert.equal(x.durable_cas_proven,false);
 assert.equal(x.spooler_or_paper_proven,false);
 assert.ok(Object.values(x.effects).every(v=>v===false));
 assert.ok(validLedger(x.ledger));
 return x;
}
let named=0;
function test(label,fn){fn();named++;console.log("PASS OUTAGE_V867 "+named+" "+label);}
const A=pair(0),B=pair(1),C=pair(2);
const a=evt(A,"a1"),b=evt(B,"b1"),c=evt(C,"c1");
const baseline=()=>recover([a,b,c],[A,B,C]);
const held=(r,code,key)=>{verify(r);assert.equal(r.status==="PARTIAL_HOLD");
 assert.ok(r.held.some(x=>(!key||x.key===key)&&x.reasons.includes(code)),
  JSON.stringify(r.held));};
const allHold=r=>{verify(r);assert.equal(r.proposed.length,0);assert.equal(r.ledger.entries.length,0);};
test("full synthetic recovery can propose 3 orders x 3 views only",()=>{
 const r=verify(baseline());
 assert.equal(r.status,"SIMULATED_REVIEW_ONLY");
 assert.equal(r.proposed.length,3);assert.equal(r.ledger.entries.length,9);
});
test("candidate proposes but never authorizes a print",()=>{
 const r=verify(recover([a],[A]));
 assert.equal(r.ledger.entries.length,3);
 assert.ok(r.ledger.entries.every(e=>e.state===STATES.RESERVED));
});
test("network flapping forces full-batch HOLD",()=>{
 const r=verify(recover([a,b],[A,B],{networkStable:false}));
 assert.equal(r.status,"HOLD");allHold(r);
});
test("missing end-of-backlog witness blocks full batch",()=>{
 const r=verify(recover([a],[A],{drainComplete:false}));assert.equal(r.status,"HOLD");allHold(r);
});
test("uncertain GP receipt blocks all pending items",()=>{
 const r=verify(recover([a,b],[A,B],{gpReconciled:false}));
 assert.equal(r.status,"HOLD");allHold(r);
});
test("source is stale after reconnect blocks entire batch",()=>{
 const r=verify(recover([a],[A],{sourceSnapshotCurrent:false}));
 assert.equal(r.status,"HOLD");allHold(r);
});
test("clock skew unknown keeps all pending without age guesses",()=>{
 const r=verify(recover([a],[A],{clockSynchronized:false}));
 assert.equal(r.status,"HOLD");allHold(r);
});
test("shift at midnight unverified keeps all pending",()=>{
 const r=verify(recover([a],[A],{shiftVerified:false}));
 assert.equal(r.status,"HOLD");allHold(r);
});
test("untrusted date window bounds rejected globally",()=>{
 const r=verify(recover([a],[A],{maxAge:300001}));
 assert.equal(r.status,"HOLD");allHold(r);
});
test("outdated order from long outage denied",()=>
 held(recover([{...a,observed_at:TIME-600000}],[A]),"STALE_AFTER_OUTAGE"));
test("future-dated event cannot hide in backlog",()=>
 held(recover([{...a,observed_at:TIME+60000}],[A]),"FUTURE_EVENT"));
test("duplicate iFood webhook redelivery held, no extra reservation",()=>{
 const r=recover([a,a],[A]);held(r,"REDELIVERED_EVENT");
 assert.equal(r.ledger.entries.length,0);
});
test("event ID reused with different payload rejected",()=>{
 const e={...a,kind:"UPDATED"};held(recover([a,e],[A]),"EVENT_ID_PAYLOAD_COLLISION");
});
test("cancel during outage blocks even when create arrived first",()=>{
 const cancel=evt(A,"a2",2,"CANCELED");
 held(recover([a,cancel],[A]),"CANCELED_DURING_OUTAGE");
});
test("cancel received before create still blocks in batch",()=>{
 const cancel=evt(A,"a2",2,"CANCELED");
 held(recover([cancel,a],[A]),"CANCELED_DURING_OUTAGE");
});
test("late ACTIVE revision after canceled order denied",()=>{
 const cancel=evt(A,"a2",2,"CANCELED"),
 late=evt(A,"a3",3,"UPDATED");
 held(recover([a,late,cancel],[A]),"LATE_EVENT_AFTER_CANCEL");
});
test("revision 3 without revision 2 is not filled in",()=>{
 const e=evt(A,"a3",3,"UPDATED");
 held(recover([a,e],[A]),"OUTAGE_REVISION_GAP_OR_REPLAY");
});
test("reordered two revisions reconciled only against current Reader",()=>{
 const newer=pair(0,2),u=evt(newer,"a2",2,"UPDATED");
 const r=verify(recover([u,a],[newer]));
 assert.equal(r.proposed.length,1);assert.equal(r.held.length,0);
});
test("wrong latest payload after outage cannot be silently upgraded",()=>{
 const newer=pair(0,2),u=evt(newer,"a2",2,"UPDATED");
 held(recover([a,u],[A]),"LATEST_READER_REVISION_MISMATCH");
});
test("arrival of another CREATE for same order is blocked",()=>{
 const e=evt(A,"a2",2,"CREATED");
 held(recover([a,e],[A]),"UNEXPECTED_CREATE_DURING_RECOVERY");
});
test("iFood short ID collision between two Teknisa orders blocked",()=>{
 const q=pair(4);q.event.order.NRCOMANDAEXT=A.event.order.NRCOMANDAEXT;
 q.event.snapshot_hash=snapshotHash(q.event.order);
 q.decision.ifood_sequence=q.event.order.NRCOMANDAEXT;
 q.decision.snapshot_hash=q.event.snapshot_hash;
 q.decision.fingerprint=decisionHash(q.decision);
 const r=recover([a,evt(q,"q1")],[A,q]);
 held(r,"SHORT_ID_AMBIGUOUS",a.order_key);
});
test("same claimed full UUID for different native orders blocked",()=>{
 const e={...b,uuid_claim:a.uuid_claim};
 const r=recover([a,e],[A,B]);
 held(r,"UUID_CLAIM_COLLISION",a.order_key);
 held(r,"UUID_CLAIM_COLLISION",b.order_key);
});
test("two different full UUID claims for one Teknisa order blocked",()=>{
 const p=pair(0,2),e=evt(p,"a2",2,"UPDATED");
 e.uuid_claim="synthetic_uuid_0000348999";
 held(recover([a,e],[p]),"MULTIPLE_UUID_CLAIMS_SAME_ORDER");
});
test("different store claimed by event blocked",()=>{
 held(recover([{...a,store:"9999"}],[A]),"CROSS_STORE_OR_SHORT_ID_MISMATCH");
});
test("item quantity forged and self-signed decision fails Reader",()=>{
 const q=cp(A);q.decision.items[0].quantity=99;
 held(recover([a],[q]),"READER_V857_INTEGRITY_HOLD");
});
test("unaccounted native order cannot be released from drain",()=>{
 held(recover([a],[A,B]),"UNACCOUNTED_NATIVE_ORDER",b.order_key);
});
test("crash after initial simulated reservation rejects replay",()=>{
 const first=verify(recover([a],[A]));
 const replay=verify(recover([a],[A],{},first.ledger));
 held(replay,"ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
 assert.equal(replay.ledger.entries.length,3);
});
test("accepted spool then timeout stays UNKNOWN and cannot retry",()=>{
 const first=recover([a],[A]),entry=first.ledger.entries[0];
 let x=observe(first.ledger,entry.key,entry.reservation_id,first.ledger.revision,
  {kind:"SPOOL_ACCEPTED",transport_evidence:"EXTERNAL_JOB_ID_OBSERVED"});
 assert.equal(x.status,"OBSERVATION_PROPOSAL_ONLY");
 x=observe(x.next_state,entry.key,entry.reservation_id,x.next_state.revision,
  {kind:"TIMEOUT_OR_CRASH"});
 assert.equal(x.next_state.entries[0].state,STATES.UNKNOWN);
 const again=recover([a],[A],{},x.next_state);
 held(again,"ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
 assert.equal(again.ledger.entries.length,3);
});
test("cancel after reservation never removes attempt ledger",()=>{
 const first=recover([a],[A]),stop=evt(A,"a2",2,"CANCELED");
 const r=recover([a,stop],[A],{},first.ledger);
 held(r,"CANCELED_DURING_OUTAGE");
 assert.equal(r.ledger.entries.length,3);
});
test("corrupt prior ledger blocks replay rather than resetting state",()=>{
 const prior=recover([a],[A]).ledger;prior.entries[0].reservation_id="x";
 const r=recover([a],[A],{},prior);verify({...r,ledger:fresh()});
 assert.equal(r.status,"HOLD");
 assert.deepEqual(r.global,["PRIOR_LEDGER_INVALID"]);
 assert.equal(r.proposed.length,0);
});
test("bounded replay refuses a 129-event backlog",()=>{
 const huge=Array.from({length:129},(_,i)=>({...a,event_id:"sim_burst"+i}));
 const r=verify(recover(huge,[A]));assert.equal(r.status,"HOLD");allHold(r);
});
test("distinct same-day orders cannot claim same TATA number",()=>{
 const p=pair(1);p.sequence_state.bindings[0].tata_sequence="007";
 const r=recover([a,evt(p,"b1")],[A,p]);
 held(r,"TATA_SEQUENCE_COLLISION_BETWEEN_ORDERS",p.event.order_key);
});
test("replayed backlog order permutation never changes result",()=>{
 const r=baseline(),rev=recover([c,b,a],[C,B,A]);
 verify(r);verify(rev);
 assert.deepEqual(new Set(r.proposed),new Set(rev.proposed));
 assert.equal(r.ledger.entries.length,rev.ledger.entries.length);
});
test("safe fresh order can coexist with held canceled order",()=>{
 const cancel=evt(A,"a2",2,"CANCELED"),r=verify(recover([a,cancel,b],[A,B]));
 assert.deepEqual(r.proposed,[b.order_key]);
 held(r,"CANCELED_DURING_OUTAGE",a.order_key);
 assert.equal(r.ledger.entries.length,3);
});

// 6! = 720 permutations for interleaving two orders, creation/update,
// and an unrelated third order. Test order invariance on every sequence.
const A2=pair(0,2),B2=pair(1,2);
const evs=[a,evt(A2,"a2",2,"UPDATED"),b,evt(B2,"b2",2,"UPDATED"),c];
function permutations(items){
 if(!items.length)return [[]];
 return items.flatMap((v,i)=>permutations(items.filter((_,j)=>j!==i))
  .map(rest=>[v,...rest]));
}
let perm=0;
for(const q of permutations(evs)){
 const r=verify(recover(q,[A2,B2,C]));
 assert.equal(r.status,"SIMULATED_REVIEW_ONLY",JSON.stringify(r.held));
 assert.equal(r.proposed.length,3);
 assert.equal(r.ledger.entries.length,9);
 perm++;
}
assert.equal(perm,120);
let fuzz=0;
let seed=0x660b17e3;
function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;}
for(let i=0;i<512;i++){
 const events=[a,b,c].map(cp),kind=i%8,nonce=rnd();
 if(kind===0)events.push(cp(events[0]));
 if(kind===1)events[0].observed_at=TIME-MAX_AGE-1;
 if(kind===2)events[1].uuid_claim=events[0].uuid_claim;
 if(kind===3)events[2].snapshot=sha("tamper"+nonce);
 if(kind===4)events[2].store="9999";
 if(kind===5)events[1].short_id="1111";
 if(kind===6)events[0].revision=3;
 if(kind===7)events[0].kind="CANCELED";
 const r=verify(recover(events,[A,B,C]));
 assert.notEqual(r.status,"SIMULATED_REVIEW_ONLY",
  JSON.stringify({i,kind,proposed:r.proposed}));
 assert.ok(r.held.length>0||r.global.length>0);
 fuzz++;
}
assert.equal(fuzz,512);
assert.equal(named,34);
console.log("TATA_IFOOD_TEKNISA_OUTAGE_RECOVERY_V867="+named+"/"+named+
 " NAMED PERMUTATIONS="+perm+"/"+perm+
 " MUTATIONS="+fuzz+"/"+fuzz+
 " REAL_READER_V857 REAL_LEDGER_V754 SYNTHETIC_IFOOD_GP"+
 " NO_NETWORK NO_PRINT NO_SQL NO_DURABLE_CAS_PROOF");

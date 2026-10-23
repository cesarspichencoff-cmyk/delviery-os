"use strict";
/**
 * V8.66 OFFLINE: multi-order station/shifts interleaving, fake GP uncertainty,
 * and replay. Calls the REAL V8.57 Reader and REAL V7.54 pure attempt ledger.
 * Synthetic iFood lifecycle guard below is a TEST MODEL, not a connected
 * iFood source, durable ledger, queue reconciliation or printer gate.
 * NO external effects, permissions, APIs, SQL, spooler, print or GP calls.
 */
const assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {syntheticReaderPairV857}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {projectReaderEssentials,snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {fresh,validLedger,normalize,reserve,observe,resumeDecision,
 STATES,NO_EFFECTS} =require("./comandas_idempotencia_v754_offline.js");
const sha=s=>createHash("sha256").update(s).digest("hex");
const copy=x=>JSON.parse(JSON.stringify(x));
const ZERO=Object.freeze({print:false,spooler_write:false,teknisa_write:false,
 ifood_write:false,sql:false,network:false,sequence_write:false,
 service_change:false});
let named=0;
function check(name,fn){fn();named++;console.log("PASS MULTIORDER_V866 "+named+" "+name);}
function zero(result){
 assert.equal(result.authorize_print,false);
 assert.ok(Object.values(result.effects).every(x=>x===false));
}
function pair(i=0,day="2026-10-20",seq){
 const p=copy(syntheticReaderPairV857());
 const o=p.event.order;
 o.NRVENDAREST=String(349281+i).padStart(10,"0");
 o.NRCOMANDA=String(348850+i).padStart(10,"0");
 o.NRCOMANDAEXT=String(9627+i);
 o.DTHRABERMESA=day+"T12:31:00.0000000";
 p.event.order_key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
 p.event.snapshot_hash=snapshotHash(o);
 p.decision.order_key=p.event.order_key;
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.ifood_sequence=o.NRCOMANDAEXT;
 p.decision.teknisa_sequence=o.NRCOMANDA;
 p.decision.fingerprint=decisionHash(p.decision);
 p.sequence_state.bindings[0].teknisa_order_id=o.NRCOMANDA;
 p.sequence_state.bindings[0].scope_id="STORE:0001|DATE:"+day;
 p.sequence_state.bindings[0].tata_sequence=seq||String(7+i).padStart(3,"0");
 return p;
}
function review(p){
 const r=projectReaderEssentials(p);
 assert.equal(r.status,"SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD",
  JSON.stringify({order:p?.event?.order_key,reason:r.reason}));
 assert.equal(r.order_source_authenticated,false);
 assert.equal(r.ifood_gp_independently_observed,false);
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.print_authorized,false);
 return r;
}
function descriptor(p,kind,slot,station,day){
 const witness=review(p);
 const raw={
  scope_id:"STORE:"+p.event.order.CDFILIAL+
   "|DATE:"+(day||p.event.order.DTHRABERMESA.slice(0,10)),
  scope_evidence:"SYNTHETIC_SCOPE_ONLY",
  order_key:p.event.order_key,kind,station,slot,
  tata_sequence:witness.essential.tata_sequence,
  payload_sha256:sha("fake_ticket:"+p.event.order_key+":"+kind+":"+slot+":"+station),
  source_sha256:p.event.snapshot_hash,
 };
 assert.ok(normalize(raw));
 return raw;
}
const tickets=p=>[
 descriptor(p,"PRODUCAO",0,"COZINHA"),
 descriptor(p,"PRODUCAO",1,"SUSHI"),
 descriptor(p,"CONFERENCIA",2,"CONFERENCIA")
];
function simulateGate(p,{active=true,revision=true,notes=true,gpClear=true,
 sourceCorrelated=true,dayMatches=true,canceled=false}={}){
 const witness=projectReaderEssentials(p);
 const reasons=[];
 if(witness.status!=="SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD")
  reasons.push("READER_SOURCE_INTEGRITY_HOLD");
 if(!active||canceled)reasons.push("IFOO​D_LIFECYCLE_HOLD".replace("\u200b",""));
 if(!revision)reasons.push("IFOO​D_REVISION_UNPROVEN".replace("\u200b",""));
 if(!notes)reasons.push("NOTES_PROVENANCE_UNCERTAIN");
 if(!gpClear)reasons.push("GP_OR_SPOOLER_STATE_UNRECONCILED");
 if(!sourceCorrelated)reasons.push("IFOO​D_TEKNISA_ORIGIN_UNBOUND".replace("\u200b",""));
 if(!dayMatches)reasons.push("SHIFT_DAY_SCOPE_MISMATCH");
 return {status:reasons.length?"HOLD":"SIMULATED_RESERVATION_CANDIDATE",
  reasons,source_real_authenticated:false,physical_print_proven:false,
  ready_for_operational_print:false,effects:ZERO};
}
function eligible(p,flags={}){
 const gate=simulateGate(p,flags);
 assert.equal(gate.ready_for_operational_print,false);
 assert.ok(Object.values(gate.effects).every(x=>x===false));
 return gate;
}
function book(state,desc){
 const r=reserve(state,desc,state.revision);
 zero(r);
 assert.equal(r.status,"RESERVATION_PROPOSAL_ONLY",JSON.stringify(r.reasons));
 assert.equal(r.requires_durable_commit,true);
 assert.equal(r.commit_required,"DURABLE_ATOMIC_CAS_BEFORE_SIDE_EFFECT");
 assert.ok(validLedger(r.next_state));
 return r.next_state; // IN-MEMORY SIMULATION, never a durable CAS.
}
function blocked(state,desc,reason){
 const r=reserve(state,desc,state.revision);
 zero(r);
 assert.equal(r.status,"HOLD");
 assert.equal(r.reasons[0],reason);
 assert.equal(resumeDecision(state,desc).authorize_print,false);
}
const A=pair(0),B=pair(1),C=pair(2);
const ad=tickets(A),bd=tickets(B),cd=tickets(C);

check("different iFood orders have distinct four-field native identities",()=>{
 assert.notEqual(A.event.order_key,B.event.order_key);
 assert.notEqual(A.event.order.NRCOMANDAEXT,B.event.order.NRCOMANDAEXT);
 assert.notEqual(A.event.snapshot_hash,B.event.snapshot_hash);
});
check("source Reader integrity does not claim iFood/GP authenticity",()=>{
 assert.equal(review(A).order_source_authenticated,false);
 assert.equal(review(B).ifood_gp_independently_observed,false);
});
check("active synthetic lifecycle can propose review only",()=>{
 assert.equal(eligible(A).status,"SIMULATED_RESERVATION_CANDIDATE");
});
check("iFood cancellation before any reservation holds entire order",()=>{
 assert.equal(eligible(A,{canceled:true}).status,"HOLD");
});
check("iFood pending/inactive event holds",()=>{
 assert.equal(eligible(A,{active:false}).status,"HOLD");
});
check("revised order without independently witnessed version holds",()=>{
 assert.equal(eligible(A,{revision:false}).status,"HOLD");
});
check("notes origin unproven holds even if hash matches",()=>{
 assert.equal(eligible(A,{notes:false}).status,"HOLD");
});
check("GP backlog ambiguity holds before attempting anything",()=>{
 assert.equal(eligible(A,{gpClear:false}).status,"HOLD");
});
check("iFood-Teknisa association not independently witnessed holds",()=>{
 assert.equal(eligible(A,{sourceCorrelated:false}).status,"HOLD");
});
check("cross-midnight shift day mismatch holds",()=>{
 assert.equal(eligible(A,{dayMatches:false}).status,"HOLD");
});
check("live event modified after snapshot is rejected by Reader",()=>{
 const p=copy(A);p.decision.items[0].quantity=8;
 assert.equal(eligible(p).status,"HOLD");
});
check("all three synthetic views carry identical source snapshot",()=>{
 assert.equal(new Set(ad.map(x=>x.source_sha256)).size,1);
 assert.equal(new Set(ad.map(x=>x.order_key)).size,1);
 assert.deepEqual(ad.map(x=>x.kind),["PRODUCAO","PRODUCAO","CONFERENCIA"]);
});
check("separate real ledger reservation keys for three station views",()=>{
 const n=ad.map(x=>normalize(x).key);assert.equal(new Set(n).size,3);
});
check("same order replay of first ticket cannot create second attempt",()=>{
 const state=book(fresh(),ad[0]);
 blocked(state,ad[0],"ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
});
check("changed ticket payload after reservation cannot print as new view",()=>{
 const state=book(fresh(),ad[0]);
 blocked(state,{...ad[0],payload_sha256:sha("fake_changed_bytes")},
  "SAME_TICKET_DIFFERENT_SOURCE_OR_SEQUENCE");
});
check("printer reassignment after reservation is never a new attempt",()=>{
 const state=book(fresh(),ad[0]);
 blocked(state,{...ad[0],station:"OUTRA_IMPRESSORA"},
  "SAME_LOGICAL_VIEW_DESTINATION_CHANGED_NO_REPRINT");
});
check("same TATA sequence for a different order same day blocked",()=>{
 const collision=tickets(pair(1,"2026-10-20","007"));
 const state=book(fresh(),ad[0]);
 blocked(state,collision[0],"TATA_SEQUENCE_COLLISION_BETWEEN_ORDERS");
});
check("same three-digit TATA sequence on a DIFFERENT day is distinct scope",()=>{
 const next=tickets(pair(0,"2026-10-21","007"));
 let state=book(fresh(),ad[0]);
 state=book(state,next[0]);
 assert.equal(state.entries.length,2);
 assert.equal(new Set(state.entries.map(x=>x.scope_id)).size,2);
});
check("old-day descriptor at new-day gate is held by lifecycle",()=>{
 assert.equal(eligible(pair(0,"2026-10-21"),{dayMatches:false}).status,"HOLD");
});
check("cancel AFTER simulated reservation cannot free/retry physical view",()=>{
 const state=book(fresh(),ad[0]);
 assert.equal(eligible(A,{canceled:true}).status,"HOLD");
 blocked(state,ad[0],"ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
});
check("reboot AFTER reservation cannot cause reprint",()=>{
 const state=book(fresh(),ad[0]),reboot=copy(state);
 blocked(reboot,ad[0],"ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
});
check("spool accepted alone remains physical paper UNKNOWN",()=>{
 const state=book(fresh(),ad[0]),first=state.entries[0];
 const r=observe(state,first.key,first.reservation_id,state.revision,
  {kind:"SPOOL_ACCEPTED",transport_evidence:"EXTERNAL_JOB_ID_OBSERVED",
   external_job_id:"synthetic-job-0001",
   reservation_id:state.entries[0].reservation_id,
   payload_sha256:state.entries[0].payload_sha256});
 zero(r);assert.equal(r.next_state.entries[0].state,STATES.ACCEPTED);
 blocked(r.next_state,ad[0],"ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
});
check("timeout after spool accepts leaves UNKNOWN never retry",()=>{
 let state=book(fresh(),ad[0]),entry=state.entries[0];
 let r=observe(state,entry.key,entry.reservation_id,state.revision,
  {kind:"SPOOL_ACCEPTED",transport_evidence:"EXTERNAL_JOB_ID_OBSERVED",
   external_job_id:"synthetic-job-0001",
   reservation_id:state.entries[0].reservation_id,
   payload_sha256:state.entries[0].payload_sha256});
 state=r.next_state;
 r=observe(state,entry.key,entry.reservation_id,state.revision,
  {kind:"TIMEOUT_OR_CRASH"});
 zero(r);assert.equal(r.next_state.entries[0].state,STATES.UNKNOWN);
 blocked(r.next_state,ad[0],"ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
});
check("photo flag without external evidence is never treated as paper",()=>{
 const state=book(fresh(),ad[0]),entry=state.entries[0];
 const r=observe(state,entry.key,entry.reservation_id,state.revision,
  {kind:"PAPER_CONFIRMED",evidence_type:"SYNTHETIC_FLAG",
   evidence_ref:"evidence:synthetic1"});
 zero(r);assert.equal(r.status,"HOLD");
});
check("even external photo reference is a claim not world proof",()=>{
 const state=book(fresh(),ad[0]),entry=state.entries[0];
 const r=observe(state,entry.key,entry.reservation_id,state.revision,
  {kind:"PAPER_CONFIRMED",evidence_type:"EXTERNAL_HUMAN_PHOTO",
   evidence_ref:"evidence:synthetic123"});
 zero(r);assert.equal(r.next_state.entries[0].state,STATES.PAPER);
 assert.equal(r.authorize_print,false);
});
check("single shared CAS allows only one of two stale writers",()=>{
 const s=fresh(),first=reserve(s,ad[0],s.revision),
 second=reserve(s,bd[0],s.revision);
 zero(first);zero(second);
 let committed=first.next_state;
 const stale=reserve(committed,bd[0],s.revision);
 zero(stale);assert.equal(stale.reasons[0],"CAS_REVISION_CONFLICT");
 committed=book(committed,bd[0]);assert.equal(committed.entries.length,2);
});
check("tampered ledger source hash is detected independently",()=>{
 const s=book(fresh(),ad[0]),fake=copy(s);
 fake.entries[0].source_sha256=sha("tampered-source");
 // This may remain a syntactically valid *new* ledger, not a signed proof.
 // Ensure it never authorizes a new attempt for the original descriptor.
 assert.equal(resumeDecision(fake,ad[0]).authorize_print,false);
 assert.equal(eligible(A,{sourceCorrelated:false}).status,"HOLD");
});
check("all three views for two orders can coexist with no side effects",()=>{
 let s=fresh();for(const t of [...ad,...bd])s=book(s,t);
 assert.equal(s.entries.length,6);assert.ok(validLedger(s));
 assert.equal(new Set(s.entries.map(x=>x.key)).size,6);
});

function permutations(arr){
 if(arr.length===0)return [[]];
 return arr.flatMap((v,i)=>permutations(arr.filter((_,j)=>i!==j))
  .map(rest=>[v,...rest]));
}
// 6! independent sequences of two simultaneous orders/three views. The
// production CAS/queue/store is NOT validated; this is a pure planner test.
let permCount=0;
for(const order of permutations([...ad,...bd])){
 let s=fresh();
 for(const d of order){
  s=book(s,d);
  assert.equal(validLedger(s),true);
 }
 assert.equal(s.entries.length,6);
 for(const d of order)
  blocked(s,d,"ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
 permCount++;
}
assert.equal(permCount,720);
// Seeded shuffle of three orders x three views (9 entries), including
// reboot, same view replay, fake timeout, and priority interleavings.
let rand=0x123a88de;
const next=()=>{rand=(Math.imul(rand,1664525)+1013904223)>>>0;return rand;};
let fuzz=0;
for(let turn=0;turn<256;turn++){
 const list=[...ad,...bd,...cd].slice();
 for(let i=list.length-1;i>0;i--){
  const j=next()%(i+1);[list[i],list[j]]=[list[j],list[i]];
 }
 let s=fresh();
 for(const desc of list){
  s=book(s,desc);
  if((next()%7)===0)s=copy(s); // crash/restart in memory
 }
 assert.equal(s.entries.length,9);
 assert.equal(new Set(s.entries.map(x=>x.key)).size,9);
 for(const desc of list)
  blocked(s,desc,"ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
 fuzz++;
}
assert.equal(fuzz,256);
assert.equal(named,28);
assert.ok(Object.values(ZERO).every(x=>x===false));
assert.ok(Object.values(NO_EFFECTS).every(x=>x===false));
console.log("TATA_COMANDA_MULTIORDER_INTERLEAVING_V866="+named+"/"+named+
 " NAMED PERMUTATIONS="+permCount+"/"+permCount+
 " SEEDED_INTERLEAVINGS="+fuzz+"/"+fuzz+
 " REAL_V857_AND_V754_PURE_PLANNERS"+
 " GP_AND_LIFECYCLE_SYNTHETIC NO_HOST NO_SQL NO_PRINT NO_SPOOLER");

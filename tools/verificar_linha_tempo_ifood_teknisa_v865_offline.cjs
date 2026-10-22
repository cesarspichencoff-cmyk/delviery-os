"use strict";
/**
 * V8.65 REVIEW-ONLY timeline campaign for simulated iFood/Teknisa events.
 * Does not define production iFood API protocol or approve use of an
 * untrusted event sequence. The event shape is a TEST MODEL, not API spec.
 *
 * Goal: reject ordering/replay/cancellation ambiguity across multiple
 * arrivals using the actual pinned-code V8.57 Reader projection.
 * No GP, real webhook, SQL, printing, network or operational persistence.
 */
const assert=require("node:assert/strict");
const {syntheticReaderPairV857}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {projectReaderEssentials,snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");

const E=Object.freeze({print:false,spooler:false,sql:false,network:false,
 ifood_write:false,teknisa_write:false,sequence_write:false,service:false});
const deepcopy=x=>JSON.parse(JSON.stringify(x));
const original=()=>deepcopy(syntheticReaderPairV857());
function refresh(p){
 p.event.snapshot_hash=snapshotHash(p.event.order);
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
 return p;
}
const key=p=>p.event.order_key;
function event(label,p,kind,ordinal,revision){
 return {model:"SYNTHETIC_IFOOD_EVENT_TIMELINE_V865",event_id:"sim_"+label,
  full_uuid_claim:"sim_uuid_"+key(p).replaceAll("|","_"),
  order_key_claim:key(p),store_claim:p.event.order.CDFILIAL,
  short_id_claim:p.event.order.NRCOMANDAEXT,
  revision,ordinal,kind,
  reader_snapshot_hash_claim:p.event.snapshot_hash,
  reader_fingerprint_claim:p.decision.fingerprint};
}
const validEvent=e=>e?.model==="SYNTHETIC_IFOOD_EVENT_TIMELINE_V865" &&
 typeof e.event_id==="string"&&/^sim_[a-z0-9_]{1,54}$/.test(e.event_id)&&
 typeof e.full_uuid_claim==="string"&&/^sim_uuid_[a-z0-9_]{1,70}$/.test(e.full_uuid_claim)&&
 typeof e.order_key_claim==="string"&&
 /^[0-9]{4}\|[0-9]{2}\|[0-9]{1,12}\|[0-9]{1,12}$/.test(e.order_key_claim)&&
 typeof e.store_claim==="string"&&/^[0-9]{4}$/.test(e.store_claim)&&
 typeof e.short_id_claim==="string"&&/^[0-9]{1,12}$/.test(e.short_id_claim)&&
 Number.isSafeInteger(e.ordinal)&&e.ordinal>0&&e.ordinal<=100000 &&
 Number.isSafeInteger(e.revision)&&e.revision>0&&e.revision<=100000 &&
 ["CREATED","UPDATED","CANCELED"].includes(e.kind)&&
 /^[a-f0-9]{64}$/i.test(e.reader_snapshot_hash_claim)&&
 /^[a-f0-9]{64}$/i.test(e.reader_fingerprint_claim);

function assessTimeline(events,pairs){
 const errors=new Set();
 const deny=reason=>{errors.add(reason);};
 const envelope=()=>({
  schema:"tata.comanda.ifood-teknisa-timeline.v865.synthetic",
  status:errors.size?"HOLD":"SIMULATION_CANDIDATE_NOT_AUTHORIZED",
  reasons:[...errors].sort(),
  source_independently_authenticated:false,
  ifood_signature_independently_verified:false,
  uuid_claim_independently_verified:false,
  gp_receipt_or_paper_proven:false,
  ready_for_operational_print:false,
  effects:E,
 });
 if(!Array.isArray(events)||events.length<1||events.length>32||
 !Array.isArray(pairs)||pairs.length<1||pairs.length>32){
  deny("TIMELINE_INPUT_INVALID");return envelope();
 }
 const candidates=new Map(),shortOwners=new Map();
 for(const p of pairs){
  const n=projectReaderEssentials(p);
  if(n.status!=="SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD"||
  n.pair_snapshot_integrity_checked!==true||
  n.decision_fingerprint_checked!==true){
   deny("READER_V857_INTEGRITY_HOLD");continue;
  }
  const k=key(p),short=p.event.order.NRCOMANDAEXT;
  const identity=k+"|"+p.event.snapshot_hash+"|"+p.decision.fingerprint;
  if(candidates.has(identity)){deny("DUPLICATED_NATIVE_WITNESS");continue;}
  candidates.set(identity,p);
  if(!shortOwners.has(short))shortOwners.set(short,new Set());
  shortOwners.get(short).add(k);
 }
 const seenIds=new Map(),orders=new Map(),uuids=new Map(),globalPairs=new Map();
 for(const ev of events){
  if(!validEvent(ev)){deny("EVENT_SCHEMA_OR_IDENTITY_INVALID");continue;}
  if(seenIds.has(ev.event_id)){
   deny(seenIds.get(ev.event_id)===JSON.stringify(ev)?
    "DUPLICATE_EVENT_DELIVERY":"EVENT_ID_REUSED_FOR_DIFFERENT_PAYLOAD");
   continue;
  }
  seenIds.set(ev.event_id,JSON.stringify(ev));
  const owners=shortOwners.get(ev.short_id_claim);
  if(!owners||owners.size===0){deny("SOURCE_SHORT_ID_NOT_FOUND");continue;}
  if(owners.size!==1){deny("SOURCE_SHORT_ID_AMBIGUOUS");continue;}
  const ident=ev.order_key_claim+"|"+ev.reader_snapshot_hash_claim+
   "|"+ev.reader_fingerprint_claim;
  const p=candidates.get(ident);
  if(!p){deny("EVENT_TO_NATIVE_REVISION_NOT_MATCHED");continue;}
  if(p.event.order.CDFILIAL!==ev.store_claim||
     p.event.order.NRCOMANDAEXT!==ev.short_id_claim||
     key(p)!==ev.order_key_claim){
   deny("ORDER_OR_STORE_BINDING_MISMATCH");continue;
  }
  // Synthetic UUID is a CLAIM only. Multiple distinct claims for the same
  // native order, or reuse of a claim by different orders, MUST HOLD.
  const oldOrder=uuids.get(ev.full_uuid_claim);
  if(oldOrder&&oldOrder!==ev.order_key_claim)
   deny("UUID_CLAIM_REUSED_ACROSS_ORDERS");
  uuids.set(ev.full_uuid_claim,ev.order_key_claim);
  const oldUuid=globalPairs.get(ev.order_key_claim);
  if(oldUuid&&oldUuid!==ev.full_uuid_claim)
   deny("NATIVE_ORDER_WITH_MULTIPLE_UUID_CLAIMS");
  globalPairs.set(ev.order_key_claim,ev.full_uuid_claim);
  const old=orders.get(ev.order_key_claim);
  if(!old){
   if(ev.kind!=="CREATED"||ev.revision!==1||ev.ordinal!==1)
    deny("FIRST_EVENT_OR_REVISION_UNPROVEN");
   orders.set(ev.order_key_claim,{ordinal:ev.ordinal,revision:ev.revision,
    canceled:ev.kind==="CANCELED",snapshot:ev.reader_snapshot_hash_claim});
   continue;
  }
  if(old.canceled){deny("CANCELED_ORDER_TERMINAL_IN_SIMULATION");continue;}
  if(ev.ordinal<=old.ordinal){deny("EVENT_ARRIVAL_REWIND");continue;}
  // Do not assume missed events can be reconstructed from the newest event.
  if(ev.ordinal!==old.ordinal+1){deny("EVENT_ORDINAL_GAP");continue;}
  if(ev.kind==="CREATED"){deny("NEW_CREATE_FOR_EXISTING_ORDER");continue;}
  if(ev.kind==="UPDATED"){
   if(ev.revision!==old.revision+1)
    deny("UPDATE_REVISION_GAP_OR_REWIND");
   if(ev.reader_snapshot_hash_claim===old.snapshot)
    deny("UPDATE_SNAPSHOT_NOT_CHANGED");
  }
  if(ev.kind==="CANCELED"&&ev.revision<old.revision)
   deny("CANCEL_REVISION_STALE");
  orders.set(ev.order_key_claim,{ordinal:ev.ordinal,revision:ev.revision,
   canceled:ev.kind==="CANCELED",
   snapshot:ev.reader_snapshot_hash_claim});
 }
 for(const order of orders.values())
  if(order.canceled)deny("TERMINAL_CANCEL_NO_PRODUCTION");
 // A clean fixture never authenticates either provider; no authority grant.
 return envelope();
}
let n=0;const check=(name,fn)=>{fn();n++;console.log("PASS TIMELINE_V865 "+n+" "+name)};
const good=original(), changed=refresh(original());
changed.event.order.items[0].QTPRODCOMVEN="3.000";
changed.decision.items[0].quantity=3;
refresh(changed);
const pg=()=>[deepcopy(good)],pu=()=>[deepcopy(good),deepcopy(changed)];
const create=(p=good)=>event("a",p,"CREATED",1,1);
const update=(p=changed)=>event("b",p,"UPDATED",2,2);
const cancel=(p=changed)=>event("c",p,"CANCELED",3,2);
function assertResult(ev,pairs,reason){
 const x=assessTimeline(ev,pairs);
 assert.equal(x.status,reason?"HOLD":"SIMULATION_CANDIDATE_NOT_AUTHORIZED",
  JSON.stringify(x.reasons));
 if(reason)assert.ok(x.reasons.includes(reason),JSON.stringify(x.reasons));
 assert.equal(x.source_independently_authenticated,false);
 assert.equal(x.ifood_signature_independently_verified,false);
 assert.equal(x.uuid_claim_independently_verified,false);
 assert.equal(x.gp_receipt_or_paper_proven,false);
 assert.equal(x.ready_for_operational_print,false);
 assert.ok(Object.values(x.effects).every(v=>v===false));
}
check("created alone permits synthetic correlation, never print",()=>
 assertResult([create()],pg()));
check("created then revision two with changed quantity stays synthetic",()=>
 assertResult([create(),update()],pu()));
check("canceled order has no production candidate",()=>
 assertResult([create(),update(),cancel()],pu(),"TERMINAL_CANCEL_NO_PRODUCTION"));
check("late create after cancel cannot resurrect",()=>
 assertResult([create(),update(),cancel(),event("d",changed,"CREATED",4,3)],
 pu(),"CANCELED_ORDER_TERMINAL_IN_SIMULATION"));
check("late revision after cancel cannot resurrect",()=>
 assertResult([create(),update(),cancel(),event("d",changed,"UPDATED",4,3)],
 pu(),"CANCELED_ORDER_TERMINAL_IN_SIMULATION"));
check("duplicate same ID and payload cannot authorize second attempt",()=>
 assertResult([create(),create()],pg(),"DUPLICATE_EVENT_DELIVERY"));
check("same event ID reused with different revision is blocked",()=>{
 const e=update();e.event_id=create().event_id;
 assertResult([create(),e],pu(),"EVENT_ID_REUSED_FOR_DIFFERENT_PAYLOAD");
});
check("update arrives before create is incomplete",()=>
 assertResult([update(),create()],pu(),"FIRST_EVENT_OR_REVISION_UNPROVEN"));
check("ordinal rollback is rejected",()=>{
 const a=update();a.ordinal=1;
 assertResult([create(),a],pu(),"EVENT_ARRIVAL_REWIND");
});
check("missing ordinal after missed event is not guessed",()=>{
 const a=update();a.ordinal=4;
 assertResult([create(),a],pu(),"EVENT_ORDINAL_GAP");
});
check("revision gap is not guessed",()=>{
 const a=update();a.revision=5;
 assertResult([create(),a],pu(),"UPDATE_REVISION_GAP_OR_REWIND");
});
check("revision rewind is blocked",()=>{
 const a=update();a.revision=1;
 assertResult([create(),a],pu(),"UPDATE_REVISION_GAP_OR_REWIND");
});
check("same unchanged snapshot does not count as changed revision",()=>{
 const a=event("b",good,"UPDATED",2,2);
 assertResult([create(),a],pg(),"UPDATE_SNAPSHOT_NOT_CHANGED");
});
check("second create for same native order blocked",()=>{
 const a=event("b",good,"CREATED",2,2);
 assertResult([create(),a],pg(),"NEW_CREATE_FOR_EXISTING_ORDER");
});
check("cancel arriving before create blocked",()=>
 assertResult([cancel()],pu(),"FIRST_EVENT_OR_REVISION_UNPROVEN"));
check("first event cannot silently start from revision 2",()=>{
 const e=create();e.revision=2;
 assertResult([e],pg(),"FIRST_EVENT_OR_REVISION_UNPROVEN");
});
check("unmatched short iFood ID blocks",()=>{
 const e=create();e.short_id_claim="9999";
 assertResult([e],pg(),"SOURCE_SHORT_ID_NOT_FOUND");
});
check("wrong store claimed blocks",()=>{
 const e=create();e.store_claim="9999";
 assertResult([e],pg(),"ORDER_OR_STORE_BINDING_MISMATCH");
});
check("wrong native order identity blocks",()=>{
 const e=create();e.order_key_claim="0001|01|0000349281|0000348999";
 assertResult([e],pg(),"EVENT_TO_NATIVE_REVISION_NOT_MATCHED");
});
check("changed quantity without matching Reader witness blocks",()=>{
 const p=deepcopy(changed);p.decision.items[0].quantity=17;
 const ev=event("a",p,"CREATED",1,1);
 assertResult([ev],[p],"READER_V857_INTEGRITY_HOLD");
});
check("forged Reader hash is never accepted as witness",()=>{
 const p=deepcopy(good);p.event.snapshot_hash="a".repeat(64);
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
 assertResult([event("a",p,"CREATED",1,1)],[p],"READER_V857_INTEGRITY_HOLD");
});
check("one native order claims two different full UUIDs -> HOLD",()=>{
 const e=update();e.full_uuid_claim="sim_uuid_different_claim";
 assertResult([create(),e],pu(),"NATIVE_ORDER_WITH_MULTIPLE_UUID_CLAIMS");
});
check("unexpectedly reused UUID claim between orders blocks",()=>{
 const q=deepcopy(good);
 q.event.order.NRCOMANDA="0000348899";
 q.event.order.NRVENDAREST="0000349999";
 q.event.order.NRCOMANDAEXT="9628";
 q.event.order_key=[q.event.order.CDFILIAL,q.event.order.CDLOJA,
  q.event.order.NRVENDAREST,q.event.order.NRCOMANDA].join("|");
 q.decision.order_key=q.event.order_key;
 q.decision.teknisa_sequence=q.event.order.NRCOMANDA;
 q.decision.ifood_sequence=q.event.order.NRCOMANDAEXT;
 q.sequence_state.bindings[0].teknisa_order_id=q.event.order.NRCOMANDA;
 refresh(q);
 const a=event("z",q,"CREATED",1,1);
 a.full_uuid_claim=create().full_uuid_claim;
 assertResult([create(),a],[good,q],"UUID_CLAIM_REUSED_ACROSS_ORDERS");
});
check("different native order with same short iFood ID -> HOLD",()=>{
 const q=deepcopy(good);
 q.event.order.NRCOMANDA="0000348899";
 q.event.order.NRVENDAREST="0000349999";
 q.event.order_key=[q.event.order.CDFILIAL,q.event.order.CDLOJA,
  q.event.order.NRVENDAREST,q.event.order.NRCOMANDA].join("|");
 q.decision.order_key=q.event.order_key;
 q.decision.teknisa_sequence=q.event.order.NRCOMANDA;
 q.sequence_state.bindings[0].teknisa_order_id=q.event.order.NRCOMANDA;
 refresh(q);
 assertResult([create()],[good,q],"SOURCE_SHORT_ID_AMBIGUOUS");
});
check("duplicate native revision witness does not double establish identity",()=>
 assertResult([create()],[good,deepcopy(good)],"DUPLICATED_NATIVE_WITNESS"));
check("bad event schema is denied, not auto-corrected",()=>{
 const e=create();e.model="ACTUAL_IFOOD_API_EVENT";
 assertResult([e],pg(),"EVENT_SCHEMA_OR_IDENTITY_INVALID");
});
check("missing event ID is not allowed",()=>{
 const e=create();e.event_id="";
 assertResult([e],pg(),"EVENT_SCHEMA_OR_IDENTITY_INVALID");
});
check("cancel stale to newer revision is not accepted",()=>{
 const e=cancel();e.revision=1;
 assertResult([create(),update(),e],pu(),"CANCEL_REVISION_STALE");
});

// Independent order oracle for all permutations of three events.
// Only canonical arrival order CREATED->UPDATED has synthetic candidate;
// every sequence containing CANCELED must end in HOLD. This oracle is
// separate from assessTimeline's errors and uses only event types/positions.
const T=[create(),update(),cancel()];
const perms=a=>a.length===1?[a]:a.flatMap((v,i)=>perms(
 a.filter((_,j)=>j!==i)).map(rest=>[v,...rest]));
let permutations=0;
for(const group of perms(T)){
 const x=assessTimeline(group,pu());
 assert.equal(x.status,"HOLD","permuted cancellation must HOLD");
 assert.equal(x.ready_for_operational_print,false);
 permutations++;
}
assert.equal(permutations,6);
let mutations=0;
let seed=0x4e15934;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
for(let i=0;i<256;i++){
 const ev=[create(),update()];
 const type=i%8, j=rnd();
 if(type===0)ev[1].event_id=ev[0].event_id;
 if(type===1)ev[1].ordinal=ev[0].ordinal;
 if(type===2)ev[1].revision=ev[0].revision;
 if(type===3)ev[1].short_id_claim=String(j%10000).padStart(4,"0");
 if(type===4)ev[1].full_uuid_claim="sim_uuid_fake_"+j;
 if(type===5)ev[1].reader_snapshot_hash_claim="b".repeat(64);
 if(type===6)ev[1].reader_fingerprint_claim="b".repeat(64);
 if(type===7)ev[1].kind="CREATED";
 const x=assessTimeline(ev,pu());
 assert.equal(x.status,"HOLD",JSON.stringify({i,type,reason:x.reasons}));
 assert.equal(x.ready_for_operational_print,false);
 mutations++;
}
assert.equal(n,29);
console.log("TATA_IFOOD_TEKNISA_TIMELINE_V865="+n+"/"+n+
 " NAMED, PERMUTATIONS="+permutations+"/"+permutations+
 " MUTATIONS="+mutations+"/"+mutations+
 " V857_REAL_ORACLE SYNTHETIC_IFOOD_MODEL NO_NETWORK NO_SQL NO_PRINT");
module.exports={assessTimeline,E};

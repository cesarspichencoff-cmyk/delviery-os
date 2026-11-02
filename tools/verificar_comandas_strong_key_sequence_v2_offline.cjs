"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {SCHEMA,STATE_SCHEMA,EFFECTS,inspectStrongKeySequence:inspect}=
 require("./comandas_strong_key_sequence_v2_review_only.cjs");
let n=0;const test=(label,fn)=>{fn();console.log("PASS "+(++n)+" "+label);};
function refresh(pair){
 pair.event.snapshot_hash=snapshotHash(pair.event.order);
 pair.decision.snapshot_hash=pair.event.snapshot_hash;
 pair.decision.fingerprint=decisionHash(pair.decision);
}
function fixture(){
 const pair=syntheticReaderPairV857();
 pair.event.order.IDSTCOMANDA="3";
 pair.event.order.items.forEach(x=>x.IDSTPRCOMVEN="4");
 refresh(pair);
 return {pair,state:{schema:STATE_SCHEMA,
  policy:{width:3,min_value:1,max_value:999},bindings:[]}};
}
const scope=x=>"STORE:"+x.pair.event.order.CDFILIAL+"/"+x.pair.event.order.CDLOJA+
 "|DATE:"+x.pair.event.order.DTHRABERMESA.slice(0,10);
const binding=(x,number="001")=>({scope_id:scope(x),
 native_order_key:x.pair.event.order_key,tata_sequence:number});
const priorBindings=(x,count)=>Array.from({length:count},(_,i)=>({
 scope_id:scope(x),native_order_key:"0001|01|HISTSALE"+i+"|HISTCMD"+i,
 tata_sequence:String(i+1).padStart(3,"0")
}));
function read(x){
 const before=JSON.stringify(x),r=inspect(x);
 assert.equal(JSON.stringify(x),before,"no source mutation");
 assert.equal(r.schema,SCHEMA);
 assert.deepEqual(r.effects,EFFECTS);
 for(const k of ["current_state_independently_attested",
 "source_currently_attested","strong_order_binding_proven",
 "sequence_persisted_proven","native_first_dispatch_proven",
 "numbering_ready_for_operational_use","print_authorized",
 "automatic_retry_allowed"])assert.equal(r[k],false,k);
 assert.equal(r.actual_operational_sequence,null);
 const output=JSON.stringify(r);
 for(const word of ["0000348850","0000349281","ALERGIA A CAMARAO",
 "CDPRODUTO","native_order_key","NRCOMANDA"])
  assert.equal(output.includes(word),false,word);
 return r;
}
test("new full-key state only proposes 001, no durable assignment",()=>{
 const r=read(fixture());
 assert.equal(r.status,"STRONG_KEY_CANDIDATE_NOT_PERSISTED");
 assert.equal(r.hypothetical_next_value,"001");
});
test("v1 short NRCOMANDA identity can never become V2 provenance",()=>{
 const x=fixture();x.state={schema:"deliveryos.tata-sequence-state.v1",
  policy:{width:3,min_value:1,max_value:999},
  next_value:1,bindings:[]};
 const r=read(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.reason,"LEGACY_SHORT_KEY_STATE_REQUIRES_INDEPENDENT_MIGRATION");
});
test("same full-key in supplied state is NOT independently persisted proof",()=>{
 const x=fixture();x.state.bindings=[...priorBindings(x,6),binding(x,"007")];
 const r=read(x);
 assert.equal(r.status,"STRONG_KEY_PRESENT_IN_SUPPLIED_STATE_NOT_ATTESTED");
 assert.equal(r.candidate_reuses_supplied_binding,true);
 assert.equal(r.review_binding_number,"007");
});
test("different sale ID despite same short comanda does NOT reuse existing",()=>{
 const x=fixture();
 const old=binding(x);
 old.native_order_key=x.pair.event.order_key.replace("0000349281","0000349282");
 x.state.bindings=[old];
 const r=read(x);
 assert.equal(r.status,"STRONG_KEY_CANDIDATE_NOT_PERSISTED");
 assert.equal(r.hypothetical_next_value,"002");
});
test("other unit never consumes current Itaim number",()=>{
 const x=fixture(),b=binding(x,"999");
 b.scope_id=b.scope_id.replace("0001/01","0001/02");
 b.native_order_key=b.native_order_key.replace("0001|01|","0001|02|");
 x.state.bindings=[b];
 const r=read(x);
 assert.equal(r.status,"STRONG_KEY_CANDIDATE_NOT_PERSISTED");
 assert.equal(r.hypothetical_next_value,"001");
});
test("other day resets the proposal without reusing its binding",()=>{
 const x=fixture(),b=binding(x,"999");
 b.scope_id=b.scope_id.replace("2026-10-20","2026-10-19");
 x.state.bindings=[b];
 const r=read(x);
 assert.equal(r.status,"STRONG_KEY_CANDIDATE_NOT_PERSISTED");
 assert.equal(r.hypothetical_next_value,"001");
});
test("daily sequence with 002 as first binding is HOLD, not silently continued",()=>{
 const x=fixture();x.state.bindings=[binding(x,"002")];
 assert.equal(read(x).reason,"V2_DAILY_SEQUENCE_GAP_OR_NONCONTIGUOUS");
});
test("missing middle binding cannot be hidden by max+1",()=>{
 const x=fixture();x.state.bindings=[...priorBindings(x,1),binding(x,"003")];
 assert.equal(read(x).reason,"V2_DAILY_SEQUENCE_GAP_OR_NONCONTIGUOUS");
});
test("first 001 of new day unaffected by historical gaps in older day",()=>{
 const x=fixture();const b=binding(x,"099");
 b.scope_id=b.scope_id.replace("2026-10-20","2026-10-19");
 x.state.bindings=[b];
 const v=read(x);
 assert.equal(v.status,"STRONG_KEY_CANDIDATE_NOT_PERSISTED");
 assert.equal(v.hypothetical_next_value,"001");
});
test("same full-key duplicated even with same 001 is blocked",()=>{
 const x=fixture();x.state.bindings=[binding(x),binding(x)];
 assert.equal(read(x).reason,"V2_DUPLICATE_ORDER_BINDING");
});
test("two different native orders cannot share same sequence in one scope",()=>{
 const x=fixture(),one=binding(x),two=binding(x);
 two.native_order_key=two.native_order_key.replace("0000349281","0000349282");
 x.state.bindings=[one,two];
 assert.equal(read(x).reason,"V2_SEQUENCE_COLLISION");
});
test("sequence 000, short, whitespace and non-numeric values are blocked",()=>{
 for(const bad of ["000","1","01","1000","00A","001 "," 001"]){
  const x=fixture();x.state.bindings=[binding(x,bad)];
  assert.equal(read(x).reason,"V2_BINDING_SCOPE_KEY_OR_NUMBER_INVALID",bad);
 }
});
test("binding scope and key must match filial and loja",()=>{
 const x=fixture(),b=binding(x);
 b.native_order_key=b.native_order_key.replace("0001|01|","0001|02|");
 x.state.bindings=[b];
 assert.equal(read(x).reason,"V2_BINDING_SCOPE_KEY_OR_NUMBER_INVALID");
});
test("impossible date, malformed policy and unsupported schema are refused",()=>{
 const x=fixture();x.state.bindings=[{...binding(x),scope_id:
  "STORE:0001/01|DATE:2026-02-30"}];
 assert.equal(read(x).status,"HOLD");
 const y=fixture();y.state.policy.width=4;
 assert.equal(read(y).reason,"V2_STATE_OR_POLICY_INVALID");
 const z=fixture();z.state.schema="unsupported";
 assert.equal(read(z).reason,"V2_STATE_OR_POLICY_INVALID");
});
test("999 exhausts current scope, not other day or store",()=>{
 const x=fixture();x.state.bindings=[...priorBindings(x,998),{
  ...binding(x,"999"),native_order_key:"0001|01|HISTSALE999|HISTCMD999"}];
 assert.equal(read(x).reason,"V2_SEQUENCE_EXHAUSTED");
});
test("canceled item, foreign shop or stale Reader fingerprint never get a candidate",()=>{
 const a=fixture();a.pair.event.order.items[0].IDSTPRCOMVEN="6";
 refresh(a.pair);
 assert.equal(read(a).status,"HOLD");
 const b=fixture();b.pair.event.order.CDLOJA="02";
 b.pair.event.order_key=b.pair.event.order_key.replace("0001|01|","0001|02|");
 b.pair.decision.order_key=b.pair.event.order_key;refresh(b.pair);
 assert.equal(read(b).reason,"NOT_ITAIM_STORE_UNIT");
 const c=fixture();c.pair.event.order.IDSTCOMANDA="P";
 assert.equal(read(c).status,"HOLD");
});
test("self-claimed approval, persisted flag and printer authority never grant effects",()=>{
 const x=fixture();
 x.approved=true;x.state.persisted=true;x.print_authorized=true;
 const r=read(x);
 assert.equal(r.status,"STRONG_KEY_CANDIDATE_NOT_PERSISTED");
 assert.equal(r.print_authorized,false);
 assert.equal(r.sequence_persisted_proven,false);
});
console.log("COMANDAS_STRONG_KEY_SEQUENCE_V2="+n+"/"+n+
 " REVIEW_ONLY NO_MIGRATION NO_PERSIST NO_PRINT");

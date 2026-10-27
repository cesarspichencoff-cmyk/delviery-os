"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {inspectSequenceForNativeV2:inspect,SCHEMA,EFFECTS}=
 require("./comandas_sequence_v2_reconciliation_v1_offline.cjs");
const clone=structuredClone;
function source(status="3"){
 const p=syntheticReaderPairV857();
 p.event.order.IDSTCOMANDA=status;
 for(const r of p.event.order.items)r.IDSTPRCOMVEN="4";
 refresh(p);
 return p;
}
function refresh(p){
 p.event.snapshot_hash=snapshotHash(p.event.order);
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
 return p;
}
function input(){
 return {pair:source(),state:{
  schema:"deliveryos.tata-sequence-state.v1",
  policy:{width:3,min_value:1,max_value:999},next_value:1,bindings:[]
 }};
}
const scope=x=>"STORE:"+x.pair.event.order.CDFILIAL+
 "|DATE:"+x.pair.event.order.DTHRABERMESA.slice(0,10);
const order=x=>x.pair.event.order.NRCOMANDA;
function binding(x,number="001"){
 return {scope_id:scope(x),teknisa_order_id:order(x),tata_sequence:number};
}
let n=0;
function test(label,fn){fn();console.log("PASS "+(++n)+" "+label);}
function verify(x){
 const before=JSON.stringify(x),r=inspect(x);
 assert.equal(JSON.stringify(x),before,"no mutation of source/state");
 assert.equal(r.schema,SCHEMA);
 assert.deepEqual(r.effects,EFFECTS);
 for(const prop of ["candidate_is_persisted","sequence_persisted_proven",
  "strong_order_binding_proven","live_sequence_attested_here",
  "authorizes_sequence_commit","authorizes_first_print",
  "automatic_retry_allowed","current_state_read_by_this_module"])
  assert.equal(r[prop],false,prop);
 assert.equal(r.number_for_operational_ticket,null);
 const output=JSON.stringify(r);
 for(const secret of ["0000348850","ALERGIA A CAMARAO","SEM CEBOLINHA",
   "0000349281"])assert.equal(output.includes(secret),false,"no order or observation leak");
 return r;
}
function candidate(x,expected){
 const r=verify(x);
 assert.equal(r.status,"CANDIDATE_ONLY_NOT_PERSISTED",r.reason);
 assert.equal(r.hypothetical_next_value,expected);
 assert.equal(r.is_new_binding_candidate,true);
 return r;
}
function hold(x,reason){
 const r=verify(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.reason,reason);
 return r;
}
test("empty installed-schema state proposes 001 only in memory",()=>{
 const r=candidate(input(),"001");
 assert.equal(r.sequence_persisted_proven,false);
});
test("header P is no independent evidence of paper or sequence binding",()=>{
 const x=input();x.pair=source("P");candidate(x,"001");
});
test("header X status is not treated as cancellation by itself",()=>{
 const x=input();x.pair=source("X");candidate(x,"001");
});
test("different iFood short ID inside native source does not bind 001 blindly",()=>{
 const x=input();x.pair.event.order.NRCOMANDAEXT="0077";
 x.pair.decision.ifood_sequence="0077";refresh(x.pair);
 candidate(x,"001");
});
test("synthetic existing binding is observed in supplied state, not proven live",()=>{
 const x=input();x.state.bindings=[binding(x,"007")];
 const r=verify(x);
 assert.equal(r.status,"EXISTING_BINDING_IN_SUPPLIED_STATE_NOT_ATTESTED");
 assert.equal(r.hypothetical_next_value,null);
});
test("replayed same Teknisa internal order can claim same binding only",()=>{
 const x=input();x.state.bindings=[binding(x,"007")];
 const a=verify(x),b=verify(clone(x));assert.deepEqual(a,b);
});
test("second order after 001 proposes 002",()=>{
 const x=input();x.state.bindings=[{...binding(x),teknisa_order_id:"OTHER"}];
 candidate(x,"002");
});
test("prior-day 999 does not carry into a new day",()=>{
 const x=input();x.state.bindings=[{...binding(x,"999"),scope_id:
 "STORE:0001|DATE:2026-10-19"}];
 candidate(x,"001");
});
test("different store previous binding does not consume current store number",()=>{
 const x=input();x.state.bindings=[{...binding(x,"999"),scope_id:
 "STORE:0002|DATE:2026-10-20"}];
 candidate(x,"001");
});
test("sparse but valid sequence cannot silently reuse a lower number",()=>{
 const x=input();x.state.bindings=[{...binding(x,"005"),teknisa_order_id:"OTHER"}];
 candidate(x,"006");
});
test("maxed 999 blocks the thousandth distinct comanda",()=>{
 const x=input();x.state.bindings=[{...binding(x,"999"),teknisa_order_id:"OTHER"}];
 hold(x,"SEQUENCE_PLANNER_REFUSED");
});
test("replay 999 remains an existing alleged binding after numeric exhaustion",()=>{
 const x=input();x.state.bindings=[binding(x,"999")];
 const r=verify(x);
 assert.equal(r.status,"EXISTING_BINDING_IN_SUPPLIED_STATE_NOT_ATTESTED");
});
test("two orders cannot share one sequence in one day/store",()=>{
 const x=input();x.state.bindings=[binding(x),{...binding(x),teknisa_order_id:"OTHER"}];
 hold(x,"SEQUENCE_COLLISION_SAME_DAY_STORE");
});
test("same order cannot have 001 and 002 in same day/store",()=>{
 const x=input();x.state.bindings=[binding(x),binding(x,"002")];
 hold(x,"SEQUENCE_DUPLICATE_ORDER_BINDING");
});
test("identical duplicate binding rows also block rather than masquerade as clean replay",()=>{
 const x=input();x.state.bindings=[binding(x),binding(x)];
 hold(x,"SEQUENCE_DUPLICATE_ORDER_BINDING");
});
test("invalid binding in another day blocks entire state, no accidental blind trust",()=>{
 const x=input();x.state.bindings=[{...binding(x),scope_id:"STORE:0001|DATE:2026-02-30"}];
 hold(x,"SEQUENCE_EXISTING_BINDING_FORMAT_INVALID");
});
test("invalid 000 historical sequence is rejected",()=>{
 const x=input();x.state.bindings=[binding(x,"000")];
 hold(x,"SEQUENCE_EXISTING_BINDING_FORMAT_INVALID");
});
test("invalid 01 nonpadded legacy binding is rejected",()=>{
 const x=input();x.state.bindings=[binding(x,"01")];
 hold(x,"SEQUENCE_EXISTING_BINDING_FORMAT_INVALID");
});
test("noncanonical scope field is refused",()=>{
 const x=input();x.state.bindings=[{...binding(x),scope_id:"ITAIM-2026-10-20"}];
 hold(x,"SEQUENCE_EXISTING_BINDING_FORMAT_INVALID");
});
test("unknown next_value state format never accepted",()=>{
 const x=input();x.state.next_value="1";
 hold(x,"SEQUENCE_STATE_OR_POLICY_INVALID");
});
test("wrong policy 4 digits cannot alter approved daily 3-digit contract",()=>{
 const x=input();x.state.policy.width=4;
 hold(x,"SEQUENCE_STATE_OR_POLICY_INVALID");
});
test("cancelled order header 4 is not sequence-ready",()=>{
 const x=input();x.pair=source("4");
 hold(x,"NATIVE_READER_V2_SOURCE_NOT_CONSISTENT");
});
test("cancelled native item status 6 is not sequence-ready",()=>{
 const x=input();x.pair.event.order.items[0].IDSTPRCOMVEN="6";refresh(x.pair);
 hold(x,"NATIVE_READER_V2_SOURCE_NOT_CONSISTENT");
});
test("stale order snapshot blocks sequence candidate",()=>{
 const x=input();x.pair.event.order.NRCOMANDAEXT="1234";
 hold(x,"NATIVE_READER_V2_SOURCE_NOT_CONSISTENT");
});
test("changed item count with matching hashes cannot allocate after content mismatch",()=>{
 const x=input();x.pair.event.order.items[0].QTPRODCOMVEN="9";refresh(x.pair);
 hold(x,"NATIVE_READER_V2_SOURCE_NOT_CONSISTENT");
});
test("fake external claimed persistence proof cannot self-promote a binding",()=>{
 const x=input();x.state_attested=true;x.authorize_commit=true;
 const r=candidate(x,"001");assert.equal(r.authorizes_sequence_commit,false);
});
test("untrusted state positive flag cannot turn proposal into persisted record",()=>{
 const x=input();x.state.persisted=true;
 const r=candidate(x,"001");assert.equal(r.live_sequence_attested_here,false);
});
test("null and malformed inputs fail closed",()=>{
 hold(null,"NATIVE_READER_V2_SOURCE_NOT_CONSISTENT");
 hold({pair:source(),state:null},"SEQUENCE_STATE_OR_POLICY_INVALID");
});
console.log("COMANDAS_SEQUENCE_V2_RECONCILIATION_V1="+n+"/"+n+
 " 001_IS_ONLY_CANDIDATE NO_BIND NO_PRINT STRONG_KEY_NOT_YET_PROVEN");

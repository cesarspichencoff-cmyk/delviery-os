"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {inspectTataSequencePreflight,SCHEMA,EFFECTS}=
 require("./tata_comanda_sequence_preflight_v858_offline.cjs");
const {syntheticReaderPairV857:pair}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const copy=x=>JSON.parse(JSON.stringify(x));
let n=0;
function test(name,fn){fn();n++;console.log("PASS "+n+" "+name);}
function assess(x){
 const before=JSON.stringify(x),o=inspectTataSequencePreflight(x);
 assert.equal(JSON.stringify(x),before,"preflight must not mutate source state");
 assert.equal(o.schema,SCHEMA);assert.deepEqual(o.effects,EFFECTS);
 assert.equal(o.printing_ready,false);
 assert.equal(o.operator_approval_verified,false);
 assert.equal(o.candidate_is_binding,false);
 assert.equal(o.proposed_state,null);
 if(o.status!=="EXISTING_SEQUENCE_PREVIEW_HOLD"){
  assert.deepEqual(o.preview_lines,[]);
  assert.equal(o.essential,null);
  assert.equal(o.sequence_persisted_proven,false);
 }
 return o;
}
test("archived OCT 05 state had ZERO production bindings, not a ready sequence",()=>{
 const proof=JSON.parse(fs.readFileSync(path.join(__dirname,"..","data",
  "tata_reader_live_sequence_state_proof_20261005_v1.json"),"utf8"));
 assert.equal(proof.production_state.binding_count,0);
 assert.equal(proof.production_state.next_formatted,"001");
 assert.equal(proof.effects.production_binding_write,false);
 assert.equal(proof.shadow_binding_proof.shadow_state_deleted,true);
});
test("existing verified synthetic state reuses 007, not shadow 999",()=>{
 const o=assess(pair());
 assert.equal(o.status,"EXISTING_SEQUENCE_PREVIEW_HOLD");
 assert.equal(o.sequence_persisted_proven,true);
 assert.equal(o.essential.tata_sequence,"007");
 assert.ok(o.preview_lines.some(s=>s.includes("IFOOD 9627 | TATA 007")));
 assert.ok(!o.preview_lines.some(s=>s.includes("TATA 999")));
});
test("zero bindings requires authorized atomically persisted sequence",()=>{
 const x=pair();x.sequence_state.bindings=[];x.sequence_state.next_value=1;
 const o=assess(x);
 assert.equal(o.status,"AUTHORIZED_ATOMIC_BIND_REQUIRED");
 assert.equal(o.hypothetical_content_validated,true);
 assert.equal(o.essential_preview_ready,false);
 assert.equal(o.next_action,"AUTHORIZED_TATA_SEQUENCE_ATOMIC_BIND_V1_THEN_RE_READ_AND_COMPARE");
});
test("simulated commit then readback enables preview, not printing",()=>{
 const x=pair();x.sequence_state.bindings=[];
 assert.equal(assess(x).status,"AUTHORIZED_ATOMIC_BIND_REQUIRED");
 const simulated=copy(x);
 simulated.sequence_state.bindings=[{
  scope_id:"STORE:0001|DATE:2026-10-20",
  teknisa_order_id:"0000348850",tata_sequence:"001"}];
 const after=assess(simulated);
 assert.equal(after.status,"EXISTING_SEQUENCE_PREVIEW_HOLD");
 assert.equal(after.essential.tata_sequence,"001");
 assert.equal(after.printing_ready,false);
});
test("old store-day binding does not carry over",()=>{
 const x=pair();x.sequence_state.bindings[0].scope_id="STORE:0001|DATE:2026-10-19";
 assert.equal(assess(x).status,"AUTHORIZED_ATOMIC_BIND_REQUIRED");
});
test("other order uses available next number but is NOT assigned",()=>{
 const x=pair();x.sequence_state.bindings[0].teknisa_order_id="0000349999";
 assert.equal(assess(x).status,"AUTHORIZED_ATOMIC_BIND_REQUIRED");
});
test("same sequence bound twice blocks",()=>{
 const x=pair();x.sequence_state.bindings.push({
  scope_id:"STORE:0001|DATE:2026-10-20",teknisa_order_id:"999",tata_sequence:"007"});
 assert.equal(assess(x).status,"HOLD");
});
test("same order different binding blocks",()=>{
 const x=pair();x.sequence_state.bindings.push({
  scope_id:"STORE:0001|DATE:2026-10-20",teknisa_order_id:"0000348850",tata_sequence:"008"});
 assert.equal(assess(x).status,"HOLD");
});
test("no source pair even with empty state cannot plan",()=>{
 const x=pair();x.sequence_state.bindings=[];delete x.decision;
 assert.equal(assess(x).status,"HOLD");
});
test("damaged watcher hash must not prompt binding",()=>{
 const x=pair();x.sequence_state.bindings=[];x.event.snapshot_hash="f".repeat(64);
 assert.equal(assess(x).status,"HOLD");
});
test("revised product count must not prompt binding",()=>{
 const x=pair();x.sequence_state.bindings=[];x.decision.items[0].quantity=10;
 assert.equal(assess(x).status,"HOLD");
});
test("wrong iFood ID must not prompt binding",()=>{
 const x=pair();x.sequence_state.bindings=[];x.decision.ifood_sequence="9999";
 assert.equal(assess(x).status,"HOLD");
});
test("false A DEFINIR product cannot prompt binding",()=>{
 const x=pair();x.sequence_state.bindings=[];x.decision.items[0].product_name="A DEFINIR";
 assert.equal(assess(x).status,"HOLD");
});
test("cancelled native order cannot prompt binding",()=>{
 const x=pair();x.sequence_state.bindings=[];x.event.order.IDSTCOMANDA="C";
 assert.equal(assess(x).status,"HOLD");
});
test("missing optional packaging still allows sequence preflight",()=>{
 const x=pair();x.sequence_state.bindings=[];
 delete x.packaging;
 assert.equal(assess(x).status,"AUTHORIZED_ATOMIC_BIND_REQUIRED");
});
test("TATA sequence cannot use empty policy",()=>{
 const x=pair();delete x.sequence_state.policy;
 assert.equal(assess(x).status,"HOLD");
});
test("no sequence state returns HOLD",()=>{
 const x=pair();delete x.sequence_state;
 assert.equal(assess(x).status,"HOLD");
});
test("invalid local day returns HOLD",()=>{
 const x=pair();x.sequence_state.bindings=[];
 x.event.order.DTHRABERMESA="2026-02-30T13:00:00";
 assert.equal(assess(x).status,"HOLD");
});
test("null input returns HOLD without exception",()=>assert.equal(assess(null).status,"HOLD"));
console.log("TATA_COMANDA_SEQUENCE_PREFLIGHT_V858="+n+"/"+n+
 " HISTORIC_ZERO_BINDINGS NOT_MISTAKE_CANDIDATE_FOR_COMMIT NO_PRINT NO_WRITE");

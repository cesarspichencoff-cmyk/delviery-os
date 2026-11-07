"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {SCHEMA,EFFECTS,triageReaderObservations:triage}=
 require("./comandas_reader_observation_triage_v1_offline.cjs");
let n=0;
function test(label,fn){fn();console.log("PASS "+(++n)+" "+label);}
function refresh(p){
 p.event.snapshot_hash=snapshotHash(p.event.order);
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
}
function sample(){
 const p=syntheticReaderPairV857();
 p.event.order.IDSTCOMANDA="3";
 p.event.order.items.forEach(x=>x.IDSTPRCOMVEN="4");
 refresh(p);return p;
}
function call(p){
 const before=JSON.stringify(p),result=triage(p);
 assert.equal(JSON.stringify(p),before,"pure function must not mutate");
 assert.equal(result.schema,SCHEMA);
 assert.deepEqual(result.effects,EFFECTS);
 for(const field of ["disposition_approved","classification_approved",
   "first_native_dispatch_proven","ready_for_operational_print",
   "print_authorized"])assert.equal(result[field],false,field);
 const out=JSON.stringify(result);
 for(const text of ["ALERGIA A CAMARAO","SEM CEBOLINHA",
   "ENTREGA NA PORTARIA","COMBINADO SUSHI","TEMAKI SALMAO",
   "0000001111","0000348850","CDPRODUTO","note_value","value_hash"])
  assert.equal(out.includes(text),false,"private/unsafe field: "+text);
 return result;
}
test("three joined native notes become a scoped inventory, never directions",()=>{
 const r=call(sample());
 assert.equal(r.status,"TRIAGE_PENDING");
 assert.equal(r.note_count,3);
 assert.deepEqual(r.entries.map(e=>[e.note_index,e.scope,e.item_index,e.source_field]),
  [[1,"ITEM",1,"DSOBSPEDDIGCMD"],
   [2,"ITEM",1,"TXPRODCOMVEN"],
   [3,"ORDER",null,"DSOBSCOMANDA"]]);
 assert.ok(r.entries.every(e=>e.review_state==="UNCLASSIFIED"&&
  e.may_route_to_production===false&&e.may_route_to_conference===false));
 assert.match(r.source_revision_sha256,/^[0-9a-f]{64}$/);
});
test("no notes returns explicit empty safe inventory, not a print grant",()=>{
 const p=sample();p.event.order.observation_rows=[];
 p.decision.order_observations=[];
 p.decision.items.forEach(x=>x.observations=[]);refresh(p);
 const r=call(p);
 assert.equal(r.status,"NO_OBSERVATIONS");
 assert.equal(r.note_count,0);
 assert.deepEqual(r.entries,[]);
 assert.equal(r.every_note_requires_explicit_disposition,false);
});
test("changed text with matching Reader hashes changes source binding",()=>{
 const p=sample(),a=call(p);
 p.event.order.observation_rows[0].value="ALERGIA A OUTRO INGREDIENTE";
 p.decision.items[0].observations[0].value="ALERGIA A OUTRO INGREDIENTE";
 refresh(p);
 const b=call(p);
 assert.equal(b.status,"TRIAGE_PENDING");
 assert.notEqual(a.source_revision_sha256,b.source_revision_sha256);
 assert.deepEqual(a.entries,b.entries);
});
test("wrong decision text even with recomputed fingerprint is HOLD",()=>{
 const p=sample();
 p.decision.items[0].observations[0].value="OUTRA OBSERVACAO";
 refresh(p);
 assert.equal(call(p).status,"HOLD");
});
test("unjoined source note is HOLD",()=>{
 const p=sample();p.event.order.observation_rows[0].join_proven=false;refresh(p);
 assert.equal(call(p).status,"HOLD");
});
test("duplicated note field on same item is HOLD",()=>{
 const p=sample();
 p.event.order.observation_rows.push({...p.event.order.observation_rows[0]});
 refresh(p);
 assert.equal(call(p).status,"HOLD");
});
test("orphaned item index cannot be represented as a valid line",()=>{
 const p=sample();
 p.event.order.observation_rows[0].item_index=7;refresh(p);
 assert.equal(call(p).status,"HOLD");
});
test("source note for wrong CDPRODUTO is HOLD",()=>{
 const p=sample();
 p.event.order.observation_rows[0].CDPRODUTO="9999999999";
 refresh(p);
 assert.equal(call(p).status,"HOLD");
});
test("missing order note in decision is HOLD",()=>{
 const p=sample();p.decision.order_observations=[];refresh(p);
 assert.equal(call(p).status,"HOLD");
});
test("native canceled item never generates a triage inventory",()=>{
 const p=sample();p.event.order.items[0].IDSTPRCOMVEN="6";refresh(p);
 assert.equal(call(p).status,"HOLD");
});
test("out-of-scope shop cannot create a note triage queue",()=>{
 const p=sample();p.event.order.CDLOJA="02";
 p.event.order_key="0001|02|0000349281|0000348850";
 p.decision.order_key=p.event.order_key;refresh(p);
 const r=call(p);assert.equal(r.status,"HOLD");
 // Strong-key source-scope gate now rejects before note-triage's own scope check.
 assert.equal(r.reason,"NATIVE_PAIR_NOT_SELF_CONSISTENT");
 assert.equal(r.print_authorized,false);
});
test("native revision change P to X cannot reuse an inventory binding",()=>{
 const p=sample(),a=call(p);
 p.event.order.IDSTCOMANDA="X";refresh(p);
 const b=call(p);
 assert.equal(b.status,"TRIAGE_PENDING");
 assert.notEqual(b.source_revision_sha256,a.source_revision_sha256);
 assert.equal(b.disposition_approved,false);
});
test("invalid or missing native pair holds with no exported data",()=>{
 for(const p of [null,{},[],{event:{},decision:{}}]){
  const r=call(p);assert.equal(r.status,"HOLD");
  assert.equal(r.source_revision_sha256,null);
  assert.deepEqual(r.entries,[]);
 }
});
console.log("COMANDAS_NATIVE_OBSERVATION_TRIAGE="+n+"/"+n+" REVIEW_ONLY NO_PRINT");

// Scoped review proposals only; receipt never approves or prints.
require("./verificar_comandas_reader_observation_disposition_proposals_v1_offline.cjs");

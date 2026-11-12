"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {triageReaderObservations}=require("./comandas_reader_observation_triage_v1_offline.cjs");
const {SCHEMA,NO_EFFECTS,reviewObservationProposals:review,
 verifyObservationProposalReceipt:verifyReceipt}=
 require("./comandas_reader_observation_disposition_proposals_v1_offline.cjs");
let count=0;
function test(label,fn){fn();console.log("PASS "+(++count)+" "+label);}
function refresh(p){
 p.event.snapshot_hash=snapshotHash(p.event.order);
 p.decision.snapshot_hash=p.event.snapshot_hash;
 p.decision.fingerprint=decisionHash(p.decision);
}
function fixture(){
 const p=syntheticReaderPairV857();
 p.event.order.IDSTCOMANDA="3";
 p.event.order.items.forEach(x=>x.IDSTPRCOMVEN="4");
 refresh(p);return p;
}
function claims(p){
 const t=triageReaderObservations(p);
 assert.equal(t.status,"TRIAGE_PENDING");
 const choices=["PROPOSE_PRODUCTION","PROPOSE_CONFERENCE","ESCALATE_FOR_HUMAN"];
 return t.entries.map((n,i)=>({
  note_index:n.note_index,scope:n.scope,item_index:n.item_index,
  source_field:n.source_field,source_revision_sha256:t.source_revision_sha256,
  decision_fingerprint_sha256:p.decision.fingerprint,
  proposed_disposition:choices[i%choices.length],
  reviewer_claim_ref:"SYNTHETIC_REVIEWER"
 }));
}
function call(p,c){
 const pBefore=JSON.stringify(p),cBefore=JSON.stringify(c);
 const r=review(p,c);
 assert.equal(JSON.stringify(p),pBefore,"pair mutated");
 assert.equal(JSON.stringify(c),cBefore,"proposals mutated");
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,NO_EFFECTS);
 for(const k of ["note_text_exposed","reviewer_identity_attested",
  "human_review_proven","disposition_approved",
  "classification_approved","production_ready",
  "legacy_print_suppression_authorized","conference_print_authorized",
  "production_print_authorized","print_authorized"])
  assert.equal(r[k],false,k);
 const out=JSON.stringify(r);
 for(const sensitive of ["ALERGIA A CAMARAO","SEM CEBOLINHA",
  "ENTREGA NA PORTARIA","COMBINADO SUSHI","0000001111",
  "0000348850","SYNTHETIC_REVIEWER","note_value"])
  assert.equal(out.includes(sensitive),false,sensitive);
 if(r.status==="HOLD")assert.equal(r.review_claim_receipt_sha256,null);
 return r;
}
test("three exact notes produce only review proposals with non-authoritative receipt",()=>{
 const p=fixture(),c=claims(p),r=call(p,c);
 assert.equal(r.status,"PROPOSALS_CAPTURED_NOT_APPROVED");
 assert.deepEqual([r.production_proposals,r.conference_proposals,r.escalate_proposals],[1,1,1]);
 assert.match(r.review_claim_receipt_sha256,/^[0-9a-f]{64}$/);
});
test("source-order independent proposals produce the same digest",()=>{
 const p=fixture(),c=claims(p),a=call(p,c);
 assert.equal(call(p,c.reverse()).review_claim_receipt_sha256,a.review_claim_receipt_sha256);
});
test("missing, duplicated or unexpected review claims remain HOLD",()=>{
 const p=fixture(),c=claims(p);
 for(const rows of [[],c.slice(1),[c[0],c[0],c[2]],
  [...c,c[0]],null,{}]){
  assert.equal(call(p,rows).status,"HOLD");
 }
});
test("exact note field, scope and line index must match triage",()=>{
 const p=fixture(),c=claims(p);
 for(const modify of [
  x=>x.scope="ORDER",x=>x.item_index=2,
  x=>x.source_field="TXPRODCOMVEN",
  x=>x.note_index=9]){
  const d=c.map(x=>({...x}));modify(d[0]);
  assert.equal(call(p,d).status,"HOLD");
 }
});
test("text change with valid recomputed source hashes invalidates old review",()=>{
 const p=fixture(),c=claims(p),old=call(p,c);
 p.event.order.observation_rows[0].value="ALERGIA A OUTRO INGREDIENTE";
 p.decision.items[0].observations[0].value="ALERGIA A OUTRO INGREDIENTE";
 refresh(p);
 assert.equal(call(p,c).status,"HOLD");
 const fresh=call(p,claims(p));
 assert.equal(fresh.status,"PROPOSALS_CAPTURED_NOT_APPROVED");
 assert.notEqual(fresh.review_claim_receipt_sha256,old.review_claim_receipt_sha256);
});
test("order state change invalidates old proposal receipt",()=>{
 const p=fixture(),c=claims(p);
 p.event.order.IDSTCOMANDA="P";refresh(p);
 assert.equal(call(p,c).status,"HOLD");
});
test("swapped decision fingerprint, source revision or reviewer identity is rejected",()=>{
 const p=fixture(),c=claims(p);
 for(const alter of [
  x=>x.source_revision_sha256="a".repeat(64),
  x=>x.decision_fingerprint_sha256="a".repeat(64),
  x=>x.reviewer_claim_ref="",
  x=>x.reviewer_claim_ref="INJECTED\nVALUE"]){
  const d=c.map(x=>({...x}));alter(d[1]);
  assert.equal(call(p,d).status,"HOLD");
 }
});
test("extra approval or note-text fields cannot be smuggled",()=>{
 const p=fixture(),c=claims(p);
 for(const field of ["print_authorized","approved","note_text","trusted_auth"]){
  const d=c.map(x=>({...x}));d[0][field]=true;
  assert.equal(call(p,d).status,"HOLD");
 }
});
test("unknown, discard or skip dispositions cannot be treated as suggestions",()=>{
 const p=fixture(),c=claims(p);
 for(const choice of ["IGNORE","DISCARD","APPROVED","SKIP",""]){
  const d=c.map(x=>({...x}));d[0].proposed_disposition=choice;
  assert.equal(call(p,d).status,"HOLD");
 }
});
test("conference-only claims do not permit suppressing native production printing",()=>{
 const p=fixture(),c=claims(p).map(x=>({...x,proposed_disposition:"PROPOSE_CONFERENCE"}));
 const r=call(p,c);assert.equal(r.status,"PROPOSALS_CAPTURED_NOT_APPROVED");
 assert.equal(r.conference_proposals,3);
 assert.equal(r.production_print_authorized,false);
 assert.equal(r.legacy_print_suppression_authorized,false);
});
test("another reviewer claim changes receipt without proving human identity",()=>{
 const p=fixture(),c=claims(p),old=call(p,c);
 const d=c.map(x=>({...x}));d[2].reviewer_claim_ref="ANOTHER_CLAIM";
 const r=call(p,d);assert.notEqual(r.review_claim_receipt_sha256,old.review_claim_receipt_sha256);
 assert.equal(r.reviewer_identity_attested,false);
});
test("notes absent means nothing to review, not approval to print",()=>{
 const p=fixture();
 p.event.order.observation_rows=[];
 p.decision.order_observations=[];
 p.decision.items.forEach(x=>x.observations=[]);refresh(p);
 assert.equal(call(p,[]).status,"NOTHING_TO_REVIEW");
 const r=call(p,[{note_index:1}]);
 assert.equal(r.status,"HOLD");
});
test("canceled item, foreign store and unpaired source never make review claims",()=>{
 const x=fixture();x.event.order.items[0].IDSTPRCOMVEN="6";refresh(x);
 assert.equal(call(x,claims(fixture())).status,"HOLD");
 const y=fixture();y.event.order.CDLOJA="02";
 y.event.order_key="0001|02|0000349281|0000348850";
 y.decision.order_key=y.event.order_key;refresh(y);
 assert.equal(call(y,claims(fixture())).status,"HOLD");
 assert.equal(call(null,[]).status,"HOLD");
});
test("informational receipt re-checks same native Reader and complete proposals",()=>{
 const p=fixture(),c=claims(p),r=call(p,c);
 assert.equal(verifyReceipt(r.review_claim_receipt_sha256,p,c),true);
 assert.equal(verifyReceipt(r.review_claim_receipt_sha256,p,[...c].reverse()),true);
 assert.equal(r.human_review_proven,false);
 assert.equal(r.print_authorized,false);
});
test("a previous receipt fails on revised source text even with valid native hashes",()=>{
 const p=fixture(),c=claims(p),receipt=call(p,c).review_claim_receipt_sha256;
 p.event.order.observation_rows[0].value="INSTRUCAO ALTERADA";
 p.decision.items[0].observations[0].value="INSTRUCAO ALTERADA";
 refresh(p);
 assert.equal(verifyReceipt(receipt,p,c),false);
 const next=claims(p),r=call(p,next);
 assert.equal(verifyReceipt(r.review_claim_receipt_sha256,p,next),true);
 assert.notEqual(receipt,r.review_claim_receipt_sha256);
});
test("changing suggested destination or reviewer-claim invalidates receipt",()=>{
 const p=fixture(),c=claims(p),receipt=call(p,c).review_claim_receipt_sha256;
 const route=c.map(x=>({...x}));
 route[0].proposed_disposition="PROPOSE_CONFERENCE";
 assert.equal(verifyReceipt(receipt,p,route),false);
 const actor=c.map(x=>({...x}));
 actor[0].reviewer_claim_ref="ALTERNATIVE_CLAIM";
 assert.equal(verifyReceipt(receipt,p,actor),false);
 assert.equal(verifyReceipt(receipt,p,c),true);
});
test("invalid, inflated and absent receipts can never be verified",()=>{
 const p=fixture(),c=claims(p),receipt=call(p,c).review_claim_receipt_sha256;
 for(const fake of [null,undefined,{},[],42,"",receipt.toUpperCase(),
  receipt.slice(0,63),receipt+"x","f".repeat(64)])
  assert.equal(verifyReceipt(fake,p,c),false);
 assert.equal(verifyReceipt(receipt,null,c),false);
 assert.equal(verifyReceipt(receipt,p,c.slice(0,2)),false);
});
test("no notes and canceled native sources cannot reuse an old proposal receipt",()=>{
 const p=fixture(),c=claims(p),receipt=call(p,c).review_claim_receipt_sha256;
 p.event.order.observation_rows=[];
 p.decision.order_observations=[];
 p.decision.items.forEach(x=>x.observations=[]);
 refresh(p);
 assert.equal(verifyReceipt(receipt,p,c),false);
 assert.equal(verifyReceipt(receipt,p,[]),false);
 const canceled=fixture();
 canceled.event.order.items[0].IDSTPRCOMVEN="6";refresh(canceled);
 assert.equal(verifyReceipt(receipt,canceled,claims(fixture())),false);
});
console.log("COMANDAS_OBSERVATION_DISPOSITION_PROPOSALS="+count+"/"+count+
 " REVIEW_ONLY NO_APPROVAL NO_PRINT");

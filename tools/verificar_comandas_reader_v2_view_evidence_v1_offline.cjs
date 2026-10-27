"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857:fixture}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {assessNativeReaderV2:review,SCHEMA,EFFECTS}=
 require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const copy=x=>structuredClone(x);
function native(status="3"){
 const x=fixture();
 x.event.order.IDSTCOMANDA=status;
 for(const item of x.event.order.items)item.IDSTPRCOMVEN="4";
 refresh(x);
 return x;
}
function refresh(x){
 x.event.snapshot_hash=snapshotHash(x.event.order);
 x.decision.snapshot_hash=x.event.snapshot_hash;
 x.decision.fingerprint=decisionHash(x.decision);
 return x;
}
function independent(x){
 const o=x.event.order;
 x.ifood={schema:"tata.comandas.ifood-export-claim.v1",
  source_kind:"OFFICIAL_IFOOD_EXPORT",source_fingerprint:"b".repeat(64),
  source_ref:"SYNTHETIC_EXPORT_NOT_ATTESTATION",store_id:o.CDFILIAL,
  operational_date:o.DTHRABERMESA.slice(0,10),
  short_id:o.NRCOMANDAEXT,short_id_unique_for_day:true};
 return x;
}
let total=0;
function test(name,fn){fn();total++;console.log("PASS "+total+" "+name);}
function audit(input){
 const before=JSON.stringify(input),r=review(input);
 assert.equal(JSON.stringify(input),before,"pure and nonmutating");
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 for(const field of ["ready_for_operational_print","print_authorized",
  "source_independently_attested","first_production_event_proven",
  "sequence_binding_proven"])assert.equal(r[field],false,field);
 assert.equal(r.source_review.physical_print_proven,false);
 assert.equal(r.source_review.production.length,2);
 assert.equal(r.source_review.conference.print_authorized,false);
 for(const p of r.source_review.production){
  assert.equal(p.print_authorized,false);
  assert.deepEqual(p.bytes,[]);
 }
 assert.equal(r.source_review.conference.ifood_item_parity_proven,false);
 const json=JSON.stringify(r);
 for(const leaked of ["ENTREGA NA PORTARIA","ALERGIA A CAMARAO",
  "SEM CEBOLINHA","0000348850","0000349281"]){
  assert.equal(json.includes(leaked),false,"sensitive value leaked: "+leaked);
 }
 return r;
}
function ok(input){
 const r=audit(input);
 assert.equal(r.status,"NATIVE_PAIR_CONSISTENT_REVIEW_ONLY",
  JSON.stringify(r.reasons));
 assert.equal(r.revision_consistency_checked,true);
 assert.ok(r.source_review.production.every(p=>p.status==="NATIVE_ONLY_REVIEW"));
 return r;
}
function hold(x,reason){
 const r=audit(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.reasons[0],reason);
 assert.ok(r.source_review.production.every(v=>v.status==="HOLD"));
 return r;
}
test("realistic observed header 3 and item 4 are source-consistent, not print authorized",()=>{
 const r=ok(native("3"));
 assert.equal(r.source_review.conference.status,"HOLD");
 assert.equal(r.item_count,2);
});
test("observed native P is a readable source state but does not prove print",()=>{
 const r=ok(native("P"));
 assert.equal(r.first_production_event_proven,false);
});
test("observed native X remains readable evidence with unknown operational cause",()=>{
 const r=ok(native("X"));
 assert.equal(r.native_state_observed,"X");
 assert.equal(r.print_authorized,false);
});
test("iFood absent holds conference only",()=>{
 const r=ok(native("P"));
 assert.equal(r.source_review.conference.reasons[0],
  "INDEPENDENT_IFOOD_CROSSCHECK_NOT_AVAILABLE");
});
test("independent presence claim only creates conference candidate, not UUID proof",()=>{
 const r=ok(independent(native("3")));
 assert.equal(r.source_review.conference.status,"IFOOD_TEK_CANDIDATE_MATCH_REVIEW_ONLY");
 assert.equal(r.source_review.conference.ifood_source_authenticated_here,false);
});
test("wrong external iFood ID holds conference only, native production same",()=>{
 const a=ok(independent(native("3"))),x=independent(native("3"));
 x.ifood.short_id="2222";
 const b=ok(x);
 assert.deepEqual(a.source_review.production,b.source_review.production);
 assert.equal(b.source_review.conference.status,"HOLD");
});
test("external source missing day holds conference only",()=>{
 const x=independent(native("X"));x.ifood.operational_date="2026-10-25";
 const r=ok(x);assert.equal(r.source_review.conference.status,"HOLD");
});
test("unassigned live sequence never fabricated by source evidence",()=>{
 const x=native("3");x.sequence_state.bindings=[];
 const r=ok(x);assert.equal(r.sequence_binding_proven,false);
});
test("cancelled order header 4 blocks production and conference",()=>{
 hold(native("4"),"NATIVE_HEADER_STATUS_NOT_SAFE_FOR_EVIDENCE_REVIEW");
});
test("scheduled A does not regain legacy synthetic authority",()=>{
 hold(native("A"),"NATIVE_HEADER_STATUS_NOT_SAFE_FOR_EVIDENCE_REVIEW");
});
test("unknown order status holds both source surfaces",()=>{
 hold(native("Z"),"NATIVE_HEADER_STATUS_NOT_SAFE_FOR_EVIDENCE_REVIEW");
});
test("native item status 6 (cancelled) holds both even with fresh hashes",()=>{
 const x=native();x.event.order.items[0].IDSTPRCOMVEN="6";refresh(x);
 hold(x,"NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
});
test("unresolved native item status 3 holds both",()=>{
 const x=native();x.event.order.items[0].IDSTPRCOMVEN="3";refresh(x);
 hold(x,"NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
});
test("legacy A item cannot masquerade as observed normal item 4",()=>{
 const x=native();x.event.order.items[0].IDSTPRCOMVEN="A";refresh(x);
 hold(x,"NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
});
test("old snapshot hash blocks rather than pair uncertain items",()=>{
 const x=native();x.event.order.items[0].QTPRODCOMVEN="3.000";
 hold(x,"NATIVE_ORDER_SNAPSHOT_OR_DECISION_FINGERPRINT_INVALID");
});
test("adversary recalculates both hashes but quantity mismatch still holds",()=>{
 const x=native();x.event.order.items[0].QTPRODCOMVEN="3.000";refresh(x);
 hold(x,"NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
});
test("rehashed product change breaks observation-to-native-item linkage first",()=>{
 const x=native();x.event.order.items[0].CDPRODUTO="wrong";refresh(x);
 hold(x,"NATIVE_ITEM_OBSERVATION_JOIN_INVALID");
});
test("rehashed product change also fails even when item note joins are aligned",()=>{
 const x=native();x.event.order.items[0].CDPRODUTO="wrong";
 for(const note of x.event.order.observation_rows)
  if(note.scope_hint==="item"&&note.item_index===0)note.CDPRODUTO="wrong";
 refresh(x);
 hold(x,"NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
});
test("old item observation fingerprint blocks after source edit",()=>{
 const x=native();x.event.order.observation_rows[0].value="SEM GENGIBRE";
 hold(x,"NATIVE_ORDER_SNAPSHOT_OR_DECISION_FINGERPRINT_INVALID");
});
test("rehashed item observation mismatch still holds",()=>{
 const x=native();x.event.order.observation_rows[0].value="SEM GENGIBRE";refresh(x);
 hold(x,"NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
});
test("rehashed general note mismatch holds all",()=>{
 const x=native();x.event.order.observation_rows[2].value="OUTRA NOTA";refresh(x);
 hold(x,"NATIVE_ORDER_OBSERVATIONS_NOT_IDENTICAL");
});
test("duplicate native item source line blocked after rehash",()=>{
 const x=native();x.event.order.items[1].NRPRODCOMVEN=x.event.order.items[0].NRPRODCOMVEN;
 refresh(x);hold(x,"NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
});
test("duplicate observation source field blocked after rehash",()=>{
 const x=native();x.event.order.observation_rows.push(
  {...x.event.order.observation_rows[0]});refresh(x);
 hold(x,"NATIVE_ITEM_NOTE_DUPLICATE_SOURCE");
});
test("incomplete observation scan remains HOLD",()=>{
 const x=native();x.decision.observation_scan_complete=false;
 x.decision.fingerprint=decisionHash(x.decision);
 hold(x,"NATIVE_OBSERVATIONS_SCAN_NOT_COMPLETE");
});
test("wrong four-part Reader key not inferred from timestamp",()=>{
 const x=native();x.event.order_key="0001|01|OTHER|0000348850";
 hold(x,"NATIVE_ORDER_FOUR_PART_KEY_OR_ORIGIN_INVALID");
});
test("different store ID rejected independently of iFood claim",()=>{
 const x=independent(native());x.event.order.CDFILIAL="0002";refresh(x);
 hold(x,"NATIVE_ORDER_FOUR_PART_KEY_OR_ORIGIN_INVALID");
});
test("invalid day, including leap-date overflow, rejected",()=>{
 const x=native();x.event.order.DTHRABERMESA="2026-02-30T12:31:00.0000000";
 refresh(x);hold(x,"NATIVE_ORDER_FOUR_PART_KEY_OR_ORIGIN_INVALID");
});
test("wrong origin DLV_NMO cannot become DLV_IFO via external claim",()=>{
 const x=independent(native());x.event.order.IDORGCMDVENDA="DLV_NMO";
 refresh(x);hold(x,"NATIVE_ORDER_FOUR_PART_KEY_OR_ORIGIN_INVALID");
});
test("native compact product code is accepted as exact source identity",()=>{
 const r=ok(native());assert.equal(r.item_status_4_observed_count,2);
});
test("native dotted product code is accepted as exact source identity",()=>{
 const x=native();x.event.order.items[0].CDARVPROD="9.20.00.010.00";refresh(x);
 ok(x);
});
test("mis-grouped product code rejected despite a matching compact spelling",()=>{
 const x=native();x.event.order.items[0].CDARVPROD="92.0.00.010.00";refresh(x);
 hold(x,"NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
});
test("fractions not silently treated as integer item quantity",()=>{
 const x=native();x.event.order.items[0].QTPRODCOMVEN="1.500";refresh(x);
 hold(x,"NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
});
test("missing decision fingerprint is a HOLD",()=>{
 const x=native();delete x.decision.fingerprint;
 hold(x,"NATIVE_ORDER_SNAPSHOT_OR_DECISION_FINGERPRINT_INVALID");
});
test("unrecognized record-shaped arrays fail closed",()=>{
 hold([],"INPUT_INVALID");
});
test("null input fails closed",()=>{hold(null,"INPUT_INVALID");});
console.log("COMANDAS_READER_V2_VIEW_EVIDENCE_V1="+total+"/"+total+
 " REAL_NATIVE_STATUS_SEMANTICS SOURCE_PAIR_ONLY CONFERENCE_IFOOD_ONLY NO_PRINT_NO_SQL");

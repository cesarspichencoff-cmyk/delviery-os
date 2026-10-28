"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857:fixture}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {assessNativeReaderV2:review,SCHEMA,EFFECTS}=
 require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {reviewReaderPrintHistory:reviewAttemptLink,SCHEMA:LINK_SCHEMA,
 EFFECTS:LINK_EFFECTS,orderStationWitnessBindingSha256V1}=
 require("./comandas_reader_print_history_link_v1_offline.cjs");
const crypto=require("node:crypto");
const {printAttemptWitnessKeyFingerprintV882,
 printAttemptWitnessMessageV882,printAttemptWitnessRecordHashV882}=
 require("../dist/src/production/printAttemptWitnessV882.js");
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
  source_ref:"SYNTHETIC_EXPORT_NOT_ATTESTATION",store_id:"53069",
  operational_date:o.DTHRABERMESA.slice(0,10),
  short_id:o.NRCOMANDAEXT,short_id_unique_for_day:true};
 x.store_mapping={schema:"tata.comandas.cross-system-store-candidate.v1",
  source_kind:"HUMAN_RECONCILIATION_CANDIDATE",
  source_ref:"SYNTHETIC_MAP_NOT_ATTESTATION",ifood_store_id:"53069",
  native_store_id:o.CDFILIAL,native_store_unit:o.CDLOJA};
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
test("missing store crosswalk prevents conference iFood candidate without touching native production",()=>{
 const x=independent(native());delete x.store_mapping;
 const r=ok(x);
 assert.equal(r.source_review.conference.status,"HOLD");
 assert.equal(r.source_review.conference.reasons[0],
  "CROSS_SYSTEM_STORE_MAPPING_CANDIDATE_REQUIRED");
});
test("mismatched iFood merchant/store crosswalk never equals native store by coincidence",()=>{
 const x=independent(native());x.store_mapping.native_store_unit="02";
 const r=ok(x);
 assert.equal(r.source_review.conference.status,"HOLD");
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

function linkedInput(state="3"){
 const reader_pair=native(state);
 return {
  reader_pair,
  candidate:{
   order_key:reader_pair.event.order_key,
   operational_date:reader_pair.event.order.DTHRABERMESA.slice(0,10),
   native_snapshot_sha256:reader_pair.event.snapshot_hash,
   station_code:"00003",intent_fingerprint:"c".repeat(64)
  },
  history:[],history_complete_claim:true,
  history_source_ref:"FIXTURE_READ_ONLY_NOT_ATTESTED",
  latest_revision_claim:true,cancellation_reconciled_claim:true
 };
}
function linkedReview(input){
 const before=JSON.stringify(input),r=reviewAttemptLink(input);
 assert.equal(JSON.stringify(input),before,"bridge is pure and immutable");
 assert.equal(r.schema,LINK_SCHEMA);
 assert.deepEqual(r.effects,LINK_EFFECTS);
 assert.equal(r.status,"HOLD");
 assert.equal(r.print_authorized,false);
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.automatic_retry_allowed,false);
 assert.equal(r.journal_independently_attested,false);
 assert.equal(r.first_native_print_event_proven,false);
 assert.equal(r.latest_revision_independently_attested,false);
 assert.equal(r.cancellation_semantics_proven,false);
 const serialized=JSON.stringify(r);
 for(const secret of ["ENTREGA NA PORTARIA","ALERGIA A CAMARAO",
  "SEM CEBOLINHA","0000348850","0000349281"]){
  assert.equal(serialized.includes(secret),false,"no order data leak");
 }
 return r;
}
const attemptRow=(linked,state,updates={})=>({
 order_key:linked.reader_pair.event.order_key,
 station_code:"00003",
 operational_date:linked.reader_pair.event.order.DTHRABERMESA.slice(0,10),
 native_snapshot_sha256:"a".repeat(64),
 intent_fingerprint:"b".repeat(64),
 attempt_id:"A1",state,...updates
});
test("Reader and attempt history link remains HOLD despite all caller claims true",()=>{
 const r=linkedReview(linkedInput());
 assert.equal(r.reader_revision_consistency_checked,true);
 assert.equal(r.history_diagnostic_verdict,"REVIEW_CANDIDATE_NO_PRINT_AUTHORITY");
 assert.deepEqual(r.reasons,
  ["READER_AND_JOURNAL_CLAIMS_NOT_INDEPENDENTLY_ATTESTED"]);
});
test("prior physical print on older native revision blocks new semantic intent",()=>{
 const x=linkedInput("P");
 x.history=[attemptRow(x,"PHYSICALLY_CONFIRMED")];
 const r=linkedReview(x);
 assert.equal(r.reader_revision_consistency_checked,true);
 assert.equal(r.history_diagnostic_verdict,"HOLD");
 assert.deepEqual(r.reasons,["PRIOR_PHYSICAL_EFFECT_SAME_ORDER_STATION"]);
});
test("earlier unknown print effect prevents review even when content changed",()=>{
 for(const state of ["SPOOLER_OBSERVED","SUBMISSION_RETURNED_UNOBSERVED",
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION"]){
  const x=linkedInput("X");x.history=[attemptRow(x,state)];
  const r=linkedReview(x);
  assert.deepEqual(r.reasons,["PRIOR_EFFECT_UNKNOWN_SAME_ORDER_STATION"]);
 }
});
test("unverified latest revision and unreconciled cancellation each hold",()=>{
 for(const field of ["latest_revision_claim","cancellation_reconciled_claim"]){
  const x=linkedInput();x[field]=false;
  const r=linkedReview(x);
  assert.deepEqual(r.reasons,["LATEST_NATIVE_REVISION_OR_CANCELLATION_UNRECONCILED"]);
 }
});
test("absent complete journal scope does not fabricate a clean history",()=>{
 const x=linkedInput();x.history_complete_claim=false;
 const r=linkedReview(x);
 assert.deepEqual(r.reasons,["ORDER_STATION_HISTORY_COMPLETENESS_UNATTESTED"]);
});
test("candidate selected different native revision is rejected before history review",()=>{
 for(const modify of [
  x=>x.candidate.native_snapshot_sha256="d".repeat(64),
  x=>x.candidate.order_key="0001|01|DIFFERENT|ORDER",
  x=>x.candidate.operational_date="2026-10-22",
  x=>x.candidate.station_code="",
  x=>x.candidate.intent_fingerprint="WRONG"
 ]){
  const x=linkedInput();modify(x);
  const r=linkedReview(x);
  assert.equal(r.reader_revision_consistency_checked,false);
  assert.deepEqual(r.reasons,
   ["READER_PRINT_LINK_ORDER_DATE_REVISION_OR_STATION_MISMATCH"]);
 }
});
test("cancelled native item 6 and altered observed content fail before attempt claim",()=>{
 const cancelled=linkedInput();
 cancelled.reader_pair.event.order.items[0].IDSTPRCOMVEN="6";
 refresh(cancelled.reader_pair);
 assert.deepEqual(linkedReview(cancelled).reasons,
  ["NATIVE_READER_REVISION_NOT_CONSISTENT"]);
 const edited=linkedInput();
 edited.reader_pair.event.order.items[0].QTPRODCOMVEN="7.000";
 refresh(edited.reader_pair);
 assert.deepEqual(linkedReview(edited).reasons,
  ["NATIVE_READER_REVISION_NOT_CONSISTENT"]);
});
test("native header 4 is not silently reclassified as print-ready",()=>{
 const x=linkedInput("4");
 assert.deepEqual(linkedReview(x).reasons,
  ["NATIVE_READER_REVISION_NOT_CONSISTENT"]);
});
test("invalid or conflicting historical attempt cannot be treated as absent",()=>{
 for(const history of [null,[null],[{state:"PHYSICALLY_CONFIRMED"}]]){
  const x=linkedInput();x.history=history;
  assert.deepEqual(linkedReview(x).reasons,
   ["ORDER_STATION_ATTEMPT_HISTORY_INVALID"]);
 }
 const x=linkedInput();
 x.history=[attemptRow(x,"PLANNED"),
  attemptRow(x,"PHYSICALLY_CONFIRMED")];
 assert.deepEqual(linkedReview(x).reasons,
  ["ORDER_STATION_ATTEMPT_IDENTITY_CONTRADICTED"]);
});
test("same native sale key in another operational day cannot hide earlier print",()=>{
 const x=linkedInput("P");
 x.history=[attemptRow(x,"PHYSICALLY_CONFIRMED",{
  operational_date:"2026-10-19"
 })];
 const r=linkedReview(x);
 assert.equal(r.reader_revision_consistency_checked,true);
 assert.deepEqual(r.reasons,["ORDER_STATION_OPERATIONAL_DAY_CONTRADICTED"]);
 assert.equal(r.print_authorized,false);
});
test("impossible attempt operational day is rejected before review",()=>{
 const x=linkedInput("3");
 x.history=[attemptRow(x,"SPOOLER_OBSERVED",{
  operational_date:"2026-02-30"
 })];
 const r=linkedReview(x);
 assert.deepEqual(r.reasons,["ORDER_STATION_ATTEMPT_HISTORY_INVALID"]);
});
// Only synthetic Ed25519 evidence. Verification proves signature coherence,
// NOT independent custodian identity, first native dispatch or physical paper.
function syntheticSourceWitness(x,options={}){
 const keys=crypto.generateKeyPairSync("ed25519");
 const now="2026-10-25T05:00:30.000Z";
 const record={
  schema:"deliveryos.print-attempt-source-witness.v882",
  witness_instance_id:"witness:spooler_review_0001",revision:7,
  store_id:x.reader_pair.event.order.CDFILIAL,
  order_binding_sha256:orderStationWitnessBindingSha256V1(
   x.reader_pair.event.order_key,
   x.reader_pair.event.order.DTHRABERMESA.slice(0,10),
   x.candidate.station_code),
  intent_fingerprint:"b".repeat(64),
  attempt_id:"attempt:print_attempt_0001",
  route_contract_sha256:"f37dae40779c5a205a26ceb289cd748d1c7747c1947c278f534a2dcc2f296f4c",
  collector_instance_id:"collector:readonly_spooler_0001",
  submitter_instance_id:"submitter:tata_sidecar_0001",
  source_channel:"WINDOWS_SPOOLER_READONLY",
  source_read_succeeded:true,
  source_snapshot_sha256:"1".repeat(64),
  observation_started_at:"2026-10-25T05:00:00.000Z",
  observed_at:"2026-10-25T05:00:02.000Z",
  nonce:"nonce:attempt_witness_0001",
  spooler_observation:{
   job_exists:true,submission_rejected_before_job_creation:false,
   job_statuses:["PRINTED"],printer_statuses:[]
  },
  claimed_evidence_state:"SPOOLER_OBSERVED",
  signature_base64:""
 };
 const {signature_base64:_ignored,...unsigned}=record;
 record.signature_base64=crypto.sign(null,
  printAttemptWitnessMessageV882(unsigned),keys.privateKey).toString("base64");
 const trust={
  schema:"deliveryos.print-attempt-witness-trust.v882",
  authority:"REVIEW_ONLY_SUPPLIED_TRUST",
  expected_witness_instance_id:record.witness_instance_id,
  required_revision:record.revision,
  required_record_sha256:printAttemptWitnessRecordHashV882(record),
  expected_store_id:record.store_id,
  expected_order_binding_sha256:record.order_binding_sha256,
  expected_intent_fingerprint:record.intent_fingerprint,
  expected_attempt_id:record.attempt_id,
  expected_route_contract_sha256:record.route_contract_sha256,
  expected_collector_instance_id:record.collector_instance_id,
  expected_submitter_instance_id:record.submitter_instance_id,
  expected_source_snapshot_sha256:record.source_snapshot_sha256,
  public_key_spki_pem:keys.publicKey.export({
   type:"spki",format:"pem"}).toString(),
  public_key_sha256:printAttemptWitnessKeyFingerprintV882(keys.publicKey),
  valid_from:"2026-10-25T04:59:00.000Z",
  valid_until:"2026-10-25T05:05:00.000Z",
  max_observation_age_seconds:60,
  max_observation_duration_seconds:10,
  revoked_nonces:[]
 };
 x.print_attempt_witness={record,trust,now_utc:now};
 if(options.wrongStore) x.print_attempt_witness.record.store_id="9999";
 return x;
}
test("signed spooler witness is correlated but never proves first print or physical paper",()=>{
 const x=syntheticSourceWitness(linkedInput());
 const r=linkedReview(x);
 assert.equal(r.source_witness_signature_verified,true);
 assert.equal(r.source_witness_trust_independently_attested,false);
 assert.equal(r.witnessed_observation_requires_reconciliation,true);
 assert.deepEqual(r.reasons,[
  "SIGNED_PRINT_ATTEMPT_OBSERVED_EFFECT_RECONCILIATION_REQUIRED"]);
 assert.equal(r.first_native_print_event_proven,false);
 assert.equal(r.prior_physical_effect_absence_proven,false);
});
test("signed witness for older semantic fingerprint still blocks revised print",()=>{
 const x=syntheticSourceWitness(linkedInput("P"));
 assert.notEqual(x.print_attempt_witness.record.intent_fingerprint,
  x.candidate.intent_fingerprint);
 assert.deepEqual(linkedReview(x).reasons,[
  "SIGNED_PRINT_ATTEMPT_OBSERVED_EFFECT_RECONCILIATION_REQUIRED"]);
});
test("modified witness signature and supplied wrong public key both hold",()=>{
 const x=syntheticSourceWitness(linkedInput());
 x.print_attempt_witness.record.signature_base64="A".repeat(88);
 assert.deepEqual(linkedReview(x).reasons,
  ["PRINT_ATTEMPT_WITNESS_SIGNATURE_OR_TRUST_INVALID"]);
 const y=syntheticSourceWitness(linkedInput());
 y.print_attempt_witness.trust.public_key_spki_pem="invalid key";
 assert.deepEqual(linkedReview(y).reasons,
  ["PRINT_ATTEMPT_WITNESS_SIGNATURE_OR_TRUST_INVALID"]);
});
test("wrong native order-station binding, store, and witness age hold",()=>{
 const x=syntheticSourceWitness(linkedInput());
 x.print_attempt_witness.record.order_binding_sha256="d".repeat(64);
 assert.deepEqual(linkedReview(x).reasons,
  ["PRINT_ATTEMPT_WITNESS_ORDER_STATION_SCOPE_MISMATCH"]);
 const y=syntheticSourceWitness(linkedInput(),{wrongStore:true});
 assert.deepEqual(linkedReview(y).reasons,
  ["PRINT_ATTEMPT_WITNESS_ORDER_STATION_SCOPE_MISMATCH"]);
 const z=syntheticSourceWitness(linkedInput());
 z.print_attempt_witness.now_utc="2026-10-26T05:00:30.000Z";
 assert.deepEqual(linkedReview(z).reasons,
  ["PRINT_ATTEMPT_WITNESS_SIGNATURE_OR_TRUST_INVALID"]);
});
test("confirmed physical history wins over signed spooler report",()=>{
 const x=syntheticSourceWitness(linkedInput());
 x.history=[attemptRow(x,"PHYSICALLY_CONFIRMED")];
 const r=linkedReview(x);
 assert.deepEqual(r.reasons,["PRIOR_PHYSICAL_EFFECT_SAME_ORDER_STATION"]);
 assert.equal(r.source_witness_signature_verified,true);
});
test("missing witness contents cannot supply independent authority",()=>{
 const x=linkedInput();x.print_attempt_witness={};
 assert.deepEqual(linkedReview(x).reasons,
  ["PRINT_ATTEMPT_WITNESS_ENVELOPE_INVALID"]);
});

test("absent native pair never yields an untrusted positive proof",()=>{
 const x=linkedInput();delete x.reader_pair;
 assert.deepEqual(linkedReview(x).reasons,["READER_PRINT_LINK_INPUT_INVALID"]);
});

console.log("COMANDAS_READER_V2_VIEW_EVIDENCE_V1="+total+"/"+total+
 " REAL_NATIVE_STATUS_SEMANTICS SOURCE_PAIR_ONLY CONFERENCE_IFOOD_ONLY NO_PRINT_NO_SQL");

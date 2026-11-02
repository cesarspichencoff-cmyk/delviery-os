"use strict";
const assert=require("node:assert/strict");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {correlateNativeFirstDispatch:correlate,EFFECTS,SCHEMA}=
 require("./comandas_native_first_dispatch_correlation_v1_offline.cjs");
const SHA="a".repeat(64),ALT_SHA="b".repeat(64);
let n=0;
function test(name,fn){fn();console.log("PASS "+(++n)+" "+name);}
function sample(){
 const pair=syntheticReaderPairV857();
 pair.event.order.IDSTCOMANDA="3";
 pair.event.order.items.forEach(x=>x.IDSTPRCOMVEN="4");
 pair.event.snapshot_hash=snapshotHash(pair.event.order);
 pair.decision.snapshot_hash=pair.event.snapshot_hash;
 pair.decision.fingerprint=decisionHash(pair.decision);
 const key=pair.event.order_key,day=pair.event.order.DTHRABERMESA.slice(0,10);
 const station="SUSHI",attempt="SYNTHETIC_ATTEMPT_1";
 const candidate={
  order_key:key,operational_date:day,station_code:station,
  attempt_id:attempt,native_snapshot_sha256:pair.event.snapshot_hash,
  intent_fingerprint:SHA
 };
 const claim={
  store_id:"0001",store_unit:"01",
  installed_or_observed_source_sha256:SHA,
  event_type:"NATIVE_FIRST_PRODUCTION_DISPATCH_CLAIM",
  order_origin:"DLV_IFO",
  native_order_revision_ref:"SYNTHETIC_REVISION_NO_ATTESTATION",
  native_revision_snapshot_sha256:pair.event.snapshot_hash,
  dispatcher_component_ref:"SYNTHETIC_DISPATCHER_UNATTESTED",
  dispatcher_source_sha256:SHA,
  preorder_import_is_not_print_proof:true,
  forsale_comanda_is_not_dispatch_proof:true,
  post_sale_report_not_reused_as_first_print:true,
  gp_and_gestor_not_reused_as_native_trigger:true,
  station_route_censused:true,
  first_attempt_identity_censused:true,
  cancellation_revision_reconciled:true,
  native_order_key:key,operational_date:day,
  station_code:station,first_attempt_id:attempt
 };
 return {
  reader_pair:pair,claim,candidate,
  history_scope_complete_claim:true,
  latest_native_revision_claim:true,
  cancellation_reconciled_claim:true,
  history_source_ref:"synthetic:bounded-journal-unattested",
  history:[{...candidate,state:"PLANNED"}]
 };
}
function inspect(input){
 const original=JSON.stringify(input),out=correlate(input);
 assert.equal(JSON.stringify(input),original,"no mutation");
 assert.equal(out.schema,SCHEMA);
 assert.deepEqual(out.effects,EFFECTS);
 for(const key of [
  "actual_first_native_print_event_proven","journal_independently_attested",
  "dispatcher_source_independently_attested","source_and_journal_currency_proven",
  "physical_paper_proven","can_authorize_cutover",
  "print_authorized","automatic_retry_allowed"])
  assert.equal(out[key],false,key);
 const serialized=JSON.stringify(out);
 for(const secret of ["SYNTHETIC_ATTEMPT_1","0000349281","0000348850",
  "ALERGIA A CAMARAO"])
  assert.equal(serialized.includes(secret),false,secret);
 return out;
}
test("self-consistent claimed journal stays review-only, never native proof",()=>{
 const result=inspect(sample());
 assert.equal(result.status,"CORRELATED_CLAIMS_REVIEW_ONLY");
 assert.equal(result.journal_first_attempt_correlated,true);
});
test("same fingerprint in another order and attempt is a collision",()=>{
 const x=sample();x.history.push({
  ...x.history[0],order_key:"0001|01|0000349282|0000348852",
  attempt_id:"OTHER_ATTEMPT_2",native_snapshot_sha256:ALT_SHA
 });
 const r=inspect(x);
 assert.equal(r.status,"HOLD");
 assert.equal(r.reason,"FIRST_DISPATCH_INTENT_FINGERPRINT_REUSED_ACROSS_SCOPE");
 assert.equal(r.journal_first_attempt_correlated,false);
});
test("same fingerprint in another station on the same order is a collision",()=>{
 const x=sample();x.history.push({
  ...x.history[0],station_code:"BAR",attempt_id:"BAR_ATTEMPT_2"
 });
 const r=inspect(x);
 assert.equal(r.reason,"FIRST_DISPATCH_INTENT_FINGERPRINT_REUSED_ACROSS_SCOPE");
});
test("same fingerprint for another native revision never reuses the first intent",()=>{
 const x=sample();x.history.push({
  ...x.history[0],station_code:"BAR",attempt_id:"REVISION_ATTEMPT_2",
  native_snapshot_sha256:ALT_SHA
 });
 const r=inspect(x);
 assert.equal(r.reason,"FIRST_DISPATCH_INTENT_FINGERPRINT_REUSED_ACROSS_SCOPE");
});
test("uppercase hex of the same fingerprint elsewhere is still a collision",()=>{
 // A SHA-256 is the same identity in either hex case and the input regex
 // accepts both. A case-sensitive comparison let a physically confirmed row
 // for another order hide behind uppercase and reach CORRELATED.
 for(const changes of [
  {order_key:"0001|01|0000349282|0000348852",native_snapshot_sha256:ALT_SHA},
  {station_code:"BAR"},
  {station_code:"BAR",native_snapshot_sha256:ALT_SHA.toUpperCase()}
 ]){
  const x=sample();x.history.push({
   ...x.history[0],...changes,attempt_id:"CASE_ATTEMPT_2",
   intent_fingerprint:SHA.toUpperCase(),state:"PHYSICALLY_CONFIRMED"
  });
  const r=inspect(x);
  assert.equal(r.status,"HOLD");
  assert.equal(r.reason,"FIRST_DISPATCH_INTENT_FINGERPRINT_REUSED_ACROSS_SCOPE");
 }
});
test("same fingerprint from another day is not the original candidate",()=>{
 const x=sample();x.history.push({
  ...x.history[0],station_code:"BAR",attempt_id:"DAY_ATTEMPT_2",
  operational_date:"2026-10-21"
 });
 const r=inspect(x);
 assert.equal(r.reason,"FIRST_DISPATCH_INTENT_FINGERPRINT_REUSED_ACROSS_SCOPE");
});
test("different intent elsewhere does not manufacture a collision or authorization",()=>{
 const x=sample();x.history.push({
  ...x.history[0],order_key:"0001|01|0000349282|0000348852",
  station_code:"BAR",attempt_id:"UNRELATED_ATTEMPT_2",
  intent_fingerprint:ALT_SHA,native_snapshot_sha256:ALT_SHA
 });
 const r=inspect(x);
 assert.equal(r.status,"CORRELATED_CLAIMS_REVIEW_ONLY");
 assert.equal(r.print_authorized,false);
});
test("same attempt ID across scopes still has its independent fail-closed guard",()=>{
 const x=sample();x.history.push({
  ...x.history[0],order_key:"0001|01|0000349282|0000348852",
  station_code:"BAR",native_snapshot_sha256:ALT_SHA,
  intent_fingerprint:ALT_SHA
 });
 const r=inspect(x);
 assert.equal(r.reason,"FIRST_DISPATCH_ATTEMPT_ID_REUSED_ACROSS_SCOPE");
});
test("double attempt in the same station is not called a first dispatch",()=>{
 const x=sample();x.history.push({
  ...x.history[0],attempt_id:"SECOND_ATTEMPT",
  intent_fingerprint:ALT_SHA
 });
 const r=inspect(x);
 assert.equal(r.reason,"FIRST_DISPATCH_MULTIPLE_ATTEMPT_ROWS_UNRECONCILED");
});
test("changed Reader revision invalidates a former journal correlation",()=>{
 const x=sample();
 x.reader_pair.event.order.IDSTCOMANDA="P";
 x.reader_pair.event.snapshot_hash=snapshotHash(x.reader_pair.event.order);
 x.reader_pair.decision.snapshot_hash=x.reader_pair.event.snapshot_hash;
 x.reader_pair.decision.fingerprint=decisionHash(x.reader_pair.decision);
 const r=inspect(x);
 assert.equal(r.status,"HOLD");
});
console.log("COMANDAS_FIRST_DISPATCH_FINGERPRINT_SCOPE="+n+"/"+n+
 " CLAIM_ONLY NO_PRINT");

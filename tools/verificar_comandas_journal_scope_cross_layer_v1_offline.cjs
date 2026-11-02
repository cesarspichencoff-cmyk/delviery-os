"use strict";
/**
 * Differential gate: ONE supplied attempt journal, THREE review layers.
 *
 *   decideProductionOrderRevisionReviewV1   (order+station diagnostic)
 *   reviewReaderPrintHistory                (Reader V2 -> journal link)
 *   correlateNativeFirstDispatch            (first-dispatch claim correlation)
 *
 * Each layer has its own reasons, but none may call a journal clean that
 * another layer rejects for cross-scope identity reuse. Before this gate the
 * diagnostic accepted an attempt ID or intent fingerprint reused under another
 * order/station/day, and the correlation accepted an uppercase-hex copy of the
 * same SHA-256. Synthetic fixtures only: no SQL, host, spooler, sequence,
 * network or print. A HOLD here is never a print authorization either way.
 */
const assert=require("node:assert/strict");
const {decideProductionOrderRevisionReviewV1:review}=
 require("../dist/src/production/productionPrintIdempotency.js");
const {reviewReaderPrintHistory:link}=
 require("./comandas_reader_print_history_link_v1_offline.cjs");
const {correlateNativeFirstDispatch:correlate}=
 require("./comandas_native_first_dispatch_correlation_v1_offline.cjs");
const {syntheticReaderPairV857}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");

const FP="a".repeat(64),OTHER="d".repeat(64),OTHER2="e".repeat(64);
const OTHER_ORDER="0001|01|0000349282|0000348852";
let n=0;
function test(name,fn){fn();console.log("PASS "+(++n)+" "+name);}

function fixture(){
 const pair=syntheticReaderPairV857();
 pair.event.order.IDSTCOMANDA="3";
 pair.event.order.items.forEach(x=>x.IDSTPRCOMVEN="4");
 pair.event.snapshot_hash=snapshotHash(pair.event.order);
 pair.decision.snapshot_hash=pair.event.snapshot_hash;
 pair.decision.fingerprint=decisionHash(pair.decision);
 const key=pair.event.order_key,day=pair.event.order.DTHRABERMESA.slice(0,10);
 const candidate={order_key:key,operational_date:day,station_code:"SUSHI",
  attempt_id:"SYNTHETIC_ATTEMPT_1",native_snapshot_sha256:pair.event.snapshot_hash,
  intent_fingerprint:FP};
 const claim={store_id:"0001",store_unit:"01",
  installed_or_observed_source_sha256:FP,
  event_type:"NATIVE_FIRST_PRODUCTION_DISPATCH_CLAIM",order_origin:"DLV_IFO",
  native_order_revision_ref:"SYNTHETIC_REVISION_NO_ATTESTATION",
  native_revision_snapshot_sha256:pair.event.snapshot_hash,
  dispatcher_component_ref:"SYNTHETIC_DISPATCHER_UNATTESTED",
  dispatcher_source_sha256:FP,
  preorder_import_is_not_print_proof:true,
  forsale_comanda_is_not_dispatch_proof:true,
  post_sale_report_not_reused_as_first_print:true,
  gp_and_gestor_not_reused_as_native_trigger:true,
  station_route_censused:true,first_attempt_identity_censused:true,
  cancellation_revision_reconciled:true,
  native_order_key:key,operational_date:day,station_code:"SUSHI",
  first_attempt_id:"SYNTHETIC_ATTEMPT_1"};
 // PROVEN_NO_EFFECT_FAILURE keeps the diagnostic baseline non-HOLD, so a
 // HOLD below can only come from the injected journal row.
 return {pair,candidate,claim,
  history:[{...candidate,state:"PROVEN_NO_EFFECT_FAILURE"}]};
}

// Run all three layers on byte-identical journal copies.
function layers(f,history){
 const e=f.pair.event,c=f.candidate;
 const journal=JSON.stringify(history);
 const r=review({order_key:e.order_key,station_code:c.station_code,
  operational_date:e.order.DTHRABERMESA.slice(0,10),
  native_snapshot_sha256:e.snapshot_hash,intent_fingerprint:c.intent_fingerprint,
  history:JSON.parse(journal),history_complete_for_order_station:true,
  history_source_ref:"synthetic:bounded-journal-unattested",
  current_native_revision_verified_latest:true,
  cancellation_revision_reconciled:true});
 const l=link({reader_pair:f.pair,candidate:c,history:JSON.parse(journal),
  history_complete_claim:true,
  history_source_ref:"synthetic:bounded-journal-unattested",
  latest_revision_claim:true,cancellation_reconciled_claim:true});
 const k=correlate({reader_pair:f.pair,claim:f.claim,candidate:c,
  history:JSON.parse(journal),history_scope_complete_claim:true,
  latest_native_revision_claim:true,cancellation_reconciled_claim:true,
  history_source_ref:"synthetic:bounded-journal-unattested"});
 assert.equal(JSON.stringify(history),journal,"no layer may mutate input");
 // Authority invariants hold on every path, clean or not.
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.automatic_retry_allowed,false);
 assert.deepEqual(r.effects,{print:false,spooler_write:false,sequence_write:false});
 assert.equal(l.status,"HOLD");
 assert.equal(l.print_authorized,false);
 assert.equal(l.ready_for_operational_print,false);
 for(const key of ["print_authorized","automatic_retry_allowed",
  "can_authorize_cutover","physical_paper_proven",
  "actual_first_native_print_event_proven"])
  assert.equal(k[key],false,key);
 for(const v of Object.values(k.effects))assert.equal(v,false);
 for(const v of Object.values(l.effects))assert.equal(v,false);
 return {review:r.verdict,review_reason:r.reasons[0],
  link_diag:l.history_diagnostic_verdict,correlation:k.status,
  correlation_reason:k.reason};
}

test("baseline: clean synthetic journal is non-HOLD in diagnostic and correlation",()=>{
 const f=fixture(),out=layers(f,f.history);
 assert.equal(out.review,"REVIEW_CANDIDATE_NO_PRINT_AUTHORITY");
 assert.equal(out.link_diag,"REVIEW_CANDIDATE_NO_PRINT_AUTHORITY");
 assert.equal(out.correlation,"CORRELATED_CLAIMS_REVIEW_ONLY");
});

const POISON=[
 ["attempt ID reused by another order",
  r=>({...r,order_key:OTHER_ORDER,native_snapshot_sha256:OTHER,
   intent_fingerprint:OTHER,state:"PHYSICALLY_CONFIRMED"})],
 ["attempt ID reused by another station of the same order",
  r=>({...r,station_code:"BAR",native_snapshot_sha256:OTHER,
   intent_fingerprint:OTHER,state:"PHYSICALLY_CONFIRMED"})],
 ["current fingerprint under another order",
  r=>({...r,order_key:OTHER_ORDER,attempt_id:"OTHER_ATTEMPT_2",
   native_snapshot_sha256:OTHER,state:"PHYSICALLY_CONFIRMED"})],
 ["current fingerprint under another station",
  r=>({...r,station_code:"BAR",attempt_id:"OTHER_ATTEMPT_3",
   state:"PHYSICALLY_CONFIRMED"})],
 ["current fingerprint in UPPERCASE hex under another order",
  r=>({...r,order_key:OTHER_ORDER,attempt_id:"OTHER_ATTEMPT_4",
   native_snapshot_sha256:OTHER,intent_fingerprint:FP.toUpperCase(),
   state:"PHYSICALLY_CONFIRMED"})],
 ["current fingerprint in UPPERCASE hex under another station and day",
  r=>({...r,station_code:"BAR",attempt_id:"OTHER_ATTEMPT_5",
   operational_date:"2026-10-21",intent_fingerprint:FP.toUpperCase(),
   state:"SPOOLER_OBSERVED"})]
];
for(const [name,mutate] of POISON){
 test("every layer HOLDs: "+name,()=>{
  const f=fixture();
  const history=[...f.history,mutate(f.history[0])];
  for(const order of [history,[...history].reverse()]){
   const out=layers(f,order);
   assert.equal(out.review,"HOLD",JSON.stringify(out));
   assert.equal(out.link_diag,"HOLD",JSON.stringify(out));
   assert.equal(out.correlation,"HOLD",JSON.stringify(out));
  }
 });
}

const BENIGN=[
 ["unrelated order with distinct attempt and fingerprint",
  r=>({...r,order_key:OTHER_ORDER,attempt_id:"UNRELATED_1",
   native_snapshot_sha256:OTHER,intent_fingerprint:OTHER,
   state:"PHYSICALLY_CONFIRMED"})],
 ["unrelated station with distinct attempt and fingerprint",
  r=>({...r,station_code:"BAR",attempt_id:"UNRELATED_2",
   intent_fingerprint:OTHER2,state:"PHYSICALLY_CONFIRMED"})]
];
for(const [name,mutate] of BENIGN){
 test("no manufactured collision: "+name,()=>{
  const f=fixture();
  const history=[...f.history,mutate(f.history[0])];
  const out=layers(f,history);
  assert.equal(out.review,"REVIEW_CANDIDATE_NO_PRINT_AUTHORITY",JSON.stringify(out));
  assert.equal(out.link_diag,"REVIEW_CANDIDATE_NO_PRINT_AUTHORITY");
  assert.equal(out.correlation,"CORRELATED_CLAIMS_REVIEW_ONLY",JSON.stringify(out));
 });
}

test("same-scope double attempt stays HOLD in both layers (existing guard)",()=>{
 const f=fixture();
 const history=[...f.history,{...f.history[0],state:"PLANNED"}];
 const out=layers(f,history);
 assert.equal(out.review,"HOLD");
 assert.equal(out.correlation,"HOLD");
});

console.log("COMANDAS_JOURNAL_SCOPE_CROSS_LAYER="+n+"/"+n+
 " SYNTHETIC_ONLY NO_PRINT NO_SQL NO_AUTHORITY");

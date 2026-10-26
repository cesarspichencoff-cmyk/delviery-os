"use strict";
const assert=require("node:assert/strict");
const {assessCaptureCoherence,SCHEMA,NO_EFFECTS}=
 require("./comandas_ifood_capture_coherence_v852_offline.cjs");
const uuid="00000000-0000-4000-8000-000000000852";
const gestor={
 schema:"deliveryos.ifood-gestor-observation.v1",store_id:"STORE_TEST",
 order_uuid:uuid,display_id:"1234",status:"CONFIRMED",snapshot_complete:true,
 order_observations:["MANTER SEPARADO"],
 items:[{name:"SUSHI TESTE",quantity:2,observations:["SEM MOLHO"]}],
 paper_claimed:false
};
const teknisa={
 schema:"deliveryos.teknisa-order-observation.v1",store_id:"STORE_TEST",
 order_key:"0001|01|000001|000001",ifood_order_uuid:uuid,
 ifood_display_id:"1234",snapshot_complete:true,
 order_observations:["MANTER SEPARADO"],
 items:[{name:"SUSHI TESTE",quantity:2,observations:["SEM MOLHO"]}],
 paper_claimed:false
};
const copy=x=>JSON.parse(JSON.stringify(x));
const original={
 gestor,teknisa,evaluated_at:"2026-10-20T13:40:00Z",
 max_capture_age_seconds:180,
 gestor_capture:{source:"GESTOR",fetch_succeeded:true,window_complete:true,
  from:"2026-10-20T13:38:00Z",until:"2026-10-20T13:39:30Z"},
 teknisa_capture:{source:"TEKNISA",fetch_succeeded:true,window_complete:true,
  from:"2026-10-20T13:39:00Z",until:"2026-10-20T13:39:50Z"}
};
let n=0;
function audit(x){
 const r=assessCaptureCoherence(x);
 assert.equal(r.schema,SCHEMA);
 assert.deepEqual(r.effects,NO_EFFECTS);
 for(const prop of ["authorizes_print","authorizes_reprint","authorizes_order_ack",
  "physical_paper_proven","duplicate_print_proven","missing_order_proven",
  "provider_authenticated","order_equivalence_proven"])
  assert.equal(r[prop],false,prop);
 const json=JSON.stringify(r);
 for(const sensitive of [uuid,"1234","MANTER SEPARADO","SUSHI TESTE","0001|01|000001|000001"])
  assert.ok(!json.includes(sensitive),"raw order identity leaked");
 return r;
}
function test(name,fn){fn();n++;console.log("PASS "+n+" "+name);}
test("contemporaneous identical snapshots remain a HOLD candidate",()=>{
 const a=audit(original);
 assert.equal(a.status,"TEMPORAL_MATCH_CANDIDATE_HOLD");
 assert.equal(a.source_capture_overlap_proven,true);
 assert.equal(a.capture_freshness_acceptable,true);
 assert.equal(a.order_equivalence_proven,false);
});
test("no source capture windows accepted without evaluation instant",()=>{
 const x=copy(original);delete x.evaluated_at;
 assert.deepEqual(audit(x).reasons,["EVALUATION_INSTANT_INVALID"]);
});
test("timezone offset accepted and equivalent",()=>{
 const x=copy(original);x.evaluated_at="2026-10-20T10:40:00-03:00";
 assert.equal(audit(x).status,"TEMPORAL_MATCH_CANDIDATE_HOLD");
});
test("future GP window blocked",()=>{
 const x=copy(original);x.gestor_capture.until="2026-10-20T13:45:00Z";
 assert.deepEqual(audit(x).reasons,["GESTOR_CAPTURE_WINDOW_INVALID_OR_FUTURE"]);
});
test("invalid calendar does not become normalized date",()=>{
 const x=copy(original);x.evaluated_at="2026-02-31T13:40:00Z";
 assert.deepEqual(audit(x).reasons,["EVALUATION_INSTANT_INVALID"]);
});
test("invalid timezone blocks",()=>{
 const x=copy(original);x.evaluated_at="2026-10-20T13:40:00+14:59";
 assert.deepEqual(audit(x).reasons,["EVALUATION_INSTANT_INVALID"]);
});
test("naive unzoned timestamp blocked",()=>{
 const x=copy(original);x.evaluated_at="2026-10-20T13:40:00";
 assert.deepEqual(audit(x).reasons,["EVALUATION_INSTANT_INVALID"]);
});
test("source capture with no coverage blocked",()=>{
 const x=copy(original);x.gestor_capture.window_complete=false;
 assert.deepEqual(audit(x).reasons,["GESTOR_SOURCE_CAPTURE_COVERAGE_UNPROVEN"]);
});
test("source capture with fetch failure blocked",()=>{
 const x=copy(original);x.teknisa_capture.fetch_succeeded=false;
 assert.deepEqual(audit(x).reasons,["TEKNISA_SOURCE_CAPTURE_COVERAGE_UNPROVEN"]);
});
test("both capture windows missing block independently",()=>{
 const x=copy(original);delete x.teknisa_capture;delete x.gestor_capture;
 assert.deepEqual(audit(x).reasons,["GESTOR_SOURCE_CAPTURE_COVERAGE_UNPROVEN",
  "TEKNISA_SOURCE_CAPTURE_COVERAGE_UNPROVEN"]);
});
test("stale windows cannot pretend current parity",()=>{
 const x=copy(original);
 x.evaluated_at="2026-10-20T14:10:00Z";
 assert.deepEqual(audit(x).reasons,["SOURCE_CAPTURE_STALE_FOR_DECLARED_AGE_POLICY"]);
});
test("disjoint capture windows cannot establish parity",()=>{
 const x=copy(original);x.gestor_capture.from="2026-10-20T13:36:00Z";
 x.gestor_capture.until="2026-10-20T13:37:00Z";
 assert.deepEqual(audit(x).reasons,["SOURCE_CAPTURE_WINDOWS_DISJOINT"]);
});
test("reversed time range invalid",()=>{
 const x=copy(original);x.teknisa_capture.from="2026-10-20T13:39:55Z";
 assert.deepEqual(audit(x).reasons,["TEKNISA_CAPTURE_WINDOW_INVALID_OR_FUTURE"]);
});
test("capture source label mismatch blocks",()=>{
 const x=copy(original);x.gestor_capture.source="TEKNISA";
 assert.deepEqual(audit(x).reasons,["GESTOR_SOURCE_CAPTURE_COVERAGE_UNPROVEN"]);
});
test("missing age policy blocks",()=>{
 const x=copy(original);delete x.max_capture_age_seconds;
 assert.deepEqual(audit(x).reasons,["CAPTURE_AGE_POLICY_MISSING_OR_INVALID"]);
});
test("noninteger age policy blocks",()=>{
 const x=copy(original);x.max_capture_age_seconds=0.5;
 assert.deepEqual(audit(x).reasons,["CAPTURE_AGE_POLICY_MISSING_OR_INVALID"]);
});
test("24h excess age policy blocked",()=>{
 const x=copy(original);x.max_capture_age_seconds=86401;
 assert.deepEqual(audit(x).reasons,["CAPTURE_AGE_POLICY_MISSING_OR_INVALID"]);
});
test("equal UUID with different items still blocks",()=>{
 const x=copy(original);x.teknisa.items[0].quantity=3;
 const r=audit(x);assert.ok(r.reasons.includes("ITEMS_OR_QUANTITIES_DIFFER_REVIEW_SOURCE_MAPPINGS"));
 assert.equal(r.status,"HOLD");
});
test("identical short ID without full UUID blocks",()=>{
 const x=copy(original);x.teknisa.ifood_order_uuid=null;
 assert.ok(audit(x).reasons.includes("SHORT_ID_IS_NOT_UNIQUE_ORDER_ID"));
});
test("missing Teknisa order in compared data is not a proven lost order",()=>{
 const x=copy(original);x.teknisa=null;
 const r=audit(x);
 assert.equal(r.missing_order_proven,false);
 assert.ok(r.reasons.includes("SOURCE_ORDER_NOT_PRESENT_IN_PROVIDED_CAPTURE_NOT_PROVEN_LOST"));
});
test("missing iFood order in compared data is not a proven lost order",()=>{
 const x=copy(original);x.gestor=null;
 assert.ok(audit(x).reasons.includes("SOURCE_ORDER_NOT_PRESENT_IN_PROVIDED_CAPTURE_NOT_PROVEN_LOST"));
});
test("cancelled Gestor order cannot become matching production order",()=>{
 const x=copy(original);x.gestor.status="CANCELLED";
 const r=audit(x);assert.equal(r.status,"HOLD");
 assert.ok(r.reasons.includes("IFOOD_CANCELLED_NO_PREPARATION_OR_REPRINT"));
});
test("double claims of printing cannot become physical paper proof",()=>{
 const x=copy(original);x.gestor.paper_claimed=true;x.teknisa.paper_claimed=true;
 assert.ok(audit(x).reasons.includes("TWO_CHANNEL_PAPER_CLAIMS_REQUIRE_PHYSICAL_DUPLICATE_REVIEW"));
});
test("only one source with stale data still blocks before absent claim",()=>{
 const x=copy(original);x.teknisa=null;x.evaluated_at="2026-10-20T14:10:00Z";
 assert.deepEqual(audit(x).reasons,["SOURCE_CAPTURE_STALE_FOR_DECLARED_AGE_POLICY"]);
});
test("null input does not throw or leak",()=>{
 assert.deepEqual(audit(null).reasons,["CAPTURE_PREFLIGHT_INPUT_INVALID"]);
});
console.log("COMANDAS_IFOOD_CAPTURE_COHERENCE_V852="+n+"/"+n+
 " NO_API NO_PRINT NO_ORDER_ACK REFERENCE_WINDOWS_SELF_ASSERTED_ONLY");

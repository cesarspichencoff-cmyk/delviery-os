"use strict";
const assert=require("node:assert/strict");
const {reviewHumanShiftRenewalV70,assessReviewedShiftOrderWindowV74}=
 require("../dist/src/production/shiftHumanReviewV70.js");
const {resolveProductionServiceShiftState}=
 require("../dist/src/production/serviceShiftState.js");
let checks=0;
const check=(title,fn)=>{fn();checks++;console.log("PASS "+checks+" "+title)};
const current={schema:"deliveryos.production-service-shift-state.v2",
  store_id:"0001",operational_date:"2026-10-07",service:"DINNER",
  evidence:"HUMAN_CONFIRMED_RULE",source_ref:"REFERENCE_TO_PRIOR_SHIFT",
  clock_inference_used:false,valid_until_local:"2026-10-07T23:59:59",
  updated_at:"2026-10-07T10:00:00"};
const now="2026-10-10T10:00:00";
function fixture(){return {
 schema:"deliveryos.human-shift-review-request.v70",
 store_id:"0001",operational_date:"2026-10-10",service:"LUNCH",
 valid_from_local:"2026-10-10T10:15:00",
 valid_until_local:"2026-10-10T15:00:00",
 human_claim:{operator_ref:"REVIEWER_DECLARED",
  confirmation_source_ref:"REVIEW_ONLY_SOURCE_REFERENCE",
  confirmed_at_local:"2026-10-10T09:59:00",
  statement:"I_CONFIRM_STORE_DAY_SERVICE_AND_VALIDITY"}
};}
const review=(req=fixture(),then=now)=>reviewHumanShiftRenewalV70(req,current,then);
check("observed expired 07/10 state cannot authorize 10/10 event",()=>{
 const p=resolveProductionServiceShiftState(current,{
  store_id:"0001",operational_date:"2026-10-10",
  order_opened_at:"2026-10-10T12:00:00"});
 assert.equal(p.ready,false);
 assert.ok(p.blocking_reasons.includes("SERVICE_STATE_OPERATIONAL_DATE_MISMATCH"));
 assert.ok(p.blocking_reasons.includes("SERVICE_STATE_EXPIRED_FOR_ORDER"));
});
check("hypothetically complete human claim is REVIEW only, not authority",()=>{
 const p=review();assert.equal(p.status,"REVIEWABLE_NOT_AUTHORIZED");
 assert.equal(p.safeguards.authenticates_human_identity,false);
 assert.equal(p.safeguards.writes_live_state,false);
 assert.equal(p.safeguards.authorizes_print,false);
 assert.equal(p.safeguards.valid_for_past_orders,false);
 assert.equal(p.safeguards.requires_independent_human_effect_approval,true);
 assert.equal(p.declared_request.valid_from_local,"2026-10-10T10:15:00");
});
check("no claim is never silently replaced by inferred time or actor",()=>{
 const req=fixture();req.human_claim=null;
 const p=review(req);assert.equal(p.status,"BLOCKED");
 assert.ok(p.blockers.includes("SHIFT_REVIEW_HUMAN_CLAIM_INCOMPLETE"));
 assert.equal(p.declared_request,null);
});
check("do not infer a service from the previous DINNER value",()=>{
 const req=fixture();req.service=null;
 const p=review(req);assert.ok(p.blockers.includes("SHIFT_REVIEW_SERVICE_INVALID"));
});
check("yesterday date is not renewed by any time-of-day heuristic",()=>{
 const req=fixture();req.operational_date="2026-10-09";
 const p=review(req);assert.ok(p.blockers.includes("SHIFT_REVIEW_DATE_NOT_CURRENT"));
});
check("retroactive window is never accepted for historic replay",()=>{
 const req=fixture();req.valid_from_local="2026-10-10T09:00:00";
 const p=review(req);assert.ok(p.blockers.includes("SHIFT_REVIEW_RETROACTIVE_WINDOW_FORBIDDEN"));
});
check("overnight windows cannot fit the installed watcher date gate",()=>{
 const req=fixture();req.valid_until_local="2026-10-11T00:30:00";
 const p=review(req);
 assert.ok(p.blockers.includes("SHIFT_REVIEW_CROSS_MIDNIGHT_UNSUPPORTED_BY_INSTALLED_WATCHER"));
});
check("invalid interval rejects automatic extension",()=>{
 const req=fixture();req.valid_until_local=req.valid_from_local;
 assert.ok(review(req).blockers.includes("SHIFT_REVIEW_INTERVAL_INVALID"));
});
check("claimed confirmation cannot come from the future",()=>{
 const req=fixture();req.human_claim.confirmed_at_local="2026-10-10T10:30:00";
 assert.ok(review(req).blockers.includes("SHIFT_REVIEW_CLAIM_CLOCK_INVALID"));
});
check("source reference and actor must be asserted explicitly, not invented",()=>{
 const req=fixture();req.human_claim.operator_ref="";
 req.human_claim.confirmation_source_ref="";
 assert.ok(review(req).blockers.includes("SHIFT_REVIEW_HUMAN_CLAIM_INCOMPLETE"));
});
check("date parser refuses impossible dates and invalid time portions",()=>{
 for(const value of ["2026-02-30","2026-13-10","2026-10-32"]){
  const req=fixture();req.operational_date=value;
  assert.ok(review(req).blockers.includes("SHIFT_REVIEW_OPERATIONAL_DATE_INVALID"));
 }
 for(const value of ["2026-10-10T25:00:00","2026-10-10T10:62:00"]){
  const req=fixture();req.valid_from_local=value;
  assert.ok(review(req).blockers.includes("SHIFT_REVIEW_INTERVAL_INVALID"));
 }
});
check("no clock input cannot produce a proposal",()=>{
 const p=review(fixture(),"");
 assert.ok(p.blockers.includes("SHIFT_REVIEW_NOW_MUST_BE_EXPLICIT_LOCAL"));
 assert.equal(p.declared_request,null);
});
check("review is pure and preserves existing state and declared request",()=>{
 const req=fixture(),beforeReq=structuredClone(req),before=structuredClone(current);
 review(req);assert.deepEqual(req,beforeReq);
 assert.deepEqual(current,before);
});

const reviewed=()=>review();
const assess=(opened="2026-10-10T12:00:00",overrides={},attestation=reviewed())=>
 assessReviewedShiftOrderWindowV74(attestation,{
  store_id:"0001",operational_date:"2026-10-10",
  order_opened_at_local:opened,...overrides
 });
check("V7.4 within prospective window matches REVIEW only, never live approval",()=>{
 const r=assess();
 assert.equal(r.status,"WINDOW_MATCHES_REVIEW_NOT_AUTHORIZED");
 assert.deepEqual(r.blockers,[]);
 assert.equal(r.service,"LUNCH");
 assert.equal(r.safeguards.grants_existing_watcher_v2_state,false);
 assert.equal(r.safeguards.authenticates_claim,false);
 assert.equal(r.safeguards.prints,false);
});
check("V7.4 lower boundary is inclusive at exact tick",()=>{
 assert.equal(assess("2026-10-10T10:15:00").status,
  "WINDOW_MATCHES_REVIEW_NOT_AUTHORIZED");
});
check("V7.4 upper boundary inclusive at precise .0000000 tick",()=>{
 assert.equal(assess("2026-10-10T15:00:00.0000000").status,
  "WINDOW_MATCHES_REVIEW_NOT_AUTHORIZED");
});
check("V7.4 one second before human window is blocked",()=>{
 const r=assess("2026-10-10T10:14:59");
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.blockers.includes("SHIFT_WINDOW_ORDER_PRECEDES_HUMAN_CONFIRMATION"));
});
check("V7.4 fractional tick AFTER valid_until is blocked",()=>{
 const r=assess("2026-10-10T15:00:00.0000001");
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.blockers.includes("SHIFT_WINDOW_ORDER_AFTER_VALID_UNTIL"));
});
check("V7.4 fractional tick AFTER valid_from is still in-window",()=>{
 const r=assess("2026-10-10T10:15:00.0000001");
 assert.equal(r.status,"WINDOW_MATCHES_REVIEW_NOT_AUTHORIZED");
});
check("V7.4 same-day historical preapproval order never retroactively passes",()=>{
 const r=assess("2026-10-10T09:59:59");
 assert.ok(r.blockers.includes("SHIFT_WINDOW_ORDER_PRECEDES_HUMAN_CONFIRMATION"));
});
check("V7.4 next-day order blocked; never automatically extends shift",()=>{
 const r=assess("2026-10-11T00:00:00",{operational_date:"2026-10-11"});
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.blockers.includes("SHIFT_WINDOW_ORDER_DATE_MISMATCH"));
});
check("V7.4 wrong store cannot inherit Mooca human review",()=>{
 const r=assess("2026-10-10T12:00:00",{store_id:"0002"});
 assert.ok(r.blockers.includes("SHIFT_WINDOW_ORDER_STORE_MISMATCH"));
});
check("V7.4 false declared operational date must not override true opened date",()=>{
 const r=assess("2026-10-09T12:00:00");
 assert.ok(r.blockers.includes("SHIFT_WINDOW_ORDER_DATE_MISMATCH"));
});
check("V7.4 missing and malformed timestamps fail closed",()=>{
 for(const value of ["","2026-10-10T12:00:00-03:00",
  "2026-10-10T25:00:00","2026-02-30T12:00:00",
  "2026-10-10T12:00:00.12345678"]){
  assert.ok(assess(value).blockers.includes("SHIFT_WINDOW_ORDER_TIMESTAMP_NOT_LOCAL_OR_INVALID"),value);
 }
});
check("V7.4 blocked V7.0 review cannot be upgraded by matching timestamps",()=>{
 const p=review({...fixture(),operational_date:"2026-10-09"});
 assert.equal(p.status,"BLOCKED");
 const r=assess("2026-10-10T12:00:00",{},p);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.blockers.includes("SHIFT_WINDOW_REVIEW_NOT_TRUSTWORTHY_OR_BLOCKED"));
});
check("V7.4 spoofed review flags are denied",()=>{
 const p=reviewed();
 const tampered={...p,safeguards:{...p.safeguards,writes_live_state:true}};
 assert.equal(assess("2026-10-10T12:00:00",{},tampered).status,"BLOCKED");
});
check("V7.4 bad prior-state status is not authorized",()=>{
 const p={...reviewed(),prior_state_status:"UNTRUSTED_OR_ABSENT"};
 assert.ok(assess("2026-10-10T12:00:00",{},p).blockers.includes(
  "SHIFT_WINDOW_REVIEW_NOT_TRUSTWORTHY_OR_BLOCKED"));
});
check("V7.4 strict parsing of source review window rejects invalid and cross-date",()=>{
 const p=reviewed();
 p.declared_request.valid_until_local="2026-10-11T00:30:00";
 assert.ok(assess("2026-10-10T12:00:00",{},p).blockers.includes(
  "SHIFT_WINDOW_DECLARED_INTERVAL_INVALID"));
});
check("V7.4 output never authenticates human, event identity or runtime side effects",()=>{
 const p=assess();
 assert.deepEqual(p.safeguards,{
  authenticates_claim:false,validates_live_event_origin:false,
  grants_existing_watcher_v2_state:false,permits_retroactive_orders:false,
  reads_sql:false,writes_state:false,prints:false,
  requires_independent_human_effect_approval:true
 });
 const original=fixture(),before=structuredClone(original);
 assess("2026-10-10T12:00:00",{},review(original));
 assert.deepEqual(original,before);
});
console.log("READER_SHIFT_WINDOW_V74=16/16 REVIEW_ONLY NO_STATE_WRITE NO_PRINT");

console.log("READER_SHIFT_HUMAN_REVIEW_V70="+checks+"/"+checks+
 " REVIEW_ONLY NO_STATE_WRITE NO_PRINT");

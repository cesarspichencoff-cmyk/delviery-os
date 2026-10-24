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
check("V7.4 upper boundary EXCLUSIVE at precise .0000000 tick (Windows V2 parity)",()=>{
 const r=assess("2026-10-10T15:00:00.0000000");
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.blockers.includes("SHIFT_WINDOW_ORDER_AFTER_VALID_UNTIL"));
});
check("V7.4 last fractional tick BEFORE upper boundary remains reviewable",()=>{
 const r=assess("2026-10-10T14:59:59.9999999");
 assert.equal(r.status,"WINDOW_MATCHES_REVIEW_NOT_AUTHORIZED");
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

// V7.4's review gate is advisory; the legacy resolver is a separate
// consistency filter, NOT proof of a trusted human approval or live deployment.
const shiftStateV2={schema:"deliveryos.production-service-shift-state.v2",
  store_id:"0001",operational_date:"2026-10-10",service:"LUNCH",
  evidence:"HUMAN_CONFIRMED_RULE",source_ref:"SELF_DECLARED_NOT_AUTHENTICATED",
  clock_inference_used:false,
  valid_from_local:"2026-10-10T10:15:00",
  valid_until_local:"2026-10-10T15:00:00",
  updated_at:"2026-10-10T09:59:00"};
const legacy=(at="2026-10-10T12:00:00",state=shiftStateV2,date="2026-10-10")=>
 resolveProductionServiceShiftState(state,{
  store_id:"0001",operational_date:date,order_opened_at:at});
check("legacy v2 contract admits only a structurally valid half-open window, not human auth",()=>{
 const r=legacy();
 assert.equal(r.ready,true);
 assert.deepEqual(r.blocking_reasons,[]);
});
check("legacy lower bound is inclusive",()=>{
 assert.equal(legacy("2026-10-10T10:15:00").ready,true);
});
check("legacy preceding tick is excluded",()=>{
 assert.ok(legacy("2026-10-10T10:14:59.9999999").blocking_reasons.includes(
  "SERVICE_STATE_NOT_YET_ACTIVE_FOR_ORDER"));
});
check("legacy EXACT end is exclusive and matches installed Windows V2",()=>{
 assert.ok(legacy("2026-10-10T15:00:00.0000000").blocking_reasons.includes(
  "SERVICE_STATE_EXPIRED_FOR_ORDER"));
});
check("legacy last fractional tick before end remains eligible structurally",()=>{
 assert.equal(legacy("2026-10-10T14:59:59.9999999").ready,true);
});
check("legacy first fractional tick after end is blocked",()=>{
 assert.ok(legacy("2026-10-10T15:00:00.0000001").blocking_reasons.includes(
  "SERVICE_STATE_EXPIRED_FOR_ORDER"));
});
check("legacy missing start is NOT allowed to inherit prior writer format",()=>{
 const {valid_from_local:ignored,...missing}=shiftStateV2;
 assert.ok(legacy(undefined,missing).blocking_reasons.includes(
  "SERVICE_STATE_VALID_FROM_REQUIRED"));
});
check("legacy missing end fails closed",()=>{
 const {valid_until_local:ignored,...missing}=shiftStateV2;
 assert.ok(legacy(undefined,missing).blocking_reasons.includes(
  "SERVICE_STATE_VALID_UNTIL_REQUIRED"));
});
check("legacy invalid start clock fails closed",()=>{
 assert.ok(legacy(undefined,{...shiftStateV2,
  valid_from_local:"2026-10-10T25:00:00"}).blocking_reasons.includes(
  "SERVICE_STATE_VALID_FROM_REQUIRED"));
});
check("legacy invalid end clock fails closed",()=>{
 assert.ok(legacy(undefined,{...shiftStateV2,
  valid_until_local:"2026-10-10T15:61:00"}).blocking_reasons.includes(
  "SERVICE_STATE_VALID_UNTIL_REQUIRED"));
});
check("legacy inverted window is rejected",()=>{
 assert.ok(legacy(undefined,{...shiftStateV2,
  valid_from_local:"2026-10-10T16:00:00"}).blocking_reasons.includes(
  "SERVICE_STATE_WINDOW_INVALID"));
});
check("legacy cross-day window is rejected",()=>{
 assert.ok(legacy(undefined,{...shiftStateV2,
  valid_until_local:"2026-10-11T00:30:00"}).blocking_reasons.includes(
  "SERVICE_STATE_WINDOW_INVALID"));
});
check("legacy order date conflicts are not accepted as shift date",()=>{
 assert.ok(legacy("2026-10-09T12:00:00").blocking_reasons.includes(
  "SERVICE_STATE_ORDER_OPENED_DATE_MISMATCH"));
});
check("legacy invalid February date is rejected",()=>{
 assert.ok(legacy(undefined,{...shiftStateV2,
  operational_date:"2026-02-30"},"2026-02-30").blocking_reasons.includes(
  "SERVICE_STATE_WINDOW_INVALID"));
});
check("legacy offset suffix is rejected instead of being truncated",()=>{
 for(const value of ["2026-10-10T12:00:00Z",
  "2026-10-10T12:00:00-03:00","2026-10-10T12:00:00.12345678"]){
  assert.ok(legacy(value).blocking_reasons.includes("SERVICE_STATE_ORDER_OPENED_AT_INVALID"));
 }
});
check("legacy timestamp parser cannot ignore fractional ticks",()=>{
 assert.equal(legacy("2026-10-10T14:59:59.9999999").ready,true);
 assert.equal(legacy("2026-10-10T15:00:00.0000000").ready,false);
});
check("legacy read-only filter does not mutate input",()=>{
 const state=structuredClone(shiftStateV2);
 const before=structuredClone(state);
 legacy("2026-10-10T14:59:59",state);
 assert.deepEqual(state,before);
});

console.log("READER_SHIFT_WINDOW_V74=16/16 REVIEW_ONLY NO_STATE_WRITE NO_PRINT");

console.log("READER_SHIFT_HUMAN_REVIEW_V70="+checks+"/"+checks+
 " REVIEW_ONLY NO_STATE_WRITE NO_PRINT");

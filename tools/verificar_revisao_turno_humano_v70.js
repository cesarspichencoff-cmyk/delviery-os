"use strict";
const assert=require("node:assert/strict");
const {reviewHumanShiftRenewalV70}=
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
console.log("READER_SHIFT_HUMAN_REVIEW_V70="+checks+"/"+checks+
 " REVIEW_ONLY NO_STATE_WRITE NO_PRINT");

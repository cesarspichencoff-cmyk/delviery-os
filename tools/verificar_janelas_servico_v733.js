"use strict";
/** One-time, versioned business-rule windows; all hours here are FICTIONAL. */
const assert=require("node:assert/strict");
const {reviewStoreServiceWindowsV733:resolve}=require(
 "../dist/src/production/storeServiceWindowsV733.js");
const base={schema:"deliveryos.store-service-windows.v733",
 store_id:"0001",revision:"synthetic-window-2026-10-12",
 source_ref:"fixture:fictional-service-policy",
 evidence:"CURRENT_OPERATING_RULE_CONFIRMED",
 effective_from_local_date:"2026-10-10",
 windows:[
  {weekday:1,service:"LUNCH",from_local:"11:00:00",until_local:"15:00:00"},
  {weekday:1,service:"DINNER",from_local:"17:00:00",until_local:"22:00:00"},
  {weekday:0,service:"LUNCH",from_local:"12:00:00",until_local:"16:00:00"}
 ]};
const order=(stamp="2026-10-12T12:00:00",store="0001")=>
 ({store_id:store,opened_at_local:stamp});
let n=0;
function check(label,fn){fn();n++;console.log("PASS V733 "+n+" "+label);}
function isBlocked(r,reason){
 assert.equal(r.status,"BLOCKED");
 assert.equal(r.authorizes_print,false);
 assert.equal(r.authorizes_watcher_state,false);
 assert.equal(r.requires_daily_signature,false);
 assert.equal(r.verifies_rule_origin,false);
 assert.ok(r.reasons.includes(reason),JSON.stringify(r.reasons));
}
check("single Monday lunch matches fictional once-confirmed rule, NOT live authority",()=>{
 const r=resolve(base,order());
 assert.equal(r.status,"RULE_MATCH_REVIEW_ONLY");
 assert.equal(r.service,"LUNCH");
 assert.equal(r.evidence,"HUMAN_CONFIRMED_RULE");
 assert.equal(r.authorizes_print,false);
 assert.equal(r.verifies_rule_origin,false);
 assert.equal(r.requires_daily_signature,false);
 assert.ok(Object.values(r.effects).every(v=>v===false));
});
check("dinner matches same unchanged document without a second approval",()=>{
 const r=resolve(base,order("2026-10-12T19:35:00"));
 assert.equal(r.status,"RULE_MATCH_REVIEW_ONLY");
 assert.equal(r.service,"DINNER");
});
check("lower boundary inclusive and fractional precision checked",()=>{
 const r=resolve(base,order("2026-10-12T17:00:00.0000001"));
 assert.equal(r.service,"DINNER");
});
check("upper boundary exclusive to avoid ambiguous turn switching",()=>{
 isBlocked(resolve(base,order("2026-10-12T15:00:00")),
  "ORDER_OUTSIDE_DOCUMENTED_SERVICE_WINDOW");
});
check("gap between services refuses any guessed turn",()=>{
 isBlocked(resolve(base,order("2026-10-12T16:59:59")),
  "ORDER_OUTSIDE_DOCUMENTED_SERVICE_WINDOW");
});
check("end of dinner does not silently extend rules",()=>{
 isBlocked(resolve(base,order("2026-10-12T22:00:00")),
  "ORDER_OUTSIDE_DOCUMENTED_SERVICE_WINDOW");
});
check("distinct Sunday schedule works without weekday assumption",()=>{
 assert.equal(resolve(base,order("2026-10-11T13:00:00")).service,"LUNCH");
});
check("unconfigured weekday is blocked rather than defaulted",()=>{
 isBlocked(resolve(base,order("2026-10-13T13:00:00")),
  "ORDER_OUTSIDE_DOCUMENTED_SERVICE_WINDOW");
});
check("wrong store cannot inherit Mooca fixture",()=>{
 isBlocked(resolve(base,order("2026-10-12T12:00:00","0002")),"ORDER_STORE_MISMATCH");
});
check("rule cannot govern orders before rule effective date",()=>{
 isBlocked(resolve(base,order("2026-10-05T12:00:00")),
  "RULE_NOT_EFFECTIVE_FOR_ORDER");
});
check("overlapping same-weekday windows invalidate entire rule",()=>{
 const changed=structuredClone(base);
 changed.windows[1].from_local="14:00:00";
 isBlocked(resolve(changed,order()),"RULE_WINDOWS_OVERLAP");
});
check("same weekday duplicate service windows reject ambiguous maintenance",()=>{
 const changed=structuredClone(base);
 changed.windows.push({weekday:1,service:"LUNCH",
  from_local:"07:00:00",until_local:"08:00:00"});
 isBlocked(resolve(changed,order()),"RULE_DUPLICATE_SERVICE_DAY");
});
check("cross-midnight interval cannot be guessed",()=>{
 const changed=structuredClone(base);
 changed.windows[1].until_local="01:00:00";
 isBlocked(resolve(changed,order()),"RULE_WINDOW_INVALID_OR_CROSS_MIDNIGHT");
});
check("without identified rule source there is no automatic turn",()=>{
 isBlocked(resolve({...base,source_ref:""},order()),"RULE_SOURCE_NOT_IDENTIFIED");
});
check("without confirmation of one-time business rule, blocked",()=>{
 isBlocked(resolve({...base,evidence:"INFERRED_FROM_CLOCK"},order()),
  "RULE_NOT_CONFIRMED");
});
check("missing revision blocks stale anonymous rule",()=>{
 isBlocked(resolve({...base,revision:""},order()),"RULE_REVISION_REQUIRED");
});
check("invalid date cannot be matched",()=>{
 isBlocked(resolve(base,order("2026-02-30T12:00:00")),
  "ORDER_TIMESTAMP_NOT_LOCAL_OR_INVALID");
});
check("timezone-marked timestamp cannot masquerade as store-local clock",()=>{
 isBlocked(resolve(base,order("2026-10-12T12:00:00-03:00")),
  "ORDER_TIMESTAMP_NOT_LOCAL_OR_INVALID");
});
check("more than 7 fractional digits disallowed",()=>{
 isBlocked(resolve(base,order("2026-10-12T12:00:00.12345678")),
  "ORDER_TIMESTAMP_NOT_LOCAL_OR_INVALID");
});
check("invalid store rule date blocked",()=>{
 isBlocked(resolve({...base,effective_from_local_date:"2026-02-30"},order()),
  "RULE_EFFECTIVE_DATE_INVALID");
});
check("missing source does not get replaced by observed cash register opening",()=>{
 const empty={...base,source_ref:"",evidence:"CURRENT_OPERATING_RULE_CONFIRMED"};
 isBlocked(resolve(empty,order()),"RULE_SOURCE_NOT_IDENTIFIED");
});
check("no input mutation or disk/database/printer effects",()=>{
 const saved=JSON.stringify({base,order:order()});
 const r=resolve(base,order());
 assert.equal(JSON.stringify({base,order:order()}),saved);
 assert.ok(Object.values(r.effects).every(v=>v===false));
});
console.log("THERMAL_STORE_SERVICE_WINDOWS_V733="+n+"/"+n+
 " FICTIONAL_SCHEDULE_NO_SIGNATURE_NO_SERVICE_WRITE_NO_PRINT");

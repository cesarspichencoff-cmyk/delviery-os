"use strict";
/* ITAIM confirmed hours, official SP 2026 holidays. NEVER real store binding. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {reviewStoreServiceWindowsV733:review}=require("../dist/src/production/storeServiceWindowsV733.js");
const template=JSON.parse(fs.readFileSync(path.join(__dirname,"../runtime/shadow/itaim-service-hours-unbound-v734.json"),"utf8"));
assert.equal(template.unit,"ITAIM");
assert.equal(template.store_id,null);
assert.equal(template.binding_state,"UNBOUND_REQUIRES_ITAIM_LOCAL_STORE_VERIFICATION");
assert.equal(template.windows.length,14);
assert.equal(template.holiday_calendar.dates.length,13);
const storeId="9999"; // synthetic fixture only
const rule={schema:"deliveryos.store-service-windows.v733",store_id:storeId,
 revision:template.revision,source_ref:template.source_ref,evidence:template.evidence,
 effective_from_local_date:template.effective_from_local_date,
 windows:template.windows,holiday_calendar:template.holiday_calendar,
 holiday_windows:template.holiday_windows};
const order=(day,hour,store=storeId)=>({store_id:store,opened_at_local:day+"T"+hour});
const result=(day,hour,config=rule)=>review(config,order(day,hour));
let n=0;
const test=(label,fn)=>{fn();n++;console.log("PASS V734 "+n+" "+label);};
function yes(day,hour,service){
 const r=result(day,hour);
 assert.equal(r.status,"RULE_MATCH_REVIEW_ONLY",JSON.stringify(r.reasons));
 assert.equal(r.service,service);
 assert.equal(r.authorizes_print,false);
 assert.equal(r.authorizes_watcher_state,false);
 assert.equal(r.requires_daily_signature,false);
 assert.equal(r.verifies_rule_origin,false);
}
function no(day,hour,reason,config=rule){
 const r=result(day,hour,config);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.reasons.includes(reason),JSON.stringify(r.reasons));
 assert.equal(r.authorizes_print,false);
}
const outside="ORDER_OUTSIDE_DOCUMENTED_SERVICE_WINDOW";
test("Oct12 Monday legal holiday 11:00 is lunch",()=>yes("2026-10-12","11:00:00","LUNCH"));
test("Oct12 Monday legal holiday 15:30 is lunch",()=>yes("2026-10-12","15:30:00","LUNCH"));
test("Oct12 Monday legal holiday 16:30 closes lunch",()=>no("2026-10-12","16:30:00",outside));
test("ordinary Monday 14:59:59 lunch",()=>yes("2026-10-19","14:59:59.9999999","LUNCH"));
test("ordinary Monday 15:00 no lunch",()=>no("2026-10-19","15:00:00",outside));
test("ordinary Monday 15:30 no lunch",()=>no("2026-10-19","15:30:00",outside));
test("Tuesday 11:00 lunch",()=>yes("2026-10-13","11:00:00","LUNCH"));
test("Friday 14:59 lunch",()=>yes("2026-10-16","14:59:59","LUNCH"));
test("Saturday 16:29 lunch",()=>yes("2026-10-17","16:29:59","LUNCH"));
test("Saturday 16:30 no lunch",()=>no("2026-10-17","16:30:00",outside));
test("Sunday 15:30 lunch",()=>yes("2026-10-18","15:30:00","LUNCH"));
test("Sunday 16:30 no lunch",()=>no("2026-10-18","16:30:00",outside));
test("Monday Nov02 public holiday 15:45 lunch",()=>yes("2026-11-02","15:45:00","LUNCH"));
test("Friday Nov20 public holiday 15:45 lunch",()=>yes("2026-11-20","15:45:00","LUNCH"));
test("Tuesday Nov03 normal 15:45 not lunch",()=>no("2026-11-03","15:45:00",outside));
const week=["2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-16","2026-10-17","2026-10-18"];
test("every day dinner begins at 18:00",()=>week.forEach(d=>yes(d,"18:00:00","DINNER")));
test("every day 17:59:59 outside",()=>week.forEach(d=>no(d,"17:59:59",outside)));
test("every day 22:59:59 dinner",()=>week.forEach(d=>yes(d,"22:59:59.9999999","DINNER")));
test("every day 23:00 outside",()=>week.forEach(d=>no(d,"23:00:00",outside)));
test("10:59:59 outside",()=>no("2026-10-12","10:59:59",outside));
test("2027 blocked until calendar refresh",()=>no("2027-01-01","15:30:00","HOLIDAY_CALENDAR_NOT_VALID_FOR_ORDER"));
test("holiday omitted from list cannot silently extend weekday",()=>{
 const c=structuredClone(rule);c.holiday_calendar.dates=c.holiday_calendar.dates.filter(x=>x!=="2026-10-12");
 no("2026-10-12","15:30:00",outside,c);
});
test("calendar missing blocked",()=>{const c=structuredClone(rule);delete c.holiday_calendar;
 no("2026-10-12","15:30:00","HOLIDAY_CALENDAR_OR_SOURCE_INVALID",c);});
test("duplicate holiday date blocked",()=>{const c=structuredClone(rule);c.holiday_calendar.dates.push("2026-10-12");
 no("2026-10-12","12:00:00","HOLIDAY_DATE_INVALID_OR_DUPLICATE",c);});
test("impossible holiday date blocked",()=>{const c=structuredClone(rule);c.holiday_calendar.dates.push("2026-02-30");
 no("2026-10-12","12:00:00","HOLIDAY_DATE_INVALID_OR_DUPLICATE",c);});
test("optional civil-service holiday isn't automatically a legal holiday",()=>no("2026-10-30","15:30:00",outside));
test("unbound template never authorizes a store",()=>no("2026-10-12","12:00:00","RULE_STORE_INVALID",{...rule,store_id:null}));
test("Mooca store identity does not inherit Itaim fixture",()=>{
 const r=review(rule,order("2026-10-12","15:30:00","0001"));
 assert.equal(r.status,"BLOCKED");assert.ok(r.reasons.includes("ORDER_STORE_MISMATCH"));
});
test("pure resolver, no database/service/spooler effects",()=>{
 const before=JSON.stringify(rule);const r=result("2026-10-12","15:30:00");
 assert.equal(JSON.stringify(rule),before);
 assert.ok(Object.values(r.effects).every(x=>x===false));
 assert.equal(r.authorizes_print,false);
});
console.log("THERMAL_ITAIM_HOURS_V734="+n+"/"+n+" CONFIRMED_HOURS_OFFICIAL_2026_HOLIDAYS_NO_STORE_BINDING_NO_PRINT");

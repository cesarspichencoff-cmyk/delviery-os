"use strict";
const assert=require("node:assert/strict");
const {SCHEMA,fromNativeReport}=require("./adapter.cjs");
let count=0;const test=(name,ok)=>{assert.ok(ok,name);count++;console.log("PASS "+name)};
const clock=new Date("2026-11-02T02:12:00.000Z");
const good=()=>({schema:SCHEMA,source:"TOQAN",transfer:"MANUAL_EXPORT",
 scope:{unit:"ITAIM",storeClaim:"53069"},
 period:{start:"2026-11-01T11:00:00-03:00",end:"2026-11-01T23:00:00-03:00",timezone:"America/Sao_Paulo"},
 reportCreatedAt:"2026-11-01T23:10:00-03:00",
 metrics:{orders_total:100,orders_delayed:8,orders_cancelled:2,preparation_mean_minutes:25.5}});
const run=fn=>{const v=good();fn(v);return fromNativeReport(v,clock)};
const result=fromNativeReport(good(),clock);
test("valid manual report yields shadow only",result.status==="SHADOW_AGGREGATE_REVIEW_ONLY");
test("retains unit Itaim",result.unit==="ITAIM");
test("does not claim stream",result.continuous===false&&result.realTime===false);
test("does not imply per-order IDs or production",result.orderLevel===false&&result.itemProduction===false);
test("no GPS",result.gps===false);
test("no action capabilities",Object.values(result.effects).every(x=>x===false)&&result.canTriggerAction===false);
test("reports unverified",result.sourceIndependentlyVerified===false&&result.forCopilot==="SHADOW_ONLY_UNVERIFIED");
test("delayed percent derived correctly",result.derived.delayed_rate_pct===8);
test("mean prep not promoted to item prep",result.metrics.preparation_mean_minutes===25.5&&result.itemProduction===false);
test("no per-order names, IDs or GPS in output",!JSON.stringify(result).includes("customer")&&!JSON.stringify(result).includes("latitude"));
test("provider-authorized export allowed as shadow",run(v=>v.transfer="PROVIDER_AUTHORIZED_EXPORT").status==="SHADOW_AGGREGATE_REVIEW_ONLY");
test("automated collector rejected",run(v=>v.transfer="BROWSER_SCRAPER").status==="HOLD");
test("untrusted source rejected",run(v=>v.source="SOME_OTHER_SERVICE").status==="HOLD");
test("extra PII field on report rejected",run(v=>v.customerName="TEST PERSON").status==="HOLD");
test("extra PII field on metrics rejected",run(v=>v.metrics.phone="11999999999").status==="HOLD");
test("other unit refused",run(v=>v.scope.unit="PINHEIROS").status==="HOLD");
test("unknown store can be retained as unverified",run(v=>v.scope.storeClaim="UNKNOWN").sourceIndependentlyVerified===false);
test("unrecognized store refused",run(v=>v.scope.storeClaim="123456").status==="HOLD");
test("period not Sao Paulo refused",run(v=>v.period.timezone="UTC").status==="HOLD");
test("inverted interval refused",run(v=>v.period.start="2026-11-01T23:45:00-03:00").status==="HOLD");
test("future report refused",run(v=>v.reportCreatedAt="2026-11-02T09:00:00-03:00").status==="HOLD");
test("invalid date refused",run(v=>v.period.start="2026-11-31T11:00:00-03:00").status==="HOLD");
test("too long period refused",run(v=>v.period.start="2026-09-01T11:00:00-03:00").status==="HOLD");
test("no metrics refused",run(v=>v.metrics={}).status==="HOLD");
test("negative metrics refused",run(v=>v.metrics.orders_delayed=-1).status==="HOLD");
test("noninteger count refused",run(v=>v.metrics.orders_total=1.5).status==="HOLD");
test("cancelled more than total refused",run(v=>v.metrics.orders_cancelled=110).status==="HOLD");
test("dispatched more than total refused",run(v=>v.metrics.orders_dispatched=110).status==="HOLD");
test("absent metrics remain absent, not zero",(()=>{const r=run(v=>v.metrics={orders_total:2});return r.status==="SHADOW_AGGREGATE_REVIEW_ONLY"&&!Object.hasOwn(r.metrics,"orders_cancelled")&&!Object.hasOwn(r.derived,"delayed_rate_pct")})());
test("zero total avoids artificial rate",(()=>{const r=run(v=>v.metrics={orders_total:0,orders_delayed:0});return !Object.hasOwn(r.derived,"delayed_rate_pct")})());
test("bad captured clock refused",fromNativeReport(good(),new Date(NaN)).status==="HOLD");
test("not an operational integration",result.forCopilot!=="LIVE"&&result.canTriggerAction===false);
console.log("TOQAN_SHADOW_ADAPTER_TEST_PASS "+count+"/"+count);
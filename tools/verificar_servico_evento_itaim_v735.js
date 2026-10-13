"use strict";
/* V7.35: reader event + Itaim operational windows, synthetic data only. */
const assert=require("node:assert/strict");
const path=require("node:path"),fs=require("node:fs");
const {reviewItaimReaderServiceV735:review}=require(
 "../dist/src/production/itaimReaderServiceReviewV735.js");
const root=path.join(__dirname,"../runtime/shadow");
const template=JSON.parse(fs.readFileSync(
 path.join(root,"itaim-service-hours-unbound-v734.json"),"utf8"));
const candidate=JSON.parse(fs.readFileSync(
 path.join(root,"itaim-reader-binding-candidate-v735.json"),"utf8"));
assert.equal(candidate.unit,"ITAIM");
assert.equal(candidate.windows_host,"CAIXA_MOOCA");
assert.equal(candidate.expected_store_id,"0001");
assert.equal(candidate.expected_shop_id,"01"); // Read-only SQL DLV_IFO group, NOT reader proof.
assert.equal(candidate.state,"CANDIDATE_READ_ONLY_NOT_INSTALLED");
assert.match(candidate.evidence.shop_id,/^SQL_DIRECT_READ_TEK_NISA_COMANDAVEN_DLV_IFO/);
assert.match(candidate.evidence.reader_event_identity,/^UNKNOWN_NEEDS_EXACT_RAW_/);
const fixed=candidate; // Known SQL pair; all event objects below are FICTIONAL.
function event(day="2026-10-12",time="15:30:00"){
 return {schema:"deliveryos.tata-reader-stable-order-event.v1",
  order_key:"0001|01|0000000099|0000000001",snapshot_hash:"a".repeat(64),
  ready_for_downstream_shadow:false,
  blockers:["SERVICE_STATE_EXPIRED_FOR_ORDER"],
  order:{CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000000099",NRCOMANDA:"0000000001",
   DTHRABERMESA:day+"T"+time,items:[{CDPRODUTO:"FIXTURE"}]}};
}
let n=0;
function check(label,fn){fn();n++;console.log("PASS V735 "+n+" "+label);}
function blocked(cause,r){
 assert.equal(r.status,"BLOCKED",JSON.stringify(r));
 assert.equal(r.service,null);
 assert.ok(r.reasons.includes(cause),JSON.stringify(r.reasons));
 assert.equal(r.authorizes_print,false);
 assert.equal(r.authorizes_watcher_state,false);
 assert.ok(Object.values(r.effects).every(v=>v===false));
}
check("SQL-observed candidate is only a diagnostic REVIEW, never end-to-end proof",()=>{
 const r=review(candidate,template,event());
 assert.equal(r.status,"RULE_MATCH_REVIEW_ONLY");
 assert.equal(r.service,"LUNCH");
 assert.equal(r.binding_independently_proven,false);
 assert.equal(r.event_snapshot_independently_reconciled,false);
 assert.equal(r.upstream_watcher_blocked,true);
 assert.equal(r.authorizes_print,false);
 assert.equal(r.authorizes_watcher_state,false);
});
check("reader-event shop cannot overwrite the independent SQL candidate",()=>{
 const ev=event();ev.order.CDLOJA="999";ev.order_key="0001|999|0000000099|0000000001";
 blocked("TARGET_SHOP_ID_MISMATCH",review(candidate,template,ev));
});
check("synthetic bound shop reviews Monday holiday lunch",()=>{
 const r=review(fixed,template,event());
 assert.equal(r.status,"RULE_MATCH_REVIEW_ONLY",JSON.stringify(r.reasons));
 assert.equal(r.service,"LUNCH");
 assert.equal(r.upstream_watcher_blocked,true);
 assert.equal(r.binding_independently_proven,false);
 assert.equal(r.event_snapshot_independently_reconciled,false);
 assert.equal(r.authorizes_print,false);
 assert.equal(r.original_event_unchanged,true);
});
check("synthetic 18:00 dinner from original local order timestamp",()=>{
 const r=review(fixed,template,event("2026-10-12","18:00:00"));
 assert.equal(r.service,"DINNER");
 assert.equal(r.authorizes_watcher_state,false);
});
check("normal Monday 15:30 blocked by explicit schedule",()=>{
 blocked("ORDER_OUTSIDE_DOCUMENTED_SERVICE_WINDOW",
  review(fixed,template,event("2026-10-19","15:30:00")));
});
check("Monday 12 Oct holiday overrides ordinary weekday cutoff",()=>{
 const r=review(fixed,template,event("2026-10-12","15:30:00"));
 assert.equal(r.service,"LUNCH");
});
check("wrong CDFILIAL never inherits the schedule",()=>{
 const ev=event();ev.order.CDFILIAL="0002";ev.order_key="0002|01|0000000099|0000000001";
 blocked("TARGET_STORE_ID_MISMATCH",review(fixed,template,ev));
});
check("wrong CDLOJA never inherits the schedule",()=>{
 const ev=event();ev.order.CDLOJA="02";ev.order_key="0001|02|0000000099|0000000001";
 blocked("TARGET_SHOP_ID_MISMATCH",review(fixed,template,ev));
});
check("synthetic legacy 3-field key must not pass installed watcher review",()=>{
 const ev=event();ev.order_key="0001|01|0000000001";
 blocked("ORDER_IDENTITY_OR_REVISION_ENVELOPE_INVALID",review(fixed,template,ev));
});
check("different sale number must not reuse original order key",()=>{
 const ev=event();ev.order.NRVENDAREST="0000000098";
 blocked("ORDER_IDENTITY_OR_REVISION_ENVELOPE_INVALID",review(fixed,template,ev));
});
check("forged order key is rejected",()=>{
 const ev=event();ev.order_key="0001|01|0000000002";
 blocked("ORDER_IDENTITY_OR_REVISION_ENVELOPE_INVALID",
  review(fixed,template,ev));
});
check("revised order number without matching key rejected",()=>{
 const ev=event();ev.order.NRCOMANDA="0000000002";
 blocked("ORDER_IDENTITY_OR_REVISION_ENVELOPE_INVALID",
  review(fixed,template,ev));
});
check("missing revision envelope rejected",()=>{
 const ev=event();ev.snapshot_hash="";
 blocked("ORDER_IDENTITY_OR_REVISION_ENVELOPE_INVALID",
  review(fixed,template,ev));
});
check("snapshot hash shape alone never proves DB source integrity",()=>{
 const r=review(fixed,template,event());
 assert.equal(r.event_snapshot_independently_reconciled,false);
});
check("event with empty order items is not a shift ticket source",()=>{
 const ev=event();ev.order.items=[];
 blocked("ORDER_IDENTITY_OR_REVISION_ENVELOPE_INVALID",
  review(fixed,template,ev));
});
check("event timestamps with timezone suffix remain blocked",()=>{
 const ev=event();ev.order.DTHRABERMESA+="Z";
 blocked("ORDER_TIMESTAMP_NOT_LOCAL_OR_INVALID",review(fixed,template,ev));
});
check("old order predating effective date cannot reuse new policy",()=>{
 blocked("RULE_NOT_EFFECTIVE_FOR_ORDER",
  review(fixed,template,event("2026-10-11","12:00:00")));
});
check("valid schedule review never upgrades upstream blocked event",()=>{
 const ev=event();ev.ready_for_downstream_shadow=false;
 const r=review(fixed,template,ev);
 assert.equal(r.status,"RULE_MATCH_REVIEW_ONLY");
 assert.equal(r.upstream_watcher_blocked,true);
 assert.equal(r.authorizes_watcher_state,false);
});
check("even upstream ready does not gain print authority",()=>{
 const ev=event();ev.ready_for_downstream_shadow=true;ev.blockers=[];
 const r=review(fixed,template,ev);
 assert.equal(r.status,"RULE_MATCH_REVIEW_ONLY");
 assert.equal(r.upstream_watcher_blocked,false);
 assert.equal(r.authorizes_print,false);
});
check("malicious auto-install status prohibited",()=>{
 blocked("TARGET_BINDING_CONTRACT_INVALID",
  review({...fixed,state:"INSTALLED"},template,event()));
});
check("changing declared unit to MOOCA prohibited",()=>{
 blocked("TARGET_BINDING_CONTRACT_INVALID",
  review({...fixed,unit:"MOOCA"},template,event()));
});
check("changing expected host to unrelated machine prohibited",()=>{
 blocked("TARGET_BINDING_CONTRACT_INVALID",
  review({...fixed,windows_host:"OTHERHOST"},template,event()));
});
check("unbound template still cannot masquerade as bound policy",()=>{
 const changed={...template,store_id:"0001"};
 blocked("ITAIM_CONFIRMED_HOURS_TEMPLATE_INVALID",
  review(fixed,changed,event()));
});
check("missing holiday calendar cannot silently assume standard Monday",()=>{
 const changed={...template,holiday_calendar:undefined};
 blocked("HOLIDAY_CALENDAR_OR_SOURCE_INVALID",
  review(fixed,changed,event()));
});
check("2027 cannot use 2026 holiday schedule",()=>{
 blocked("HOLIDAY_CALENDAR_NOT_VALID_FOR_ORDER",
  review(fixed,template,event("2027-01-01","12:00:00")));
});
check("no alteration of source event, binding or template",()=>{
 const ev=event();
 const before=JSON.stringify([fixed,template,ev]);
 const r=review(fixed,template,ev);
 assert.equal(JSON.stringify([fixed,template,ev]),before);
 assert.equal(r.authorizes_print,false);
 assert.equal(r.authorizes_watcher_state,false);
 assert.ok(Object.values(r.effects).every(x=>x===false));
});
console.log("THERMAL_ITAIM_READER_SERVICE_V735="+n+"/"+n+
 " SHOP_OBSERVED_SQL_READER_PARITY_PENDING_HOLD READ_ONLY_NO_PRINT");
// Static and ParseFile-only proof; NEVER run the real spool probe in CI.
require("./verificar_spool_passivo_v738.js");

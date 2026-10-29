"use strict";
const assert=require("node:assert/strict");
const {INPUT_SCHEMA,SCHEMA,EFFECTS,compareAggregateSamples:compare}=
 require("./comandas_live_aggregate_trend_v1_offline.cjs");
function pair(){
 const start={
  schema:INPUT_SCHEMA,host_name:"CAIXA_MOOCA",
  captured_at:"2026-10-29T16:38:59Z",
  reader:{state:"RUNNING",updated_at:"2026-10-29T16:38:51Z",
   last_success_at:"2026-10-29T16:38:05Z",
   last_batch_outcome:"OK",consecutive_failures:0,
   totals:{batches:674,ok:337,failed:337,events_emitted:117}},
  shadow:{state:"RUNNING",updated_at:"2026-10-29T16:38:58Z",
   processed:117,ready:37,blocked:80,reporting_envelopes:117,
   last_projection_status:"PROJECTED",last_error_present:false},
  projector:{state:"PROJECTED",updated_at:"2026-10-29T16:38:54Z",
   source_files:10670,adapted_revisions:10670,failed_revisions:0},
  shift:{operational_date:"2026-10-14",valid_until_local:"2026-10-14T15:00:00"}
 };
 const end=structuredClone(start);
 end.captured_at="2026-10-29T16:49:45Z";
 end.reader.updated_at="2026-10-29T16:49:39Z";
 end.reader.last_success_at="2026-10-29T16:48:58Z";
 Object.assign(end.reader.totals,{batches:685,ok:348,failed:337,events_emitted:121});
 Object.assign(end.shadow,{updated_at:"2026-10-29T16:49:36Z",
  processed:121,ready:37,blocked:84,reporting_envelopes:121});
 Object.assign(end.projector,{updated_at:"2026-10-29T16:43:41Z",
  source_files:10674,adapted_revisions:10674});
 return [start,end];
}
let n=0;
function check(name,fn){fn();console.log("PASS "+(++n)+" "+name);}
function test(pair,expectedState,reason){
 const inputs=JSON.stringify(pair);
 const r=compare(...pair);
 assert.equal(JSON.stringify(pair),inputs,"input mutation forbidden");
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 assert.equal(r.review_status,"HOLD_FOR_PRODUCTION");
 assert.equal(r.print_authorized,false);assert.equal(r.physical_paper_proven,false);
 assert.equal(r.ready_count_is_print_permission,false);
 assert.equal(r.first_native_dispatch_proven,false);
 assert.equal(r.root_cause_confirmed,false);
 assert.equal(r.diagnostic_state,expectedState);
 if(reason)assert.ok(r.reasons.includes(reason),r.reasons.join(","));
 return r;
}
const progress="RECENT_BATCH_PROGRESS_OBSERVED",hold="AGGREGATE_GAPS_REQUIRE_REVIEW",
 unknown="INDETERMINATE";
check("realistic aggregate progress never proves printing",()=>{
 const r=test(pair(),progress,"AGGREGATE_DELTAS_ALIGN_NOT_ORDER_IDENTITY");
 assert.deepEqual([r.delta.ok_batches,r.delta.failed_batches,r.delta.emitted_events,
   r.delta.processed,r.delta.adapted_revisions],[11,0,4,4,4]);
 assert.ok(r.reasons.includes("SHIFT_STATE_EXPIRED"));
 assert.ok(r.reasons.includes("HISTORICAL_FAILURES_UNEXPLAINED"));
});
const mutate=(name,fn,state,reason)=>check(name,()=>{
 const x=pair();fn(...x);test(x,state,reason);
});
mutate("one new failed batch never passes as clean",
 (a,b)=>{b.reader.totals.batches++;b.reader.totals.failed++;
 b.reader.consecutive_failures=1;b.reader.last_batch_outcome="FAILED";},
 hold,"NEW_WATCHER_BATCH_FAILURES");
mutate("new ready state never authorizes paper",
 (a,b)=>{b.shadow.ready++;b.shadow.blocked--;},progress,"NEW_READY_IS_ONLY_SHADOW_STATE");
mutate("shadow event gap cannot prove matching orders",
 (a,b)=>{b.shadow.processed++;b.shadow.blocked++;b.shadow.reporting_envelopes++;},
 progress,"AGGREGATE_DELTA_NOT_ALIGNED_NO_ORDER_JOIN");
mutate("reader not running holds",
 (a,b)=>{b.reader.state="STOPPED";},hold,"READER_LATEST_BATCH_NOT_CLEAR");
mutate("projection error holds",
 (a,b)=>{b.shadow.last_projection_status="FAILED";},progress,"SHADOW_OR_PROJECTOR_NOT_CLEAR");
mutate("reported shadow error holds",
 (a,b)=>{b.shadow.last_error_present=true;},progress,"SHADOW_OR_PROJECTOR_NOT_CLEAR");
mutate("stale heartbeat blocks progress",
 (a,b)=>{b.reader.updated_at="2026-10-29T16:40:00Z";},hold,
 "READER_HEARTBEAT_STALE");
mutate("stale projector flagged independently",
 (a,b)=>{b.projector.updated_at="2026-10-29T16:00:00Z";},progress,
 "PROJECTOR_STATUS_STALE");
mutate("counter rollback not mistaken for healthy restart",
 (a,b)=>{b.shadow.processed=10;b.shadow.ready=0;b.shadow.blocked=10;
 b.shadow.reporting_envelopes=10;},unknown,
 "AGGREGATE_COUNTER_DECREASE_OR_PROCESS_RESTART");
mutate("injected order ID is rejected, never echoed",
 (a,b)=>{b.reader.customer_order_id="SENSITIVE_CUSTOMER";},unknown,
 "SANITIZED_SAMPLE_INVALID_OR_UNSAFE");
mutate("top-level private field rejected",
 (a,b)=>{b.customer="SENSITIVE_CUSTOMER";},unknown,
 "SANITIZED_SAMPLE_INVALID_OR_UNSAFE");
mutate("host different from authorized name is rejected",
 (a,b)=>{b.host_name="OTHER_PC";},unknown,
 "SANITIZED_SAMPLE_INVALID_OR_UNSAFE");
mutate("impossible calendar date rejected",
 (a,b)=>{b.captured_at="2026-02-30T16:49:45Z";},unknown,
 "SANITIZED_SAMPLE_INVALID_OR_UNSAFE");
mutate("clock future status rejected",
 (a,b)=>{b.reader.updated_at="2026-10-29T17:01:45Z";},unknown,
 "SANITIZED_SAMPLE_INVALID_OR_UNSAFE");
mutate("processed differs from ready plus blocked rejected",
 (a,b)=>{b.shadow.ready=900;},unknown,
 "SANITIZED_SAMPLE_INVALID_OR_UNSAFE");
mutate("reader batches must reconcile with ok + failed",
 (a,b)=>{b.reader.totals.ok++;},unknown,
 "SANITIZED_SAMPLE_INVALID_OR_UNSAFE");
mutate("report with more adapted than sources is rejected",
 (a,b)=>{b.projector.adapted_revisions=20000;},unknown,
 "SANITIZED_SAMPLE_INVALID_OR_UNSAFE");
mutate("captured before baseline cannot invent progress",
 (a,b)=>{b.captured_at="2026-10-29T16:30:00Z";},unknown,
 "SAMPLE_ORDER_NOT_MONOTONIC");
mutate("shift remains expired even when aggregates align",
 (a,b)=>{b.shift.valid_until_local="2026-10-27T15:00:00";},
 progress,"SHIFT_STATE_EXPIRED");
mutate("zero new events means not a fresh-order proof",
 (a,b)=>{b.reader.totals.events_emitted=117;b.shadow.processed=117;
 b.shadow.ready=37;b.shadow.blocked=80;b.shadow.reporting_envelopes=117;
 b.projector.source_files=10670;b.projector.adapted_revisions=10670;},
 progress,"NO_NEW_EMITTED_EVENTS_IN_WINDOW");
check("null and empty are safe HOLD",()=>{
 for(const v of [null,undefined,{},[],false]){
  const r=compare(v,v);
  assert.equal(r.diagnostic_state,unknown);
  assert.equal(r.print_authorized,false);
 }
});
console.log("COMANDAS_LIVE_AGGREGATE_TREND="+n+"/"+n+
 " SANITIZED_ONLY NO_NATIVE_PRINT_NO_SERVICES");

"use strict";
// Pure, fictitious data. Status schemas describe local progress, never live orders.
const assert=require("node:assert/strict");
const {evaluateTataReaderHealthV1:review}=require("../../runtime/tata-reader/tata_reader_health_v1.cjs");
const now=Date.parse("2026-11-05T03:40:00.000Z");
const stamp=delta=>new Date(now-delta).toISOString();
const heartbeat=()=>({
  schema:"deliveryos.tata-reader-heartbeat.v1",state:"RUNNING",
  written_at:stamp(1000),last_success_at:stamp(15000),
  consecutive_failures:0,watcher:{sha256_verified:true},
  cadence:{poll_seconds:3,expected_batch_seconds:180,
    heartbeat_every_seconds:5,progress_stall_seconds:39,max_backoff_seconds:60},
  last_batch:{outcome:"OK",error_class:null}
});
const consumer=(version="v2",state="RUNNING")=>({
  schema:"deliveryos.live-shadow-consumer-status."+version,state,
  updated_at:stamp(2000),processed:123,ready_count:0,blocked_count:123,
  last_projection_status:"SKIPPED_LOCKED"
});
const evaluate=(c=consumer(),h=heartbeat(),ck=now-1000)=>
  review({nowMs:now,heartbeat:h,consumerStatus:c,checkpointMtimeMs:ck});
let passed=0;const check=(name,fn)=>{fn();passed++;};
check("v2 RUNNING supported without schema warning",()=>{
  const r=evaluate();assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.consumer_state,"RUNNING");
  assert(!r.reasons.includes("CONSUMER_STATUS_SCHEMA_INVALID"));
});
check("v2 projection SKIPPED_LOCKED is not source-proof",()=>{
  const r=evaluate();assert.equal(r.verdict,"HEALTHY");
  assert(!Object.hasOwn(r,"ordersPublishable"));
  assert(!Object.hasOwn(r,"live_source_verified"));
});
check("v2 consumer FAILED is degraded",()=>{
  const r=evaluate(consumer("v2","FAILED"));assert.equal(r.verdict,"DEGRADED");
  assert(r.reasons.includes("CONSUMER_FAILED"));
});
check("v2 consumer STOPPED is degraded",()=>{
  const r=evaluate(consumer("v2","STOPPED"));assert.equal(r.verdict,"DEGRADED");
  assert(r.reasons.includes("CONSUMER_NOT_RUNNING"));
});
check("v2 consumer blank state cannot become healthy",()=>{
  const r=evaluate(consumer("v2",""));assert.equal(r.verdict,"DEGRADED");
  assert(r.reasons.includes("CONSUMER_STATUS_SCHEMA_INVALID"));
});
check("unrecognized consumer schema cannot become healthy",()=>{
  const r=evaluate(consumer("v3"));assert.equal(r.verdict,"DEGRADED");
  assert(r.reasons.includes("CONSUMER_STATUS_SCHEMA_INVALID"));
});
check("malformed consumer cannot become healthy",()=>{
  const r=evaluate({schema:"deliveryos.live-shadow-consumer-status.v2",
     state:{unknown:"RUNNING"}});assert.equal(r.verdict,"DEGRADED");
});
check("v1 RUNNING remains supported",()=>{
  const r=evaluate(consumer("v1"));assert.equal(r.verdict,"HEALTHY");
});
check("v1 FAILED remains degraded",()=>{
  const r=evaluate(consumer("v1","FAILED"));assert.equal(r.verdict,"DEGRADED");
});
check("stale heartbeat defeats v2 running claim",()=>{
  const h=heartbeat();h.written_at=stamp(120000);
  const r=evaluate(consumer(),h);assert.equal(r.verdict,"STALLED");
});
check("stale checkpoint defeats v2 running claim",()=>{
  const r=evaluate(consumer(),heartbeat(),now-600000);
  assert.equal(r.verdict,"STALLED");
});
check("missing consumer is not proof but legacy policy stays unchanged",()=>{
  const r=evaluate(null);assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.consumer_state,null);
});
// An intermittent SQL/Reader failure may be followed by a successful last
// batch; when a same-run baseline is provided, the health must not go green.
function pair(failuresNow=625,failuresBefore=620) {
  const h=heartbeat(),before=heartbeat();
  h.supervisor={run_id:"fictional-supervisor-run-1"};
  before.supervisor={run_id:"fictional-supervisor-run-1"};
  h.seq=210;before.seq=180;
  h.totals={failed:failuresNow};
  before.totals={failed:failuresBefore};
  before.written_at=stamp(5*60*1000);
  return {h,before};
}
function compare(h,before) {
  return review({nowMs:now,heartbeat:h,previousHeartbeat:before,
    consumerStatus:consumer(),checkpointMtimeMs:now-1000});
}
check("recovered last batch stays DEGRADED after new batch failures",()=>{
  const {h,before}=pair();
  assert.equal(h.last_batch.outcome,"OK");
  assert.equal(h.consecutive_failures,0);
  const r=compare(h,before);
  assert.equal(r.verdict,"DEGRADED");
  assert.equal(r.evidence.failure_delta_since_baseline,5);
  assert(r.reasons.includes("NEW_WATCHER_FAILURES_SINCE_BASELINE"));
});
check("unchanged counter across recent same-run snapshots stays healthy",()=>{
  const {h,before}=pair(620,620);
  const r=compare(h,before);
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,0);
});
check("regressed counter inside same run is inconsistent, not healthy",()=>{
  const {h,before}=pair(618,620);
  const r=compare(h,before);
  assert.equal(r.verdict,"DEGRADED");
  assert.equal(r.evidence.failure_delta_since_baseline,-2);
  assert(r.reasons.includes("WATCHER_FAILURE_COUNTER_REGRESSED"));
});
check("baseline from another supervisor run cannot fabricate a delta",()=>{
  const {h,before}=pair();
  before.supervisor.run_id="fictional-supervisor-run-2";
  const r=compare(h,before);
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});
check("old baseline is not classified as recent failure",()=>{
  const {h,before}=pair();
  before.written_at=stamp(5*60*60*1000);
  const r=compare(h,before);
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});
check("future baseline cannot fabricate a valid delta",()=>{
  const {h,before}=pair();
  before.written_at=stamp(-10000);
  const r=compare(h,before);
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});
check("replayed or unordered sequence cannot invent an interval",()=>{
  const {h,before}=pair();
  before.seq=h.seq;
  const r=compare(h,before);
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});
check("missing or malformed baseline counters do not grant trend proof",()=>{
  const {h,before}=pair();
  before.totals={failed:"not-number"};
  const r=compare(h,before);
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});
check("no baseline keeps legacy health semantics without historical claim",()=>{
  const r=evaluate();
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});

// CLI bridge: only existing *synthetic* files in an isolated temporary folder.
// Fail immediately if someone accidentally invokes these tests on the POS host.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const healthCli=path.resolve(__dirname,"../../runtime/tata-reader/tata_reader_health_v1.cjs");
function runCli(previousOverrides={},currentOverrides={}) {
  if(os.hostname().toUpperCase()==="CAIXA_MOOCA")
    throw Error("CASHIER_HOST_FORBIDDEN");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-reader-health-fixture-"));
  try {
    const {h,before}=pair();
    Object.assign(h,currentOverrides);
    Object.assign(before,previousOverrides);
    const currentFile=path.join(dir,"current.json");
    const previousFile=path.join(dir,"previous.json");
    const checkpointFile=path.join(dir,"checkpoint.json");
    fs.writeFileSync(currentFile,JSON.stringify(h),"utf8");
    fs.writeFileSync(previousFile,JSON.stringify(before),"utf8");
    fs.writeFileSync(checkpointFile,"SYNTHETIC_CHECKPOINT_ONLY","utf8");
    fs.utimesSync(checkpointFile,(now-1000)/1000,(now-1000)/1000);
    const beforeNames=fs.readdirSync(dir);
    const proc=spawnSync(process.execPath,[healthCli,
      "--heartbeat",currentFile,"--previous-heartbeat",previousFile,
      "--checkpoint",checkpointFile,"--now",new Date(now).toISOString()
    ],{encoding:"utf8",timeout:5000,maxBuffer:100000});
    assert.equal(proc.error,undefined,String(proc.error));
    assert.equal(proc.stderr,"");
    assert.deepEqual(fs.readdirSync(dir),beforeNames);
    const result=JSON.parse(proc.stdout);
    assert.equal(proc.status,result.exit_code);
    assert.equal(result.schema,"deliveryos.tata-reader-health.v1");
    return result;
  }finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
check("CLI reads two synthetic heartbeats and degrades recovered failures",()=>{
  const r=runCli();
  assert.equal(r.verdict,"DEGRADED");
  assert.equal(r.evidence.failure_delta_since_baseline,5);
  assert(r.reasons.includes("NEW_WATCHER_FAILURES_SINCE_BASELINE"));
});
check("CLI returns healthy only when synthetic failure counter is unchanged",()=>{
  const r=runCli({totals:{failed:625}});
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,0);
});
check("CLI invalidates comparison from another supervisor",()=>{
  const r=runCli({supervisor:{run_id:"another-fictional-supervisor"}});
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});
check("CLI invalidates stale previous heartbeat",()=>{
  const r=runCli({written_at:stamp(5*60*60*1000)});
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});
check("CLI flags regressed failure counter as partial",()=>{
  const r=runCli({totals:{failed:626}});
  assert.equal(r.verdict,"DEGRADED");
  assert(r.reasons.includes("WATCHER_FAILURE_COUNTER_REGRESSED"));
});
check("CLI cannot use missing prior heartbeat as trend evidence",()=>{
  const r=runCli({schema:"UNKNOWN_CHECKPOINT"});
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});
check("CLI refuses to classify replayed sequence as historical trend",()=>{
  const r=runCli({seq:210});
  assert.equal(r.verdict,"HEALTHY");
  assert.equal(r.evidence.failure_delta_since_baseline,null);
});

console.log("TATA_READER_CONSUMER_V2_HEALTH_GATE_PASS "+passed+"/"+passed+" SYNTHETIC_ONLY");

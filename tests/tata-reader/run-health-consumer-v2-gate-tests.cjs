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
console.log("TATA_READER_CONSUMER_V2_HEALTH_GATE_PASS "+passed+"/"+passed+" SYNTHETIC_ONLY");

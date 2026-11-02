"use strict";
/**
 * Offline comparison of two *sanitized aggregate* observations of the
 * EXISTING TataComandaReader on CAIXA_MOOCA.
 *
 * No IO, no raw file reads, no order-level data, no process/service action.
 * Input is an observation claim, NOT independently authenticated evidence.
 * The result always vetoes physical printing and never echoes input values.
 */
const SCHEMA="tata.comandas.itaim-live-aggregate-trend.v1.offline";
const INPUT_SCHEMA="tata.comandas.itaim-aggregate-sample.v1.sanitized";
const EFFECTS=Object.freeze({file_read:false,filesystem_write:false,sql:false,
 network:false,printer:false,spooler:false,service:false,
 sequence:false,fiscal:false,deploy:false});
const OBJ=(x,keys)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const NONNEG=x=>Number.isSafeInteger(x)&&x>=0;
function clock(s){
 if(typeof s!=="string"||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)$/.test(s))
  return NaN;
 const ms=Date.parse(s);
 if(!Number.isFinite(ms))return NaN;
 const [y,m,d,h,min,sec]=s.match(/\d+/g).slice(0,6).map(Number);
 if(m<1||m>12||d<1||d>31||h>23||min>59||sec>59||
    new Date(Date.UTC(y,m-1,d)).getUTCDate()!==d)return NaN;
 return ms;
}
const localShiftTime=s=>typeof s==="string"&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(s)?clock(s+"-03:00"):NaN;
function fail(reason){
 return {schema:SCHEMA,review_status:"HOLD_FOR_PRODUCTION",
  diagnostic_state:"INDETERMINATE",reasons:[reason],delta:null,
  host_name_proves_device_identity:false,
  live_source_independently_authenticated:false,
  first_native_dispatch_proven:false,physical_paper_proven:false,
  ready_count_is_print_permission:false,print_authorized:false,
  root_cause_confirmed:false,effects:EFFECTS};
}
function validate(s){
 if(!OBJ(s,["schema","host_name","captured_at","reader","shadow","projector","shift"])||
 s.schema!==INPUT_SCHEMA||s.host_name!=="CAIXA_MOOCA"||
 !Number.isFinite(clock(s.captured_at))||
 !OBJ(s.reader,["state","updated_at","last_success_at","last_batch_outcome",
  "consecutive_failures","totals"])||
 !OBJ(s.reader.totals,["batches","ok","failed","events_emitted"])||
 !OBJ(s.shadow,["state","updated_at","processed","ready","blocked",
  "reporting_envelopes","last_projection_status","last_error_present"])||
 !OBJ(s.projector,["state","updated_at","source_files","adapted_revisions",
  "failed_revisions"])||
 !OBJ(s.shift,["operational_date","valid_until_local"])||
 !["RUNNING","STOPPED","UNKNOWN"].includes(s.reader.state)||
 !["RUNNING","STOPPED","UNKNOWN"].includes(s.shadow.state)||
 !["PROJECTED","RUNNING","FAILED","UNKNOWN"].includes(s.projector.state)||
 !["OK","FAILED","UNKNOWN"].includes(s.reader.last_batch_outcome)||
 !["PROJECTED","FAILED","UNKNOWN"].includes(s.shadow.last_projection_status)||
 typeof s.shadow.last_error_present!=="boolean"||
 !/^\d{4}-\d\d-\d\d$/.test(s.shift.operational_date)||
 !Number.isFinite(localShiftTime(s.shift.valid_until_local)))return false;
 const rr=s.reader,sh=s.shadow,p=s.projector;
 if(![rr.consecutive_failures,...Object.values(rr.totals),sh.processed,sh.ready,
  sh.blocked,sh.reporting_envelopes,p.source_files,p.adapted_revisions,
  p.failed_revisions].every(NONNEG)||
 rr.totals.batches!==rr.totals.ok+rr.totals.failed||
 sh.processed!==sh.ready+sh.blocked||
 p.source_files<p.adapted_revisions+p.failed_revisions)return false;
 const at=clock(s.captured_at);
 for(const timestamp of [rr.updated_at,rr.last_success_at,sh.updated_at,p.updated_at]){
  const t=clock(timestamp);
  if(!Number.isFinite(t)||t>at+120000)return false;
 }
 return true;
}
function compareAggregateSamples(previous,current){
 if(!validate(previous)||!validate(current))
  return fail("SANITIZED_SAMPLE_INVALID_OR_UNSAFE");
 const before=clock(previous.captured_at),after=clock(current.captured_at);
 if(after<=before)return fail("SAMPLE_ORDER_NOT_MONOTONIC");
 const delta={
  batches:current.reader.totals.batches-previous.reader.totals.batches,
  ok_batches:current.reader.totals.ok-previous.reader.totals.ok,
  failed_batches:current.reader.totals.failed-previous.reader.totals.failed,
  emitted_events:current.reader.totals.events_emitted-
                 previous.reader.totals.events_emitted,
  processed:current.shadow.processed-previous.shadow.processed,
  ready:current.shadow.ready-previous.shadow.ready,
  blocked:current.shadow.blocked-previous.shadow.blocked,
  reporting_envelopes:current.shadow.reporting_envelopes-
                      previous.shadow.reporting_envelopes,
  adapted_revisions:current.projector.adapted_revisions-
                    previous.projector.adapted_revisions,
  failed_revisions:current.projector.failed_revisions-
                   previous.projector.failed_revisions
 };
 if(Object.values(delta).some(x=>!Number.isSafeInteger(x)||x<0))
  return fail("AGGREGATE_COUNTER_DECREASE_OR_PROCESS_RESTART");
 const reasons=[];
 const age=(t)=>(after-clock(t))/60000;
 const readerFresh=age(current.reader.updated_at)<=3;
 const shadowFresh=age(current.shadow.updated_at)<=3;
 const projectorFresh=age(current.projector.updated_at)<=20;
 const shiftEnd=localShiftTime(current.shift.valid_until_local);
 if(shiftEnd<after)reasons.push("SHIFT_STATE_EXPIRED");
 if(!readerFresh)reasons.push("READER_HEARTBEAT_STALE");
 if(!shadowFresh)reasons.push("SHADOW_STATUS_STALE");
 if(!projectorFresh)reasons.push("PROJECTOR_STATUS_STALE");
 if(current.reader.state!=="RUNNING"||
    current.reader.last_batch_outcome!=="OK"||
    current.reader.consecutive_failures>0)
  reasons.push("READER_LATEST_BATCH_NOT_CLEAR");
 if(current.shadow.state!=="RUNNING"||
    current.shadow.last_projection_status!=="PROJECTED"||
    current.shadow.last_error_present||
    current.projector.state!=="PROJECTED")
  reasons.push("SHADOW_OR_PROJECTOR_NOT_CLEAR");
 if(delta.failed_batches>0)reasons.push("NEW_WATCHER_BATCH_FAILURES");
 if(current.reader.totals.failed>0)reasons.push("HISTORICAL_FAILURES_UNEXPLAINED");
 if(delta.failed_revisions>0)reasons.push("NEW_ADAPTER_FAILURES");
 if(delta.ready>0)reasons.push("NEW_READY_IS_ONLY_SHADOW_STATE");
 if(delta.emitted_events!==delta.processed||
    delta.processed!==delta.reporting_envelopes||
    delta.reporting_envelopes!==delta.adapted_revisions)
  reasons.push("AGGREGATE_DELTA_NOT_ALIGNED_NO_ORDER_JOIN");
 else if(delta.emitted_events>0)
  reasons.push("AGGREGATE_DELTAS_ALIGN_NOT_ORDER_IDENTITY");
 // A healthy latest batch is not proof that a newly arriving order succeeded:
 // the 1000 observed snapshots may be duplicates only.
 if(delta.emitted_events===0)reasons.push("NO_NEW_EMITTED_EVENTS_IN_WINDOW");
 reasons.push("FIRST_NATIVE_PRINT_DISPATCH_NOT_OBSERVED");
 reasons.push("NO_PHYSICAL_PRINT_PROOF");
 const progress=delta.ok_batches>0&&readerFresh&&shadowFresh&&
  current.reader.state==="RUNNING"&&
  current.reader.last_batch_outcome==="OK"&&
  current.reader.consecutive_failures===0;
 return {schema:SCHEMA,review_status:"HOLD_FOR_PRODUCTION",
  diagnostic_state:progress?"RECENT_BATCH_PROGRESS_OBSERVED":"AGGREGATE_GAPS_REQUIRE_REVIEW",
  reasons:[...new Set(reasons)].sort(),delta,
  host_name_proves_device_identity:false,
  live_source_independently_authenticated:false,
  first_native_dispatch_proven:false,physical_paper_proven:false,
  ready_count_is_print_permission:false,print_authorized:false,
  root_cause_confirmed:false,effects:EFFECTS};
}
module.exports={INPUT_SCHEMA,SCHEMA,EFFECTS,compareAggregateSamples};

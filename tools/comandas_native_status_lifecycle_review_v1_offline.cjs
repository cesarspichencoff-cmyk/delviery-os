"use strict";
/*
 * READ-ONLY native order lifecycle evidence analyzer.
 * No status code (3, P, X, 4, A or any other) is granted production
 * meaning by this tool. Native revision order is not a print authorization.
 * Input is already observed, normalized envelope data; no DB/network/files.
 */
const SCHEMA="deliveryos.comandas.native-lifecycle-review.v1";
const sha=/^[a-fA-F0-9]{64}$/;
function empty(status,reason){
 return {schema:SCHEMA,status,reasons:reason?[reason]:[],
   observed_revisions:0,distinct_orders:0,changed_status_orders:0,
   repeated_snapshot_rows:0,status_revisions:{},transitions:{},
   print_authorized:false,sequence_authorized:false,
   status_semantics_proven:false,classification_authorized:false,
   status_transition_is_delivery_proof:false,privacy:"AGGREGATES_ONLY",
   effects:{sql_read:false,sql_write:false,network:false,
     printer:false,spooler:false,sequence_write:false}};
}
function strictObservedAt(raw){
 // Date.parse rolls invalid calendar days forward; order/revision ordering
 // must not be inferred from a normalized imaginary observation instant.
 const p=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
 if(!p)return null;
 const y=Number(p[1]),m=Number(p[2]),d=Number(p[3]);
 const leap=y%4===0&&(y%100!==0||y%400===0);
 const lengths=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(y<1||m<1||m>12||d<1||d>lengths[m-1]||
  Number(p[4])>23||Number(p[5])>59||Number(p[6])>59)return null;
 if(p[7]!=="Z"&&
  (Number(p[7].slice(1,3))>23||Number(p[7].slice(4,6))>59))return null;
 const n=Date.parse(raw);
 return Number.isFinite(n)?n:null;
}
function analyzeNativeLifecycle(data){
 const result=empty("HOLD");
 if(!Array.isArray(data)||!data.length)return empty("HOLD","INPUT_EMPTY_OR_INVALID");
 if(data.length>5000)return empty("HOLD","INPUT_BUDGET_EXCEEDED");
 const byKey=new Map();
 const revisions=new Map();
 for(const row of data){
  if(!row||typeof row!=="object"||Array.isArray(row)||
     typeof row.order_key!=="string"||row.order_key.split("|").length!==4||
     row.order_key.split("|").some(x=>!x.trim())||
     typeof row.snapshot_hash!=="string"||!sha.test(row.snapshot_hash)||
     typeof row.status!=="string"||!/^[A-Za-z0-9]{1,4}$/.test(row.status)||
     typeof row.origin!=="string"||!/^[A-Z0-9_]{4,12}$/.test(row.origin)||
     typeof row.observed_at!=="string"||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.observed_at)
  )return empty("HOLD","ROW_SCHEMA_INVALID");
  const time=strictObservedAt(row.observed_at);
  if(time===null)return empty("HOLD","ROW_TIMESTAMP_INVALID");
  const hash=row.snapshot_hash.toLowerCase(),key=row.order_key;
  const fingerprint=key+"|"+hash;
  const old=revisions.get(fingerprint);
  if(old){
   if(old.status!==row.status||old.origin!==row.origin)
    return empty("HOLD","SNAPSHOT_HASH_CONTRADICTS_STATUS_OR_ORIGIN");
   result.repeated_snapshot_rows++;
  }else revisions.set(fingerprint,{status:row.status,origin:row.origin});
  const series=byKey.get(key)||[];
  series.push({status:row.status,origin:row.origin,time,hash});
  byKey.set(key,series);
 }
 result.observed_revisions=data.length;
 result.distinct_orders=byKey.size;
 const transitions={};
 const statuses={};
 for(const series of byKey.values()){
  // The original events may arrive unordered. Stable sort, then deduplicate
  // the same hash; do not count retried identical emissions as new revisions.
  series.sort((a,b)=>a.time-b.time||a.hash.localeCompare(b.hash));
  // Identity/origin contradiction outranks ordering uncertainty. Report the
  // semantic cause even if two contradictory records share one timestamp.
  const firstOrigin=series[0].origin;
  if(series.some(entry=>entry.origin!==firstOrigin))
   return empty("HOLD","SAME_ORDER_KEY_MULTIPLE_ORIGINS");
  for(let k=1;k<series.length;k++){
   if(series[k].time===series[k-1].time){
    if(series[k].status!==series[k-1].status)
     return empty("HOLD","STATUS_TRANSITION_ORDER_AMBIGUOUS_SAME_OBSERVED_AT");
    // Two distinct payload hashes sharing the same observation instant
    // have no provable before/after ordering. Hash sorting is NOT a revision.
    // Same native status could still hide altered items or cancellations.
    if(series[k].hash!==series[k-1].hash)
     return empty("HOLD","NATIVE_REVISION_ORDER_AMBIGUOUS_SAME_OBSERVED_AT");
   }
  }
  const visited=new Set(),ordered=[];
  let initialOrigin=null,previousStatus=null,changed=false;
  for(const entry of series){
   if(initialOrigin===null)initialOrigin=entry.origin;
   if(entry.origin!==initialOrigin)return empty("HOLD","SAME_ORDER_KEY_MULTIPLE_ORIGINS");
   // A hash reappearing after a different snapshot may be a stale replay,
   // not a genuine return to a former state. Never infer that transition.
   if(visited.has(entry.hash)){
    if(entry.hash!==ordered[ordered.length-1]?.hash)
     return empty("HOLD","NONCONSECUTIVE_SNAPSHOT_REAPPEARANCE_AMBIGUOUS");
    continue;
   }
   visited.add(entry.hash);
   statuses[entry.status]=(statuses[entry.status]||0)+1;
   if(previousStatus!==null&&previousStatus!==entry.status){
    const pair=previousStatus+" -> "+entry.status;
    transitions[pair]=(transitions[pair]||0)+1;
    changed=true;
   }
   previousStatus=entry.status;
   ordered.push(entry);
  }
  if(changed)result.changed_status_orders++;
 }
 const sort=(o)=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)));
 result.status_revisions=sort(statuses);
 result.transitions=sort(transitions);
 result.status="EVIDENCE_ONLY_REVIEW";
 result.reasons=["NATIVE_STATUS_MEANING_NOT_ATTESTED",
 "STATUS_TRANSITION_NOT_RELEASE_OR_PRINT_AUTHORITY"];
 return result;
}
module.exports={SCHEMA,analyzeNativeLifecycle};

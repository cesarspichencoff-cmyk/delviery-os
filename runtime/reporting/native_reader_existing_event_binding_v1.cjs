'use strict';
// PURE checkpoint-to-previously-emitted-event binding. No I/O, SQL or process.
// Descriptor contains PRIVATE order identity: NEVER log/serialize/publish it.
// Only a separately approved local caller may use it to read ONE existing file.
const {review}=require('./native_reader_n2n3_sanitized_receipt_v1.cjs');
const SCHEMA='deliveryos.native-reader-existing-event-binding.v1';
const SOURCE_CHECKPOINT='deliveryos.tata-reader-continuous-checkpoint.v1';
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
// SQL native wall time has NO offset; check calendar validity without
// converting it to a UTC instant or assuming the host time zone.
const stamp=x=>{
 if(typeof x!=='string')return false;
 const m=/^(20\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?$/.exec(x);
 if(!m)return false;
 const [y,mo,d,h,mi,se]=m.slice(1).map(Number);
 const t=new Date(Date.UTC(y,mo-1,d,h,mi,se));
 return t.getUTCFullYear()===y&&t.getUTCMonth()+1===mo&&
  t.getUTCDate()===d&&t.getUTCHours()===h&&
  t.getUTCMinutes()===mi&&t.getUTCSeconds()===se;
};
const hold=reason=>Object.freeze({schema:SCHEMA,state:'HOLD',reason,
 checkpointBound:false,sourceVerified:false,completeSqlReadVerified:false,
 ordersPublishable:0,homePublishAuthorized:false,privateDescriptor:null});
function selectOne(checkpoint){
 try{
  if(!checkpoint||checkpoint.schema!==SOURCE_CHECKPOINT||
     checkpoint.bootstrap_complete!==true||
     !Array.isArray(checkpoint.entries)||
     checkpoint.entries.length===0||checkpoint.entries.length>250)
   return hold('CHECKPOINT_ENVELOPE_INVALID');
  // Validate EVERY entry before choosing, not just the first one.
  const seen=new Set();
  let previous=null;
  for(const e of checkpoint.entries){
   if(!e||typeof e!=='object'||Array.isArray(e)||
      typeof e.order_key!=='string')return hold('CHECKPOINT_ENTRY_INVALID');
   const segments=e.order_key.split('|');
   if(segments.length!==4||segments[0]!=='0001'||segments[1]!=='01'||
      !safe(segments[2])||!safe(segments[3])||seen.has(e.order_key))
    return hold('CHECKPOINT_SCOPE_KEY_OR_DUPLICATE_INVALID');
   seen.add(e.order_key);
   if(!stamp(e.last_seen_order_time))return hold('SOURCE_TIME_UNVERIFIED');
   if(previous!==null&&e.last_seen_order_time>previous)
    return hold('CHECKPOINT_ORDER_NOT_DESCENDING');
   previous=e.last_seen_order_time;
   if(typeof e.snapshot_hash!=='string'||
      !/^[0-9A-F]{64}$/.test(e.snapshot_hash)||
      (e.emitted_hash!==null&&!/^[0-9A-F]{64}$/.test(e.emitted_hash))||
      !Number.isSafeInteger(e.stable_count)||e.stable_count<1)
    return hold('CHECKPOINT_HASH_OR_STABILITY_INVALID');
  }
  const eligible=checkpoint.entries.filter(e=>e.stable_count>=2&&
    e.emitted_hash===e.snapshot_hash);
  if(eligible.length<1)return hold('NO_STABLE_EMITTED_REVISION');
  // Most recent textual order-open time, not proof of source freshness.
  const e=eligible[0],segments=e.order_key.split('|');
  const desc=Object.freeze({
    order_key:e.order_key,expected_hash:e.snapshot_hash,
    event_filename:segments[3]+'_'+e.snapshot_hash+'.json'
  });
  // Keep the descriptor available ONLY via explicit property access.
  // A generic JSON.stringify/log of selectOne() must never disclose the
  // native order key, filename or a stable content digest by accident.
  const result={
   schema:SCHEMA,state:'CANDIDATE_PRIVATE_UNVERIFIED',
   reason:null,checkpointBound:false,sourceVerified:false,
   completeSqlReadVerified:false,ordersPublishable:0,
   homePublishAuthorized:false
  };
  Object.defineProperty(result,'privateDescriptor',{
    enumerable:false,writable:false,configurable:false,value:desc
  });
  return Object.freeze(result);
 }catch{return hold('CHECKPOINT_REVIEW_EXCEPTION');}
}
function reviewOne(checkpoint,event){
 const candidate=selectOne(checkpoint);
 const denied=(reason)=>Object.freeze({
  schema:SCHEMA,state:'HOLD',reason,
  checkpointBound:false,n2StructureSelfConsistent:false,
  n3CanonicalHashSelfConsistent:false,sourceVerified:false,
  completeSqlReadVerified:false,sourceFreshnessVerified:false,
  ordersPublishable:0,homePublishAuthorized:false,
  customerDataExported:false,rawHashExported:false,
  rawOrderIdsExported:0,privateDescriptor:null
 });
 if(candidate.state!=='CANDIDATE_PRIVATE_UNVERIFIED')
  return denied(candidate.reason);
 try{
  const desc=candidate.privateDescriptor;
  if(!event||typeof event!=='object'||Array.isArray(event)||
     event.order_key!==desc.order_key||
     event.snapshot_hash!==desc.expected_hash)
   return denied('CHECKPOINT_EVENT_IDENTITY_OR_HASH_MISMATCH');
  const result=review(event);
  // No event IDs, basename, hash, customer fields or order payload in return.
  return Object.freeze({
   ...result,schema:SCHEMA,
   checkpointBound:result.n3CanonicalHashSelfConsistent===true&&
     result.n2StructureSelfConsistent===true,
   sourceVerified:false,completeSqlReadVerified:false,
   sourceFreshnessVerified:false,ordersPublishable:0,
   homePublishAuthorized:false,privateDescriptor:null
  });
 }catch{return denied('EVENT_BINDING_EXCEPTION');}
}
module.exports=Object.freeze({SCHEMA,selectOne,reviewOne});

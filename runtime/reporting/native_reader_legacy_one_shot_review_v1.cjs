'use strict';
// Explicit ONE-REVISION review of a historical, UNVERSIONED Reader V2 checkpoint.
// This is NOT the canonical V2 selector, a checkpoint migration or a field runner.
// Pure / no filesystem, SQL, process or network access. Never publish orders.
// A caller may use the private descriptor only under a separately authorized,
// silent, local, bounded one-file reader. "emitted_hash" alone does not prove
// that the file exists (legacy bootstrap can suppress initial emission).
const {review}=require('./native_reader_n2n3_sanitized_receipt_v1.cjs');
const SCHEMA='deliveryos.native-reader-legacy-one-shot-review.v1';
const CHECKPOINT='deliveryos.tata-reader-continuous-checkpoint.v1';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const upperHash=x=>typeof x==='string'&&/^[0-9A-F]{64}$/.test(x);
function wallTime(x){
 if(typeof x!=='string')return false;
 const m=/^(20\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?$/.exec(x);
 if(!m)return false;
 const [y,mo,d,h,mi,s]=m.slice(1).map(Number);
 const t=new Date(Date.UTC(y,mo-1,d,h,mi,s));
 return t.getUTCFullYear()===y&&t.getUTCMonth()+1===mo&&
  t.getUTCDate()===d&&t.getUTCHours()===h&&
  t.getUTCMinutes()===mi&&t.getUTCSeconds()===s;
}
const hold=(reason)=>Object.freeze({
 schema:SCHEMA,state:'HOLD',reason,legacyDiagnosticOnly:true,
 checkpointBound:false,sourceVerified:false,completeSqlReadVerified:false,
 sourceFreshnessVerified:false,ordersPublishable:0,homePublishAuthorized:false,
 customerDataExported:false,rawHashExported:false,rawOrderIdsExported:0,
 privateDescriptor:null
});
function selectOneLegacy(checkpoint){
 try{
  // Exactly the old shape, never an alias/upgrade of a canonical V2 record.
  if(!obj(checkpoint)||Object.keys(checkpoint).sort().join('|')!==
      'bootstrap_complete|entries|schema'||checkpoint.schema!==CHECKPOINT||
     checkpoint.bootstrap_complete!==true||!Array.isArray(checkpoint.entries)||
     checkpoint.entries.length<1||checkpoint.entries.length>250)
    return hold('LEGACY_CHECKPOINT_SHAPE_UNVERIFIED');
  const seen=new Set();let previous=null;
  for(const e of checkpoint.entries){
   if(!obj(e)||typeof e.order_key!=='string')
    return hold('LEGACY_ENTRY_INVALID');
   const k=e.order_key.split('|');
   if(k.length!==4||k[0]!=='0001'||k[1]!=='01'||
      !safe(k[2])||!safe(k[3])||seen.has(e.order_key))
    return hold('LEGACY_ITAIM_KEY_INVALID');
   seen.add(e.order_key);
   if(!wallTime(e.last_seen_order_time))
    return hold('LEGACY_WALL_TIME_UNVERIFIED');
   if(previous!==null&&e.last_seen_order_time>previous)
    return hold('LEGACY_CHECKPOINT_ORDER_INVALID');
   previous=e.last_seen_order_time;
   if(!upperHash(e.snapshot_hash)||
      (e.emitted_hash!==null&&!upperHash(e.emitted_hash))||
      !Number.isSafeInteger(e.stable_count)||e.stable_count<1)
    return hold('LEGACY_HASH_OR_STABILITY_INVALID');
  }
  const entry=checkpoint.entries.find(e=>e.stable_count>=2&&
    e.emitted_hash===e.snapshot_hash);
  if(!entry)return hold('NO_LEGACY_STABLE_CANDIDATE');
  const key=entry.order_key.split('|');
  const privateDescriptor=Object.freeze({
    order_key:entry.order_key,expected_hash:entry.snapshot_hash,
    event_filename:key[3]+'_'+entry.snapshot_hash+'.json'
  });
  const result={
    schema:SCHEMA,state:'PRIVATE_LEGACY_CANDIDATE_UNVERIFIED',
    reason:null,legacyDiagnosticOnly:true,checkpointBound:false,
    sourceVerified:false,completeSqlReadVerified:false,
    sourceFreshnessVerified:false,ordersPublishable:0,
    homePublishAuthorized:false,customerDataExported:false,
    rawHashExported:false,rawOrderIdsExported:0
  };
  Object.defineProperty(result,'privateDescriptor',{
    value:privateDescriptor,enumerable:false,writable:false,configurable:false
  });
  return Object.freeze(result);
 }catch{return hold('LEGACY_SELECTION_EXCEPTION');}
}
function reviewOneLegacy(checkpoint,event){
 const selected=selectOneLegacy(checkpoint);
 if(selected.state!=='PRIVATE_LEGACY_CANDIDATE_UNVERIFIED')
  return hold(selected.reason);
 try{
  const desc=selected.privateDescriptor;
  if(!obj(event)||event.order_key!==desc.order_key||
     event.snapshot_hash!==desc.expected_hash)
    return hold('LEGACY_EVENT_CHECKPOINT_MISMATCH');
  // The existing pure reviewer RECOMPUTES the canonical SHA-256 of the
  // unmodified event. Its success is only local self-consistency, not
  // source authentication or revision completeness.
  const r=review(event);
  return Object.freeze({
    ...r,schema:SCHEMA,legacyDiagnosticOnly:true,
    checkpointBound:r.n2StructureSelfConsistent===true&&
      r.n3CanonicalHashSelfConsistent===true,
    sourceVerified:false,completeSqlReadVerified:false,
    sourceFreshnessVerified:false,ordersPublishable:0,
    homePublishAuthorized:false,customerDataExported:false,
    rawHashExported:false,rawOrderIdsExported:0,privateDescriptor:null
  });
 }catch{return hold('LEGACY_REVIEW_EXCEPTION');}
}
module.exports=Object.freeze({SCHEMA,selectOneLegacy,reviewOneLegacy});

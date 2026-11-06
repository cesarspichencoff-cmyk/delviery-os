'use strict';
// Pure checkpoint/event consistency. Never returns the nonenumerable
// raw native descriptor, file name, order key or hash to the caller.
const {selectOne}=require('./native_reader_existing_event_binding_v1.cjs');
const {review}=require('./native_reader_n2n3_sanitized_receipt_v2.cjs');
const SCHEMA='deliveryos.native-reader-existing-event-binding.v2';
const bucket=n=>n===2?'2':n>=3&&n<=9?'3-9':
 n>=10&&n<=99?'10-99':n>=100?'100+':'UNKNOWN';
const deny=reason=>Object.freeze({...review(null),schema:SCHEMA,
  state:'HOLD',reason,checkpointBound:false,stabilityBucket:'UNKNOWN',
  sourceVerified:false,completeSqlReadVerified:false});
function reviewOne(checkpoint,event){
 try{
  const selected=selectOne(checkpoint);
  if(selected.state!=='CANDIDATE_PRIVATE_UNVERIFIED')
   return deny(selected.reason);
  const privateInfo=selected.privateDescriptor;
  if(!event||typeof event!=='object'||Array.isArray(event)||
     event.order_key!==privateInfo.order_key||
     event.snapshot_hash!==privateInfo.expected_hash)
   return deny('CHECKPOINT_EVENT_IDENTITY_OR_HASH_MISMATCH');
  const count=checkpoint.entries.find(e=>e.order_key===privateInfo.order_key)?.stable_count;
  const result=review(event);
  return Object.freeze({...result,schema:SCHEMA,
   checkpointBound:result.n3DigestBoundToContent===true&&
    result.n2StructureSelfConsistent===true,
   stabilityBucket:bucket(count),
   sourceVerified:false,completeSqlReadVerified:false,
   sourceFreshnessVerified:false,
   ordersPublishable:0,homePublishAuthorized:false,
   customerDataExported:false,rawHashExported:false,
   rawOrderIdsExported:0});
 }catch{return deny('EVENT_BINDING_EXCEPTION');}
}
module.exports=Object.freeze({SCHEMA,reviewOne});

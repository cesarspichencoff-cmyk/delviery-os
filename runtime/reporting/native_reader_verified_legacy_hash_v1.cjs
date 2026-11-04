'use strict';
// Pure, REVIEW-ONLY compatibility for the installed Reader V2's uppercase SHA.
// Does NOT attest SQL rowset atomicity, effective login, freshness or readiness.
// Preserves raw legacy digest in the checkpoint/file lookup; never writes files.
const {snapshotHash}=require('./native_reader_shadow_replay_v1.cjs');
function normalizeVerifiedLegacyNativeHashV1(event){
 const hold=reason=>Object.freeze({state:'HOLD',reason,event:null,
  liveSourceVerified:false,ordersPublishable:0,noActionExecuted:true});
 if(!event||typeof event!=='object'||Array.isArray(event)||
    event.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
    !event.order||typeof event.order!=='object'||Array.isArray(event.order))
    return hold('SOURCE_EVENT_INVALID');
 const received=event.snapshot_hash;
 if(typeof received!=='string'||!(/^[0-9A-F]{64}$/.test(received)||/^[0-9a-f]{64}$/.test(received)))
    return hold('LEGACY_SHA256_FORMAT_INVALID');
 const expected=snapshotHash(event.order);
 if(typeof expected!=='string'||received.toLowerCase()!==expected)
    return hold('LEGACY_HASH_BYTES_NOT_CANONICAL');
 // Only case-normalization after independently recomputing canonical SHA-256
 // using the already-shared consumer function. NO blind .toLowerCase().
 const canonicalEvent=received===expected?event:{...event,snapshot_hash:expected};
 return Object.freeze({state:'CANONICAL_SHAPE_REVIEW_ONLY',reason:null,
  event:canonicalEvent,legacyUppercaseConverted:received!==expected,
  liveSourceVerified:false,ordersPublishable:0,noActionExecuted:true});
}
module.exports={normalizeVerifiedLegacyNativeHashV1};

'use strict';
// One-caller-event N2/N3 shape and digest preflight, PURE and NO I/O.
// NEVER export raw orders/observations, native IDs or their stable hashes.
// Even PASSING SELF-CONSISTENCY does not prove SQL, iFood, coverage, consent,
// source clock, observation-read exhaustion or operational authorization.
const {normalizeVerifiedLegacyNativeHashV1:normalize}=
  require('./native_reader_verified_legacy_hash_v1.cjs');
const {review:reviewContract}=
  require('./native_reader_producer_contract_review_v1.cjs');

const SCHEMA='deliveryos.native-reader-n2n3-sanitized-receipt.v1';
const deny=(reason,info={})=>Object.freeze({
 schema:SCHEMA,state:'HOLD',reason,unit:'ITAIM',
 sourceKind:'CALLER_SUPPLIED_EVENT_NOT_AUTHENTICATED',
 n2StructureSelfConsistent:false,n2ObservationReadIndependentlyComplete:false,
 n3CanonicalHashSelfConsistent:false,sourceIdentityVerified:false,
 sourceFreshnessVerified:false,independentIfoodIdentityVerified:false,
 ordersPublishable:0,homePublishAuthorized:false,actionsExecuted:0,
 rawOrderIdsExported:0,customerDataExported:false,rawHashExported:false,
 itemRows:null,noteRows:null,legacyUppercaseNormalized:false,...info
});
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function review(event){
 try{
  if(!obj(event)||!obj(event.order)||
     !Array.isArray(event.order.items)||event.order.items.length>200||
     !Array.isArray(event.order.observation_rows)||
     event.order.observation_rows.length>400)
   return deny('REVIEW_ENVELOPE_OR_BOUNDS_INVALID');
  // No shell, database, filesystem, log, network, or persistent state.
  // Normalization only after comparing HASH BYTES with canonical JS hashing.
  const n=normalize(event);
  if(n.state!=='CANONICAL_SHAPE_REVIEW_ONLY')
   return deny(n.reason==='LEGACY_HASH_BYTES_NOT_CANONICAL'
     ?'N3_HASH_BYTES_NOT_CANONICAL':'N3_HASH_OR_ENVELOPE_INVALID');
  const c=reviewContract(n.event);
  if(c.canonicalContractChecked!==true)
   // The code comes from a finite internal validation vocabulary, not the event.
   return deny('N2_STRUCTURE_OR_NOTE_JOIN_INVALID',{detailCode:c.reason});
  return deny('N2_N3_SELF_CONSISTENT_SOURCE_UNATTESTED',{
   n2StructureSelfConsistent:true,n3CanonicalHashSelfConsistent:true,
   itemRows:c.itemRows,noteRows:c.noteRows,
   legacyUppercaseNormalized:n.legacyUppercaseConverted===true
  });
 }catch{return deny('REVIEW_EXCEPTION_HOLD');}
}
module.exports=Object.freeze({SCHEMA,review});

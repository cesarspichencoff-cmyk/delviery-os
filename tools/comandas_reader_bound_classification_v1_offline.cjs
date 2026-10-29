"use strict";
/**
 * Reader V2 native revision -> source-bound Academy classification review.
 * All three surfaces are REVIEW-ONLY. This verifies self-consistency of
 * supplied native event/decision pair; it does NOT authenticate the origin
 * independently or bind to a real first print, live service or iFood API.
 *
 * DO NOT pass a self-declared source claim as a proof of station/boxes/bags.
 * This module grants NO production effects and never reads order files/SQL.
 */
const {assessNativeReaderV2}=
 require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {reviewSourceBoundClassificationV1}=
 require("../dist/src/production/sourceBoundClassificationReviewV1.js");
const {PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const SCHEMA="tata.comandas.reader-v2-bound-classification.v1.offline";
const EFFECTS=Object.freeze({
 print:false,spooler_write:false,sql_read:false,sql_write:false,
 filesystem_read:false,filesystem_write:false,network:false,
 source_update:false,catalog_update:false,service_change:false,
 sequence_write:false,deploy:false
});
const reason=x=>({schema:SCHEMA,status:"HOLD",
 reasons:[x],review:null,item_count:0,
 native_pair_self_consistency_checked:false,
 exact_native_items_bound:false,independent_source_attested:false,
 classification_approved:false,packaging_approved:false,
 first_native_dispatch_proven:false,production_ready:false,
 print_authorized:false,effects:EFFECTS});
function bindNativeReview(pair,claims,sourceBlob=PACKAGING_SOURCE_BLOB_V63){
 let validated;
 try{validated=assessNativeReaderV2(pair);}
 catch{return reason("READER_PAIR_INVALID");}
 if(validated.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY")
  return reason("READER_PAIR_NOT_SELF_CONSISTENT");
 const order=pair.event.order,decision=pair.decision;
 if(order.CDFILIAL!=="0001"||order.CDLOJA!=="01")
  return reason("NOT_APPROVED_ITAIM_STORE_SCOPE");
 if(!Array.isArray(decision.items)||decision.items.length<1||
    decision.items.length>200)
  return reason("NATIVE_ITEM_SET_INVALID");
 const sources=decision.items.map((x,i)=>({
  item_index:i,product_code:x.canonical_code,
  product_name:x.product_name,quantity:x.quantity,
  observations:[],packaging_role:"UNKNOWN"
 }));
 let review;
 try{review=reviewSourceBoundClassificationV1(sources,claims,sourceBlob);}
 catch{return reason("SOURCE_BOUND_REVIEW_FAILED_CLOSED");}
 if(review.status!=="REVIEW_CANDIDATE_ONLY")
  return {...reason("CLASSIFICATION_REVIEW_NOT_APPROVED"),
   reasons:["CLASSIFICATION_REVIEW_NOT_APPROVED",...review.reasons],
   native_pair_self_consistency_checked:true,
   exact_native_items_bound:review.exact_code_name_quantity_index_checked};
 if(!review.exact_code_name_quantity_index_checked||
   review.current_catalog_homologation_proven!==false||
   review.provenance_independently_attested!==false||
   review.ready_for_automatic_operational_print!==false||
   review.entries.some(e=>e.station_proof!=="UNKNOWN"))
  return reason("REVIEW_PROMOTION_NOT_ALLOWED");
 return {schema:SCHEMA,status:"REVIEW_CANDIDATE_ONLY",
  reasons:[
   "READER_PAIR_SELF_CONSISTENCY_NOT_INDEPENDENT_ATTESTATION",
   "CLASSIFICATION_SOURCE_NOT_HOMOLOGATED"
  ],review,item_count:review.entries.length,
  native_pair_self_consistency_checked:true,exact_native_items_bound:true,
  independent_source_attested:false,classification_approved:false,
  packaging_approved:false,first_native_dispatch_proven:false,
  production_ready:false,print_authorized:false,effects:EFFECTS};
}
module.exports={SCHEMA,EFFECTS,bindNativeReview};

"use strict";
/**
 * Shared, pure native revision identity for V2 production writer / attester.
 * No lab allocator, SQLite constructor, filesystem, key, host, or printer.
 * Extraction of the eligibility rule from the disposable V2 lab; no policy
 * widening and no synthetic-bind side effects in production imports.
 */
const {assessNativeReaderV2}=require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {storeLocalTimeV1}=require("../dist/src/production/nativeReaderChainV1.js");
const {buildDailyStoreTataSequenceScope}=require("../dist/src/production/tataSequence.js");
function eligibleNativeRevisionV2(pair){
 let native;
 try{native=assessNativeReaderV2(pair);}catch{return {reason:"NATIVE_PAIR_INVALID"};}
 if(native.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY")
  return {reason:"NATIVE_REVISION_NOT_ELIGIBLE:"+(native.reasons||[]).join(",")};
 const o=pair.event.order,time=storeLocalTimeV1(o.DTHRABERMESA);
 if(!time)return {reason:"SOURCE_LOCAL_DAY_NOT_TRUSTED"};
 const store=o.CDFILIAL+"|"+o.CDLOJA;
 const scope=buildDailyStoreTataSequenceScope({store_id:store,operational_date:time.day}).scope_id;
 if(!scope)return {reason:"SOURCE_LOCAL_DAY_NOT_TRUSTED"};
 return {day:time.day,store,scope_id:scope,order_key:pair.event.order_key};
}
module.exports={eligibleNativeRevisionV2};

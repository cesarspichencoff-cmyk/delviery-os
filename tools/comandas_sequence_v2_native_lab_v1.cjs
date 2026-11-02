"use strict";
/**
 * TATÁ number V2 — native-pair binder over the DISPOSABLE SQLite lab.
 *
 * Contract (César, issue #102 and PR #135): 001 at the first order of each
 * Itaim store day; lunch and dinner share one sequence; replay, reprint,
 * restart and a new revision of the same order keep the binding; unique
 * (store, day, four-part native key) and (store, day, number); a number bound
 * to an order later canceled is never recycled.
 *
 * Levels, never merged (N.sequenceVerdictV1 is the reader of these claims):
 *   PREVIEW                     computed from a supplied V2 state; nothing stored
 *   CANDIDATE_PERSISTED_IN_LAB  bound + read back in a disposable lab DB
 *   LIVE_ATTESTED               NOT produced here: needs the real store state
 *                               and an independent attestation protocol
 *
 * Reuses, never forks: assessNativeReaderV2 (eligible native revision), the
 * store-local clock and daily scope of the native chain (tataSequence.ts),
 * inspectStrongKeySequence (V2 gap/collision policy) and the SQLite lab
 * (transaction, readback, immutable bindings). The lab only accepts TEST_
 * keys inside a disposable DB; the V1 writer and its commit guard are untouched.
 */
const {assessNativeReaderV2}=require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {inspectStrongKeySequence,STATE_SCHEMA}=require("./comandas_strong_key_sequence_v2_review_only.cjs");
const {bindSyntheticSequence}=require("./comandas_sequence_v2_sqlite_lab.cjs");
const {storeLocalTimeV1}=require("../dist/src/production/nativeReaderChainV1.js");
const {buildDailyStoreTataSequenceScope}=require("../dist/src/production/tataSequence.js");
const SCHEMA="tata.comandas.sequence-v2-native-lab.v1";
const EFFECTS=Object.freeze({disposable_sqlite_write:true,operational_sequence_write:false,
 host:false,sql:false,print:false,spooler:false,network:false,service:false});

function result(level,status,reason,extra={}){
 return {schema:SCHEMA,level,status,reason,live_attested:false,
  number_for_operational_ticket:null,print_authorized:false,effects:EFFECTS,...extra};
}
function eligible(pair){
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
const claim=(level,e,number)=>({level,persisted:level!=="PREVIEW",attested_independently:false,
 order_key:e.order_key,scope_id:e.scope_id,tata_sequence:number});

/** PREVIEW: what the V2 policy would do with a supplied state. Stores nothing. */
function previewNativeSequenceV2(pair,state){
 const e=eligible(pair);
 if(e.reason)return result(null,"HOLD",e.reason);
 const v=inspectStrongKeySequence({pair,state});
 if(v.status==="STRONG_KEY_CANDIDATE_NOT_PERSISTED")
  return result("PREVIEW","PREVIEW_ONLY",v.reason,{preview_number:v.hypothetical_next_value,
   reused:false,day:e.day,chain_binding:claim("PREVIEW",e,v.hypothetical_next_value)});
 if(v.status==="STRONG_KEY_PRESENT_IN_SUPPLIED_STATE_NOT_ATTESTED")
  return result("PREVIEW","PREVIEW_ONLY",v.reason,{preview_number:v.review_binding_number,
   reused:true,day:e.day,chain_binding:claim("PREVIEW",e,v.review_binding_number)});
 return result(null,"HOLD",v.reason);
}

/** CANDIDATE_PERSISTED_IN_LAB: atomic bind + readback in a disposable DB. */
function bindNativeRevisionInLabV2(db,pair){
 const e=eligible(pair);
 if(e.reason)return result(null,"HOLD",e.reason);
 const r=bindSyntheticSequence(db,{lab_context:"EPHEMERAL_CI_FIXTURE_ONLY",
  store:e.store,date:e.day,native_order_key:e.order_key});
 if(r.status!=="SYNTHETIC_ATOMIC_BIND_READBACK_ONLY"&&r.status!=="SYNTHETIC_REUSE_RECHECKED")
  return result(null,"HOLD",r.reason,{lab_effect_may_have_occurred:r.lab_effect_may_have_occurred===true});
 return result("CANDIDATE_PERSISTED_IN_LAB","LAB_BOUND_READ_BACK","LAB_ONLY_NOT_LIVE_ATTESTED",
  {lab_number:r.lab_sequence,reused:r.reused,day:e.day,
   chain_binding:claim("CANDIDATE_PERSISTED_IN_LAB",e,r.lab_sequence)});
}

/** Lab DB content as a V2 state, so the SAME V2 policy re-checks it. */
function exportLabStateV2(db){
 const rows=db.prepare("SELECT scope,order_key,seq FROM test_tata_seq_bind ORDER BY scope,seq").all();
 return {schema:STATE_SCHEMA,policy:{width:3,min_value:1,max_value:999},
  bindings:rows.map(r=>({scope_id:r.scope.replace(/^STORE:([^|]+)\|([^|]+)\|DATE:/,"STORE:$1/$2|DATE:"),
   native_order_key:r.order_key,tata_sequence:String(r.seq).padStart(3,"0")}))};
}
module.exports={SCHEMA,EFFECTS,previewNativeSequenceV2,bindNativeRevisionInLabV2,exportLabStateV2,
 eligibleNativeRevisionV2:eligible};

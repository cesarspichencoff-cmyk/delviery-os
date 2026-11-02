"use strict";
/**
 * Pure sequence inspection for the V2 native three-view source.
 * Existing V1 state binds STORE+DATE+NRCOMANDA, not the full native strong key.
 * Consequently no reported state or candidate proves a sequence usable on
 * paper. This module NEVER allocates or commits an operational number.
 */
const {assessNativeReaderV2}=require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {planDailyStoreTataSequence}=
 require("../dist/src/production/tataSequence.js");
const SCHEMA="tata.comandas.sequence-v2-reconciliation.v1.review-only";
const EFFECTS=Object.freeze({
 filesystem_read:false,filesystem_write:false,sequence_write:false,
 sequence_allocate:false,sequence_commit:false,print:false,reprint:false,
 spooler:false,sql_read:false,sql_write:false,service:false,install:false,
 deploy:false,network:false,fiscal:false
});
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const SEQ=/^[0-9]{3}$/;
const SCOPE=/^STORE:([A-Za-z0-9_-]{1,64})\|DATE:(\d{4}-\d{2}-\d{2})$/;
function day(s){
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const t=new Date(s+"T00:00:00Z");
 return !Number.isNaN(t.valueOf())&&t.toISOString().slice(0,10)===s;
}
function result(status,reason,detail={}){
 return {schema:SCHEMA,status,reason,
  candidate_is_persisted:false,
  sequence_persisted_proven:false,
  strong_order_binding_proven:false,
  live_sequence_attested_here:false,
  number_for_operational_ticket:null,
  authorizes_sequence_commit:false,
  authorizes_first_print:false,
  automatic_retry_allowed:false,
  current_state_read_by_this_module:false,
  effects:EFFECTS,...detail};
}
function inspectSequenceForNativeV2(input){
 const review=assessNativeReaderV2(input?.pair);
 if(review.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY")
  return result("HOLD","NATIVE_READER_V2_SOURCE_NOT_CONSISTENT");
 const o=input.pair.event.order;
 const state=input.state;
 if(!state||typeof state!=="object"||Array.isArray(state)||
    state.schema!=="deliveryos.tata-sequence-state.v1"||
    !state.policy||state.policy.width!==3||
    state.policy.min_value!==1||state.policy.max_value!==999||
    !Number.isInteger(state.next_value)||state.next_value<1||state.next_value>1000||
    !Array.isArray(state.bindings)||state.bindings.length>200000)
  return result("HOLD","SEQUENCE_STATE_OR_POLICY_INVALID");
 const byScopeOrder=new Set(),byScopeNumber=new Map();
 for(const b of state.bindings){
  if(!b||typeof b!=="object"||Array.isArray(b)||
     !SCOPE.test(b.scope_id||"")||!day(b.scope_id.slice(-10))||
     !ID.test(b.teknisa_order_id||"")||!SEQ.test(b.tata_sequence||"")||
     Number(b.tata_sequence)<1||Number(b.tata_sequence)>999)
   return result("HOLD","SEQUENCE_EXISTING_BINDING_FORMAT_INVALID");
  const scopeOrder=b.scope_id+"|"+b.teknisa_order_id;
  const scopeNum=b.scope_id+"|"+b.tata_sequence;
  if(byScopeOrder.has(scopeOrder))
   return result("HOLD","SEQUENCE_DUPLICATE_ORDER_BINDING");
  byScopeOrder.add(scopeOrder);
  const prior=byScopeNumber.get(scopeNum);
  if(prior!==undefined&&prior!==b.teknisa_order_id)
   return result("HOLD","SEQUENCE_COLLISION_SAME_DAY_STORE");
  byScopeNumber.set(scopeNum,b.teknisa_order_id);
 }
 // Only the order's *native* store and the native store-local date may scope
 // this proposal. Never use an iFood merchant number as the native store.
 const store=o.CDFILIAL;
 const date=o.DTHRABERMESA.slice(0,10);
 const nativeId=o.NRCOMANDA;
 if(!ID.test(store)||!day(date)||!ID.test(nativeId))
  return result("HOLD","NATIVE_SCOPE_OR_ORDER_INVALID");
 const scopeId="STORE:"+store+"|DATE:"+date;
 const current=state.bindings.filter(b=>b.scope_id===scopeId&&
                                     b.teknisa_order_id===nativeId);
 if(current.length>1)
  return result("HOLD","SEQUENCE_DUPLICATE_ORDER_BINDING");
 const proposed=planDailyStoreTataSequence(state,{
  store_id:store,operational_date:date},nativeId);
 if(!proposed.ready||!proposed.assignment||
    proposed.blocking_reasons.length>0)
  return result("HOLD","SEQUENCE_PLANNER_REFUSED",{
   planner_blockers:Array.isArray(proposed.blocking_reasons)
    ?[...proposed.blocking_reasons]:[]});
 const assignment=proposed.assignment;
 if(assignment.scope_id!==scopeId||assignment.teknisa_order_id!==nativeId||
    !SEQ.test(assignment.tata_sequence))
  return result("HOLD","SEQUENCE_PLANNER_IDENTITY_MISMATCH");
 if(current.length===1){
  if(!proposed.reused_existing||
     assignment.tata_sequence!==current[0].tata_sequence)
   return result("HOLD","SEQUENCE_EXISTING_REUSE_CONFLICT");
  return result("EXISTING_BINDING_IN_SUPPLIED_STATE_NOT_ATTESTED",
   "STRONG_ORDER_KEY_AND_EXTERNAL_PERSISTENCE_NOT_ATTESTED",{
   is_new_binding_candidate:false,
   hypothetical_next_value:null,
   historical_binding_count:state.bindings.length,
   next_action:"INDEPENDENT_STRONG_KEY_BIND_AND_STATE_READBACK_REQUIRED"});
 }
 if(proposed.reused_existing)
  return result("HOLD","UNEXPECTED_SEQUENCE_REUSE");
 return result("CANDIDATE_ONLY_NOT_PERSISTED",
  "AUTHORIZED_ATOMIC_BIND_AND_VERIFIED_STRONG_ORDER_KEY_REQUIRED",{
  is_new_binding_candidate:true,
  hypothetical_next_value:assignment.tata_sequence,
  historical_binding_count:state.bindings.length,
  next_action:"SEPARATELY_AUTHORIZED_ATOMIC_BIND_RECHECK_THEN_INDEPENDENT_READBACK"
 });
}
module.exports={inspectSequenceForNativeV2,SCHEMA,EFFECTS};

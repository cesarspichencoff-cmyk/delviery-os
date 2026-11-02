"use strict";
/**
 * A non-authoritative V2 state inspection with complete native identity:
 * CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA + store-local open date.
 * Legacy V1 states cannot silently be treated as full-key persisted records.
 *
 * NO migration/write/number allocation, no native first-dispatch attestation.
 */
const {assessNativeReaderV2}=require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const SCHEMA="tata.comandas.strong-key-sequence-reconciliation.v2.review-only";
const STATE_SCHEMA="tata.comandas.strong-key-sequence-state.v2.review-only";
const EFFECTS=Object.freeze({host_read:false,filesystem_read:false,
 filesystem_write:false,sequence_allocate:false,sequence_write:false,
 print:false,spooler_write:false,sql_read:false,sql_write:false,
 network:false,service:false,install:false,deploy:false});
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const SEQ=/^(?!000)[0-9]{3}$/;
const SCOPE=/^STORE:([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})\|DATE:(\d{4}-\d{2}-\d{2})$/;
const KEY=/^[A-Za-z0-9_-]{1,64}(?:\|[A-Za-z0-9_-]{1,64}){3}$/;
function validDay(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+"T00:00:00Z");
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;
}
function verdict(status,reason,detail={}){
 return {schema:SCHEMA,status,reason,
  current_state_independently_attested:false,
  source_currently_attested:false,strong_order_binding_proven:false,
  sequence_persisted_proven:false,
  native_first_dispatch_proven:false,
  numbering_ready_for_operational_use:false,
  print_authorized:false,automatic_retry_allowed:false,
  actual_operational_sequence:null,
  effects:EFFECTS,...detail};
}
function inspectStrongKeySequence(input){
 let native;
 try{native=assessNativeReaderV2(input?.pair);}
 catch{return verdict("HOLD","INVALID_READER_PAIR");}
 if(native.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY")
  return verdict("HOLD","NATIVE_READER_REVISION_NOT_CONSISTENT");
 const o=input.pair.event.order;
 if(o.CDFILIAL!=="0001"||o.CDLOJA!=="01")
  return verdict("HOLD","NOT_ITAIM_STORE_UNIT");
 const sourceDay=o.DTHRABERMESA.slice(0,10);
 if(!validDay(sourceDay)||![o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].every(v=>
  typeof v==="string"&&ID.test(v)))
  return verdict("HOLD","NATIVE_STRONG_KEY_OR_DAY_INVALID");
 const orderKey=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
 if(input.pair.event.order_key!==orderKey)
  return verdict("HOLD","NATIVE_STRONG_KEY_MISMATCH");
 const state=input.state;
 if(!state||typeof state!=="object"||Array.isArray(state))
  return verdict("HOLD","STATE_MISSING");
 if(state.schema==="deliveryos.tata-sequence-state.v1")
  return verdict("HOLD","LEGACY_SHORT_KEY_STATE_REQUIRES_INDEPENDENT_MIGRATION");
 if(state.schema!==STATE_SCHEMA||!state.policy||
   state.policy.width!==3||state.policy.min_value!==1||
   state.policy.max_value!==999||!Array.isArray(state.bindings)||
   state.bindings.length>200000)
  return verdict("HOLD","V2_STATE_OR_POLICY_INVALID");
 const byOrder=new Set(),bySequence=new Set();
 for(const b of state.bindings){
  if(!b||typeof b!=="object"||Array.isArray(b)||
   typeof b.scope_id!=="string"||typeof b.native_order_key!=="string"||
   typeof b.tata_sequence!=="string")
   return verdict("HOLD","V2_BINDING_SHAPE_INVALID");
  const match=b.scope_id.match(SCOPE);
  if(!match||!validDay(match[3])||!KEY.test(b.native_order_key)||
     b.native_order_key.split("|")[0]!==match[1]||
     b.native_order_key.split("|")[1]!==match[2]||
     !SEQ.test(b.tata_sequence))
   return verdict("HOLD","V2_BINDING_SCOPE_KEY_OR_NUMBER_INVALID");
  const id=b.scope_id+"|"+b.native_order_key,number=b.scope_id+"|"+b.tata_sequence;
  if(byOrder.has(id))
   return verdict("HOLD","V2_DUPLICATE_ORDER_BINDING");
  if(bySequence.has(number))
   return verdict("HOLD","V2_SEQUENCE_COLLISION");
  byOrder.add(id);bySequence.add(number);
 }
 const scope="STORE:"+o.CDFILIAL+"/"+o.CDLOJA+"|DATE:"+sourceDay;
 const scoped=state.bindings.filter(b=>b.scope_id===scope);
 // The daily counter is a gap-free append-only ledger. A missing 001,
 // a deleted intermediate number or an altered persisted number cannot be
 // papered over by choosing max+1. Canceled orders keep their bindings.
 const orderedNumbers=scoped.map(b=>Number(b.tata_sequence)).sort((a,b)=>a-b);
 if(orderedNumbers.some((number,index)=>number!==index+1))
  return verdict("HOLD","V2_DAILY_SEQUENCE_GAP_OR_NONCONTIGUOUS");
 const matches=scoped.filter(b=>b.native_order_key===orderKey);
 if(matches.length>1)return verdict("HOLD","V2_DUPLICATE_ORDER_BINDING");
 if(matches.length===1)return verdict(
  "STRONG_KEY_PRESENT_IN_SUPPLIED_STATE_NOT_ATTESTED",
  "V2_STATE_AND_READER_SOURCE_NOT_INDEPENDENTLY_ATTESTED",{
   candidate_reuses_supplied_binding:true,
   review_binding_number:matches[0].tata_sequence
  });
 const max=scoped.reduce((n,b)=>Math.max(n,Number(b.tata_sequence)),0);
 if(max>=999)return verdict("HOLD","V2_SEQUENCE_EXHAUSTED");
 const candidate=String(max+1).padStart(3,"0");
 return verdict("STRONG_KEY_CANDIDATE_NOT_PERSISTED",
  "AUTHORIZED_ATOMIC_V2_BIND_AND_STRONG_KEY_READBACK_REQUIRED",{
  candidate_reuses_supplied_binding:false,
  hypothetical_next_value:candidate
 });
}
module.exports={SCHEMA,STATE_SCHEMA,EFFECTS,inspectStrongKeySequence};

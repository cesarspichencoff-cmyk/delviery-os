"use strict";
/**
 * TATÁ Comanda V8.58 — missing production sequence is a REAL remaining
 * execution boundary, not a reason to lie in the preview.
 *
 * This is a read-only preflight around the EXISTING daily-store sequence
 * planner and V8.57 Reader adapter. It never commits any plan or suggests
 * that a shadow candidate is an allocated sequence.
 * No host, printer, database, filesystem write, or network interaction.
 */
const {planDailyStoreTataSequence}=require("../dist/src/production/tataSequence.js");
const {projectReaderEssentials}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const SCHEMA="tata.comanda.sequence-preflight.v858.review-only";
const EFFECTS=Object.freeze({
 print:false,spooler:false,api:false,sql:false,network:false,
 sequence_write:false,sequence_allocate:false,sequence_commit:false,
 filesystem_write:false,ack:false,fiscal:false,sefaz:false,deploy:false
});
const safe=x=>typeof x==="string"&&x.length>0&&x.length<120;
function verdict(status,reason,details={}){
 return {schema:SCHEMA,status,reason,
  sequence_persisted_proven:false,essential_preview_ready:false,
  printing_ready:false,operator_approval_verified:false,
  candidate_is_binding:false,
  next_action:"REVIEW_SOURCE_ONLY",
  preview_lines:[],essential:null,proposed_state:null,
  effects:EFFECTS,...details};
}
function inspectTataSequencePreflight(input){
 try {
  const order=input?.event?.order,state=input?.sequence_state;
  if(!order||!state||state.schema!=="deliveryos.tata-sequence-state.v1"||
     state.policy?.width!==3||state.policy?.min_value!==1||
     state.policy?.max_value!==999||
     !Array.isArray(state.bindings)||
     !safe(order.CDFILIAL)||!safe(order.NRCOMANDA)||
     typeof order.DTHRABERMESA!=="string")
   return verdict("HOLD","READER_OR_SEQUENCE_STATE_INVALID");
  const date=order.DTHRABERMESA.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    Number.isNaN(Date.parse(date+"T00:00:00Z"))||
    new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)
   return verdict("HOLD","OPERATIONAL_DATE_INVALID");
  // Existing binding must be checked BEFORE planning another one.
  // The v8.57 adapter independently verifies the watcher snapshot,
  // decision fingerprint, product IDs, quantities, notes and identity.
  const live=projectReaderEssentials(input);
  if(live.status==="SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD"){
   return verdict("EXISTING_SEQUENCE_PREVIEW_HOLD",
      "PERSISTED_SEQUENCE_REUSED_NOT_PRINT_AUTHORITY",{
     sequence_persisted_proven:true,essential_preview_ready:true,
     next_action:"SOURCE_AUTHENTICITY_AND_PRINT_PILOT_STILL_REQUIRED",
     essential:live.essential,preview_lines:live.preview_lines
   });
  }
  const plan=planDailyStoreTataSequence(state,{
   store_id:order.CDFILIAL,operational_date:date},order.NRCOMANDA);
  if(plan.schema!=="deliveryos.tata-sequence-plan.v1"||
     plan.ready!==true||!plan.assignment||!plan.next_state||
     plan.blocking_reasons.length)
   return verdict("HOLD","EXISTING_SEQUENCE_PLANNER_BLOCKED");
  if(plan.reused_existing)
   return verdict("HOLD","EXISTING_BINDING_OR_READER_INTEGRITY_INVALID");
  const proposed=plan.next_state;
  // This synthetic in-memory assignment is ONLY a validator of what would
  // become possible AFTER a separately authorized and verified atomic commit.
  const hypothetical=projectReaderEssentials({...input,sequence_state:proposed});
  if(hypothetical.status!=="SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD")
   return verdict("HOLD","READER_CONTENT_NOT_VALID_FOR_SEQUENCE_BIND");
  return verdict("AUTHORIZED_ATOMIC_BIND_REQUIRED",
   "CANDIDATE_IS_NOT_PERSISTED_SEQUENCE",{
    next_action:"AUTHORIZED_TATA_SEQUENCE_ATOMIC_BIND_V1_THEN_RE_READ_AND_COMPARE",
    hypothetical_content_validated:true
   });
 } catch {
  return verdict("HOLD","SEQUENCE_PREFLIGHT_INPUT_OR_PLANNER_ERROR");
 }
}
module.exports={inspectTataSequencePreflight,SCHEMA,EFFECTS};

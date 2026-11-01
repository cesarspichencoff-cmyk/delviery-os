"use strict";
/**
 * Private-order note triage derived from one validated native Reader V2
 * snapshot. Outputs only note source fields, line indexes and counts.
 * No note text, product names, customer data, native order/line IDs or print.
 *
 * A triage inventory is never a note-disposition or station approval.
 */
const {assessNativeReaderV2}=require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const SCHEMA="tata.comandas.native-observation-triage.v1.review-only";
const EFFECTS=Object.freeze({print:false,spooler_write:false,
 sql_read:false,sql_write:false,filesystem_read:false,
 filesystem_write:false,network:false,sequence_write:false,
 service_change:false,deploy:false});
const FIELDS=new Set(["DSOBSDESCIT","DSOBSPEDDIGCMD","TXPRODCOMVEN"]);
function result(status,reason,revision=null,entries=[]){
 return {schema:SCHEMA,status,reason,source_revision_sha256:revision,
  note_count:entries.length,entries,
  every_note_requires_explicit_disposition:entries.length>0,
  disposition_approved:false,classification_approved:false,
  first_native_dispatch_proven:false,ready_for_operational_print:false,
  print_authorized:false,effects:EFFECTS};
}
function triageReaderObservations(pair){
 let assessed;
 try{assessed=assessNativeReaderV2(pair);}
 catch{return result("HOLD","INVALID_NATIVE_REVISION");}
 if(assessed.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY")
  return result("HOLD","NATIVE_PAIR_NOT_SELF_CONSISTENT");
 if(pair.event.order.CDFILIAL!=="0001"||pair.event.order.CDLOJA!=="01")
  return result("HOLD","NOT_ITAIM_SCOPE");
 const observations=pair.event.order.observation_rows;
 if(observations.length>601)return result("HOLD","TOO_MANY_NOTES");
 const items=pair.event.order.items;
 const entries=[];
 for(const o of observations){
  if(!o||o.join_proven!==true||typeof o.value!=="string"||
     (o.scope_hint==="item"&&
      (!FIELDS.has(o.source_field)||!Number.isInteger(o.item_index)||
       o.item_index<0||o.item_index>=items.length||
       o.CDPRODUTO!==items[o.item_index].CDPRODUTO))||
     (o.scope_hint==="order"&&o.source_field!=="DSOBSCOMANDA")||
     !["item","order"].includes(o.scope_hint))
    return result("HOLD","OBSERVATION_SCOPE_INVALID");
  entries.push({
   note_index:entries.length+1,
   scope:o.scope_hint==="item"?"ITEM":"ORDER",
   item_index:o.scope_hint==="item"?o.item_index+1:null,
   source_field:o.source_field,
   review_state:"UNCLASSIFIED",
   may_route_to_production:false,may_route_to_conference:false
  });
 }
 // No content hashing in the output: low-entropy allergy/omission strings
 // should not acquire a reversible offline hash oracle. The already
 // verified native snapshot binds this inventory to the full note content.
 return result(entries.length?"TRIAGE_PENDING":"NO_OBSERVATIONS",
  entries.length?"EXPLICIT_DISPOSITION_REQUIRED":"NOTHING_TO_TRIAGE",
  pair.event.snapshot_hash,entries);
}
module.exports={SCHEMA,EFFECTS,triageReaderObservations};

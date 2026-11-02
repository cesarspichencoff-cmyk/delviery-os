"use strict";
/**
 * Read-only evidence of a single native Reader V2 EVENT + shadow DECISION.
 * This validates paired content for the THREE review surfaces without the
 * V8.57 legacy fiction that real orders/items all use state "A".
 *
 * Native states 3/P/X and item 4 are accepted for EVIDENCE ANALYSIS ONLY;
 * no state is translated into a first-print event or into a print grant.
 * Item 6 (cancelled in inspected Odhen source), order 4 and any unknown
 * or partially mixed state are HOLD. No sequence is allocated or claimed.
 * iFood-to-Teknisa crosscheck belongs ONLY to the conference source scope.
 *
 * Pure: no IO, no networking, no persistent secrets, no order-content output.
 */
const {snapshotHash,decisionHash}=
 require("./tata_comanda_reader_native_essentials_v857_offline.cjs");
const {assessViewSourceScopes}=
 require("./comandas_view_source_scope_v1_offline.cjs");
const SCHEMA="tata.comandas.reader-v2-view-evidence.v1.review-only";
const EFFECTS=Object.freeze({
 print:false,reprint:false,spooler:false,sql_read:false,sql_write:false,
 sequence_allocate:false,sequence_write:false,api:false,network:false,
 fiscal:false,service:false,install:false,deploy:false
});
const SHA=/^[a-f0-9]{64}$/i;
const ID=/^[A-Z0-9_-]{1,48}$/;
const QTY=/^0*[1-9][0-9]*(?:\.0+)?$/;
const CODE=/^[A-Z0-9]\.[A-Z0-9]{2}\.[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{2}$/;
const sha=x=>typeof x==="string"&&SHA.test(x);
const str=x=>typeof x==="string"&&x.length>0&&x.length<=2000&&
 x===x.trim()&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(x);
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function dayOf(s){
 if(typeof s!=="string")return null;
 const day=s.slice(0,10);
 if(!/^\d{4}-\d\d-\d\d$/.test(day))return null;
 const t=new Date(day+"T00:00:00Z");
 return Number.isNaN(t.valueOf())||t.toISOString().slice(0,10)!==day
  ?null:day;
}
function canonical(raw){
 if(typeof raw!=="string"||raw!==raw.trim())return null;
 const c=raw.toUpperCase();
 const full=CODE.test(c)?c:
  /^[A-Z0-9]{10}$/.test(c)
   ?[c.slice(0,1),c.slice(1,3),c.slice(3,5),c.slice(5,8),c.slice(8,10)].join(".")
   :null;
 return full;
}
function reject(reason){
 return {schema:SCHEMA,status:"HOLD",reasons:[reason],
  revision_consistency_checked:false,source_independently_attested:false,
  first_production_event_proven:false,sequence_binding_proven:false,
  ready_for_operational_print:false,print_authorized:false,
  source_review:assessViewSourceScopes({}),
  effects:EFFECTS};
}
function assessNativeReaderV2(input){
 if(!input||typeof input!=="object"||Array.isArray(input))
  return reject("INPUT_INVALID");
 const {event:e,decision:d}=input;
 if(!e||!d||e.schema!=="deliveryos.tata-reader-stable-order-event.v1"||
  d.schema!=="deliveryos.live-shadow-decision.v1"||
  !e.order||!Array.isArray(e.order.items)||
  !Array.isArray(e.order.observation_rows)||
  !Array.isArray(d.items)||!Array.isArray(d.order_observations))
  return reject("NATIVE_READER_PAIR_SCHEMA_INVALID");
 const o=e.order;
 const day=dayOf(o.DTHRABERMESA);
 const parts=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA];
 const key=parts.join("|");
 if(!day||parts.some(v=>typeof v!=="string"||!ID.test(v))||
   typeof o.NRCOMANDAEXT!=="string"||!/^[0-9]{1,12}$/.test(o.NRCOMANDAEXT)||
   o.IDORGCMDVENDA!=="DLV_IFO"||
   e.order_key!==key||d.order_key!==key||
   d.ifood_sequence!==o.NRCOMANDAEXT||
   d.teknisa_sequence!==o.NRCOMANDA)
  return reject("NATIVE_ORDER_FOUR_PART_KEY_OR_ORIGIN_INVALID");
 if(!sha(e.snapshot_hash)||!sha(d.snapshot_hash)||
    e.snapshot_hash!==d.snapshot_hash||
    snapshotHash(o)!==e.snapshot_hash.toLowerCase()||
    !sha(d.fingerprint)||decisionHash(d)!==d.fingerprint.toLowerCase())
  return reject("NATIVE_ORDER_SNAPSHOT_OR_DECISION_FINGERPRINT_INVALID");
 if(o.observation_scan_complete!==true||
   d.observation_scan_complete!==true)
  return reject("NATIVE_OBSERVATIONS_SCAN_NOT_COMPLETE");
 if(!["3","P","X"].includes(o.IDSTCOMANDA))
  return reject("NATIVE_HEADER_STATUS_NOT_SAFE_FOR_EVIDENCE_REVIEW");
 if(o.items.length===0||o.items.length>200||
    o.items.length!==d.items.length)
  return reject("NATIVE_ITEM_COVERAGE_INVALID");
 const observed=new Set(),itemNotes=new Map(),general=[];
 for(const r of o.observation_rows){
  if(!r||r.join_proven!==true||!str(r.value))
   return reject("NATIVE_OBSERVATION_NOT_JOINED");
  if(r.scope_hint==="order"){
   if(r.source_field!=="DSOBSCOMANDA"||general.length)
    return reject("NATIVE_ORDER_OBSERVATION_SCOPE_INVALID");
   general.push({source_field:r.source_field,value:r.value});
  }else if(r.scope_hint==="item"){
   if(!["DSOBSDESCIT","DSOBSPEDDIGCMD","TXPRODCOMVEN"].includes(r.source_field)||
     !Number.isInteger(r.item_index)||r.item_index<0||
     r.item_index>=o.items.length||
     r.CDPRODUTO!==o.items[r.item_index]?.CDPRODUTO)
    return reject("NATIVE_ITEM_OBSERVATION_JOIN_INVALID");
   const tok=r.item_index+"|"+r.source_field;
   if(observed.has(tok))return reject("NATIVE_ITEM_NOTE_DUPLICATE_SOURCE");
   observed.add(tok);
   const group=itemNotes.get(r.item_index)||[];
   group.push({source_field:r.source_field,value:r.value});
   itemNotes.set(r.item_index,group);
  }else return reject("NATIVE_OBSERVATION_SCOPE_UNKNOWN");
 }
 if(!exact(general,d.order_observations))
  return reject("NATIVE_ORDER_OBSERVATIONS_NOT_IDENTICAL");
 const seenLines=new Set();
 for(let i=0;i<o.items.length;i++){
  const r=o.items[i],x=d.items[i];
  if(!r||!x||!str(r.NRPRODCOMVEN)||
    seenLines.has(r.NRPRODCOMVEN)||!str(r.CDPRODUTO)||
    r.IDSTPRCOMVEN!=="4"||
    !str(x.product_name)||!str(x.CDPRODUTO)||
    x.CDPRODUTO!==r.CDPRODUTO||x.item_index!==i+1||
    !str(x.canonical_code)||canonical(r.CDARVPROD)!==x.canonical_code||
    typeof r.QTPRODCOMVEN!=="string"||!QTY.test(r.QTPRODCOMVEN)||
    !Number.isSafeInteger(Number(r.QTPRODCOMVEN))||
    Number(r.QTPRODCOMVEN)!==x.quantity||
    !Array.isArray(x.observations)||
    !exact(itemNotes.get(i)||[],
      x.observations.map(z=>({source_field:z?.source_field,value:z?.value}))))
    return reject("NATIVE_ITEM_STATUS_IDENTITY_QUANTITY_OR_NOTES_HOLD");
  seenLines.add(r.NRPRODCOMVEN);
 }
 // The native revision has been checked for SELF-CONSISTENCY only. Claims
 // below are metadata, not the original confidential order or notes.
 const sourceClaims={
  native:{schema:"tata.comandas.native-revision-claim.v1",
   origin:o.IDORGCMDVENDA,store_id:o.CDFILIAL,store_unit:o.CDLOJA,
   operational_date:day,order_key:key,
   snapshot_sha256:e.snapshot_hash,short_id:o.NRCOMANDAEXT,
   item_rows_complete:true,observation_scan_complete:true},
  views:["PRODUCTION_1","PRODUCTION_2","CONFERENCE"].map(id=>({
   id,source_kind:"TEKNISA_READER_V2",
   native_snapshot_sha256:e.snapshot_hash
  })),
  ifood:input.ifood??null,
  store_mapping:input.store_mapping??null
 };
 const scope=assessViewSourceScopes(sourceClaims);
 if(scope.production.some(v=>v.status!=="NATIVE_ONLY_REVIEW"))
  return reject("NATIVE_SOURCE_SCOPE_UNEXPECTED_HOLD");
 return {schema:SCHEMA,status:"NATIVE_PAIR_CONSISTENT_REVIEW_ONLY",
  reasons:["PAIR_SELF_CONSISTENCY_IS_NOT_INDEPENDENT_SOURCE_ATTESTATION",
   "NATIVE_STATUS_DOES_NOT_PROVE_FIRST_PRODUCTION_EVENT"],
  native_state_observed:o.IDSTCOMANDA,
  item_status_4_observed_count:o.items.length,
  item_count:o.items.length,order_note_count:general.length,
  item_notes_present:itemNotes.size>0,
  revision_consistency_checked:true,source_independently_attested:false,
  first_production_event_proven:false,sequence_binding_proven:false,
  ready_for_operational_print:false,print_authorized:false,
  source_review:scope,effects:EFFECTS};
}
module.exports={assessNativeReaderV2,SCHEMA,EFFECTS};

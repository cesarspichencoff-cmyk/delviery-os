"use strict";
/**
 * TATÁ Comanda — independent iFood export vs Teknisa set reconciliation.
 * RECONCILIATION ONLY. Not a consumer, service, join authorization or printer gate.
 * Normalized arrays come from separately authorized sources; never reads SQL/XLSX.
 * Deliberately does not equate a 4-digit ID with an authenticated iFood UUID.
 */
const SCHEMA="deliveryos.comandas.independent-presence-reconciliation.v1";
const EFFECTS=Object.freeze({database_read:false,database_write:false,
  network:false,sequence_write:false,print:false,spooler:false,fiscal:false});
const uuidRegex=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shortRegex=/^[0-9]{4}$/;
function validDay(day){
 if(typeof day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
 const v=new Date(day+"T00:00:00.000Z");
 return Number.isFinite(v.getTime())&&v.toISOString().slice(0,10)===day;
}
function groupById(rows){const m=new Map();for(const r of rows){
  const a=m.get(r.short_id)||[];a.push(r);m.set(r.short_id,a);
}return m;}
function tally(rows,key){const values={};for(const row of rows){
 const x=row[key];values[x]=(values[x]||0)+1;
}return Object.fromEntries(Object.entries(values).sort(([a],[b])=>a.localeCompare(b)));}
function reconcilePresence(input){
 const result={
  schema:SCHEMA,mode:"READ_ONLY_REVIEW",ready_for_operational_print:false,
  uuid_to_native_proven:false,item_content_proven:false,
  independent_source_attestation_proven:false,
  source_store_mapping_attested:false,physical_print_proven:false,
  effects:EFFECTS,status:"HOLD",reasons:[],
  counts:{ifood_rows:0,native_rows:0,matched_short_ids:0,
    only_ifood:0,only_native:0,ambiguous_short_ids:0},
  native_unmatched_status_codes:{},native_matched_status_codes:{},
  // Only aggregates leave the analyzer; never include UUID or customer info.
  differences_without_personal_ids:true
 };
 const fail=code=>{result.reasons.push(code);return result;};
 if(!input||typeof input!=="object"||Array.isArray(input))return fail("INPUT_MISSING");
 const {day,ifood_store,native_store,ifood,native}=input;
 if(!validDay(day)||typeof ifood_store!=="string"||!ifood_store.trim()||
   typeof native_store!=="string"||!native_store.trim()||
   !Array.isArray(ifood)||!Array.isArray(native))
  return fail("INVALID_BATCH_SCOPE");
 result.counts.ifood_rows=ifood.length;result.counts.native_rows=native.length;
 if(!ifood.length||!native.length)return fail("EMPTY_SOURCE_BATCH");
 if(ifood.length>20000||native.length>20000)return fail("INPUT_BUDGET_EXCEEDED");
 const uuids=new Set();
 for(const r of ifood){
  if(!r||typeof r!=="object"||Array.isArray(r)||
    r.day!==day||r.store!==ifood_store)return fail("IFOOD_ROW_SCOPE_MISMATCH");
  if(!shortRegex.test(r.short_id)||typeof r.uuid!=="string"||
    !uuidRegex.test(r.uuid)||typeof r.final_status!=="string"||
    !r.final_status.trim())return fail("IFOOD_REQUIRED_FIELD_INVALID");
  const normalized=r.uuid.toLowerCase();
  if(uuids.has(normalized))return fail("IFOOD_UUID_REPEATED");
  uuids.add(normalized);
 }
 for(const r of native){
  if(!r||typeof r!=="object"||Array.isArray(r)||
    r.day!==day||r.store!==native_store)return fail("NATIVE_ROW_SCOPE_MISMATCH");
  if(!shortRegex.test(r.short_id)||r.origin!=="DLV_IFO"||
    typeof r.status_code!=="string"||!r.status_code.trim())
    return fail("NATIVE_REQUIRED_FIELD_INVALID");
 }
 const i=groupById(ifood),n=groupById(native);
 const ambiguous=new Set([...i,...n].filter(([code])=>
   (i.get(code)||[]).length>1||(n.get(code)||[]).length>1).map(([code])=>code));
 result.counts.ambiguous_short_ids=ambiguous.size;
 if(ambiguous.size>0)return fail("DUPLICATE_SHORT_ID_WITHIN_STORE_DAY");
 const matched=[],onlyNative=[],onlyIfood=[];
 for(const [code,records] of i){
  if(n.has(code))matched.push(n.get(code)[0]);
  else onlyIfood.push(records[0]);
 }
 for(const [code,records] of n)if(!i.has(code))onlyNative.push(records[0]);
 result.counts.matched_short_ids=matched.length;
 result.counts.only_ifood=onlyIfood.length;
 result.counts.only_native=onlyNative.length;
 result.native_matched_status_codes=tally(matched,"status_code");
 result.native_unmatched_status_codes=tally(onlyNative,"status_code");
 result.reasons.push("SHORT_ID_DAY_STORE_CANDIDATE_ONLY");
 if(onlyIfood.length)result.reasons.push("IFOOD_ORDER_NOT_IN_NATIVE_SCOPE");
 if(onlyNative.length)result.reasons.push("NATIVE_ORDER_NOT_IN_IFOOD_EXPORT_SCOPE");
 result.status=onlyIfood.length||onlyNative.length?"DISCREPANCIES_REVIEW":"CANDIDATE_SET_REVIEW";
 return result;
}
module.exports={SCHEMA,EFFECTS,reconcilePresence};
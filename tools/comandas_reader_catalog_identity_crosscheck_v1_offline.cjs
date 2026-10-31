"use strict";
/**
 * Internal catalog identity bridge for the exact Reader V2 revision.
 * Inputs are caller-supplied (possibly stale or fabricated) evidence.
 * Reports ONLY per-line statuses/counts; never publishes product names,
 * CDPRODUTO, order identifiers, note text, customer data, or source paths.
 *
 * This is NOT independent catalog custody, current rule homologation,
 * packaging approval, first-dispatch evidence, or print authorization.
 */
const {assessNativeReaderV2}=
 require("./comandas_reader_v2_view_evidence_v1_offline.cjs");
const {CATALOG_SCHEMA}=
 require("./comandas_packaging_classification_review_v1_offline.cjs");
const SCHEMA="tata.comandas.reader-v2-catalog-identity-crosscheck.v1.review-only";
const EFFECTS=Object.freeze({print:false,spooler_write:false,
 sql_read:false,sql_write:false,filesystem_read:false,filesystem_write:false,
 network:false,catalog_write:false,sequence_write:false,service_change:false,
 deploy:false});
const CODE=/^[A-Z0-9]\.[A-Z0-9]{2}\.[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{2}$/;
const ID=/^[0-9]{1,20}$/;
const shape=(x,keys)=>x&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const validName=x=>typeof x==="string"&&x.length>0&&x.length<=160&&
 x===x.trim()&&!/[\x00-\x1f\x7f]/.test(x);
const norm=x=>x.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toUpperCase().trim().replace(/\s+/g," ");
const validDay=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x+"T00:00:00Z"))&&
 new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
function deny(reason){
 return {schema:SCHEMA,status:"HOLD",reason,
  line_states:[],candidate_count:0,unresolved_count:0,
  reader_pair_self_consistent:false,identity_candidate_only:true,
  catalog_origin_independently_attested:false,catalog_freshness_proven:false,
  approved_family_station:false,packaging_approved:false,
  ready_for_operational_print:false,print_authorized:false,effects:EFFECTS};
}
function crosscheckReaderCatalogIdentity(pair,capture){
 let native;
 try{native=assessNativeReaderV2(pair);}
 catch{return deny("NATIVE_READER_PAIR_NOT_VALIDATED");}
 if(native.status!=="NATIVE_PAIR_CONSISTENT_REVIEW_ONLY")
  return deny("NATIVE_READER_PAIR_NOT_VALIDATED");
 const o=pair.event.order;
 if(o.CDFILIAL!=="0001"||o.CDLOJA!=="01")
  return deny("NOT_ITAIM_SCOPE");
 if(!shape(capture,["schema","source_kind","source_ref","store_id",
      "store_unit","captured_local_date","entries"])||
    capture.schema!==CATALOG_SCHEMA||
    capture.source_kind!=="LOCAL_READ_ONLY_CAPTURE_CLAIM"||
    !validName(capture.source_ref)||capture.store_id!==o.CDFILIAL||
    capture.store_unit!==o.CDLOJA||!validDay(capture.captured_local_date)||
    !Array.isArray(capture.entries)||capture.entries.length>1000)
  return deny("CAPTURE_SCOPE_OR_METADATA_INVALID");
 const byId=new Map(),byCode=new Map();
 for(const row of capture.entries){
  if(!shape(row,["CDPRODUTO","canonical_code","product_name","active"])||
     typeof row.CDPRODUTO!=="string"||!ID.test(row.CDPRODUTO)||
     typeof row.canonical_code!=="string"||!CODE.test(row.canonical_code)||
     !validName(row.product_name)||typeof row.active!=="boolean")
   return deny("CAPTURE_ENTRY_INVALID");
  const a=byId.get(row.CDPRODUTO)||[];
  a.push(row);byId.set(row.CDPRODUTO,a);
  const b=byCode.get(row.canonical_code)||[];
  b.push(row);byCode.set(row.canonical_code,b);
 }
 let candidate_count=0;
 const line_states=pair.decision.items.map((item,index)=>{
  const rows=byId.get(item.CDPRODUTO)||[];
  let state;
  if(!rows.length)state="NATIVE_PRODUCT_ID_ABSENT_IN_SUPPLIED_CAPTURE";
  else if(rows.length!==1)
   state="AMBIGUOUS_CATALOG_IDENTITY";
  else if(rows[0].canonical_code!==item.canonical_code)
   state="NATIVE_PRODUCT_CODE_CONFLICT";
  else if(byCode.get(item.canonical_code)?.length!==1)
   state="AMBIGUOUS_CATALOG_IDENTITY";
  else if(!rows[0].active)state="INACTIVE_IN_SUPPLIED_CAPTURE";
  else if(norm(rows[0].product_name)!==norm(item.product_name))
   state="PRODUCT_NAME_CONFLICT";
  else{state="EXACT_IDENTITY_CANDIDATE_ONLY";candidate_count++;}
  return {item_index:index+1,status:state};
 });
 return {schema:SCHEMA,status:"IDENTITY_CANDIDATES_REVIEW_ONLY",
  reason:"CATALOG_CAPTURE_NOT_INDEPENDENTLY_ATTESTED",
  line_states,candidate_count,
  unresolved_count:line_states.length-candidate_count,
  reader_pair_self_consistent:true,identity_candidate_only:true,
  catalog_origin_independently_attested:false,catalog_freshness_proven:false,
  approved_family_station:false,packaging_approved:false,
  ready_for_operational_print:false,print_authorized:false,effects:EFFECTS};
}
module.exports={SCHEMA,EFFECTS,crosscheckReaderCatalogIdentity};

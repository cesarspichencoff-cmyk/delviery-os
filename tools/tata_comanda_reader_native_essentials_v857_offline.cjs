"use strict";
/**
 * TATA Comanda V8.57 — the shortest source-native path to a usable
 * essential ticket preview, independent of packaging/kit completion.
 * Uses the existing V2 Reader event + decision + persisted TATA binding.
 * No separate fake iFood observer, no claim of authenticated GP order,
 * no sequence allocation and no printer/spooler/SQL/network actions.
 */
const {createHash}=require("node:crypto");
const SCHEMA="tata.comanda.reader-essentials.v857.review-only";
const EFFECTS=Object.freeze({
 print:false,reprint:false,spooler:false,sequence_write:false,
 sequence_allocate:false,sql:false,network:false,api:false,ack:false,
 fiscal:false,sefaz:false,service:false,deploy:false
});
const SHA=/^[a-f0-9]{64}$/i;
const clean=x=>typeof x==="string"?x.trim():"";
const safe=x=>typeof x==="string"&&x.length>0&&x.length<=2000&&
 x===x.trim()&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(x);
const digest=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const unknown="A DEFINIR";
function deny(reason){
 return {schema:SCHEMA,status:"HOLD",reason,essential:null,preview_lines:[],
  optional:{caixa:unknown,sacola:unknown,kit:unknown},
  pair_snapshot_integrity_checked:false,decision_fingerprint_checked:false,
  persisted_sequence_reused:false,order_source_authenticated:false,
  ifood_gp_independently_observed:false,packaging_ready:false,
  ready_for_offline_preview:false,ready_for_operational_print:false,
  print_authorized:false,bytes:[],effects:EFFECTS};
}
function snapshotHash(order){
 const fields=["CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA",
  "NRCOMANDAEXT","IDORGCMDVENDA","IDSTCOMANDA","DTHRABERMESA"];
 const itemFields=["NRPRODCOMVEN","CDPRODUTO","CDARVPROD",
  "QTPRODCOMVEN","IDSTPRCOMVEN"];
 if(!order||fields.some(k=>!Object.hasOwn(order,k))||
   !Array.isArray(order.items))return null;
 const basis={};for(const k of fields)basis[k]=order[k];
 basis.items=order.items.map(x=>{
  if(!x||itemFields.some(k=>!Object.hasOwn(x,k)))return null;
  const item={};for(const k of itemFields)item[k]=x[k];return item;
 });
 if(basis.items.some(x=>x===null))return null;
 if(Array.isArray(order.observation_rows)&&order.observation_rows.length)
  basis.observation_rows=order.observation_rows;
 return digest(basis);
}
function decisionHash(d){
 const core={order_key:d.order_key,snapshot_hash:d.snapshot_hash,
  ifood_sequence:d.ifood_sequence,teknisa_sequence:d.teknisa_sequence,
  service:d.service,items:d.items};
 core.order_observations=d.order_observations;
 core.observation_scan_complete=d.observation_scan_complete;
 core.packaging=d.packaging;core.kits=d.kits;core.sequence=d.sequence;
 return digest(core);
}
function validDate(v){
 const d=clean(v).slice(0,10);
 return /^\d{4}-\d\d-\d\d$/.test(d)&&
 !Number.isNaN(Date.parse(d+"T00:00:00Z"))&&
 new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d?d:null;
}
function parsedQuantity(raw){
 if(typeof raw!=="string"||!/^0*[1-9]\d*(?:\.0+)?$/.test(raw))return null;
 const n=Number(raw);return Number.isSafeInteger(n)&&n>0?n:null;
}
function optional(o,k){
 const x=o?.[k];
 if(x?.status==="PROVEN"&&safe(x.label)&&x.label!=="A DEFINIR")
  return x.label;
 if(x?.status==="NONE")return "NAO SE APLICA";
 return unknown;
}
function projectReaderEssentials(input){
 if(!input||typeof input!=="object")return deny("INPUT_INVALID");
 const {event:e,decision:d,sequence_state:state}=input;
 if(!e||!d||e.schema!=="deliveryos.tata-reader-stable-order-event.v1"||
   d.schema!=="deliveryos.live-shadow-decision.v1"||
   !e.order||!Array.isArray(e.order.items)||!Array.isArray(d.items)||
   !Array.isArray(e.blockers)||!Array.isArray(d.blocking_reasons))
  return deny("READER_PAIR_STRUCTURE_INVALID");
 const o=e.order,day=validDate(o.DTHRABERMESA);
 const key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join("|");
 if(!day||![o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].every(safe)||
   !/^\d{1,12}$/.test(clean(o.NRCOMANDAEXT))||
   o.IDORGCMDVENDA!=="DLV_IFO"||e.order_key!==key||
   d.order_key!==key||d.ifood_sequence!==o.NRCOMANDAEXT||
   d.teknisa_sequence!==o.NRCOMANDA||
   d.snapshot_hash!==e.snapshot_hash||!SHA.test(e.snapshot_hash))
  return deny("SAME_ORDER_FOUR_FIELD_IDENTITY_NOT_PROVEN");
 if(o.observation_scan_complete!==true||!Array.isArray(o.observation_rows)||
    d.observation_scan_complete!==true||!Array.isArray(d.order_observations))
  return deny("V2_FULL_OBSERVATION_SCAN_NOT_PROVEN");
 const rows=o.observation_rows,allNotes=new Set(),itemNotes=new Map(),
  orderNotes=[];
 for(const r of rows){
  if(!r||r.join_proven!==true||!safe(r.value)||
    !["order","item"].includes(r.scope_hint))
   return deny("UNPROVEN_OBSERVATION_ROW");
  if(r.scope_hint==="order"){
   if(r.source_field!=="DSOBSCOMANDA"||orderNotes.length)
    return deny("ORDER_NOTE_SCOPE_INVALID");
   orderNotes.push({source_field:r.source_field,value:r.value});
  }else{
   if(!["DSOBSDESCIT","DSOBSPEDDIGCMD","TXPRODCOMVEN"].includes(r.source_field)||
     !Number.isInteger(r.item_index)||r.item_index<0||
     r.item_index>=o.items.length||
     r.CDPRODUTO!==o.items[r.item_index]?.CDPRODUTO)
    return deny("ITEM_NOTE_LINK_NOT_PROVEN");
   const key=r.item_index+"|"+r.source_field;
   if(allNotes.has(key))return deny("DUPLICATE_ITEM_NOTE_SOURCE");
   allNotes.add(key);
   const list=itemNotes.get(r.item_index)||[];
   list.push({source_field:r.source_field,value:r.value});
   itemNotes.set(r.item_index,list);
  }
 }
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(!same(orderNotes,d.order_observations)||
   !same(rows.filter(r=>r.scope_hint==="order").map(r=>({source_field:r.source_field,value:r.value})),
     orderNotes))return deny("GENERAL_OBSERVATIONS_NOT_IDENTICAL");
 if(snapshotHash(o)!==e.snapshot_hash.toLowerCase())
  return deny("WATCHER_V2_SNAPSHOT_HASH_MISMATCH");
 if(!SHA.test(d.fingerprint)||decisionHash(d)!==d.fingerprint.toLowerCase())
  return deny("DECISION_CONTENT_FINGERPRINT_MISMATCH");
 if(!e.order.items.length||e.order.items.length!==d.items.length||
   e.order.items.length>200)return deny("SOURCE_ITEM_COVERAGE_INVALID");
 const seen=new Set(),items=[];
 for(const [i,raw] of e.order.items.entries()){
  const x=d.items[i],qty=parsedQuantity(raw.QTPRODCOMVEN);
  if(!x||!safe(raw.NRPRODCOMVEN)||seen.has(raw.NRPRODCOMVEN)||
   !safe(raw.CDPRODUTO)||!safe(x.product_name)||
   x.product_name.toUpperCase()==="A DEFINIR"||
   x.item_index!==i+1||raw.CDPRODUTO!==x.CDPRODUTO||
   qty===null||qty!==x.quantity||!safe(x.canonical_code))
   return deny("ITEM_IDENTITY_NAME_OR_QUANTITY_MISMATCH");
  seen.add(raw.NRPRODCOMVEN);
  const expected=itemNotes.get(i)||[];
  if(!Array.isArray(x.observations)||
     !same(expected,x.observations.map(z=>({source_field:z?.source_field,value:z?.value}))))
   return deny("ITEM_OBSERVATION_SOURCE_MISMATCH");
  items.push({name:x.product_name,quantity:qty,
   notes:expected.map(z=>z.value)});
 }
 // shadow_candidate from the consumer is not a persisted assignment.
 // Read only an existing daily-store binding for the exact native order.
 if(!state||state.schema!=="deliveryos.tata-sequence-state.v1"||
    state.policy?.width!==3||state.policy?.min_value!==1||
    state.policy?.max_value!==999||!Array.isArray(state.bindings))
  return deny("PERSISTED_TATA_SEQUENCE_STATE_INVALID");
 const scope="STORE:"+o.CDFILIAL+"|DATE:"+day;
 const scoped=state.bindings.filter(b=>b?.scope_id===scope);
 const matching=scoped.filter(b=>b.teknisa_order_id===o.NRCOMANDA);
 if(matching.length!==1||
   !/^\d{3}$/.test(clean(matching[0].tata_sequence))||
   Number(matching[0].tata_sequence)<1||
   scoped.some(b=>b!==matching[0]&&
    (b.tata_sequence===matching[0].tata_sequence||
     b.teknisa_order_id===o.NRCOMANDA)))
  return deny("TATA_SEQUENCE_NOT_UNIQUELY_PERSISTED_FOR_ORDER_DAY");
 const tata=matching[0].tata_sequence;
 const pack={
  caixa:optional(input.packaging,"caixa"),
  sacola:optional(input.packaging,"sacola"),
  kit:optional(input.packaging,"kit")
 };
 const lines=["TATA COMANDA - PREVIA / SEM IMPRESSAO",
  "IFOOD "+o.NRCOMANDAEXT+" | TATA "+tata,
  "TEKNISA "+o.NRCOMANDA,"PRODUTOS"];
 for(const item of items){
  lines.push(item.quantity+" X "+item.name.toLocaleUpperCase("pt-BR"));
  for(const note of item.notes)
   lines.push("  OBS: "+note.toLocaleUpperCase("pt-BR"));
 }
 for(const note of orderNotes)
  lines.push("OBS GERAL / REVISAR: "+note.value.toLocaleUpperCase("pt-BR"));
 lines.push("CAIXA: "+pack.caixa,"SACOLA: "+pack.sacola,"KIT: "+pack.kit);
 const out=deny("READONLY_ESSENTIAL_PREVIEW_NOT_PRINT_AUTHORITY");
 return {...out,status:"SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD",
  essential:{ifood_short_id:o.NRCOMANDAEXT,tata_sequence:tata,
   NRCOMANDA:o.NRCOMANDA,NRVENDAREST:o.NRVENDAREST,
   items,order_observations:orderNotes.map(x=>x.value)},
  optional:pack,preview_lines:lines,
  pair_snapshot_integrity_checked:true,decision_fingerprint_checked:true,
  persisted_sequence_reused:true,ready_for_offline_preview:true};
}
module.exports={projectReaderEssentials,SCHEMA,EFFECTS,snapshotHash,decisionHash};

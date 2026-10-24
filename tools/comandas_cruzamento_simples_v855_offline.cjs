"use strict";
/** V8.55 — minimal OFFLINE linkage: iFood paper -> Teknisa native order ->
 * optional fiscal row. Self-reported captures are review candidates only.
 * Never read GP secrets, modify services or auto-print on a short ID.
 */
const SCHEMA="deliveryos.comandas.simple-crosswalk.v855.review";
const UNKNOWN="A DEFINIR";
const EFFECTS=Object.freeze({print:false,reprint:false,ack:false,ifood_api:false,
 teknisa_write:false,sql:false,fiscal:false,sefaz:false,service:false,deploy:false});
const clean=x=>typeof x==="string"?x.trim():"";
const validDay=x=>/^\d{4}-\d\d-\d\d$/.test(clean(x))&&
 !Number.isNaN(Date.parse(x+"T00:00:00Z"))&&
 new Date(x+"T00:00:00Z").toISOString().slice(0,10)===x;
const id=x=>/^\d{1,12}$/.test(clean(x));
const norm=x=>clean(x).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toUpperCase().replace(/\s+/g," ");
const validItems=a=>Array.isArray(a)&&a.length>0&&a.length<=200&&a.every(x=>
 x&&clean(x.name).length>0&&clean(x.name).length<=200&&
 Number.isSafeInteger(x.quantity)&&x.quantity>0&&x.quantity<=999&&
 Array.isArray(x.notes)&&x.notes.length<=30&&
 x.notes.every(n=>typeof n==="string"&&n.length<=2000));
const sig=x=>JSON.stringify([norm(x.name),x.quantity]);
const itemSet=a=>JSON.stringify(a.map(sig).sort());
function notesEqual(a,b){
 const noteSig=x=>JSON.stringify([sig(x),x.notes.map(norm).sort()]);
 return JSON.stringify(a.map(noteSig).sort())===JSON.stringify(b.map(noteSig).sort());
}
function result(g,reason){
 const i=Array.isArray(g?.items)?g.items.filter(x=>validItems([x]))
  .map(x=>({name:clean(x.name),quantity:x.quantity,notes:x.notes.map(clean)})):[];
 return {schema:SCHEMA,status:"HOLD",reasons:[reason],
  match_basis:"NONE",full_ifood_uuid_join_proven:false,
  native_order_matched:false,native_fiscal_link_matched:false,
  paper_proven:false,duplicates_excluded:false,print_authorized:false,
  comanda:{ifood:clean(g?.short_id)||UNKNOWN,items:i,
   caixa:UNKNOWN,sacola:UNKNOWN,kit:UNKNOWN,nota_fiscal:UNKNOWN},
  effects:EFFECTS};
}
function crosswalk(input){
 if(!input||typeof input!=="object"||Array.isArray(input))
  return result(null,"INPUT_INVALID");
 const g=input.ifood;
 if(!g||g.schema!=="deliveryos.ifood-paper-observation.v1"||
  !clean(g.store)||!validDay(g.day)||!id(g.short_id)||
  !["PLACED","CONFIRMED","CONCLUDED","CANCELLED"].includes(g.status)||
  g.items_complete!==true||!validItems(g.items))
  return result(g,"IFOOD_CAPTURE_INVALID_OR_INCOMPLETE");
 if(g.status==="CANCELLED")return result(g,"IFOOD_CANCELLED");
 if(g.status==="PLACED")return result(g,"IFOOD_NOT_CONFIRMED");
 if(!Array.isArray(input.teknisa_orders)||input.teknisa_orders.length>500)
  return result(g,"TEKNISA_CAPTURE_UNAVAILABLE");
 const candidates=input.teknisa_orders.filter(t=>t&&
  t.schema==="deliveryos.teknisa-native-order-observation.v1"&&
  t.store===g.store&&t.day===g.day&&t.origin==="DLV_IFO"&&
  t.NRCOMANDAEXT===g.short_id);
 if(!candidates.length)return result(g,"NATIVE_ORDER_NOT_OBSERVED_NOT_PROVEN_LOST");
 if(candidates.length!==1)return result(g,"AMBIGUOUS_SHORT_ID_SAME_STORE_DAY");
 const t=candidates[0];
 if(!id(t.NRCOMANDA)||!id(t.NRVENDAREST)||t.items_complete!==true||
    !validItems(t.items))return result(g,"NATIVE_ORDER_INCOMPLETE");
 if(itemSet(g.items)!==itemSet(t.items))
  return result(g,"ITEMS_OR_QUANTITIES_DIFFER");
 if(t.notes_complete===true&&!notesEqual(g.items,t.items))
  return result(g,"NOTES_CONTRADICT");
 const out={...result(g,"FULL_IFOOD_UUID_NOT_PROVEN"),
  status:"CANDIDATE_REVIEW",native_order_matched:true,
  match_basis:"STORE_DAY_SHORT_ID_ITEMS",
  native_reference:{NRCOMANDA:t.NRCOMANDA,NRVENDAREST:t.NRVENDAREST},
  reasons:["FULL_IFOOD_UUID_NOT_PROVEN","NO_AUTOMATIC_PRINT_AUTHORITY"]};
 if(t.notes_complete!==true)out.reasons.push("NATIVE_NOTES_A_DEFINIR");
 if(Array.isArray(input.fiscal_rows)){
  const matches=input.fiscal_rows.filter(f=>f&&f.NRCOMANDA===t.NRCOMANDA&&
   f.NRVENDAREST===t.NRVENDAREST&&
   f.schema==="deliveryos.teknisa-fiscal-observation.v1");
  if(matches.length===1&&matches[0].status==="A"){
   out.native_fiscal_link_matched=true;
   out.comanda.nota_fiscal="REGISTRADA NA TEKNISA";
  }else if(matches.length>1)out.reasons.push("MULTIPLE_FISCAL_ROWS_A_DEFINIR");
 }
 return out;
}
module.exports={crosswalk,SCHEMA,UNKNOWN,EFFECTS};

"use strict";
/**
 * TATÁ Comanda V8.56 — FIRST-DELIVERY ESSENTIAL CONTENT, OFFLINE ONLY.
 * Reuses V8.55 matching and an EXISTING TATÁ sequence observation.
 * No sequence assignment, fiscal coupling, printing, queue, API or service.
 * Raw order lines are only for local previews, never public CI logs.
 */
const {crosswalk}=require("./comandas_cruzamento_simples_v855_offline.cjs");
const SCHEMA="tata.comanda.essential.v856.review-only";
const UNKNOWN="A DEFINIR";
const EFFECTS=Object.freeze({print:false,reprint:false,spooler:false,
 sequence_allocate:false,sequence_write:false,ack:false,api:false,
 database:false,fiscal:false,sefaz:false,service:false,deploy:false});
const clean=x=>typeof x==="string"?x.trim():"";
const safeText=x=>clean(x).length>0&&clean(x).length<=200&&
 !/[\x00-\x1f\x7f]/.test(clean(x));
const SHA=/^[a-f0-9]{64}$/i;
function base(reason) {
 return {schema:SCHEMA,status:"HOLD",reason,
  essential_fields_present:false,canonical_ifood_uuid_proven:false,
  existing_sequence_identity_claim_matched:false,
  source_attestation_proven:false,actual_print_proven:false,
  ready_for_offline_preview:false,ready_for_operational_print:false,
  origin:"V855_REVIEW_CANDIDATE_PLUS_EXISTING_SEQUENCE_CLAIM",
  essential:null,optional:{caixa:UNKNOWN,sacola:UNKNOWN,kit:UNKNOWN},
  preview_lines:[],bytes:[],effects:EFFECTS};
}
function label(optional,key){
 const claim=optional?.[key];
 if(!claim||typeof claim!=="object")return UNKNOWN;
 if(claim.status==="NONE")return "NAO SE APLICA";
 if(claim.status==="PROVEN"&&safeText(claim.label))return clean(claim.label);
 return UNKNOWN;
}
function projectTataComandaEssencial(input){
 if(!input||typeof input!=="object"||Array.isArray(input))
  return base("INPUT_INVALID");
 const match=crosswalk(input);
 if(match.status!=="CANDIDATE_REVIEW"||!match.native_order_matched)
  return base("IFOOD_TEK_MATCH_NOT_READY:"+match.reasons[0]);
 const g=input.ifood, b=input.tata_sequence_binding;
 if(!b||typeof b!=="object"||
   b.schema!=="tata.comanda.existing-sequence-observation.v1"||
   b.kind!=="EXISTING_TATA_SEQUENCE"||
   !/^\d{3}$/.test(clean(b.tata_sequence))||
   b.store!==g.store||b.day!==g.day||
   b.ifood_short_id!==g.short_id||
   b.NRCOMANDA!==match.native_reference.NRCOMANDA||
   b.NRVENDAREST!==match.native_reference.NRVENDAREST||
   !SHA.test(clean(b.snapshot_hash))||!safeText(b.source_ref))
  return base("EXISTING_TATA_SEQUENCE_ORDER_BINDING_NOT_MATCHED");
 // Prevent a claimed sequence from silently binding an item revision whose
 // snapshot is not explicitly linked. Self-report is still NOT attestation.
 if(!safeText(g.capture_ref)||b.ifood_capture_ref!==g.capture_ref)
  return base("IFOOD_SOURCE_CAPTURE_REFERENCE_NOT_MATCHED");
 const items=match.comanda.items.map(x=>({
  ...x,notes:x.notes.filter(n=>clean(n).length>0)
 }));
 if(items.length===0||
    items.some(x=>!safeText(x.name)||
      x.name.toLocaleUpperCase("pt-BR")==="A DEFINIR"||
      !Number.isSafeInteger(x.quantity)||x.quantity<=0||
      !Array.isArray(x.notes)||x.notes.some(n=>!safeText(n))))
  return base("ESSENTIAL_ITEM_OR_OBSERVATION_INVALID");
 const optional={
  caixa:label(input.packaging,"caixa"),
  sacola:label(input.packaging,"sacola"),
  kit:label(input.packaging,"kit")
 };
 const lines=[
  "TATA COMANDA - PREVIA SEM IMPRESSAO",
  "IFOOD "+g.short_id+" | TATA "+b.tata_sequence,
  "PEDIDO TEKNISA "+match.native_reference.NRCOMANDA,
  "PRODUTOS"
 ];
 for(const x of items) {
  lines.push(x.quantity+" X "+x.name.toLocaleUpperCase("pt-BR"));
  for(const note of x.notes)
   lines.push("  OBS: "+note.toLocaleUpperCase("pt-BR"));
 }
 lines.push("CAIXA: "+optional.caixa);
 lines.push("SACOLA: "+optional.sacola);
 lines.push("KIT: "+optional.kit);
 return {...base("ESSENTIAL_CONTENT_COMPLETE_NOT_PRINT_AUTHORITY"),
  status:"ESSENTIAL_PREVIEW_READY_HOLD",
  essential_fields_present:true,
  existing_sequence_identity_claim_matched:true,
  ready_for_offline_preview:true,
  essential:{
   ifood_short_id:g.short_id,tata_sequence:b.tata_sequence,
   NRCOMANDA:match.native_reference.NRCOMANDA,
   NRVENDAREST:match.native_reference.NRVENDAREST,
   items:items.map(x=>({name:x.name,quantity:x.quantity,notes:[...x.notes]}))
  },optional,preview_lines:lines};
}
module.exports={projectTataComandaEssencial,SCHEMA,UNKNOWN,EFFECTS};

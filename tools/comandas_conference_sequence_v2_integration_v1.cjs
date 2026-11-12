"use strict";
/**
 * TATÁ Comandas — isolated Conference V2 integration gate.
 *
 * Separated host roles:
 *  1. Reviewer: preflightConferenceV2() validates real native L1-L4.
 *  2. Writer identity: bindPreparedConferenceV2() receives a pre-signed
 *     Ed25519 request and an already-open authorized SQLite write handle.
 *  3. Attester identity: existing attestSignedLedgerV2() verifies all
 *     persisted writer receipts through a truly READ-ONLY handle.
 *  4. Reviewer: reviewAttestedConferenceV2() independently replays the
 *     same source with the signed attestation + readback ledger.
 *
 * This module opens no file, key, service, network, spooler, or printer.
 * It NEVER dispatches paper and NEVER returns a physical print authorization.
 * A full content-bearing Conference preview remains watermarked
 * "SIMULAÇÃO · NÃO PRODUZIR"; production-station bytes are NEVER exported.
 */
const crypto=require("node:crypto");
const {runNativeChainV1}=require("./comandas_cadeia_nativa_v1_offline.cjs");
const {bindAuthorizedNativeV2}=require("./comandas_sequence_v2_authorized_ledger_core_v1.cjs");
const SCHEMA="tata.comandas.conference-sequence-v2-integration.v1";
const EFFECTS=Object.freeze({
 print:false,spooler:false,queue:false,fiscal:false,network:false,
 install:false,service:false,deploy:false,merge:false
});
const SHA=/^[a-f0-9]{64}$/;
function hold(reason){
 return {schema:SCHEMA,status:"HOLD",reason,conference:null,
  bound_number_for_attester:null,number_for_operational_ticket:null,
  physical_print_authorized:false,effects:EFFECTS};
}
function fingerprint(i){
 try{
  if(!i||typeof i!=="object"||!i.event||!i.decision||
     !Buffer.isBuffer(i.motor_source))return null;
  const fixed={event:i.event,decision:i.decision,routing:i.routing,
   printer_map:i.printer_map,calibration:i.calibration,
   motor_sha256:crypto.createHash("sha256").update(i.motor_source).digest("hex"),
   catalog_equivalence:i.catalog_equivalence??null,kit_rules:i.kit_rules??null,
   note_disposition_claim:i.note_disposition_claim??null};
  return crypto.createHash("sha256").update(JSON.stringify(fixed)).digest("hex");
 }catch{return null;}
}
function inputAllowed(i){
 if(!fingerprint(i))return "REVIEW_INPUT_INVALID";
 // A signed human claim previously approved suppression ONLY in a shadow
 // replay. It never authorizes operational writer binding or printing.
 if(i.note_disposition_claim!=null)return "SHADOW_NOTE_CLAIM_NOT_OPERATIONAL_AUTHORITY";
 return null;
}
function preflightConferenceV2(i){
 const denied=inputAllowed(i);
 if(denied)return hold(denied);
 let r;
 try{
  // No caller-supplied sequence may influence the writer preflight.
  r=runNativeChainV1({...i,sequence_binding:null,
   sequence_attesters:null,sequence_ledger_day:null,now_s:null});
 }catch{return hold("NATIVE_CHAIN_PREFLIGHT_EXCEPTION");}
 const L=r?.layers||{};
 if(L.L1?.status!=="NATIVE_REVISION_CONSISTENT" ||
    L.L2?.status!=="NATIVE_ORDER_TIME_WINDOW" ||
    L.L3?.status!=="NATIVE_CONTENT_PROVEN" ||
    L.L4?.status!=="VIRTUAL_VIEWS_READY" ||
    L.L5?.status!=="HOLD")return hold("NATIVE_L1_L4_NOT_PROVEN");
 const v=r.views||[],prod=v.filter(x=>x.kind==="PRODUCAO"),
  conf=v.filter(x=>x.kind==="CONFERENCIA");
 if(!prod.length||conf.length!==1||v.length!==prod.length+1||
    conf[0].station!=="CONFERENCIA"||
    conf[0].semantic_ready!==true||conf[0].lines<1||
    conf[0].escpos_bytes!==0||conf[0].escpos.length!==0||
    prod.some(x=>!x.semantic_ready)||r.physical_effect_authorized!==false)
  return hold("CONFERENCE_CONTENT_OR_SCOPE_NOT_PROVEN");
 return {schema:SCHEMA,status:"READY_FOR_SIGNED_WRITER_REVIEW_ONLY",reason:null,
  source_fingerprint:fingerprint(i),order_key:i.event.order_key,
  native_snapshot_sha256:i.event.snapshot_hash,
  conference_content_sha256:conf[0].text_trace_sha256,
  conference_lines:conf[0].lines,production_station_count:prod.length,
  conference:null,bound_number_for_attester:null,
  number_for_operational_ticket:null,physical_print_authorized:false,effects:EFFECTS};
}
function matchedPreflight(i,preflight){
 const fresh=preflightConferenceV2(i);
 if(fresh.status!=="READY_FOR_SIGNED_WRITER_REVIEW_ONLY")
  return {reason:fresh.reason};
 if(!preflight||preflight.schema!==SCHEMA||
    preflight.status!==fresh.status||
    !SHA.test(String(preflight.source_fingerprint))||
    !SHA.test(String(preflight.conference_content_sha256))||
    !SHA.test(String(preflight.native_snapshot_sha256))||
    preflight.source_fingerprint!==fresh.source_fingerprint||
    preflight.order_key!==fresh.order_key||
    preflight.native_snapshot_sha256!==fresh.native_snapshot_sha256||
    preflight.conference_content_sha256!==fresh.conference_content_sha256||
    preflight.conference_lines!==fresh.conference_lines||
    preflight.production_station_count!==fresh.production_station_count)
  return {reason:"PREFLIGHT_CHANGED_OR_NOT_BOUND_TO_SOURCE"};
 return {fresh};
}
/** Run ONLY in a distinct provisioned writer identity, on its owned DB handle. */
function bindPreparedConferenceV2({input,preflight,db,writerRequest,writerTrust,nowS}={}){
 const p=matchedPreflight(input,preflight);
 if(p.reason)return hold(p.reason);
 let bound;
 try{
  bound=bindAuthorizedNativeV2(db,{event:input.event,decision:input.decision},
   writerRequest,writerTrust,nowS);
 }catch{return hold("WRITER_BIND_EXCEPTION");}
 if(!bound||!["V2_BOUND_PERSISTED_NOT_ATTESTED",
    "V2_BOUND_REUSED_NOT_ATTESTED"].includes(bound.status)||
    !/^\d{3}$/.test(bound.bound_number_for_attester||"")||
    bound.print_authorized!==false||bound.number_for_operational_ticket!==null)
  return hold("AUTHORIZED_WRITER_HOLD:"+String(bound?.reason||"INVALID_RESULT"));
 return {schema:SCHEMA,status:"PERSISTED_FOR_INDEPENDENT_ATTESTER_ONLY",
  reason:null,source_fingerprint:p.fresh.source_fingerprint,
  bound_number_for_attester:bound.bound_number_for_attester,
  reused:bound.reused,sequence_effect_confirmed:bound.sequence_effect_confirmed,
  number_for_operational_ticket:null,physical_print_authorized:false,
  conference:null,effects:EFFECTS};
}
/**
 * Reviewer boundary: an attester signature must pass the native L5 verifier
 * and the CURRENT full-day readback. Never trust a caller's "ready" flag.
 * A content-bearing, watermarked OFFLINE preview is intentionally returned
 * only after all cryptographic and semantic checks. Never pass it to a printer.
 */
function reviewAttestedConferenceV2({input,preflight,chainBinding,
 attesterTrust,ledgerState,nowS}={}){
 const p=matchedPreflight(input,preflight);
 if(p.reason)return hold(p.reason);
 if(!chainBinding||chainBinding.level!=="LIVE_ATTESTED"||
    chainBinding.attested_independently!==true||
    chainBinding.persisted!==true||!ledgerState||!attesterTrust)
  return hold("INDEPENDENT_PRODUCTION_ATTESTATION_NOT_PRESENT");
 let r;
 try{
  r=runNativeChainV1({...input,sequence_binding:chainBinding,
   sequence_attesters:attesterTrust,sequence_ledger_day:ledgerState,now_s:nowS});
 }catch{return hold("ATTESTED_CHAIN_EXCEPTION");}
 const L=r?.layers||{},conf=(r.views||[]).filter(x=>x.kind==="CONFERENCIA"),
  prod=(r.views||[]).filter(x=>x.kind==="PRODUCAO");
 if(L.L1?.status!=="NATIVE_REVISION_CONSISTENT"||
    L.L2?.status!=="NATIVE_ORDER_TIME_WINDOW"||
    L.L3?.status!=="NATIVE_CONTENT_PROVEN"||
    L.L4?.status!=="VIRTUAL_VIEWS_READY"||
    L.L5?.status!=="BOUND"||
    !/^\d{3}$/.test(L.L5?.tata_number||"")||
    conf.length!==1||prod.length!==preflight.production_station_count||
    conf[0].station!=="CONFERENCIA"||!conf[0].semantic_ready||
    conf[0].lines!==preflight.conference_lines||
    conf[0].render_blockers.length!==0||
    conf[0].escpos_bytes<1||
    conf[0].escpos.length!==conf[0].escpos_bytes||
    typeof conf[0].text_trace!=="string"||
    !conf[0].text_trace.startsWith("SIMULAÇÃO · NÃO PRODUZIR\n")||
    conf[0].text_trace.trim().split("\n").at(-1)!==L.L5.tata_number||
    !prod.every(x=>x.semantic_ready)||
    r.physical_effect_authorized!==false)
  return hold("ATTESTED_L5_OR_CONFERENCE_CONTENT_HOLD");
 const only=conf[0];
 // Full real content in this *in-memory* preview, not a sanitized descriptor.
 // Bytes retain the shadow banner; there is no emitter in the module.
 return {schema:SCHEMA,status:"CONFERENCE_CONTENT_ATTESTED_OFFLINE_NOT_FOR_PRINT",
  reason:null,source_fingerprint:p.fresh.source_fingerprint,
  tata_sequence_for_offline_review:L.L5.tata_number,
  conference:{station:"CONFERENCIA",lines:only.lines,
   text_trace:only.text_trace,text_trace_sha256:only.text_trace_sha256,
   escpos:[...only.escpos],escpos_sha256:only.escpos_sha256,
   escpos_bytes:only.escpos_bytes,watermark:"SIMULAÇÃO · NÃO PRODUZIR"},
  production_views_exported:0,number_for_operational_ticket:null,
  physical_print_authorized:false,effects:EFFECTS};
}
module.exports={SCHEMA,EFFECTS,preflightConferenceV2,
 bindPreparedConferenceV2,reviewAttestedConferenceV2};

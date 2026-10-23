"use strict";
/**
 * V7.54 / DRAFT: deterministic, NO-EFFECT, ledger state machine for receipt attempts.
 * A durable, atomic, compare-and-swap store AND physical reconciler are NOT
 * implemented by this file. No real proof of scope/authority can be inferred
 * from synthetic context flags. Nothing can authorize print or spool a job.
 *
 * Once an attempt is RESERVED, any reboot, timeout, ambiguous printer result,
 * or replay MUST remain HOLD. No automatic retry, even if the queue is empty.
 */
const crypto=require("node:crypto");
const SCHEMA="deliveryos.comandas-attempt-ledger.v754.offline";
const STATES=Object.freeze({RESERVED:"ATTEMPT_RESERVED_UNVERIFIED",
 ACCEPTED:"SPOOL_ACCEPTED_PAPER_UNVERIFIED",
 UNKNOWN:"RESULT_UNKNOWN_NO_RETRY",
 PAPER:"PAPER_EVIDENCE_RECORDED_NOT_WORLD_PROVEN"});
const NO_EFFECTS=Object.freeze({print:false,spooler_write:false,
 sequence_binding_write:false,odhen_write:false,service_change:false,
 driver_change:false,deploy:false,persistence_write:false});
const DIGEST=/^[a-f0-9]{64}$/i;
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
function reject(reason){return {status:"HOLD",reasons:[reason],
 authorize_print:false,requires_durable_commit:true,effects:NO_EFFECTS};}
function fresh(){return {schema:SCHEMA,revision:0,entries:[]};}
function validLedger(s){
 if(!s||s.schema!==SCHEMA||!Number.isSafeInteger(s.revision)||s.revision<0||
   !Array.isArray(s.entries)||s.entries.length>10000)return false;
 // Reservation-only history cannot have a nonzero revision and zero entries.
 // This checks structure; independent durable tamper evidence is STILL required.
 if(s.entries.length===0)return s.revision===0;
 let previousReservationRevision=0;
 const seen=new Set(),logicalViews=new Map(),sequenceOwners=new Map();
 for(const e of s.entries){
  if(!e||typeof e.key!=="string"||!DIGEST.test(e.key)||seen.has(e.key)||
    !DIGEST.test(e.payload_sha256)||!DIGEST.test(e.source_sha256)||
    !DIGEST.test(e.reservation_id)||!Object.values(STATES).includes(e.state)||
    typeof e.scope_id!=="string"||!e.scope_id||
    !Number.isSafeInteger(e.reserved_revision)||e.reserved_revision<=0)
   return false;
  const check=normalize({...e,scope_evidence:"SYNTHETIC_SCOPE_ONLY"});
  if(!check||check.key!==e.key||check.source_sha256!==e.source_sha256||
     check.payload_sha256!==e.payload_sha256||
     e.reservation_id!==sha("v754:reservation:"+e.key+":"+e.payload_sha256)||
     e.reserved_revision> s.revision)return false;
  // A reservation starts at revision 1. Later reservations advance strictly;
  // observation-only revisions may create gaps, but never rewind or duplicate.
  if((previousReservationRevision===0&&e.reserved_revision!==1)||
      e.reserved_revision<=previousReservationRevision)return false;
  previousReservationRevision=e.reserved_revision;
  const viewId=JSON.stringify([e.scope_id,e.order_key,e.kind,e.slot]);
  const previousDestination=logicalViews.get(viewId);
  if(previousDestination!==undefined&&previousDestination!==e.key)return false;
  logicalViews.set(viewId,e.key);
  const sequenceId=JSON.stringify([e.scope_id,e.tata_sequence]);
  const previousOrder=sequenceOwners.get(sequenceId);
  if(previousOrder!==undefined&&previousOrder!==e.order_key)return false;
  sequenceOwners.set(sequenceId,e.order_key);
  seen.add(e.key);
 }
 return true;
}
function validDailyStoreScope(scope){
 if(typeof scope!=="string")return false;
 const m=/^STORE:[A-Z0-9_-]{1,32}\|DATE:(\d{4})-(\d{2})-(\d{2})$/.exec(scope);
 if(!m)return false;
 const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]);
 if(mo<1||mo>12||day<1||day>31)return false;
 const d=new Date(Date.UTC(y,mo-1,day));
 return d.getUTCFullYear()===y&&d.getUTCMonth()+1===mo&&
  d.getUTCDate()===day;
}
function normalize(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const {scope_id,scope_evidence,order_key,kind,station,slot,
  tata_sequence,payload_sha256,source_sha256}=raw;
 if(!validDailyStoreScope(scope_id)||
   scope_evidence!=="SYNTHETIC_SCOPE_ONLY"||
   typeof order_key!=="string"||order_key.split("|").length!==4||
   order_key.split("|").some(x=>!x||x.length>48||/[\r\n]/.test(x))||
   !["PRODUCAO","CONFERENCIA"].includes(kind)||
   typeof station!=="string"||!station||station.length>64||/[|\r\n]/.test(station)||
   !Number.isSafeInteger(slot)||slot<0||slot>50||
   typeof tata_sequence!=="string"||!/^\d{3}$/.test(tata_sequence)||
   typeof payload_sha256!=="string"||!DIGEST.test(payload_sha256)||
   typeof source_sha256!=="string"||!DIGEST.test(source_sha256))return null;
 const values={scope_id,order_key,kind,station,slot,tata_sequence,
  payload_sha256:payload_sha256.toLowerCase(),
  source_sha256:source_sha256.toLowerCase()};
 const key=sha(JSON.stringify([scope_id,order_key,kind,station,slot]));
 return {...values,key};
}
/**
 * Pure proposal only. A print-capable future host MUST commit the returned
 * next_state with DURABLE ATOMIC CAS AND verify the resulting commit before
 * ANY external attempt. Merely receiving this result is not a commit.
 */
function reserve(state,raw,expectedRevision){
 if(!validLedger(state))return reject("LEDGER_INVALID_OR_TAMPERED");
 if(!Number.isSafeInteger(expectedRevision)||state.revision!==expectedRevision)
  return reject("CAS_REVISION_CONFLICT");
 const item=normalize(raw);
 if(!item)return reject("INTENT_OR_SCOPE_UNVERIFIED");
 // Logical-view identity is independent of printer routing. Moving the
 // same order/slot to another station must NOT produce a fresh attempt key.
 // The daily TATA sequence must not bind to another order in this ledger.
 if(state.entries.some(x=>x.scope_id===item.scope_id&&
   x.order_key===item.order_key&&x.kind===item.kind&&x.slot===item.slot&&
   x.key!==item.key))
  return reject("SAME_LOGICAL_VIEW_DESTINATION_CHANGED_NO_REPRINT");
 if(state.entries.some(x=>x.scope_id===item.scope_id&&
   x.tata_sequence===item.tata_sequence&&x.order_key!==item.order_key))
  return reject("TATA_SEQUENCE_COLLISION_BETWEEN_ORDERS");
 const conflict=state.entries.find(x=>x.key===item.key);
 if(conflict){
  if(conflict.payload_sha256!==item.payload_sha256||
     conflict.source_sha256!==item.source_sha256||
     conflict.tata_sequence!==item.tata_sequence)
   return reject("SAME_TICKET_DIFFERENT_SOURCE_OR_SEQUENCE");
  return reject("ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
 }
 const reservation_id=sha("v754:reservation:"+item.key+":"+item.payload_sha256);
 const entry={...item,reservation_id,state:STATES.RESERVED,
  reserved_revision:state.revision+1};
 const next_state={schema:SCHEMA,revision:state.revision+1,
  entries:[...state.entries,entry]};
 return {status:"RESERVATION_PROPOSAL_ONLY",next_state,
  reservation_id,commit_required:"DURABLE_ATOMIC_CAS_BEFORE_SIDE_EFFECT",
  authorize_print:false,requires_durable_commit:true,effects:NO_EFFECTS};
}
function observe(state,key,reservationId,expectedRevision,observation){
 if(!validLedger(state))return reject("LEDGER_INVALID_OR_TAMPERED");
 if(!Number.isSafeInteger(expectedRevision)||state.revision!==expectedRevision)
  return reject("CAS_REVISION_CONFLICT");
 if(typeof key!=="string"||!DIGEST.test(key)||
    typeof reservationId!=="string"||!DIGEST.test(reservationId))
  return reject("INVALID_RESERVATION_ID");
 const old=state.entries.find(e=>e.key===key);
 if(!old||old.reservation_id!==reservationId)return reject("RESERVATION_NOT_FOUND");
 if(!observation||typeof observation!=="object"||Array.isArray(observation))
  return reject("UNKNOWN_OBSERVATION");
 let next;
 // This remains an unverified OBSERVATION CLAIM, never physical evidence.
 // A bare string marker cannot bind a spool job to the attempted bytes.
 if(observation.kind==="SPOOL_ACCEPTED"&&old.state===STATES.RESERVED &&
     observation.transport_evidence==="EXTERNAL_JOB_ID_OBSERVED"&&
     typeof observation.external_job_id==="string"&&
     /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/.test(observation.external_job_id)&&
     observation.reservation_id===old.reservation_id&&
     observation.payload_sha256===old.payload_sha256)
  next=STATES.ACCEPTED;
 else if(observation.kind==="TIMEOUT_OR_CRASH"&&
   [STATES.RESERVED,STATES.ACCEPTED].includes(old.state))
  next=STATES.UNKNOWN;
 else if(observation.kind==="PAPER_CONFIRMED"&&
   [STATES.RESERVED,STATES.ACCEPTED,STATES.UNKNOWN].includes(old.state)&&
   observation.evidence_type==="EXTERNAL_HUMAN_PHOTO"&&
   typeof observation.evidence_ref==="string"&&
   /^evidence:[a-zA-Z0-9_-]{8,96}$/.test(observation.evidence_ref)&&
   observation.reservation_id===old.reservation_id&&
   observation.payload_sha256===old.payload_sha256&&
   observation.source_sha256===old.source_sha256)
  next=STATES.PAPER;
 else return reject("OBSERVATION_NOT_PROVEN_OR_STATE_IMPOSSIBLE");
 const next_state={schema:SCHEMA,revision:state.revision+1,
  entries:state.entries.map(e=>e.key===key?{...e,state:next}:e)};
 return {status:"OBSERVATION_PROPOSAL_ONLY",next_state,
  authorize_print:false,requires_durable_commit:true,effects:NO_EFFECTS};
}
function resumeDecision(state,raw){
 if(!validLedger(state))return reject("LEDGER_INVALID_OR_TAMPERED");
 const item=normalize(raw);if(!item)return reject("INTENT_OR_SCOPE_UNVERIFIED");
 const e=state.entries.find(x=>x.key===item.key);
 if(!e)return reject("NO_COMMITTED_RESERVATION_NOT_PRINT_AUTHORIZED");
 if(e.payload_sha256!==item.payload_sha256||
    e.source_sha256!==item.source_sha256||
    e.tata_sequence!==item.tata_sequence)
  return reject("SOURCE_OR_SEQUENCE_DRIFT_NO_REPRINT");
 return reject("ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
}
/** Stable, already-verified V6.8 metadata to ONE descriptor PER ticket.
 * This maps 2 station tickets + conference, but can never be sent to a printer.
 */
function descriptorsFromProof(manifest,event,context){
 if(!manifest||manifest.status!=="OFFLINE_VERIFIED_NO_PHYSICAL_EFFECT"||
    manifest.effects?.print!==false||manifest.effects?.spooler_write!==false||
    manifest.native_font_candidate?.status!=="NATIVE_FONT_V752_SEMANTIC_PROOF_ONLY"||
    manifest.native_font_candidate?.ready_for_operational_print!==false||
    manifest.native_font_candidate?.effects?.print!==false||
    manifest.native_font_candidate?.effects?.spooler_write!==false||
    !Array.isArray(manifest.outputs)||!Array.isArray(manifest.native_font_candidate.outputs)||
    manifest.outputs.length!==manifest.native_font_candidate.outputs.length||
    manifest.outputs.length!==3||!DIGEST.test(manifest.origin?.event_sha256)||
    !event||event.schema!=="deliveryos.tata-reader-stable-order-event.v1"||
    typeof event.order_key!=="string"||!event.order||
    ["CDFILIAL","CDLOJA","NRVENDAREST","NRCOMANDA"].some(k=>
     typeof event.order[k]!=="string"||!event.order[k])||
    event.order_key!==[event.order.CDFILIAL,event.order.CDLOJA,
     event.order.NRVENDAREST,event.order.NRCOMANDA].join("|")||
    !context)return {status:"HOLD",reasons:["THREE_VIEW_SOURCE_NOT_VERIFIED"],descriptors:[]};
 if(manifest.origin.event_sha256.toLowerCase()!==context.event_file_sha256?.toLowerCase())
  return {status:"HOLD",reasons:["EVENT_SOURCE_HASH_NOT_BOUND"],descriptors:[]};
 const out=[],productionStations=new Set();
 for(let i=0;i<manifest.outputs.length;i++){
  const svg=manifest.outputs[i],native=manifest.native_font_candidate.outputs[i];
  if(svg.kind!==native.kind||svg.station!==native.station||
     svg.boxes!==native.boxes||svg.product_lines!==native.product_lines||
     !Number.isSafeInteger(svg.boxes)||svg.boxes<0||
     !Number.isSafeInteger(svg.product_lines)||svg.product_lines<0||
     !DIGEST.test(svg.svg_sha256)||!DIGEST.test(native.design_svg_sha256)||
     !DIGEST.test(native.native_bytes_sha256)||
     svg.svg_sha256!==native.design_svg_sha256||
     !["PRODUCAO","CONFERENCIA"].includes(native.kind)||
     typeof native.station!=="string"||!native.station.trim()||
     !Number.isSafeInteger(native.native_byte_count)||native.native_byte_count<=0||
     native.full_text_preserved!==true)
   return {status:"HOLD",reasons:["NATIVE_VIEW_DRIFT"],descriptors:[]};
  if(native.kind==="PRODUCAO"){
   const stationKey=native.station.trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toUpperCase();
   if(productionStations.has(stationKey))
    return {status:"HOLD",reasons:["DUPLICATE_PRODUCTION_STATION"],descriptors:[]};
   productionStations.add(stationKey);
  }
  const entry=normalize({scope_id:context.scope_id,
   scope_evidence:context.scope_evidence,order_key:event.order_key,
   kind:native.kind,station:native.station,slot:i,
   tata_sequence:context.tata_sequence,
   payload_sha256:native.native_bytes_sha256,
   source_sha256:manifest.origin.event_sha256});
  if(!entry)return {status:"HOLD",reasons:["DESTINATION_OR_SCOPE_UNPROVEN"],descriptors:[]};
  out.push({...entry,scope_evidence:"SYNTHETIC_SCOPE_ONLY"});
 }
 if(out[out.length-1].kind!=="CONFERENCIA"||
    out.slice(0,-1).some(e=>e.kind!=="PRODUCAO")||
    new Set(out.map(x=>x.key)).size!==out.length)
  return {status:"HOLD",reasons:["TICKET_COUNT_OR_IDENTITY_COLLISION"],descriptors:[]};
 return {status:"OFFLINE_DESCRIPTORS_ONLY",descriptors:out,
  authorize_print:false,effects:NO_EFFECTS};
}
module.exports={SCHEMA,STATES,NO_EFFECTS,fresh,normalize,validLedger,
 reserve,observe,resumeDecision,descriptorsFromProof};

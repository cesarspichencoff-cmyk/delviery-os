"use strict";
/**
 * Capture only the STRUCTURE of proposed disposition reviews from a single
 * native Reader V2 snapshot. No approval, note content, persistence or print.
 * A claim to have reviewed a note is NOT independently verified review.
 */
const {createHash}=require("node:crypto");
const {triageReaderObservations}=require("./comandas_reader_observation_triage_v1_offline.cjs");
const SCHEMA="tata.comandas.observation-disposition-proposals.v1.review-only";
const NO_EFFECTS=Object.freeze({print:false,spooler_write:false,
 sql_read:false,sql_write:false,network:false,filesystem_read:false,
 filesystem_write:false,sequence_write:false,deploy:false,service_change:false});
const CHOICES=new Set(["PROPOSE_PRODUCTION","PROPOSE_CONFERENCE",
 "ESCALATE_FOR_HUMAN"]);
const KEYS=["note_index","scope","item_index","source_field",
 "source_revision_sha256","decision_fingerprint_sha256",
 "proposed_disposition","reviewer_claim_ref"];
const sha=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const plain=x=>x&&typeof x==="object"&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype;
const exactly=(x,keys)=>plain(x)&&
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
function output(status,reason,counts=[0,0,0],receipt=null){
 return {schema:SCHEMA,status,reason,
  production_proposals:counts[0],conference_proposals:counts[1],
  escalate_proposals:counts[2],
  review_claim_receipt_sha256:receipt,
  note_text_exposed:false,reviewer_identity_attested:false,
  human_review_proven:false,disposition_approved:false,
  classification_approved:false,production_ready:false,
  legacy_print_suppression_authorized:false,
  conference_print_authorized:false,production_print_authorized:false,
  print_authorized:false,effects:NO_EFFECTS};
}
function reviewObservationProposals(pair,proposals){
 const triage=triageReaderObservations(pair);
 if(triage.status==="HOLD")return output("HOLD","NATIVE_NOT_IN_REVIEW_SCOPE");
 if(!Array.isArray(proposals)||proposals.length>601)
  return output("HOLD","PROPOSALS_INVALID");
 if(triage.status==="NO_OBSERVATIONS")
  return proposals.length===0
   ?output("NOTHING_TO_REVIEW","NO_NOTES_OR_APPROVAL")
   :output("HOLD","PROPOSALS_WITHOUT_NATIVE_NOTES");
 if(proposals.length!==triage.note_count)
  return output("HOLD","NOT_ALL_NATIVE_NOTES_ACCOUNTED_FOR");
 const map=new Map(triage.entries.map(n=>[n.note_index,n]));
 const seen=new Set(),rows=[],counts=[0,0,0];
 for(const p of proposals){
  if(!exactly(p,KEYS)||!Number.isInteger(p.note_index)||
      seen.has(p.note_index)||!map.has(p.note_index)||
      !CHOICES.has(p.proposed_disposition)||
      p.source_revision_sha256!==triage.source_revision_sha256||
      p.decision_fingerprint_sha256!==pair.decision.fingerprint||
      typeof p.reviewer_claim_ref!=="string"||
      !/^[A-Za-z0-9:_-]{2,64}$/.test(p.reviewer_claim_ref))
   return output("HOLD","UNBOUND_OR_INVALID_REVIEW_CLAIM");
  const n=map.get(p.note_index);seen.add(p.note_index);
  if(p.scope!==n.scope||p.item_index!==n.item_index||
     p.source_field!==n.source_field)
   return output("HOLD","NOTE_SCOPE_OR_INDEX_MISMATCH");
  const j=p.proposed_disposition==="PROPOSE_PRODUCTION"?0:
   p.proposed_disposition==="PROPOSE_CONFERENCE"?1:2;
  counts[j]++;
  rows.push([p.note_index,p.scope,p.item_index,p.source_field,
   p.proposed_disposition,p.reviewer_claim_ref]);
 }
 rows.sort((a,b)=>a[0]-b[0]);
 // SHA binds the claim to the complete native Reader revision, never
 // independently authenticates reviewer, catalog, station or note content.
 const receipt=sha({schema:SCHEMA,
  reader_snapshot_sha256:triage.source_revision_sha256,
  reader_decision_fingerprint_sha256:pair.decision.fingerprint,
  proposed_review_rows:rows});
 return output("PROPOSALS_CAPTURED_NOT_APPROVED",
  "HUMAN_IDENTITY_AND_NOTE_DISPOSITION_NOT_ATTESTED",counts,receipt);
}
/**
 * Re-check a previously captured informational receipt against the CURRENT
 * paired Reader revision and complete proposals. A matching digest still
 * proves neither operator identity nor approval. Never unlock printing.
 */
function verifyObservationProposalReceipt(receipt,pair,proposals){
 if(typeof receipt!=="string"||!/^[a-f0-9]{64}$/.test(receipt))
  return false;
 const current=reviewObservationProposals(pair,proposals);
 return current.status==="PROPOSALS_CAPTURED_NOT_APPROVED"&&
  current.review_claim_receipt_sha256===receipt&&
  current.print_authorized===false&&
  current.human_review_proven===false;
}
module.exports={SCHEMA,NO_EFFECTS,reviewObservationProposals,
 verifyObservationProposalReceipt};

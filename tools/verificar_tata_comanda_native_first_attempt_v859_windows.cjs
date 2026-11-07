"use strict";
// GitHub-hosted disposable Windows only. Never execute against a store computer.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {syntheticReaderPairV857:pair}=
 require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.RUNNER_TEMP||
 process.platform!=="win32")throw Error("GITHUB_HOSTED_WINDOWS_ONLY");
const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,"tata-v859-fixture-"));
const events=path.join(root,"reader-events-v1");
const decisions=path.join(root,"reader-shadow-decisions-v1");
fs.mkdirSync(events);fs.mkdirSync(decisions);
const seqfile=path.join(root,"tata-sequence-state.json");
const efile=path.join(events,"event.json");
const dfile=path.join(decisions,"decision.json");
let checks=0;
function write(src){
 fs.writeFileSync(efile,JSON.stringify(src.event,null,2),"utf8");
 fs.writeFileSync(dfile,JSON.stringify(src.decision,null,2),"utf8");
 fs.writeFileSync(seqfile,JSON.stringify(src.sequence_state,null,2),"utf8");
}
// Privacy contract: an archived order's digits can coincidentally occur
// in the fraction of a UTC timestamp. Validate the output SCHEMA and the
// permitted symbolic strings, not substring matches in arbitrary JSON.
const allowedFields=[
 "schema","status","observed_at_utc","sample_limit","decision_budget",
 "scanned_events","last_event_age_minutes","unique_event_decision_pairs",
 "note_parity_verified_candidates","note_parity_conflicts",
 "basic_essential_content_candidates","observed_native_structural_review_candidates",
 "observed_native_note_parity_review_candidates","observed_native_note_parity_conflicts",
 "legacy_state_inapplicable_with_valid_native_review",
 "observed_native_revisions_authorized_for_print",
 "native_first_production_dispatch_proven","paired_with_persisted_tata_sequence",
 "legacy_v1_short_key_matches_unattested","content_valid_but_sequence_missing",
 "sequence_scope_collisions","sequence_state_status","sequence_bindings_total",
 "unpaired_or_ambiguous","incomplete_essential_content","gp_receipt_proven",
 "full_ifood_uuid_proven","event_snapshot_hash_independently_recomputed",
 "print_paper_proven","source_authenticity_proven","printing_authorized",
 "blocking_codes","effects","privacy"];
const allowedFlags=new Set([
 "DECISION_READ_UNAVAILABLE","EVENT_READ_UNAVAILABLE",
 "EXISTING_TATA_BINDING_MISSING_FOR_SOME_ORDERS",
 "ITEM_OR_ORDER_OBSERVATION_PARITY_FAILED","LATEST_READER_EVENT_STALE",
 "LEGACY_A_CRITERION_NOT_APPLICABLE_TO_OBSERVED_NATIVE_STATE",
 "LEGACY_V1_SHORT_KEY_CANNOT_ATTEST_NATIVE_FULL_IDENTITY",
 "NO_BASIC_ESSENTIAL_CANDIDATE_IN_SAMPLE","NO_READABLE_EVENTS",
 "NO_READER_EVENTS_IN_DIRECTORY","OBSERVED_NATIVE_ITEM_OR_ORDER_NOTES_CONFLICT",
 "OBSERVED_NATIVE_STATES_ARE_REVIEW_ONLY_NOT_PRINT_AUTHORITY",
 "READONLY_INSPECTION_UNAVAILABLE","SEQUENCE_COLLISION_IN_SAMPLE",
 "TATA_SEQUENCE_STATE_ABSENT","TATA_SEQUENCE_STATE_INVALID_OR_UNREADABLE"]);
const countFields=[
 "sample_limit","decision_budget","scanned_events","unique_event_decision_pairs",
 "note_parity_verified_candidates","note_parity_conflicts",
 "basic_essential_content_candidates","observed_native_structural_review_candidates",
 "observed_native_note_parity_review_candidates","observed_native_note_parity_conflicts",
 "legacy_state_inapplicable_with_valid_native_review",
 "paired_with_persisted_tata_sequence","legacy_v1_short_key_matches_unattested",
 "content_valid_but_sequence_missing","sequence_scope_collisions",
 "unpaired_or_ambiguous","incomplete_essential_content"];
function privacyEnvelope(o){
 const keys=Object.keys(o||{});
 assert.ok(keys.length===allowedFields.length &&
  keys.every(k=>allowedFields.includes(k)),"UNEXPECTED_DIAGNOSTIC_OUTPUT_FIELDS");
 assert.equal(o.schema,"tata.comanda.native-first-attempt.v859.readonly");
 assert.ok(["READONLY_DIAGNOSTIC_ONLY","INSPECTION_INCOMPLETE"]
  .includes(o.status),"UNEXPECTED_DIAGNOSTIC_STATUS");
 // Exact .NET round-trip UTC clock, including seven variable fractional digits.
 assert.ok(typeof o.observed_at_utc==="string"&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{7}Z$/.test(o.observed_at_utc)&&
  Number.isFinite(Date.parse(o.observed_at_utc)),"INVALID_DIAGNOSTIC_CLOCK");
 assert.ok(["UNKNOWN","LEGACY_V1_STRUCTURALLY_VALID_NOT_STRONG_KEY",
  "INVALID_OR_UNREADABLE","ABSENT"].includes(o.sequence_state_status),
  "UNEXPECTED_SEQUENCE_STATUS");
 assert.ok(Array.isArray(o.blocking_codes)&&o.blocking_codes.length<=allowedFlags.size&&
  o.blocking_codes.every(x=>allowedFlags.has(x))&&
  new Set(o.blocking_codes).size===o.blocking_codes.length,
  "UNAPPROVED_BLOCKING_CODE_OR_SOURCE_TEXT");
 assert.ok(countFields.every(k=>Number.isSafeInteger(o[k])&&o[k]>=0),
  "NONNUMERIC_OR_NEGATIVE_AGGREGATE");
 assert.ok(o.sample_limit<=25&&o.sample_limit>=1&&o.decision_budget>=1&&
  o.decision_budget<=100&&o.scanned_events<=o.sample_limit&&
  o.unique_event_decision_pairs<=o.scanned_events,
  "AGGREGATE_COUNT_OUT_OF_BOUND");
 assert.ok(countFields.filter(k=>!["sample_limit","decision_budget"].includes(k))
  .every(k=>o[k]<=o.sample_limit),"SAMPLED_COUNTER_EXCEEDS_BUDGET");
 assert.ok(o.sequence_bindings_total===null||
  (Number.isSafeInteger(o.sequence_bindings_total)&&o.sequence_bindings_total>=0),
  "SEQUENCE_TOTAL_NOT_NUMERIC");
 assert.ok(o.last_event_age_minutes===null||
  (typeof o.last_event_age_minutes==="number"&&
   Number.isFinite(o.last_event_age_minutes)&&o.last_event_age_minutes>=0),
  "EVENT_AGE_NOT_NUMERIC");
 const effects=["sql","network","api","ack","print","spooler",
  "service_change","sequence_write","file_write","install","deploy","fiscal"];
 const privacy=["order_ids_exported","hashes_exported","notes_exported",
  "customer_exported","file_paths_exported"];
 for(const [value,fields] of [[o.effects,effects],[o.privacy,privacy]]){
  assert.ok(value&&typeof value==="object"&&!Array.isArray(value)&&
   Object.keys(value).length===fields.length&&
   fields.every(k=>Object.hasOwn(value,k)&&value[k]===false),
   "EFFECT_OR_PRIVACY_FIELD_INVALID");
 }
 for(const field of ["observed_native_revisions_authorized_for_print",
  "native_first_production_dispatch_proven","gp_receipt_proven",
  "full_ifood_uuid_proven","event_snapshot_hash_independently_recomputed",
  "print_paper_proven","source_authenticity_proven","printing_authorized"])
  assert.equal(o[field],false,"UNAUTHORIZED_PROOF_OR_EFFECT");
 // Only recognized symbolic statuses/reasons may leave the fixture. A clock
 // containing '9627' or a numeric aggregate is not a leaked short order ID.
 const visible=[o.schema,o.status,o.sequence_state_status,...o.blocking_codes].join("|");
 for(const canary of ["9627","SEM CEBOLINHA","0000348850"])
  assert.ok(!visible.includes(canary),"NO_CUSTOMER_OR_ORDER_DATA_EXPORTED");
}
function run(){
 const p=spawnSync("pwsh.exe",["-NoProfile","-NonInteractive",
  "-ExecutionPolicy","Bypass","-File",
  "tools/tata_comanda_native_first_attempt_v859_readonly.ps1",
  "-CiFixtureRoot",root,"-SampleSize","5","-DecisionBudget","8"],{
   cwd:path.resolve(__dirname,".."),encoding:"utf8",timeout:45000,
   windowsHide:true
  });
 assert.equal(p.status,0,p.stderr||p.stdout||
  (p.error?String(p.error.code||p.error.message):"POWERSHELL_CHILD_NO_OUTPUT"));
 const raw=p.stdout.trim();
 const o=JSON.parse(raw);
 privacyEnvelope(o);
 assert.equal(o.schema,"tata.comanda.native-first-attempt.v859.readonly");
 assert.deepEqual(Object.values(o.effects),Object.values(o.effects).map(()=>false));
 assert.deepEqual(Object.values(o.privacy),Object.values(o.privacy).map(()=>false));
 assert.equal(o.printing_authorized,false);
 assert.equal(o.full_ifood_uuid_proven,false);
 assert.equal(o.source_authenticity_proven,false);
 return o;
}
function test(name,fn){fn();checks++;console.log("PASS "+checks+" "+name);}
try{
 const x=pair();write(x);
 test("native Reader pair and persisted sequence candidate counts only",()=>{
  const o=run();
  assert.equal(o.status,"READONLY_DIAGNOSTIC_ONLY");
  assert.equal(o.scanned_events,1);
  assert.equal(o.unique_event_decision_pairs,1);
  assert.equal(o.basic_essential_content_candidates,1);
  assert.equal(o.note_parity_verified_candidates,1);
  assert.equal(o.note_parity_conflicts,0);
  assert.equal(o.paired_with_persisted_tata_sequence,0,
   "V1 short-key identity cannot prove strong native persisted binding");
  assert.equal(o.legacy_v1_short_key_matches_unattested,1);
  assert.equal(o.sequence_state_status,
   "LEGACY_V1_STRUCTURALLY_VALID_NOT_STRONG_KEY");
  assert.ok(o.blocking_codes.includes(
   "LEGACY_V1_SHORT_KEY_CANNOT_ATTEST_NATIVE_FULL_IDENTITY"));
  assert.equal(o.sequence_bindings_total,1);
  assert.equal(o.content_valid_but_sequence_missing,0);
 });
 test("legacy V1 duplicate cannot count as a strong persisted binding",()=>{
  const y=pair();
  y.sequence_state.bindings.push({...y.sequence_state.bindings[0]});
  write(y);
  const o=run();
  assert.equal(o.paired_with_persisted_tata_sequence,0);
  assert.equal(o.legacy_v1_short_key_matches_unattested,0);
  assert.equal(o.content_valid_but_sequence_missing,1);
  assert.equal(o.printing_authorized,false);
 });
 test("real native 3/P/X with item 4 is counted as shadow-only evidence",()=>{
  for(const header of ["3","P","X"]){
   const y=pair();
   y.event.order.IDSTCOMANDA=header;
   for(const item of y.event.order.items)item.IDSTPRCOMVEN="4";
   write(y);const o=run();
   assert.equal(o.status,"READONLY_DIAGNOSTIC_ONLY");
   assert.equal(o.unique_event_decision_pairs,1);
   assert.equal(o.observed_native_structural_review_candidates,1);
   assert.equal(o.observed_native_note_parity_review_candidates,1);
   assert.equal(o.observed_native_note_parity_conflicts,0);
   assert.equal(o.basic_essential_content_candidates,0);
   assert.equal(o.note_parity_verified_candidates,0);
   assert.equal(o.paired_with_persisted_tata_sequence,0);
   assert.equal(o.observed_native_revisions_authorized_for_print,false);
   assert.equal(o.native_first_production_dispatch_proven,false);
   assert.equal(o.printing_authorized,false);
   assert.ok(o.blocking_codes.includes(
    "OBSERVED_NATIVE_STATES_ARE_REVIEW_ONLY_NOT_PRINT_AUTHORITY"));
  }
 });
 test("real native item status 6 or canceled header is not reviewed as healthy",()=>{
  const canceledItem=pair();
  canceledItem.event.order.IDSTCOMANDA="P";
  for(const item of canceledItem.event.order.items)item.IDSTPRCOMVEN="4";
  canceledItem.event.order.items[0].IDSTPRCOMVEN="6";
  write(canceledItem);const a=run();
  assert.equal(a.observed_native_structural_review_candidates,0);
  assert.equal(a.observed_native_note_parity_review_candidates,0);
  assert.equal(a.basic_essential_content_candidates,0);
  assert.equal(a.printing_authorized,false);
  const canceledHeader=pair();
  canceledHeader.event.order.IDSTCOMANDA="4";
  for(const item of canceledHeader.event.order.items)item.IDSTPRCOMVEN="4";
  write(canceledHeader);const b=run();
  assert.equal(b.observed_native_structural_review_candidates,0);
  assert.equal(b.native_first_production_dispatch_proven,false);
 });
 test("real native note conflicts remain visible but never promote readiness",()=>{
  for(const mode of ["missing-item-note","missing-order-note",
                     "changed-quantity","unproven-join"]){
   const y=pair();
   y.event.order.IDSTCOMANDA="3";
   for(const item of y.event.order.items)item.IDSTPRCOMVEN="4";
   if(mode==="missing-item-note")y.decision.items[0].observations=[];
   if(mode==="missing-order-note")y.decision.order_observations=[];
   if(mode==="changed-quantity")y.decision.items[0].quantity=99;
   if(mode==="unproven-join")
    y.event.order.observation_rows[0].join_proven=false;
   write(y);const o=run();
   assert.equal(o.observed_native_note_parity_review_candidates,0);
   if(mode==="changed-quantity"){
    assert.equal(o.observed_native_structural_review_candidates,0);
    assert.equal(o.observed_native_note_parity_conflicts,0);
   }else{
    assert.equal(o.observed_native_structural_review_candidates,1);
    assert.equal(o.observed_native_note_parity_conflicts,1);
    assert.ok(o.blocking_codes.includes(
     "OBSERVED_NATIVE_ITEM_OR_ORDER_NOTES_CONFLICT"));
   }
   assert.equal(o.paired_with_persisted_tata_sequence,0);
   assert.equal(o.printing_authorized,false);
  }
 });
 test("real native review never bypasses missing source/decision parity",()=>{
  const y=pair();y.event.order.IDSTCOMANDA="X";
  for(const item of y.event.order.items)item.IDSTPRCOMVEN="4";
  y.decision.ifood_sequence="different";
  write(y);
  const o=run();
  assert.equal(o.observed_native_structural_review_candidates,0);
  assert.equal(o.observed_native_note_parity_review_candidates,0);
  assert.equal(o.native_first_production_dispatch_proven,false);
  assert.equal(o.printing_authorized,false);
 });
 test("valid native 3/P/X are not falsely marked as incomplete content",()=>{
  for(const header of ["3","P","X"]){
   const y=pair();
   y.event.order.IDSTCOMANDA=header;
   for(const item of y.event.order.items)item.IDSTPRCOMVEN="4";
   write(y);
   const o=run();
   assert.equal(o.observed_native_structural_review_candidates,1);
   assert.equal(o.observed_native_note_parity_review_candidates,1);
   assert.equal(o.legacy_state_inapplicable_with_valid_native_review,1);
   assert.equal(o.incomplete_essential_content,0);
   assert.equal(o.basic_essential_content_candidates,0);
   assert.equal(o.paired_with_persisted_tata_sequence,0);
   assert.ok(o.blocking_codes.includes(
    "LEGACY_A_CRITERION_NOT_APPLICABLE_TO_OBSERVED_NATIVE_STATE"));
   assert.equal(o.printing_authorized,false);
  }
 });
 test("actual native content defects are still counted as incomplete",()=>{
  for(const defect of ["quantity","lost-note","canceled-item"]){
   const y=pair();
   y.event.order.IDSTCOMANDA="P";
   for(const item of y.event.order.items)item.IDSTPRCOMVEN="4";
   if(defect==="quantity")y.decision.items[0].quantity=888;
   if(defect==="lost-note")y.decision.items[0].observations=[];
   if(defect==="canceled-item")y.event.order.items[0].IDSTPRCOMVEN="6";
   write(y);const o=run();
   assert.equal(o.legacy_state_inapplicable_with_valid_native_review,0);
   assert.equal(o.incomplete_essential_content,1);
   assert.equal(o.paired_with_persisted_tata_sequence,0);
   assert.equal(o.printing_authorized,false);
  }
 });
 test("legacy A count remains separate and does not become real native evidence",()=>{
  const y=pair();write(y);
  const o=run();
  assert.equal(o.legacy_state_inapplicable_with_valid_native_review,0);
  assert.equal(o.observed_native_structural_review_candidates,0);
  assert.equal(o.incomplete_essential_content,0);
  assert.equal(o.basic_essential_content_candidates,1);
  assert.equal(o.native_first_production_dispatch_proven,false);
  assert.equal(o.printing_authorized,false);
 });
 test("no binding reveals exact real blocker without inventing a sequence",()=>{
  const y=pair();y.sequence_state.bindings=[];write(y);
  const o=run();assert.equal(o.basic_essential_content_candidates,1);
  assert.equal(o.paired_with_persisted_tata_sequence,0);
  assert.equal(o.content_valid_but_sequence_missing,1);
  assert.ok(o.blocking_codes.includes("EXISTING_TATA_BINDING_MISSING_FOR_SOME_ORDERS"));
 });
 test("existing binding on previous day not accepted",()=>{
  const y=pair();y.sequence_state.bindings[0].scope_id="STORE:0001|DATE:2026-10-19";
  write(y);const o=run();
  assert.equal(o.paired_with_persisted_tata_sequence,0);
 });
 test("same sequence duplicated for another order marked collision",()=>{
  const y=pair();
  y.sequence_state.bindings.push({scope_id:"STORE:0001|DATE:2026-10-20",
   teknisa_order_id:"0000348888",tata_sequence:"007"});
  write(y);
  const o=run();assert.equal(o.sequence_scope_collisions,1);
  assert.equal(o.paired_with_persisted_tata_sequence,0);
 });
 test("changed item quantity cannot show essential candidate",()=>{
  const y=pair();y.decision.items[0].quantity=888;write(y);
  const o=run();assert.equal(o.basic_essential_content_candidates,0);
  assert.equal(o.incomplete_essential_content,1);
 });
 test("lost item instruction fails read-only candidate without exporting notes",()=>{
  const y=pair();y.decision.items[0].observations=[];write(y);
  const o=run();
  assert.equal(o.basic_essential_content_candidates,0);
  assert.equal(o.note_parity_conflicts,1);
  assert.equal(o.paired_with_persisted_tata_sequence,0);
  assert.ok(o.blocking_codes.includes("ITEM_OR_ORDER_OBSERVATION_PARITY_FAILED"));
 });
 test("changed allergy text fails even while pair keys are unchanged",()=>{
  const y=pair();y.decision.items[0].observations[1].value="TEXTO SINTETICO DIFERENTE";
  write(y);const o=run();
  assert.equal(o.note_parity_conflicts,1);
  assert.equal(o.basic_essential_content_candidates,0);
 });
 test("general note dropped from decision prevents essential candidate",()=>{
  const y=pair();y.decision.order_observations=[];write(y);
  const o=run();assert.equal(o.note_parity_conflicts,1);
  assert.equal(o.basic_essential_content_candidates,0);
 });
 test("extra source note is never silently omitted",()=>{
  const y=pair();y.event.order.observation_rows.push({
   source_field:"DSOBSPEDDIGCMD",value:"SEGUNDA OBSERVACAO SINTETICA",
   scope_hint:"item",join_proven:true,item_index:0,CDPRODUTO:"0000001111",
  });
  write(y);const o=run();assert.equal(o.note_parity_conflicts,1);
  assert.equal(o.basic_essential_content_candidates,0);
 });
 test("unproven source-note join blocks even if projected text matches",()=>{
  const y=pair();y.event.order.observation_rows[0].join_proven=false;
  write(y);const o=run();assert.equal(o.note_parity_conflicts,1);
  assert.equal(o.basic_essential_content_candidates,0);
 });
 test("duplicate extra decision note fails no-note-invention guarantee",()=>{
  const y=pair();y.decision.items[0].observations.push({
   source_field:"TXPRODCOMVEN",value:"OBSERVACAO EXTRA SINTETICA",
  });
  write(y);const o=run();assert.equal(o.note_parity_conflicts,1);
  assert.equal(o.basic_essential_content_candidates,0);
 });
 test("note order permutation retains content parity",()=>{
  const y=pair();y.decision.items[0].observations.reverse();write(y);
  const o=run();assert.equal(o.note_parity_verified_candidates,1);
  assert.equal(o.note_parity_conflicts,0);
  assert.equal(o.basic_essential_content_candidates,1);
 });
 test("missing decision shows unpaired, not lost iFood order",()=>{
  const y=pair();write(y);fs.rmSync(dfile);
  const o=run();assert.equal(o.unpaired_or_ambiguous,1);
  assert.equal(o.basic_essential_content_candidates,0);
  assert.equal(o.paired_with_persisted_tata_sequence,0);
 });
 test("privacy distinguishes dynamic clock collision from private output",()=>{
  const valid=run();
  privacyEnvelope({...valid,observed_at_utc:"2026-11-07T18:03:33.9627000Z"});
  assert.throws(()=>privacyEnvelope({...valid,order_id:"0000348850"}),
   /UNEXPECTED_DIAGNOSTIC_OUTPUT_FIELDS/);
  assert.throws(()=>privacyEnvelope({...valid,blocking_codes:["SEM CEBOLINHA"]}),
   /UNAPPROVED_BLOCKING_CODE_OR_SOURCE_TEXT/);
  assert.throws(()=>privacyEnvelope({...valid,status:"READONLY_DIAGNOSTIC_ONLY 9627"}),
   /UNEXPECTED_DIAGNOSTIC_STATUS/);
  assert.throws(()=>privacyEnvelope({...valid,scanned_events:"0000348850"}),
   /NONNUMERIC_OR_NEGATIVE_AGGREGATE/);
 });
 test("missing sequence file reported independently",()=>{
  const y=pair();write(y);fs.rmSync(seqfile);
  const o=run();assert.equal(o.sequence_state_status,"ABSENT");
  assert.equal(o.paired_with_persisted_tata_sequence,0);
  assert.ok(o.blocking_codes.includes("TATA_SEQUENCE_STATE_ABSENT"));
 });
 console.log("TATA_COMANDA_NATIVE_FIRST_ATTEMPT_V859_WINDOWS="+checks+"/"+checks+
  " DISPOSABLE_FIXTURE ONLY_AGGREGATES NO_HOST NO_PRINT NO_SQL NO_WRITE");
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}

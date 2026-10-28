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
 assert.ok(!raw.includes("9627")&&!raw.includes("SEM CEBOLINHA")&&
  !raw.includes("0000348850"),"NO_CUSTOMER_OR_ORDER_DATA_EXPORTED");
 const o=JSON.parse(raw);
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
  assert.equal(o.paired_with_persisted_tata_sequence,1,
   JSON.stringify({sequence_state_status:o.sequence_state_status,
    bindings:o.sequence_bindings_total,
    content_valid_but_sequence_missing:o.content_valid_but_sequence_missing,
    sequence_scope_collisions:o.sequence_scope_collisions,
    blocking_codes:o.blocking_codes}));
  assert.equal(o.sequence_bindings_total,1);
  assert.equal(o.content_valid_but_sequence_missing,0);
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

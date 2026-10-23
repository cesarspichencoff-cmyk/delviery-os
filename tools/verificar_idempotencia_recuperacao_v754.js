"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {SCHEMA,STATES,NO_EFFECTS,fresh,normalize,validLedger,reserve,
 observe,resumeDecision,descriptorsFromProof}=
 require("./comandas_idempotencia_v754_offline.js");
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
 order_key:"0001|01|0000000001|0000000001",order:{CDFILIAL:"0001",CDLOJA:"01",
 NRVENDAREST:"0000000001",NRCOMANDA:"0000000001"}};
const ctx={scope_id:"STORE:SIMULATED|DATE:2026-10-13",scope_evidence:"SYNTHETIC_SCOPE_ONLY",
 tata_sequence:"001",event_file_sha256:sha("synthetic-bound-fixture")};
const views=[{kind:"PRODUCAO",station:"COZINHA",boxes:2,product_lines:2},
 {kind:"PRODUCAO",station:"SUSHI",boxes:4,product_lines:4},
 {kind:"CONFERENCIA",station:"CONFERÊNCIA",boxes:6,product_lines:6}];
const outputs=views.map((v,i)=>({...v,svg_sha256:sha("svg"+i)}));
const native=views.map((v,i)=>({...v,design_svg_sha256:sha("svg"+i),
 native_bytes_sha256:sha("native"+i),native_byte_count:500+i,
 full_text_preserved:true}));
const manifest={status:"OFFLINE_VERIFIED_NO_PHYSICAL_EFFECT",
 effects:{print:false,spooler_write:false},origin:{event_sha256:ctx.event_file_sha256},outputs,
 native_font_candidate:{status:"NATIVE_FONT_V752_SEMANTIC_PROOF_ONLY",
 ready_for_operational_print:false,effects:{print:false,spooler_write:false},outputs:native}};
let n=0;function test(label,fn){fn();n++;process.stdout.write("PASS "+n+" "+label+"\n")}
const d=descriptorsFromProof(manifest,event,ctx);
test("exact three source-bound descriptors but never print authority",()=>{
 assert.equal(d.status,"OFFLINE_DESCRIPTORS_ONLY");assert.equal(d.authorize_print,false);
 assert.equal(d.descriptors.length,3);assert.equal(new Set(d.descriptors.map(x=>x.key)).size,3);
 assert.deepEqual(d.descriptors.map(x=>x.kind),["PRODUCAO","PRODUCAO","CONFERENCIA"]);
});
test("empty ledger is strict and no effects",()=>{
 assert.ok(validLedger(fresh()));assert.deepEqual(fresh(),{schema:SCHEMA,revision:0,entries:[]});
 assert.equal(NO_EFFECTS.print,false);assert.equal(NO_EFFECTS.spooler_write,false);
});
let state=fresh(),a,b,c;
test("reservation proposal cannot authorize spool",()=>{
 a=reserve(state,d.descriptors[0],0);
 assert.equal(a.status,"RESERVATION_PROPOSAL_ONLY");
 assert.equal(a.authorize_print,false);
 assert.equal(a.requires_durable_commit,true);
 assert.equal(a.commit_required,"DURABLE_ATOMIC_CAS_BEFORE_SIDE_EFFECT");
 assert.equal(a.next_state.entries[0].state,STATES.RESERVED);
 assert.deepEqual(state,fresh(),"pure reserve must not mutate ledger");
 state=a.next_state;
});
test("same order same ticket replay blocked",()=>{
 assert.equal(reserve(state,d.descriptors[0],1).reasons[0],
 "ALREADY_ATTEMPTED_NO_AUTOMATIC_RETRY");
 assert.equal(resumeDecision(state,d.descriptors[0]).status,"HOLD");
});
test("crash after durable reservation persists HOLD on replay",()=>{
 const reboot=JSON.parse(JSON.stringify(state));
 assert.equal(resumeDecision(reboot,d.descriptors[0]).authorize_print,false);
 assert.equal(reserve(reboot,d.descriptors[0],1).status,"HOLD");
});
test("simulated accept is still physical uncertainty and no automatic retry",()=>{
 const r=observe(state,d.descriptors[0].key,a.reservation_id,1,
  {kind:"SPOOL_ACCEPTED",transport_evidence:"EXTERNAL_JOB_ID_OBSERVED"});
 assert.equal(r.status,"OBSERVATION_PROPOSAL_ONLY");
 assert.equal(r.next_state.entries[0].state,STATES.ACCEPTED);
 assert.equal(r.authorize_print,false);
 state=r.next_state;
 assert.equal(resumeDecision(state,d.descriptors[0]).status,"HOLD");
});
test("timeout AFTER spool acceptance is uncertain, never retry",()=>{
 const r=observe(state,d.descriptors[0].key,a.reservation_id,2,{kind:"TIMEOUT_OR_CRASH"});
 assert.equal(r.next_state.entries[0].state,STATES.UNKNOWN);
 state=r.next_state;
 assert.equal(reserve(state,d.descriptors[0],3).authorize_print,false);
});
test("unknown result cannot self-declare paper from event text",()=>{
 assert.equal(observe(state,d.descriptors[0].key,a.reservation_id,3,
  {kind:"PAPER_CONFIRMED",evidence_type:"SYNTHETIC_USER_FLAG",
   evidence_ref:"evidence:abcdefgh"}).status,"HOLD");
});
test("external evidence is recorded as an unverified assertion, never print permit",()=>{
 const r=observe(state,d.descriptors[0].key,a.reservation_id,3,
  {kind:"PAPER_CONFIRMED",evidence_type:"EXTERNAL_HUMAN_PHOTO",
   evidence_ref:"evidence:fictitiousphoto123"});
 assert.equal(r.next_state.entries[0].state,STATES.PAPER);
 assert.equal(r.authorize_print,false);state=r.next_state;
 assert.equal(resumeDecision(state,d.descriptors[0]).status,"HOLD");
});
test("revision races need true CAS (not supplied by planner)",()=>{
 const snapshot=fresh();const w1=reserve(snapshot,d.descriptors[0],0);
 const w2=reserve(snapshot,d.descriptors[0],0);
 assert.equal(w1.next_state.revision,w2.next_state.revision);
 const fakeStore={revision:0,state:snapshot};
 const compareAndSwap=proposal=>{
  if(proposal.next_state.revision!==fakeStore.revision+1)return false;
  fakeStore.revision++;fakeStore.state=proposal.next_state;return true;
 };
 assert.equal(compareAndSwap(w1),true);
 assert.equal(compareAndSwap(w2),false);
 assert.equal(reserve(fakeStore.state,d.descriptors[0],0).reasons[0],"CAS_REVISION_CONFLICT");
 // Above fake CAS is SIMULATION, never evidence of atomic filesystem durability.
});
test("second station and conference have distinct reservations",()=>{
 b=reserve(state,d.descriptors[1],4);assert.equal(b.status,"RESERVATION_PROPOSAL_ONLY");
 state=b.next_state;c=reserve(state,d.descriptors[2],5);
 assert.equal(c.status,"RESERVATION_PROPOSAL_ONLY");state=c.next_state;
 assert.equal(state.entries.length,3);
});
test("ticket mutation on same order conflicts instead of duplicate",()=>{
 const t={...d.descriptors[0],payload_sha256:sha("changed byte")};
 assert.equal(reserve(state,t,6).reasons[0],"SAME_TICKET_DIFFERENT_SOURCE_OR_SEQUENCE");
 const seq={...d.descriptors[0],tata_sequence:"002"};
 assert.equal(reserve(state,seq,6).reasons[0],"SAME_TICKET_DIFFERENT_SOURCE_OR_SEQUENCE");
 const revision={...d.descriptors[0],source_sha256:sha("changed event")};
 assert.equal(resumeDecision(state,revision).reasons[0],"SOURCE_OR_SEQUENCE_DRIFT_NO_REPRINT");
});
test("station reroute cannot create a second reservation for the same logical view",()=>{
 const rerouted={...d.descriptors[0],station:"DELIVERY_SUSHI_2"};
 assert.equal(reserve(state,rerouted,6).reasons[0],
  "SAME_LOGICAL_VIEW_DESTINATION_CHANGED_NO_REPRINT");
 assert.equal(reserve(state,rerouted,6).authorize_print,false);
});
test("one TATA sequence cannot silently be shared by two different orders",()=>{
 const other={...d.descriptors[0],order_key:"0001|01|0000000002|0000000002"};
 assert.equal(reserve(state,other,6).reasons[0],
  "TATA_SEQUENCE_COLLISION_BETWEEN_ORDERS");
});
test("history erased with nonzero revision is HOLD, not a fresh printing opportunity",()=>{
 const truncated=structuredClone(state);truncated.entries=[];
 assert.equal(truncated.revision,6);
 assert.equal(validLedger(truncated),false);
 assert.equal(reserve(truncated,d.descriptors[0],6).status,"HOLD");
 assert.equal(resumeDecision(truncated,d.descriptors[0]).status,"HOLD");
});
test("missing first reservation or reordered timestamps are not a valid ledger",()=>{
 const missingFirst=structuredClone(state);missingFirst.entries.shift();
 assert.equal(validLedger(missingFirst),false);
 const reordered=structuredClone(state);reordered.entries.reverse();
 assert.equal(validLedger(reordered),false);
 const reusedRevision=structuredClone(state);
 reusedRevision.entries[1].reserved_revision=reusedRevision.entries[0].reserved_revision;
 assert.equal(validLedger(reusedRevision),false);
});
test("tampered ledger with two printer routes for one logical receipt is rejected",()=>{
 const corrupted=structuredClone(state);
 const changed=normalize({...d.descriptors[0],station:"ANOTHER_STATION"});
 const replica={...changed,
  reservation_id:sha("v754:reservation:"+changed.key+":"+changed.payload_sha256),
  state:STATES.RESERVED,reserved_revision:7};
 corrupted.entries.push(replica);corrupted.revision=7;
 assert.equal(validLedger(corrupted),false);
});
test("tampered ledger with cross-order number reuse is rejected",()=>{
 const corrupted=structuredClone(state);
 const changed=normalize({...d.descriptors[0],order_key:"0001|01|0000000002|0000000002"});
 const replica={...changed,
  reservation_id:sha("v754:reservation:"+changed.key+":"+changed.payload_sha256),
  state:STATES.RESERVED,reserved_revision:7};
 corrupted.entries.push(replica);corrupted.revision=7;
 assert.equal(validLedger(corrupted),false);
});
test("cross-day scope does not collide, but still only proposes",()=>{
 const tomorrow={...d.descriptors[0],scope_id:"STORE:SIMULATED|DATE:2026-10-14"};
 const r=reserve(state,tomorrow,6);
 assert.equal(r.status,"RESERVATION_PROPOSAL_ONLY");
 assert.equal(r.authorize_print,false);
});
test("invalid operational dates rejected, valid leap day allowed only offline",()=>{
 for(const wrong of ["2026-02-30","2025-02-29","2026-13-01","2026-00-01",
  "2026-10-32","2026-04-31"]){
  assert.equal(reserve(state,{...d.descriptors[0],
   scope_id:"STORE:SIMULATED|DATE:"+wrong},6).status,"HOLD",wrong);
 }
 const leap=reserve(state,{...d.descriptors[0],
  scope_id:"STORE:SIMULATED|DATE:2024-02-29"},6);
 assert.equal(leap.status,"RESERVATION_PROPOSAL_ONLY");
 assert.equal(leap.authorize_print,false);
});
test("missing or self-declared authorization scope blocked",()=>{
 assert.equal(reserve(state,{...d.descriptors[0],scope_evidence:"HUMAN_CONFIRMED_RULE"},6).status,"HOLD");
 assert.equal(reserve(state,{...d.descriptors[0],scope_id:""},6).status,"HOLD");
});
test("unknown request after reboot still cannot authorize",()=>{
 const r=resumeDecision(JSON.parse(JSON.stringify(state)),d.descriptors[2]);
 assert.equal(r.authorize_print,false);assert.equal(r.status,"HOLD");
});
test("tampered ledger key and reservation identity blocked",()=>{
 const corrupt=structuredClone(state);corrupt.entries[0].key=sha("different key");
 assert.equal(validLedger(corrupt),false);assert.equal(reserve(corrupt,d.descriptors[1],6).status,"HOLD");
 const bad=structuredClone(state);bad.entries[0].reservation_id=sha("other reservation");
 assert.equal(validLedger(bad),false);
});
test("stale revision and misidentified receipt rejected",()=>{
 assert.equal(observe(state,d.descriptors[0].key,a.reservation_id,5,{kind:"TIMEOUT_OR_CRASH"}).reasons[0],"CAS_REVISION_CONFLICT");
 assert.equal(observe(state,d.descriptors[0].key,sha("forged"),6,{kind:"TIMEOUT_OR_CRASH"}).reasons[0],"RESERVATION_NOT_FOUND");
});
test("all unverified three-way manifest variants blocked",()=>{
 for(const mutate of [
  x=>{x.native_font_candidate.status="BLOCKED"},
  x=>{x.outputs.pop()},x=>{x.native_font_candidate.outputs[0].native_bytes_sha256="x"},
  x=>{x.native_font_candidate.outputs[1].boxes++},
  x=>{x.native_font_candidate.outputs[0].kind="CONFERENCIA"},
  x=>{x.origin.event_sha256=sha("other event")},
  x=>{x.native_font_candidate.effects.print=true}
 ]){
  const invalid=structuredClone(manifest);mutate(invalid);
  assert.equal(descriptorsFromProof(invalid,event,ctx).status,"HOLD");
 }
});
test("exactly two production and one conference descriptor are required",()=>{
 const missing=structuredClone(manifest);
 missing.outputs.shift();missing.native_font_candidate.outputs.shift();
 assert.equal(descriptorsFromProof(missing,event,ctx).status,"HOLD");
 const extra=structuredClone(manifest);
 const addedSvg={...extra.outputs[0],station:"TERCEIRA_PRACA"};
 const addedNative={...extra.native_font_candidate.outputs[0],station:"TERCEIRA_PRACA"};
 extra.outputs.splice(2,0,addedSvg);
 extra.native_font_candidate.outputs.splice(2,0,addedNative);
 assert.equal(descriptorsFromProof(extra,event,ctx).status,"HOLD");
});
test("duplicate station or mismatch between design and native print is rejected",()=>{
 const duplicate=structuredClone(manifest);
 duplicate.outputs[1].station=duplicate.outputs[0].station;
 duplicate.native_font_candidate.outputs[1].station=duplicate.native_font_candidate.outputs[0].station;
 assert.equal(descriptorsFromProof(duplicate,event,ctx).status,"HOLD");
 const wrongStation=structuredClone(manifest);
 wrongStation.outputs[0].station="SUSHI";
 assert.equal(descriptorsFromProof(wrongStation,event,ctx).status,"HOLD");
 const wrongKind=structuredClone(manifest);
 wrongKind.outputs[0].kind="CONFERENCIA";
 assert.equal(descriptorsFromProof(wrongKind,event,ctx).status,"HOLD");
 const blankStation=structuredClone(manifest);
 blankStation.outputs[0].station="   ";
 blankStation.native_font_candidate.outputs[0].station="   ";
 assert.equal(descriptorsFromProof(blankStation,event,ctx).status,"HOLD");
 const noDesignDigest=structuredClone(manifest);
 delete noDesignDigest.outputs[0].svg_sha256;
 delete noDesignDigest.native_font_candidate.outputs[0].design_svg_sha256;
 assert.equal(descriptorsFromProof(noDesignDigest,event,ctx).status,"HOLD");
 const absentCounts=structuredClone(manifest);
 delete absentCounts.outputs[0].boxes;
 delete absentCounts.native_font_candidate.outputs[0].boxes;
 assert.equal(descriptorsFromProof(absentCounts,event,ctx).status,"HOLD");
});
test("event identity four parts is exact and revision bound",()=>{
 const wrong=structuredClone(event);wrong.order.NRCOMANDA="OTHER";
 assert.equal(descriptorsFromProof(manifest,wrong,ctx).status,"HOLD");
 assert.equal(descriptorsFromProof(manifest,event,{...ctx,event_file_sha256:sha("wrong")}).status,"HOLD");
});
test("no transport, filesystem writes, network, or service control API",()=>{
 const content=fs.readFileSync(path.join(__dirname,"comandas_idempotencia_v754_offline.js"),"utf8");
 assert.doesNotMatch(content,/\brequire\s*\(\s*["']node:(?:fs|net|http|https|child_process|dgram)["']|\b(?:WritePrinter|StartDocPrinter|OpenPrinter|Set-Printer|execSync|spawnSync)\s*\(/i);
 assert.doesNotMatch(content,/\.writeFileSync\s*\(|\.connect\s*\(|\bfetch\s*\(/i);
 assert.equal(validLedger(state),true);
});
console.log(JSON.stringify({schema:"deliveryos.comandas-attempt-v754.adversarial",result:"PASS",
 checks:n,attempt_count:3,crash_replay_no_auto_retry:true,
 simulated_cas_not_operational_atomicity:true,three_view_metadata:true,
 durability_implemented:false,printer_ack_proven:false,print:false,
 spooler_write:false,teknisa_touched:false}));

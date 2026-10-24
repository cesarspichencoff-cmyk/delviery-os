"use strict";
/** V7.56. Offline-only verification of synthetic journal reconciliation.
 * Creates only disposable os.tmpdir fixtures. It cannot reach any printer.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {auditExpectedThreeViews,STATUS,EFFECTS}=
 require("./comandas_reconciliation_v756_offline.js");
const {reserveDurablyInSyntheticSandbox,snapshot}=
 require("./comandas_journal_v755_sandbox.js");
const h=s=>crypto.createHash("sha256").update(s).digest("hex");
const src=h("V756-SOURCE-ONLY");
const kinds=["PRODUCAO","PRODUCAO","CONFERENCIA"];
const stations=["COZINHA","SUSHI","CONFERENCIA"];
const descriptors=stations.map((station,slot)=>({
 scope_id:"STORE:SIMULATED|DATE:2026-10-13",
 scope_evidence:"SYNTHETIC_SCOPE_ONLY",
 order_key:"0001|01|0000000001|0000000001",kind:kinds[slot],
 station,slot,tata_sequence:"001",payload_sha256:h("V756-FICTITIOUS-"+slot),
 source_sha256:src
}));
const dirs=[];const make=()=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v755-"));dirs.push(p);return p};
let n=0;
function test(label,fn){fn();n++;console.log("PASS V756 "+n+" "+label)}
function verifyHold(x){
 assert.equal(x.print_authorized,false);
 assert.equal(x.no_automatic_retry,true);
 assert.equal(x.manual_review_required,true);
 assert.equal(x.exact_once_physical_proven,false);
 assert.equal(x.external_anchor_proven,false);
 assert.equal(x.effects.print,false);
 assert.equal(x.effects.spooler_write,false);
 assert.equal(x.effects.lock_cleanup,false);
}
try{
const empty=make();
test("no journal reservation is UNKNOWN, not proof of no physical print",()=>{
 const r=auditExpectedThreeViews(empty,descriptors);
 verifyHold(r);
 assert.equal(r.status,"MANUAL_RECONCILIATION_REQUIRED");
 assert.equal(r.recorded_attempts,0);
 assert.equal(r.missing_attempt_records,3);
 assert.ok(r.receipt_states.every(x=>x.state===STATUS.MISSING));
 assert.equal(r.missing_record_is_not_no_print_proof,true);
});
const partial=make();
test("one reservation is not a full three-way print",()=>{
 const x=reserveDurablyInSyntheticSandbox(partial,descriptors[0],0);
 assert.equal(x.status,"SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
 const r=auditExpectedThreeViews(partial,descriptors);
 verifyHold(r);assert.equal(r.recorded_attempts,1);
 assert.equal(r.missing_attempt_records,2);
 assert.deepEqual(r.receipt_states.map(x=>x.state),
  [STATUS.RESERVED,STATUS.MISSING,STATUS.MISSING]);
});
test("snapshot after simulated restart retains unknown physical outcome",()=>{
 const r=auditExpectedThreeViews(partial,structuredClone(descriptors));
 verifyHold(r);assert.equal(r.receipt_states[0].physical_paper_verified,false);
 assert.equal(r.receipt_states[0].state,STATUS.RESERVED);
});
test("all three ledger reservations remain HUMAN REVIEW only",()=>{
 for(let i=1;i<3;i++){
  const r=reserveDurablyInSyntheticSandbox(partial,descriptors[i],i);
  assert.equal(r.status,"SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
 }
 const a=auditExpectedThreeViews(partial,descriptors);
 verifyHold(a);assert.equal(a.recorded_attempts,3);
 assert.equal(a.missing_attempt_records,0);
 assert.deepEqual(a.receipt_states.map(x=>x.kind),kinds);
 assert.ok(a.receipt_states.every(x=>x.state===STATUS.RESERVED));
 assert.equal(a.spool_ack_is_not_paper_proof,true);
 assert.equal(a.photo_reference_is_not_external_validation,true);
});
test("duplicate order or receipt slot cannot change expected identity",()=>{
 const d=structuredClone(descriptors);d[1].slot=0;
 verifyHold(auditExpectedThreeViews(partial,d));
 assert.equal(auditExpectedThreeViews(partial,d).status,"RECONCILIATION_HOLD");
});
test("source hash drift blocks even if all ticket byte hashes match",()=>{
 const d=structuredClone(descriptors);d[2].source_sha256=h("different-event");
 assert.equal(auditExpectedThreeViews(partial,d).status,"RECONCILIATION_HOLD");
});
test("payload drift after reservation blocks source reconciliation",()=>{
 const d=structuredClone(descriptors);d[1].payload_sha256=h("mutated-payload");
 assert.equal(auditExpectedThreeViews(partial,d).status,"RECONCILIATION_HOLD");
});
test("change of sequence cannot quietly reprint or reassign",()=>{
 const d=structuredClone(descriptors);d[0].tata_sequence="002";
 verifyHold(auditExpectedThreeViews(partial,d));
});
test("wrong station or reordered conference fails closed",()=>{
 const d=structuredClone(descriptors);d[2].kind="PRODUCAO";
 assert.equal(auditExpectedThreeViews(partial,d).status,"RECONCILIATION_HOLD");
});
test("orphan journal receipt for another source is a hard HOLD",()=>{
 const d=structuredClone(descriptors);d[0].payload_sha256=h("foreign-content");
 const other=make();
 const q=reserveDurablyInSyntheticSandbox(other,descriptors[0],0);
 assert.equal(q.status,"SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
 // Replace the expected receipt with another logically valid ticket.
 d[0].station="OTHER"; // derived key now differs, leaving a journal orphan
 assert.equal(auditExpectedThreeViews(other,d).status,"RECONCILIATION_HOLD");
});
test("stale lock never self-releases during read-only audit",()=>{
 const locked=make();fs.mkdirSync(path.join(locked,".attempt-lock"));
 assert.equal(auditExpectedThreeViews(locked,descriptors).status,"RECONCILIATION_HOLD");
 assert.ok(fs.existsSync(path.join(locked,".attempt-lock")));
});
test("journal damaged in place remains HOLD and unmodified",()=>{
 const bad=make();assert.equal(
 reserveDurablyInSyntheticSandbox(bad,descriptors[0],0).status,
 "SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
 const f=path.join(bad,"state-000001.json");fs.writeFileSync(f,"{not-json");
 const before=fs.readFileSync(f,"utf8");
 assert.equal(auditExpectedThreeViews(bad,descriptors).status,"RECONCILIATION_HOLD");
 assert.equal(fs.readFileSync(f,"utf8"),before);
});
test("forged spool ACK within first snapshot is rejected by journal protocol",()=>{
 const bad=make();reserveDurablyInSyntheticSandbox(bad,descriptors[0],0);
 const f=path.join(bad,"state-000001.json");
 const obj=JSON.parse(fs.readFileSync(f,"utf8"));
 obj.ledger.entries[0].state="SPOOL_ACCEPTED_PAPER_UNVERIFIED";
 fs.writeFileSync(f,JSON.stringify(obj));
 assert.equal(snapshot(bad).status,"HOLD");
 assert.equal(auditExpectedThreeViews(bad,descriptors).status,"RECONCILIATION_HOLD");
});
test("forged paper confirmation within first snapshot cannot grant acceptance",()=>{
 const bad=make();reserveDurablyInSyntheticSandbox(bad,descriptors[0],0);
 const f=path.join(bad,"state-000001.json");
 const obj=JSON.parse(fs.readFileSync(f,"utf8"));
 obj.ledger.entries[0].state="PAPER_EVIDENCE_RECORDED_NOT_WORLD_PROVEN";
 fs.writeFileSync(f,JSON.stringify(obj));
 verifyHold(auditExpectedThreeViews(bad,descriptors));
});
test("wrong temp directory and non-synthetic scope rejected",()=>{
 assert.equal(auditExpectedThreeViews(process.cwd(),descriptors).status,"RECONCILIATION_HOLD");
 const d=structuredClone(descriptors);d[0].scope_evidence="LIVE_CONFIRMED";
 assert.equal(auditExpectedThreeViews(partial,d).status,"RECONCILIATION_HOLD");
});
test("no paper, operator, printer, service or write effects",()=>{
 const contents=fs.readFileSync(path.join(__dirname,"comandas_reconciliation_v756_offline.js"),"utf8");
 assert.doesNotMatch(contents,/\b(?:OpenPrinter|WritePrinter|StartDocPrinter|Get-Printer|Set-Printer|execSync|spawnSync|writeFileSync|unlinkSync|rmSync|rmdirSync|mkdirSync|renameSync|createConnection)\s*\(/);
 assert.deepEqual(EFFECTS,{print:false,spooler_write:false,
  sequence_binding_write:false,service_change:false,driver_change:false,
  odhen_write:false,deploy:false,filesystem_write:false,lock_cleanup:false});
});
console.log(JSON.stringify({schema:"deliveryos.synthetic-reconciliation-v756",
 result:"PASS",tests:n,three_tickets:true,uncertain_after_restart:true,
 spoofed_spool_or_paper_rejected:true,printer_access:false,
 services_modified:false,automatic_reprint:false,
 physical_exactly_once_proven:false,windows_durability_proven:false}));
}finally{
 for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});
}

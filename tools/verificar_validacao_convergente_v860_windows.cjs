"use strict";
/**
 * TATA Comanda V8.60 - disposable WINDOWS ONLY dual-reader witness.
 * Separately executes V8.57 snapshot/fingerprint oracle and V8.59 native PS
 * against the exact SAME synthetic event, decision and persisted sequence.
 *
 * A V8.59 "basic candidate" is not a cryptographically verified event.
 * We must require agreement between both witnesses before labeling an
 * offline synthetic fixture convergent. No live operational proof implied.
 *
 * No printer, network, service, SQL, spooler, order data, private motor,
 * mapping, sequence mutation outside this temporary test fixture.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {spawnSync}=require("node:child_process");
const {syntheticReaderPairV857}=require("./verificar_tata_comanda_reader_native_v857_offline.cjs");
const {projectReaderEssentials}=require("./tata_comanda_reader_native_essentials_v857_offline.cjs");

if(process.env.GITHUB_ACTIONS!=="true"||
 !process.env.RUNNER_TEMP||process.platform!=="win32")
 throw Error("GITHUB_HOSTED_WINDOWS_ONLY");
const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,"tata-v860-convergence-"));
const events=path.join(root,"reader-events-v1");
const decisions=path.join(root,"reader-shadow-decisions-v1");
fs.mkdirSync(events);fs.mkdirSync(decisions);
const eventPath=path.join(events,"event.json"),
 decisionPath=path.join(decisions,"decision.json"),
 sequencePath=path.join(root,"tata-sequence-state.json");
let count=0;
function write(x){
 fs.writeFileSync(eventPath,JSON.stringify(x.event),"utf8");
 fs.writeFileSync(decisionPath,JSON.stringify(x.decision),"utf8");
 fs.writeFileSync(sequencePath,JSON.stringify(x.sequence_state),"utf8");
}
function native(){
 const proc=spawnSync("pwsh.exe",[
  "-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass",
  "-File","tools/tata_comanda_native_first_attempt_v859_readonly.ps1",
  "-CiFixtureRoot",root,"-SampleSize","5","-DecisionBudget","8"
 ],{
  cwd:path.resolve(__dirname,".."),encoding:"utf8",timeout:45000,windowsHide:true,
 });
 assert.equal(proc.status,0,
  String(proc.stderr||proc.stdout||proc.error||"PS_NATIVE_FAILED").slice(0,300));
 const report=JSON.parse(proc.stdout.trim());
 assert.equal(report.schema,"tata.comanda.native-first-attempt.v859.readonly");
 assert.equal(report.printing_authorized,false);
 assert.equal(report.event_snapshot_hash_independently_recomputed,false);
 assert.equal(report.source_authenticity_proven,false);
 assert.ok(Object.values(report.effects).every(x=>x===false));
 assert.ok(Object.values(report.privacy).every(x=>x===false));
 return report;
}
function check(name,alter,expect){
 const fixture=syntheticReaderPairV857();
 if(alter)alter(fixture);
 write(fixture);
 const strong=projectReaderEssentials(fixture);
 const weak=native();
 const cryptoOk=strong.pair_snapshot_integrity_checked===true &&
  strong.decision_fingerprint_checked===true;
 const strongOk=strong.status==="SOURCE_NATIVE_ESSENTIAL_PREVIEW_HOLD"&&cryptoOk;
 const weakOk=weak.basic_essential_content_candidates===1&&
  weak.note_parity_verified_candidates===1&&
  weak.paired_with_persisted_tata_sequence===1;
 const converged=strongOk&&weakOk;
 assert.equal(converged,expect.converged,
  JSON.stringify({case:name,strong:strong.status,reason:strong.reason,
   cryptoOk,basic:weak.basic_essential_content_candidates,
   noteParity:weak.note_parity_verified_candidates,
   seq:weak.paired_with_persisted_tata_sequence}));
 if(expect.weakCandidate!==undefined)
  assert.equal(weak.basic_essential_content_candidates,expect.weakCandidate);
 if(expect.strongHold!==undefined)
  assert.equal(strong.status==="HOLD",expect.strongHold);
 if(expect.notesBlocked)
  assert.equal(weak.note_parity_conflicts,1);
 if(expect.sequenceBlocked)
  assert.equal(weak.paired_with_persisted_tata_sequence,0);
 assert.equal(strong.ready_for_operational_print,false);
 assert.equal(strong.print_authorized,false);
 count++;
 console.log("PASS V860 "+count+" "+name);
}
try{
 check("intact pinned-format event + decision + existing sequence converge",
  null,{converged:true,weakCandidate:1,strongHold:false});
 check("event snapshot hash forged: structural candidate alone not a proof",
  x=>{x.event.snapshot_hash="a".repeat(64);x.decision.snapshot_hash=x.event.snapshot_hash;},
  {converged:false,weakCandidate:1,strongHold:true});
 check("decision fingerprint forged: structural candidate alone not a proof",
  x=>{x.decision.fingerprint="a".repeat(64);},
  {converged:false,weakCandidate:1,strongHold:true});
 check("raw and projected quantities changed together without valid snapshot",
  x=>{x.event.order.items[0].QTPRODCOMVEN="4.000";x.decision.items[0].quantity=4;},
  {converged:false,weakCandidate:1,strongHold:true});
 check("note field forged consistently in both sources is not trusted",
  x=>{x.event.order.observation_rows[0].source_field="UNVERIFIED_FAKE_FIELD";
   x.decision.items[0].observations[0].source_field="UNVERIFIED_FAKE_FIELD";},
  {converged:false,weakCandidate:1,strongHold:true});
 check("lost item note fails both witnesses",
  x=>{x.decision.items[0].observations=[];},
  {converged:false,weakCandidate:0,strongHold:true,notesBlocked:true});
 check("missing general note fails both witnesses",
  x=>{x.decision.order_observations=[];},
  {converged:false,weakCandidate:0,strongHold:true,notesBlocked:true});
 check("missing persisted sequence blocks convergent witness",
  x=>{x.sequence_state.bindings=[];},
  {converged:false,weakCandidate:1,sequenceBlocked:true});
 check("source note join unproven fails both witnesses",
  x=>{x.event.order.observation_rows[1].join_proven=false;},
  {converged:false,weakCandidate:0,strongHold:true,notesBlocked:true});
 console.log("TATA_COMANDA_VALIDATION_CONVERGENCE_V860="+count+"/"+count+
  " SYNTHETIC_TWO_WITNESSES NO_REAL_SOURCE NO_PRINT NO_SQL NO_SERVICE"+
  " STRUCTURAL_CANDIDATE_NEVER_PROMOTED_TO_CRYPTO_PROOF");
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}

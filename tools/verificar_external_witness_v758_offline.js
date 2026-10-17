"use strict";
/** V7.58: two distinct disposable fixture roots, zero live external services.
 * The trusted pin & signing key stay IN MEMORY in the test process.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),
 crypto=require("node:crypto");
const {reserveDurablyInSyntheticSandbox,snapshot}=
 require("./comandas_journal_v755_sandbox.js");
const {messageFor,keyFingerprint}=
 require("./comandas_signed_anchor_v757_offline.js");
const {verifyWitnessHistoryOnly,verifySyntheticWitnessAgainstJournal,
 genesisHash,recordHash,NO_EFFECTS,SCHEMA}=
 require("./comandas_external_witness_v758_offline.js");
const h=s=>crypto.createHash("sha256").update(s).digest("hex");
const keys=crypto.generateKeyPairSync("ed25519");
const journalRoot=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v755-"));
const witnessRoot=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v758-"));
const witnessId="test:witness_separate_001",journalId="test:journal_separate_001";
const descriptor=i=>({
 scope_id:"STORE:SIMULATED|DATE:2026-10-13",
 scope_evidence:"SYNTHETIC_SCOPE_ONLY",
 order_key:"0001|01|0000000001|0000000001",
 kind:i===2?"CONFERENCIA":"PRODUCAO",
 station:["COZINHA","SUSHI","CONFERENCIA","ENROLADOS"][i],
 slot:i,tata_sequence:"001",source_sha256:h("source-only-synthetic-758"),
 payload_sha256:h("test-only-binary-"+i)
});
const checkpoints=[],witness={schema:SCHEMA,
 witness_instance_id:witnessId,records:[]};
let prev=genesisHash(witnessId);
for(let i=0;i<3;i++){
 const r=reserveDurablyInSyntheticSandbox(journalRoot,descriptor(i),i);
 assert.equal(r.status,"SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
 const snap=snapshot(journalRoot);
 const entry={schema:"deliveryos.signed-journal-anchor.v757.offline",
  journal_instance_id:journalId,revision:i+1,
  journal_head_sha256:snap.journal_head_sha256};
 const signed={...entry,signature_base64:
  crypto.sign(null,messageFor(entry),keys.privateKey).toString("base64")};
 checkpoints.push(signed);
 const hash=recordHash(witnessId,prev,signed);
 witness.records.push({previous_sha256:prev,checkpoint:signed,record_sha256:hash});
 prev=hash;
}
assert.notEqual(journalRoot,witnessRoot);
const witnessFile=path.join(witnessRoot,"independently-staged-witness.json");
fs.writeFileSync(witnessFile,JSON.stringify(witness),{flag:"wx"});
// Distinct folder simulates a distinct trust surface; it is NOT a distinct
// admin account, cloud provider, host, or independent failure domain.
const fromWitnessRoot=JSON.parse(fs.readFileSync(witnessFile,"utf8"));
const trust={authority:"EPHEMERAL_CI_TEST_CONTEXT_ONLY",
 journal_instance_id:journalId,witness_instance_id:witnessId,
 public_key_spki_pem:keys.publicKey.export({format:"pem",type:"spki"}).toString(),
 public_key_sha256:keyFingerprint(keys.publicKey),
 pinned_witness_revision:3,pinned_witness_head_sha256:prev,
 required_latest_journal_head_sha256:snapshot(journalRoot).journal_head_sha256};
let count=0;
function test(name,fn){fn();count++;console.log("PASS V758 "+count+" "+name)}
function blocked(x){
 assert.equal(x.status,"WITNESS_HOLD");
 assert.equal(x.authorize_print,false);assert.equal(x.authorize_reprint,false);
 assert.equal(x.manual_review_required,true);
 assert.equal(x.independently_custodied_trust_proven,false);
 assert.equal(x.exactly_once_paper_proven,false);
 assert.equal(x.effects.print,false);assert.equal(x.effects.spooler_write,false);
}
try{
 test("three signatures and pinned independent witness chain match synthetic ledger",()=>{
  const result=verifySyntheticWitnessAgainstJournal(journalRoot,fromWitnessRoot,trust);
  assert.equal(result.status,"SYNTHETIC_OUT_OF_BAND_WITNESS_MATCH_NOT_PRODUCTION_PROOF");
  assert.equal(result.verified_revision,3);
  assert.equal(result.signed_history_verified,true);
  assert.equal(result.latest_journal_checkpoint_matched,true);
  assert.equal(result.independent_failure_domain_proven,false);
  assert.equal(result.authorize_print,false);
 });
 test("witness directory distinct from printer journal fixture, no real custody claim",()=>{
  assert.equal(path.dirname(witnessRoot),path.dirname(journalRoot));
  assert.notEqual(witnessRoot,journalRoot);
  assert.equal(fs.readdirSync(journalRoot).filter(x=>x.endsWith(".json")).length,3);
  assert.deepEqual(fs.readdirSync(witnessRoot),["independently-staged-witness.json"]);
 });
 test("no context or missing witness fails closed",()=>{
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,null));
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,null,trust));
 });
 test("truncated witness history with pinned revision 3 is rejected",()=>{
  const short=structuredClone(witness);short.records.pop();
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,short,trust));
 });
 test("witness record deletion from middle cannot reindex safely",()=>{
  const mid=structuredClone(witness);mid.records.splice(1,1);
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,mid,trust));
 });
 test("witness record reordering is rejected",()=>{
  const swapped=structuredClone(witness);
  [swapped.records[0],swapped.records[1]]=[swapped.records[1],swapped.records[0]];
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,swapped,trust));
 });
 test("one changed prior hash breaks witness chaining",()=>{
  const changed=structuredClone(witness);
  changed.records[1].previous_sha256=h("forged-prev");
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,changed,trust));
 });
 test("recompute an altered record hash cannot forge existing pinned head",()=>{
  const changed=structuredClone(witness);
  changed.records[1].checkpoint.journal_head_sha256=h("rewritten");
  changed.records[1].record_sha256=recordHash(witnessId,
   changed.records[1].previous_sha256,changed.records[1].checkpoint);
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,changed,trust));
 });
 test("mutation of signed message is rejected even with recomputed witness chain",()=>{
  const changed=structuredClone(witness);
  changed.records[2].checkpoint.journal_head_sha256=h("different-record");
  changed.records[2].record_sha256=recordHash(witnessId,
   changed.records[2].previous_sha256,changed.records[2].checkpoint);
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,changed,trust));
 });
 test("one altered Ed25519 signature never becomes valid",()=>{
  const changed=structuredClone(witness);
  const sig=changed.records[0].checkpoint.signature_base64;
  changed.records[0].checkpoint.signature_base64=(sig[0]==="A"?"B":"A")+sig.slice(1);
  changed.records[0].record_sha256=recordHash(witnessId,
   changed.records[0].previous_sha256,changed.records[0].checkpoint);
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,changed,trust));
 });
 test("different trusted signer breaks verification",()=>{
  const other=crypto.generateKeyPairSync("ed25519");
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,
   {...trust,public_key_spki_pem:other.publicKey.export({type:"spki",format:"pem"}).toString()}));
 });
 test("attacker cannot change the pinned witness head without external approval",()=>{
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,
   {...trust,pinned_witness_head_sha256:h("attacker")}));
 });
 test("old independently pinned latest journal head cannot be replaced",()=>{
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,
   {...trust,required_latest_journal_head_sha256:h("old-version")}));
 });
 test("incorrect instance labels are rejected",()=>{
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,
   {...trust,witness_instance_id:"test:another_witness_001"}));
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,
   {...trust,journal_instance_id:"test:another_journal_001"}));
 });
 test("authority cannot be elevated by relabeling",()=>{
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,
   {...trust,authority:"REAL_RESTAURANT_APPROVED"}));
 });
 test("malformed or unexpectedly extended witness entries fail closed",()=>{
  const extra=structuredClone(witness);extra.records[0].newField="trusted";
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,extra,trust));
  const altered=structuredClone(witness);altered.other="foo";
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,altered,trust));
 });
 test("restore stale journal history is rejected by latest witness",()=>{
  const last=path.join(journalRoot,"state-000003.json");
  const saved=fs.readFileSync(last);
  fs.unlinkSync(last); // disposable fixture only
  assert.equal(snapshot(journalRoot).revision,2);
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,trust));
  fs.writeFileSync(last,saved,{flag:"wx"});
  assert.equal(verifySyntheticWitnessAgainstJournal(journalRoot,witness,trust).verified_revision,3);
 });
 test("unsanctioned fourth local journal revision is a hold against pinned 3",()=>{
  assert.equal(reserveDurablyInSyntheticSandbox(journalRoot,descriptor(3),3).status,
   "SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,trust));
 });
 test("crashed journal lock refuses a genuine signed witness",()=>{
  fs.mkdirSync(path.join(journalRoot,".attempt-lock"));
  blocked(verifySyntheticWitnessAgainstJournal(journalRoot,witness,trust));
 });
 test("reading wrong root cannot access printer operational directories",()=>{
  blocked(verifySyntheticWitnessAgainstJournal(process.cwd(),witness,trust));
 });
 test("complete attacker rewrite with attacker-controlled trust remains only simulation",()=>{
  const attacker=crypto.generateKeyPairSync("ed25519");
  const reissued=structuredClone(witness);
  let previous=genesisHash(witnessId);
  for(const r of reissued.records){
   const {signature_base64,...base}=r.checkpoint;
   r.checkpoint={...base,signature_base64:
    crypto.sign(null,messageFor(base),attacker.privateKey).toString("base64")};
   r.previous_sha256=previous;
   r.record_sha256=recordHash(witnessId,previous,r.checkpoint);
   previous=r.record_sha256;
  }
  const fakeTrust={...trust,
   public_key_spki_pem:attacker.publicKey.export({format:"pem",type:"spki"}).toString(),
   public_key_sha256:keyFingerprint(attacker.publicKey),
   pinned_witness_head_sha256:previous};
  // Proof can only be as independent as the supplied trusted input.
  const outcome=verifySyntheticWitnessAgainstJournal(journalRoot,reissued,fakeTrust);
  blocked(outcome); // local stale lock also blocks (never prove real custody)
  const inner=verifyWitnessHistoryOnly(reissued,fakeTrust);
  assert.equal(inner.status,"SYNTHETIC_HISTORY_VALID_UNDER_SUPPLIED_TRUST");
  assert.equal(inner.independently_custodied_trust_proven,false);
 });
 test("verifier module is pure, with no key generation or signing",()=>{
  const source=fs.readFileSync(path.join(__dirname,
   "comandas_external_witness_v758_offline.js"),"utf8");
  assert.doesNotMatch(source,/\b(?:generateKeyPairSync|createPrivateKey|sign|writeFileSync|readFileSync|fetch|connect|OpenPrinter|StartDocPrinter|WritePrinter|Set-Printer|spawnSync|execSync|mkdirSync|unlinkSync)\s*\(/);
  assert.equal(NO_EFFECTS.network,false);assert.equal(NO_EFFECTS.print,false);
  assert.equal(NO_EFFECTS.filesystem_write,false);
 });
 console.log(JSON.stringify({schema:"deliveryos.external-witness-v758-test",
 result:"PASS",checks:count,
 ephemeral_ed25519_test_key_only:true,two_disposable_directories:true,
 independent_real_failure_domain:false,real_trust_custody:false,
 monotonic_external_pin_operational:false,
 windows_power_loss_durability:false,physical_exactly_once_proven:false,
 printer_calls:0,service_changes:0,operational_files_modified:0}));
}finally{
 for(const dir of [journalRoot,witnessRoot])
  fs.rmSync(dir,{recursive:true,force:true});
}

"use strict";
/**
 * Adversarial V7.57 test. Ed25519 private keys exist ONLY in this disposable
 * runner process; never load/save them into the project or journal.
 */
const assert=require("node:assert/strict");
const crypto=require("node:crypto"),fs=require("node:fs"),
 path=require("node:path"),os=require("node:os");
const {reserveDurablyInSyntheticSandbox,snapshot}=
 require("./comandas_journal_v755_sandbox.js");
const {verifySignedSyntheticCheckpoint,keyFingerprint,messageFor,NO_EFFECTS,STATUS}=
 require("./comandas_signed_anchor_v757_offline.js");
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const dirs=[];
const directory=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v755-"));dirs.push(dir);return dir};
const instance="test:journal_anchor_001";
const entry=(i,shift="")=>({
 scope_id:"STORE:SIMULATED|DATE:2026-10-13",
 scope_evidence:"SYNTHETIC_SCOPE_ONLY",
 order_key:"0001|01|0000000001|0000000001",
 kind:i===2?"CONFERENCIA":"PRODUCAO",
 station:["COZINHA","SUSHI","CONFERENCIA"][i],
 slot:i,tata_sequence:"001",payload_sha256:sha("fictional-binary-"+i+shift),
 source_sha256:sha("fictional-verified-source")
});
let checks=0;
function test(name,fn){fn();checks++;console.log("PASS V757 "+checks+" "+name)}
function assertHold(result){
 assert.equal(result.status,"ANCHOR_HOLD");
 assert.equal(result.authorize_print,false);assert.equal(result.authorize_reprint,false);
 assert.equal(result.manual_review_required,true);
 assert.equal(result.operational_external_anchor_proven,false);
 assert.equal(result.exactly_once_paper_proven,false);
 assert.deepEqual(result.effects,NO_EFFECTS);
}
try{
 const first=directory(),rewritten=directory(),damaged=directory();
 for(let i=0;i<2;i++)
  assert.equal(reserveDurablyInSyntheticSandbox(first,entry(i),i).status,
   "SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
 const initial=snapshot(first);
 assert.equal(initial.status,"SYNTHETIC_SNAPSHOT_ONLY");
 assert.equal(initial.revision,2);
 assert.match(initial.journal_head_sha256,/^[a-f0-9]{64}$/);
 const {publicKey,privateKey}=crypto.generateKeyPairSync("ed25519");
 const pem=publicKey.export({format:"pem",type:"spki"}).toString();
 const baseAnchor={schema:"deliveryos.signed-journal-anchor.v757.offline",
  journal_instance_id:instance,revision:2,
  journal_head_sha256:initial.journal_head_sha256};
 function sign(a,secret=privateKey){
  return {...a,signature_base64:crypto.sign(null,messageFor(a),secret).toString("base64")};
 }
 const anchor=sign(baseAnchor);
 const trust={authority:"EPHEMERAL_CI_TEST_CONTEXT_ONLY",
  journal_instance_id:instance,minimum_revision:2,
  required_head_sha256:initial.journal_head_sha256,
  public_key_spki_pem:pem,public_key_sha256:keyFingerprint(publicKey)};
 test("independent Ed25519 signed synthetic journal head accepted only as LAB proof",()=>{
  const out=verifySignedSyntheticCheckpoint(first,anchor,trust);
  assert.equal(out.status,STATUS);
  assert.equal(out.signature_verified,true);
  assert.equal(out.synthetic_checkpoint_matched,true);
  assert.equal(out.operational_external_anchor_proven,false);
  assert.equal(out.authorize_print,false);
 });
 test("replay of same signed checkpoint stays no-print",()=>{
  const again=verifySignedSyntheticCheckpoint(first,anchor,trust);
  assert.equal(again.status,STATUS);assert.equal(again.authorize_reprint,false);
 });
 test("missing independently supplied context or anchor is HOLD",()=>{
  assertHold(verifySignedSyntheticCheckpoint(first,anchor,null));
  assertHold(verifySignedSyntheticCheckpoint(first,null,trust));
 });
 test("signature mutation rejected",()=>{
  const b=anchor.signature_base64;
  assertHold(verifySignedSyntheticCheckpoint(first,
   {...anchor,signature_base64:(b[0]==="A"?"B":"A")+b.slice(1)},trust));
 });
 test("another signer cannot replace independently trusted public key",()=>{
  const other=crypto.generateKeyPairSync("ed25519");
  assertHold(verifySignedSyntheticCheckpoint(first,sign(baseAnchor,other.privateKey),trust));
  assertHold(verifySignedSyntheticCheckpoint(first,anchor,{
   ...trust,public_key_spki_pem:other.publicKey.export({format:"pem",type:"spki"}).toString()
  }));
 });
 test("substituted key plus fingerprint cannot override trust without separate authority",()=>{
  const other=crypto.generateKeyPairSync("ed25519");
  const attacker={...trust,
   public_key_spki_pem:other.publicKey.export({format:"pem",type:"spki"}).toString(),
   public_key_sha256:keyFingerprint(other.publicKey)};
  const signed=sign(baseAnchor,other.privateKey);
  // This is a SIMULATED injected context, not a trusted external checkpoint.
  // The cryptographic layer alone cannot reject it. The result, if verified,
  // remains explicitly NOT an operational external anchor or print permit.
  const o=verifySignedSyntheticCheckpoint(first,signed,attacker);
  assert.equal(o.status,STATUS);
  assert.equal(o.operational_external_anchor_proven,false);
  assert.equal(o.authorize_print,false);
 });
 test("instance binding prevents borrowing checkpoint from another journal",()=>{
  assertHold(verifySignedSyntheticCheckpoint(first,anchor,{
   ...trust,journal_instance_id:"test:journal_anchor_002"}));
 });
 test("untrusted authority label never becomes a real-world key-custody claim",()=>{
  assertHold(verifySignedSyntheticCheckpoint(first,anchor,{
   ...trust,authority:"PRODUCTION_APPROVED"}));
 });
 test("mutated signed payload fields break envelope/trust relationship",()=>{
  assertHold(verifySignedSyntheticCheckpoint(first,{
   ...anchor,journal_head_sha256:sha("arbitrary")
  },trust));
  assertHold(verifySignedSyntheticCheckpoint(first,{...anchor,revision:3},trust));
  assertHold(verifySignedSyntheticCheckpoint(first,{...anchor,unexpected:"yes"},trust));
 });
 test("full self-consistent journal rewrite fails against earlier signed head",()=>{
  for(let i=0;i<2;i++){
   const r=reserveDurablyInSyntheticSandbox(rewritten,entry(i,"changed"),i);
   assert.equal(r.status,"SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
  }
  // Both local hash chains are internally valid, revision 2, SAME order key.
  assert.equal(snapshot(rewritten).status,"SYNTHETIC_SNAPSHOT_ONLY");
  assert.equal(snapshot(rewritten).revision,2);
  assert.notEqual(snapshot(rewritten).journal_head_sha256,
    snapshot(first).journal_head_sha256);
  assertHold(verifySignedSyntheticCheckpoint(rewritten,anchor,trust));
 });
 test("rollback to older revision refused by independently pinned minimum",()=>{
  const p=path.join(first,"state-000002.json");
  const saved=fs.readFileSync(p);
  fs.unlinkSync(p); // ONLY disposable test directory
  assert.equal(snapshot(first).status,"SYNTHETIC_SNAPSHOT_ONLY");
  assert.equal(snapshot(first).revision,1);
  assertHold(verifySignedSyntheticCheckpoint(first,anchor,trust));
  fs.writeFileSync(p,saved,{flag:"wx"}); // restore original synthetic fixture
  assert.equal(verifySignedSyntheticCheckpoint(first,anchor,trust).status,STATUS);
 });
 test("append of unexpected future record is not approved by old external revision",()=>{
  assert.equal(reserveDurablyInSyntheticSandbox(first,entry(2),2).status,
   "SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
  assert.equal(snapshot(first).revision,3);
  assertHold(verifySignedSyntheticCheckpoint(first,anchor,trust));
 });
 test("corrupted local journal blocked even with authentic signed checkpoint",()=>{
  for(let i=0;i<2;i++)assert.equal(
   reserveDurablyInSyntheticSandbox(damaged,entry(i),i).status,
   "SYNTHETIC_JOURNAL_COMMIT_OBSERVED");
  fs.writeFileSync(path.join(damaged,"state-000002.json"),"not-json");
  assertHold(verifySignedSyntheticCheckpoint(damaged,anchor,trust));
 });
 test("unresolved crash lock cannot be bypassed using valid signature",()=>{
  fs.mkdirSync(path.join(rewritten,".attempt-lock"));
  assertHold(verifySignedSyntheticCheckpoint(rewritten,anchor,trust));
  assert.ok(fs.existsSync(path.join(rewritten,".attempt-lock")));
 });
 test("invalid path cannot turn into operational filesystem access",()=>{
  assertHold(verifySignedSyntheticCheckpoint(process.cwd(),anchor,trust));
 });
 test("verify-only module cannot sign, persist or transport",()=>{
  const c=fs.readFileSync(path.join(__dirname,"comandas_signed_anchor_v757_offline.js"),"utf8");
  assert.doesNotMatch(c,/\b(?:generateKeyPairSync|createPrivateKey|writeFileSync|mkdirSync|unlinkSync|renameSync|OpenPrinter|WritePrinter|StartDocPrinter|Set-Printer|spawnSync|execSync)\s*\(/);
  assert.equal(NO_EFFECTS.print,false);assert.equal(NO_EFFECTS.filesystem_write,false);
 });
 console.log(JSON.stringify({schema:"deliveryos.signed-journal-anchor-v757-test",
  result:"PASS",checks,cryptographic_signature_in_lab:true,
  independent_key_custody_in_restaurant:false,
  external_monotonic_anchor_in_restaurant:false,
  power_loss_durability_proven:false,exactly_once_physical_proven:false,
  wrote_only_os_temp:true,printer_calls:0,service_changes:0}));
}finally{
 for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});
}

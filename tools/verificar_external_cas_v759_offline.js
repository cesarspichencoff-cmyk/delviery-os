"use strict";
/** Disposable synthetic CAS verification. NO external API or printer. */
const assert=require("node:assert/strict"),fs=require("node:fs"),
 path=require("node:path"),crypto=require("node:crypto");
const {genesisHash,recordHash,SCHEMA:WITNESS_SCHEMA}=
 require("./comandas_external_witness_v758_offline.js");
const {messageFor,keyFingerprint}=
 require("./comandas_signed_anchor_v757_offline.js");
const {SCHEMA,NO_EFFECTS,planConditionalWitnessCommit,
 reconcileSimulatedProviderResult}=require("./comandas_external_cas_v759_offline.js");
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const keys=crypto.generateKeyPairSync("ed25519");
const journalId="test:journal_v759_001",witnessId="test:witness_v759_001";
let prior=genesisHash(witnessId);
const witness={schema:WITNESS_SCHEMA,witness_instance_id:witnessId,records:[]};
function append(index, payload="regular"){
 const c={schema:"deliveryos.signed-journal-anchor.v757.offline",
  journal_instance_id:journalId,revision:index,
  journal_head_sha256:sha("synthetic-durable-head-"+index+":"+payload)};
 const signed={...c,signature_base64:
  crypto.sign(null,messageFor(c),keys.privateKey).toString("base64")};
 const digest=recordHash(witnessId,prior,signed);
 witness.records.push({previous_sha256:prior,checkpoint:signed,record_sha256:digest});
 prior=digest;
}
const pin=records=>({authority:"EPHEMERAL_CI_TEST_CONTEXT_ONLY",
 journal_instance_id:journalId,witness_instance_id:witnessId,
 public_key_spki_pem:keys.publicKey.export({type:"spki",format:"pem"}).toString(),
 public_key_sha256:keyFingerprint(keys.publicKey),
 pinned_witness_revision:records.length,
 pinned_witness_head_sha256:records.at(-1).record_sha256,
 required_latest_journal_head_sha256:records.at(-1).checkpoint.journal_head_sha256});
append(1);append(2);
const before=structuredClone(witness),oldTrust=pin(before.records);
append(3);
const after=structuredClone(witness),newTrust=pin(after.records);
const plan=planConditionalWitnessCommit(before,oldTrust,after,newTrust);
const readback=(w=after,t=newTrust)=>({kind:"SIMULATED_PROVIDER_READBACK",
 witness:w,trusted:t,provider_request_id:plan.request_id,
 observed_revision:plan.proposed_revision,
 observed_head_sha256:plan.proposed_head_sha256});
let checks=0;
function test(title,fn){fn();checks++;console.log("PASS V759 "+checks+" "+title)}
function expectBlocked(value){
 assert.equal(value.status,"CAS_WITNESS_HOLD");
 assert.equal(value.authorize_print,false);
 assert.equal(value.authorize_reprint,false);
 assert.equal(value.manual_reconciliation_required,true);
 assert.equal(value.remote_atomic_commit_proven,false);
 assert.equal(value.effects.spooler_write,false);
}
test("signed next witness append can be proposed, never dispatched",()=>{
 assert.equal(plan.status,"OFFLINE_CONDITIONAL_APPEND_PROPOSAL_ONLY");
 assert.equal(plan.expected_revision,2);assert.equal(plan.proposed_revision,3);
 assert.equal(plan.conditional_write_required,true);
 assert.equal(plan.remote_atomic_commit_proven,false);
 assert.equal(plan.authorize_print,false);
 assert.match(plan.request_id,/^[a-f0-9]{64}$/);
});
test("same proposal deterministic under replay and no automatic retry",()=>{
 const duplicate=planConditionalWitnessCommit(before,oldTrust,after,newTrust);
 assert.equal(duplicate.request_id,plan.request_id);
 assert.equal(duplicate.authorize_reprint,false);
});
test("simulated provider read-back is NOT proof of real provider, paper, or custody",()=>{
 const result=reconcileSimulatedProviderResult(plan,after,newTrust,readback());
 assert.equal(result.status,"SYNTHETIC_CAS_READBACK_MATCH_NOT_PROVIDER_PROOF");
 assert.equal(result.remote_atomic_commit_proven,false);
 assert.equal(result.provider_fencing_proven,false);
 assert.equal(result.authorize_print,false);
});
test("lost ACK and timeout remain HOLD until independently validated read-back",()=>{
 expectBlocked(reconcileSimulatedProviderResult(plan,after,newTrust,null));
 expectBlocked(reconcileSimulatedProviderResult(plan,after,newTrust,
  {kind:"ACK_ACCEPTED",provider_request_id:plan.request_id}));
});
test("read-back from older revision cannot prove current commit",()=>{
 const stale={...readback(before,oldTrust),observed_revision:2,
  observed_head_sha256:oldTrust.pinned_witness_head_sha256};
 expectBlocked(reconcileSimulatedProviderResult(plan,after,newTrust,stale));
});
test("signed but wrong request identity is HOLD",()=>{
 expectBlocked(reconcileSimulatedProviderResult(plan,after,newTrust,
  {...readback(),provider_request_id:sha("different")}));
});
test("signed but wrong observed head is HOLD",()=>{
 expectBlocked(reconcileSimulatedProviderResult(plan,after,newTrust,
  {...readback(),observed_head_sha256:sha("different")}));
});
test("readback cannot invent fields or authority",()=>{
 expectBlocked(reconcileSimulatedProviderResult(plan,after,newTrust,
  {...readback(),cas_committed:true}));
 expectBlocked(reconcileSimulatedProviderResult(plan,after,newTrust,
  {...readback(),kind:"REAL_PROVIDER"}));
});
test("same journal checkpoint but mutated signing key rejected",()=>{
 const fake={...newTrust,public_key_sha256:sha("other")};
 expectBlocked(planConditionalWitnessCommit(before,oldTrust,after,fake));
});
test("old pinned trust rejected even when witness history is signed",()=>{
 expectBlocked(planConditionalWitnessCommit(before,{...oldTrust,
  pinned_witness_head_sha256:sha("untrusted")},after,newTrust));
});
test("cannot skip a witness revision or append two at once",()=>{
 const extra=structuredClone(after);
 const next=4;
 const source={schema:"deliveryos.signed-journal-anchor.v757.offline",
  journal_instance_id:journalId,revision:next,
  journal_head_sha256:sha("synthetic-head-4")};
 const signed={...source,signature_base64:crypto.sign(null,
  messageFor(source),keys.privateKey).toString("base64")};
 const end=recordHash(witnessId,extra.records.at(-1).record_sha256,signed);
 extra.records.push({previous_sha256:extra.records.at(-1).record_sha256,
  checkpoint:signed,record_sha256:end});
 expectBlocked(planConditionalWitnessCommit(before,oldTrust,extra,pin(extra.records)));
});
test("rewritten historical receipt cannot pass exact-prefix test",()=>{
 const changed=structuredClone(after);
 changed.records[1].checkpoint.journal_head_sha256=sha("rewritten-middle");
 expectBlocked(planConditionalWitnessCommit(before,oldTrust,changed,newTrust));
});
test("changing witness instance cannot be presented as a legitimate next revision",()=>{
 const altered=structuredClone(after);
 altered.witness_instance_id="test:other_witness_001";
 expectBlocked(planConditionalWitnessCommit(before,oldTrust,altered,newTrust));
});
test("replacing trust authority with production label is not permission",()=>{
 expectBlocked(planConditionalWitnessCommit(before,oldTrust,after,
  {...newTrust,authority:"PRODUCTION_APPROVED"}));
});
test("simulated provider CAS race allows at most one writer",()=>{
 let remote={rev:2,head:oldTrust.pinned_witness_head_sha256};
 function mockCAS(attempt){
  if(attempt.expected_revision!==remote.rev||
     attempt.expected_head_sha256!==remote.head)return false;
  remote={rev:attempt.proposed_revision,head:attempt.proposed_head_sha256};
  return true;
 }
 const competing=planConditionalWitnessCommit(before,oldTrust,after,newTrust);
 assert.equal(mockCAS(plan),true);
 assert.equal(mockCAS(competing),false);
 assert.deepEqual(remote,{rev:3,head:newTrust.pinned_witness_head_sha256});
 // This is an in-memory simulation, not an actual atomic remote backend.
});
test("crash between local reservation and external witness commit blocks",()=>{
 const unanchored={...plan,observed_revision:undefined};
 expectBlocked(reconcileSimulatedProviderResult(plan,after,newTrust,unanchored));
});
test("provider outage after simulated CAS cannot authorize any print",()=>{
 const lostReply=undefined;
 expectBlocked(reconcileSimulatedProviderResult(plan,after,newTrust,lostReply));
 assert.equal(plan.authorize_print,false);
});
test("simulated successful validation never grants real-world exactly-once",()=>{
 const out=reconcileSimulatedProviderResult(plan,after,newTrust,readback());
 assert.equal(out.physical_exactly_once_proven,false);
 assert.equal(out.manual_reconciliation_required,true);
 assert.equal(out.independent_trust_proven,false);
});
test("no runtime calls to network, filesystem, crypto signing or printer",()=>{
 const source=fs.readFileSync(path.join(__dirname,
  "comandas_external_cas_v759_offline.js"),"utf8");
 assert.doesNotMatch(source,/\b(?:fetch|connect|writeFileSync|readFileSync|createPrivateKey|sign|OpenPrinter|WritePrinter|StartDocPrinter|Set-Printer|execSync|spawnSync)\s*\(/);
 assert.deepEqual(NO_EFFECTS,{print:false,reprint:false,spooler_write:false,
  network:false,provider_write:false,filesystem_write:false,
  service_change:false,driver_change:false,deploy:false,
  sequence_binding_write:false});
});
console.log(JSON.stringify({schema:SCHEMA,result:"PASS",checks,
 mock_conditional_compare_swap:true,external_cas_proven:false,
 real_key_custody:false,physical_exactly_once_proven:false,
 no_auto_print_or_reprint:true,provider_calls:0,spooler_calls:0}));

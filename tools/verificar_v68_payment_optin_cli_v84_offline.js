"use strict";
/** Synthetic CI-only test for the V8.0 payment opt-in plumbing of the REAL
 * offline three-view CLI. Mock V6.8 pairing fails CLOSED by construction.
 * This proves option propagation and intact source preflights, not the
 * independent production proof, thermal rendering or any real order. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {PACKAGING_SOURCE_BLOB_V63}=
 require("../dist/src/production/currentPackagingBridgeV63.js");
const contract=require("../dist/src/production/stableReaderShadowPairV68.js");
const original=contract.projectVerifiedReaderPairV68;
const POLICY=contract.PAYMENT_NOTE_POLICY_V80;
assert.match(POLICY,/^CESAR_CONFIRMED_20261015_/);
const calls=[];
contract.projectVerifiedReaderPairV68=(event,decision,context,policy)=>{
 calls.push({policy,event_schema:event?.schema,
  decision_schema:decision?.schema,independent_fields_present:
  Boolean(context?.production_plan&&context?.identities&&context?.observation_proofs)});
 return {status:"BLOCKED",tickets:null,reasons:["SYNTHETIC_PROOF_NOT_INDEPENDENT"]};
};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"tata-v68-optin-fixture-"));
let checks=0;
const yes=(x)=>{assert.ok(x);checks++};
const reject=(f,expected)=>{assert.throws(f,new RegExp(expected));checks++};
let printed=[];
const savedLog=console.log;
try{
 const {run,getArgs,blob}=require("./gerar_tres_vias_par_leitor_v68_offline.js");
 const motor=path.join(__dirname,"fixtures/canonical-packaging-v63-pinned.js");
 yes(blob(fs.readFileSync(motor))===PACKAGING_SOURCE_BLOB_V63);
 const f=[
  ["event.json",{schema:"deliveryos.tata-reader-stable-order-event.v1",
    order_key:"SYNTHETIC_ONLY",snapshot_hash:"a".repeat(64)}],
  ["decision.json",{schema:"deliveryos.live-shadow-decision.v1",
    order_key:"SYNTHETIC_ONLY",snapshot_hash:"a".repeat(64),ready:false}],
  ["proof.json",{schema:"deliveryos.reconciled-reader-pair-proof.v68.offline",
    delivery:{items:[]},production:{lines:[]},production_plan:{print_intents:[]},
    current_product_identities:[],item_observation_proofs:[]}]
 ].map(([name,value])=>{const p=path.join(tmp,name);
  fs.writeFileSync(p,JSON.stringify(value));return p;});
 const args=["--event",f[0],"--decision",f[1],"--proof",f[2],"--motor",motor];
 yes(Object.keys(getArgs(args)).length===4);
 yes(getArgs([...args,"--payment-policy",POLICY])["--payment-policy"]===POLICY);
 reject(()=>getArgs([...args,"--payment-policy","NOT_APPROVED"]),
   "PAYMENT_NOTE_POLICY_NOT_EXACTLY_REVIEWED");
 reject(()=>getArgs([...args,"--payment-policy",""]),
   "UNKNOWN_OR_REPEATED_V68_SOURCE_ARGUMENT");
 reject(()=>getArgs([...args,"--payment-policy",POLICY,
   "--payment-policy",POLICY]),"UNKNOWN_OR_REPEATED_V68_SOURCE_ARGUMENT");
 reject(()=>getArgs([...args,"--wrong-flag","anything"]),
   "UNKNOWN_OR_REPEATED_V68_SOURCE_ARGUMENT");
 reject(()=>getArgs([...args.slice(0,-2)]),"FOUR_EXPLICIT_LOCAL_SOURCES_REQUIRED");
 reject(()=>getArgs([...args,"--payment-policy"]), "EXACT_FLAG_VALUE_PAIRS_REQUIRED");
 console.log=(...xs)=>{printed.push(xs.join(" "))};
 const before=fs.readFileSync(f[0]),priorCalls=calls.length;
 yes(run(args).ok===false);
 yes(calls.length===priorCalls+1);
 yes(calls.at(-1).policy===undefined);
 yes(calls.at(-1).independent_fields_present);
 yes(run([...args,"--payment-policy",POLICY]).ok===false);
 yes(calls.at(-1).policy===POLICY);
 yes(printed.length===2);
 const origins=printed.map(x=>JSON.parse(x).origin);
 yes(origins[0].payment_note_policy==="NOT_OPTED_IN");
 yes(origins[1].payment_note_policy===POLICY);
 yes(fs.readFileSync(f[0]).equals(before));
 const oldSize=calls.length;
 const missing=path.join(tmp,"missing-proof.json");
 fs.writeFileSync(missing,JSON.stringify({schema:"deliveryos.reconciled-reader-pair-proof.v68.offline",
   delivery:{items:[]},production:{lines:[]}}));
 reject(()=>run(["--event",f[0],"--decision",f[1],
   "--proof",missing,"--motor",motor,"--payment-policy",POLICY]),
   "RECONCILED_READONLY_PROOF_ENVELOPE_MALFORMED");
 yes(calls.length===oldSize);
 const changedMotor=path.join(tmp,"changed-motor.js");
 fs.writeFileSync(changedMotor,fs.readFileSync(motor).toString("utf8")+"\n// drift\n");
 reject(()=>run(["--event",f[0],"--decision",f[1],
   "--proof",f[2],"--motor",changedMotor,"--payment-policy",POLICY]),
   "CANONICAL_PACKAGING_MOTOR_SOURCE_DRIFT");
 yes(calls.length===oldSize);
}finally{
 console.log=savedLog;
 contract.projectVerifiedReaderPairV68=original;
 fs.rmSync(tmp,{recursive:true,force:true});
}
console.log(JSON.stringify({schema:"deliveryos.v68-payment-optin-cli-test.v1",
 status:"PASS",synthetic_only:true,checks,
 original_v68_validation_executed:false,production_proof_created:false,
 no_real_orders:true,no_print:true,no_service_changes:true}));

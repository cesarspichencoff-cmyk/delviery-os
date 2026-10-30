"use strict";
const assert=require("node:assert/strict");
const {reviewIfoodInstalledPrintChannels:review,SCHEMA,EFFECTS}=
 require("./comandas_ifood_installed_print_channels_v1_offline.cjs");
const h="a".repeat(64);
const channel=(channel_id)=>({
 channel_id,proposed_action:"SOURCE_OFF",runtime_auto_print_mode:"DISABLED",
 runtime_observation_ref:"SYNTHETIC_RUNTIME_SETTING_NOT_ATTESTED",
 runtime_observation_sha256:h,
 manual_print_path_censused:true,
 pending_or_ambiguous_jobs_reconciled:true,
 source_control_scope_isolated:true
});
const baseline=()=>({store_id:"0001",store_unit:"01",
 package_fingerprints:{gp_asar_sha256:h,gestor_asar_sha256:h},
 channels:[channel("GP_HTTP_PRINT"),channel("GESTOR_IPC_PRINTORDER")]});
let n=0;function test(name,f){f();console.log("PASS "+(++n)+" "+name);}
function check(x){
 const before=JSON.stringify(x),r=review(x);
 assert.equal(JSON.stringify(x),before,"pure non mutating");
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 for(const field of ["channels_proved_live_print",
 "installed_app_running_proves_print_enabled","gp_listener_proves_paper",
 "gestor_ipc_ack_proves_paper","gp_http_response_proves_paper",
 "windows_job_id_proves_paper","application_ack_proves_order_identity",
 "any_old_paper_suppressed_proven","can_activate"])
   assert.equal(r[field],false,field);
 assert.equal(JSON.stringify(r).includes("SYNTHETIC_RUNTIME_SETTING_NOT_ATTESTED"),false);
 return r;
}
function hold(x,reason){
 const r=check(x);assert.equal(r.status,"HOLD");
 assert.ok(r.reasons.some(x=>x.includes(reason)),r.reasons.join(";"));
}
test("both GP server and Gestor IPC must be inventoried independently",()=>{
 const r=check(baseline());
 assert.equal(r.status,"REVIEW_CANDIDATE_NEEDS_INDEPENDENT_ATTESTATION");
 assert.equal(r.channel_actions.length,2);
});
test("GP listener being open does not prove delivery order print",()=>{
 const x=baseline();x.gp_port_listening=true;x.gp_print_enabled=true;
 const r=check(x);assert.equal(r.gp_listener_proves_paper,false);
});
test("Gestor printOrderReply is issued before asynchronous library settles",()=>{
 const x=baseline();x.gestor_print_order_reply="Successfully printed";
 const r=check(x);assert.equal(r.gestor_ipc_ack_proves_paper,false);
});
test("GP local /print response is not a physical paper receipt",()=>{
 const x=baseline();x.gp_print_response="Successfully printed";
 const r=check(x);assert.equal(r.gp_http_response_proves_paper,false);
});
test("Windows RAW spooler job id is not printed paper",()=>{
 const x=baseline();x.job_id=123;
 const r=check(x);assert.equal(r.windows_job_id_proves_paper,false);
});
test("GP daemon disabled but Gestor IPC omitted is insufficient",()=>{
 const x=baseline();x.channels.pop();
 hold(x,"IFOD_GP_GESTOR_COVERAGE_OR_CODE_INVALID");
});
test("missing GP channel cannot be replaced by duplicate Gestor",()=>{
 const x=baseline();x.channels[0]=channel("GESTOR_IPC_PRINTORDER");
 hold(x,"IFOOD_CHANNEL_DUPLICATE:GESTOR_IPC_PRINTORDER");
});
test("unknown channel is never accepted",()=>{
 const x=baseline();x.channels[0].channel_id="IFOOD_ALL_PRINT";
 hold(x,"IFOOD_CHANNEL_UNKNOWN_OR_INVALID");
});
test("keep legacy GP printing while new emits is not safe",()=>{
 const x=baseline();x.channels[0].proposed_action="KEEP_LEGACY";
 hold(x,"IFOOD_LEGACY_CHANNEL_NOT_NEUTRALIZED:GP_HTTP_PRINT");
});
test("Gestor IPC print also requires selective neutralization",()=>{
 const x=baseline();x.channels[1].proposed_action="KEEP_LEGACY";
 hold(x,"IFOOD_LEGACY_CHANNEL_NOT_NEUTRALIZED:GESTOR_IPC_PRINTORDER");
});
test("running process with unknown actual settings fails closed",()=>{
 const x=baseline();x.channels[1].runtime_auto_print_mode="UNKNOWN";
 hold(x,"IFOOD_ACTUAL_PRINT_SETTING_UNKNOWN:GESTOR_IPC_PRINTORDER");
});
test("both kinds of old manual print paths must be reviewed",()=>{
 const x=baseline();x.channels[0].manual_print_path_censused=false;
 hold(x,"IFOOD_MANUAL_PRINT_PATH_UNCENSUSED:GP_HTTP_PRINT");
});
test("already pending iFood jobs must be reconciled",()=>{
 const x=baseline();x.channels[1].pending_or_ambiguous_jobs_reconciled=false;
 hold(x,"IFOOD_QUEUED_OR_AMBIGUOUS_JOBS_UNRECONCILED:GESTOR_IPC_PRINTORDER");
});
test("source-off must not globally disable other application functions",()=>{
 const x=baseline();x.channels[0].source_control_scope_isolated=false;
 hold(x,"IFOOD_SOURCE_OFF_SCOPE_UNVERIFIED:GP_HTTP_PRINT");
});
test("Windows queue sink requires dedicated, actual nonfiscal queue",()=>{
 const x=baseline();x.channels[1].proposed_action="WINDOWS_QUEUE_SINK_REVIEW";
 hold(x,"IFOOD_WINDOWS_SINK_NOT_BOUND_TO_EXCLUSIVE_QUEUE:GESTOR_IPC_PRINTORDER");
});
test("queue seen on host does not prove channel maps there",()=>{
 const x=baseline();x.channels[0].proposed_action="WINDOWS_QUEUE_SINK_REVIEW";
 x.channels[0].actual_printer_queue_censused=true;
 hold(x,"IFOOD_WINDOWS_SINK_NOT_BOUND_TO_EXCLUSIVE_QUEUE:GP_HTTP_PRINT");
});
test("a direct nonwindows transport cannot be intercepted by NUL",()=>{
 const x=baseline();x.channels[0].proposed_action="WINDOWS_QUEUE_SINK_REVIEW";
 Object.assign(x.channels[0],{actual_printer_queue_censused:true,
  dedicated_nonfiscal_queue_proven:true,actual_transport:"DIRECT_TCP"});
 hold(x,"IFOOD_WINDOWS_SINK_NOT_BOUND_TO_EXCLUSIVE_QUEUE:GP_HTTP_PRINT");
});
test("Windows queue sink with all synthetic claims grants review only",()=>{
 const x=baseline();Object.assign(x.channels[0],{
  proposed_action:"WINDOWS_QUEUE_SINK_REVIEW",
  actual_printer_queue_censused:true,
  dedicated_nonfiscal_queue_proven:true,
  actual_transport:"WINDOWS_PRINTER_DRIVER"});
 const r=check(x);assert.equal(r.status,"REVIEW_CANDIDATE_NEEDS_INDEPENDENT_ATTESTATION");
 assert.equal(r.can_activate,false);
});
test("wrong unit cannot authorize moving Itaim printer",()=>{
 const x=baseline();x.store_unit="02";
 hold(x,"IFOD_GP_GESTOR_COVERAGE_OR_CODE_INVALID");
});
test("invalid installed app SHA cannot stand in for binary provenance",()=>{
 const x=baseline();x.package_fingerprints.gestor_asar_sha256="missing";
 hold(x,"IFOD_GP_GESTOR_COVERAGE_OR_CODE_INVALID");
});
test("missing observation digest cannot imply printing disabled",()=>{
 const x=baseline();x.channels[0].runtime_observation_sha256="unknown";
 hold(x,"IFOOD_ACTUAL_PRINT_SETTING_UNKNOWN:GP_HTTP_PRINT");
});
test("false authorization flags cannot promote unproven paper suppression",()=>{
 const x=baseline();x.customer_approved=true;x.print_authorized=true;
 x.printers_changed=true;const r=check(x);
 assert.equal(r.any_old_paper_suppressed_proven,false);
 assert.equal(r.can_activate,false);
});
test("malformed requests all fail closed",()=>{
 for(const x of [null,{},[],false]){const r=check(x);assert.equal(r.status,"HOLD");}
});
console.log("COMANDAS_IFOOD_INSTALLED_CHANNELS_V1="+n+"/"+n+
 " GP_HTTP_AND_GESTOR_IPC INDEPENDENT WINDOWS_DRIVER_ONLY_NO_PAPER ZERO_EFFECTS");

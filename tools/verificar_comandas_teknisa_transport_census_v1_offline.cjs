"use strict";
const assert=require("node:assert/strict");
const {identifyTeknisaPrintTransport:review,SCHEMA,EFFECTS}=
 require("./comandas_teknisa_transport_census_v1_offline.cjs");
const sha="a".repeat(64),clone=structuredClone;
function input(ponte=null,php=null,kind="WINDOWS_SPOOLER_QUEUE"){
 return {store_id:"0001",store_unit:"01",
  code_evidence:{impressao_pedido_sha256:sha,impressao_util_sha256:sha,
   printing_sha256:sha},
  runtime_flags:ponte===null?null:{
   utiliza_impressao_ponte:ponte,utiliza_impressao_php:php,
   observation_sha256:sha,provenance:"SYNTHETIC_RUNTIME_FLAG_ONLY"},
  transport_destination:{kind,provenance:"SYNTHETIC_DESTINATION_ONLY",
   path_matches_order_print:true},
  proposed_action:"WINDOWS_NUL_REDIRECT"};
}
let n=0;
function test(name,fn){fn();console.log("PASS "+(++n)+" "+name);}
function check(x){
 const before=JSON.stringify(x),r=review(x);
 assert.equal(JSON.stringify(x),before,"pure");
 assert.equal(r.schema,SCHEMA);
 assert.deepEqual(r.effects,EFFECTS);
 for(const field of ["chosen_live_transport_attested_here","old_output_redirected",
  "old_output_suppressed","paperless_sink_proven","nul_is_order_trigger",
  "cutover_authorized","print_authorized"])assert.equal(r[field],false,field);
 assert.equal(JSON.stringify(r).includes("SYNTHETIC_DESTINATION_ONLY"),false);
 return r;
}
function hold(x,reason){
 const r=check(x);assert.equal(r.status,"HOLD",JSON.stringify(r));
 assert.equal(r.reason,reason);
 return r;
}
function candidate(x,mode){
 const r=check(x);
 assert.equal(r.status,"REVIEW_CANDIDATE_ONLY",JSON.stringify(r));
 assert.equal(r.mode,mode);assert.equal(r.runtime_flags_source_claim_only,true);
 return r;
}
test("source alone does not prove bridge/PHP/Delphi active",()=>{
 hold(input(),"ACTIVE_RUNTIME_PRINT_FLAGS_NOT_ATTESTED");
});
test("runtime strings instead of boolean refuse to infer branch",()=>{
 const x=input(true,false);x.runtime_flags.utiliza_impressao_ponte="true";
 hold(x,"ACTIVE_RUNTIME_PRINT_FLAGS_NOT_ATTESTED");
});
test("a claimed bridge HTTP print does not map automatically to a local Windows queue",()=>{
 hold(input(true,false),"BRIDGE_HTTP_NOT_PROVEN_TO_USE_SELECTED_WINDOWS_QUEUE");
});
test("bridge HTTP /print with direct IP path cannot be caught by local Windows NUL",()=>{
 hold(input(true,false,"DIRECT_OR_NETWORK_PORT"),"NUL_NOT_ON_ACTUAL_PRINT_TRANSPORT_PATH");
});
test("bridge HTTP with independently downstream mapped Windows queue is only candidate",()=>{
 const x=input(true,false);x.nul_target_is_downstream_bridge=true;
 candidate(x,"PONTE_HTTP_PRINT");
});
test("bridge has priority over PHP flag if both are true",()=>{
 const x=input(true,true);x.nul_target_is_downstream_bridge=true;
 candidate(x,"PONTE_HTTP_PRINT");
});
test("PHP fopen/fwrite with actual Windows queue is merely sink candidate",()=>{
 candidate(input(false,true),"PHP_PORT_WRITE");
});
test("PHP fopen/fwrite directly to TCP cannot be diverted by spooler NUL",()=>{
 hold(input(false,true,"DIRECT_OR_NETWORK_PORT"),
  "NUL_NOT_ON_ACTUAL_PRINT_TRANSPORT_PATH");
});
test("Delphi file dispatch does not imply queue access",()=>{
 hold(input(false,false),"DELPHI_DISPATCH_NOT_PROVEN_TO_USE_SELECTED_WINDOWS_QUEUE");
});
test("Delphi file dispatch proved to Windows spooler downstream is candidate only",()=>{
 const x=input(false,false);x.nul_target_is_downstream_delphi=true;
 candidate(x,"DELPHI_FILE_DISPATCH");
});
test("a Delphi file bridge is not a Windows NUL queue",()=>{
 hold(input(false,false,"FILE_BRIDGE"),"NUL_NOT_ON_ACTUAL_PRINT_TRANSPORT_PATH");
});
test("unknown destination blocks NUL even when runtime flags are present",()=>{
 hold(input(false,true,"UNKNOWN"),"NUL_NOT_ON_ACTUAL_PRINT_TRANSPORT_PATH");
});
test("a queue that handles something else is not the actual native order path",()=>{
 const x=input(false,true);x.transport_destination.path_matches_order_print=false;
 hold(x,"DESTINATION_NOT_BOUND_TO_NATIVE_TICKET_PATH");
});
test("store mismatch cannot apply Itaim policy elsewhere",()=>{
 const x=input(false,true);x.store_id="0002";
 hold(x,"SOURCE_FINGERPRINTS_OR_STORE_INVALID");
});
test("source SHA missing never allows virtual sink",()=>{
 const x=input(false,true);x.code_evidence.printing_sha256="bad";
 hold(x,"SOURCE_FINGERPRINTS_OR_STORE_INVALID");
});
test("runtime claims without observation fingerprint are unknown",()=>{
 const x=input(false,true);x.runtime_flags.observation_sha256="bad";
 hold(x,"ACTIVE_RUNTIME_PRINT_FLAGS_NOT_ATTESTED");
});
test("upstream off may be reviewed but fiscal/report isolation must be proved elsewhere",()=>{
 const x=input(true,false,"DIRECT_OR_NETWORK_PORT");
 x.proposed_action="UPSTREAM_PRINT_OFF";
 const r=candidate(x,"PONTE_HTTP_PRINT");
 assert.equal(r.upstream_suppression_candidate,true);
 assert.equal(r.reason,"UPSTREAM_PRINT_OPTION_MUST_BE_SCOPED_TO_TICKETS_NOT_FISCAL");
});
test("unknown action cannot become permission to touch host",()=>{
 const x=input(false,true);x.proposed_action="AUTO_BLOCK_PRINTER";
 hold(x,"UNSUPPORTED_OR_UNCHANGED_LEGACY_ACTION");
});
test("source metadata cannot self-assert installation or paper suppression",()=>{
 const x=input(false,true);x.approved=true;x.paperless_sink_proven=true;
 x.print_authorized=true;x.host_changed=true;
 const r=candidate(x,"PHP_PORT_WRITE");
 assert.equal(r.paperless_sink_proven,false);
});
test("null and malformed input fail closed",()=>{
 for(const v of [null,[],{},false]) {
  const r=check(v);assert.equal(r.status,"HOLD");
 }
});
console.log("COMANDAS_TEK_PRINT_TRANSPORT_CENSUS_V1="+n+"/"+n+
 " RUNTIME_MODE_NOT_ATTESTED NUL_NOT_TRIGGER NO_LIVE_ACTION");

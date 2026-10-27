"use strict";
const assert=require("node:assert/strict");
const {reviewNativeProductionPrintMode:review,SCHEMA,EFFECTS,GROUPS}=
 require("./comandas_teknisa_native_print_mode_v1_offline.cjs");
const SHA="b".repeat(64);
const fixture=(mode="N")=>({store_id:"0001",store_unit:"01",
 impressao_pedido_sha256:SHA,mode,
 intended_scope:{origin:"DLV_IFO",kind:"DELIVERY_PRODUCTION_TICKET_ONLY",
  other_tek_orders_preserved:true,fiscal_outputs_preserved:true,
  callsite_evidence_ref:"SYNTHETIC_CALLSITE_NOT_LIVE",
  callsite_snapshot_sha256:SHA}});
let n=0;function test(s,f){f();console.log("PASS "+(++n)+" "+s);}
function check(x){
 const old=JSON.stringify(x),r=review(x);
 assert.equal(JSON.stringify(x),old,"pure");
 assert.equal(r.schema,SCHEMA);
 assert.deepEqual(r.effects,EFFECTS);
 for(const k of ["old_production_vias_suppressed_in_world",
 "real_first_print_callsite_identified_here","delivery_only_scope_attested_here",
 "safe_for_other_order_types_proven","fiscal_and_reports_independently_proven",
 "can_set_live_mode","cutover_authorized"])assert.equal(r[k],false,k);
 assert.equal(JSON.stringify(r).includes("SYNTHETIC_CALLSITE_NOT_LIVE"),false);
 return r;
}
function hold(x,reason){
 const r=check(x);assert.equal(r.status,"HOLD");
 assert.equal(r.reason,reason);return r;
}
function expected(group,production,device){
 assert.equal(group.production_printer_eligible,production);
 assert.equal(group.maquininha_eligible,device);
}
test("N suppresses all three production groups in the observed PHP predicates only",()=>{
 const r=check(fixture("N"));assert.equal(r.status,"REVIEW_CANDIDATE_ONLY");
 assert.deepEqual(r.group_predicates.map(z=>z.group),GROUPS);
 r.group_predicates.forEach(g=>expected(g,false,false));
});
test("S still permits normal production group and cannot be claimed as print-off",()=>{
 const r=hold(fixture("S"),"NATIVE_MODE_STILL_ALLOWS_SOME_PRODUCTION_OUTPUT");
 r.group_predicates.forEach(g=>expected(g,true,false));
});
test("M still permits maquininha group",()=>{
 const r=hold(fixture("M"),"NATIVE_MODE_STILL_ALLOWS_SOME_PRODUCTION_OUTPUT");
 r.group_predicates.forEach(g=>expected(g,false,true));
});
test("T permits both printer types",()=>{
 const r=hold(fixture("T"),"NATIVE_MODE_STILL_ALLOWS_SOME_PRODUCTION_OUTPUT");
 r.group_predicates.forEach(g=>expected(g,true,true));
});
test("unknown mode cannot silently suppress anything",()=>{
 hold(fixture("Y"),"PHP_PRINT_MODE_OR_SOURCE_INVALID");
});
test("missing callsite proof blocks N at cutover",()=>{
 const x=fixture();delete x.intended_scope;
 hold(x,"DELIVERY_ONLY_CALLSITE_AND_FISCAL_SCOPE_NOT_PROVEN");
});
test("generic Tek invoice or other order not a delivery-only suppression",()=>{
 const x=fixture();x.intended_scope.origin="FISCAL";
 hold(x,"DELIVERY_ONLY_CALLSITE_AND_FISCAL_SCOPE_NOT_PROVEN");
});
test("all orders global shutdown is not a scoped delivery fix",()=>{
 const x=fixture();x.intended_scope.kind="ALL_TEK_ORDERS";
 hold(x,"DELIVERY_ONLY_CALLSITE_AND_FISCAL_SCOPE_NOT_PROVEN");
});
test("other Teknisa orders must be proven unaffected externally",()=>{
 const x=fixture();x.intended_scope.other_tek_orders_preserved=false;
 hold(x,"DELIVERY_ONLY_CALLSITE_AND_FISCAL_SCOPE_NOT_PROVEN");
});
test("fiscal or reports not preserved means print-off is unsafe",()=>{
 const x=fixture();x.intended_scope.fiscal_outputs_preserved=false;
 hold(x,"DELIVERY_ONLY_CALLSITE_AND_FISCAL_SCOPE_NOT_PROVEN");
});
test("unknown callsite signature cannot be substituted with verbal promise",()=>{
 const x=fixture();x.intended_scope.callsite_snapshot_sha256="not-hash";
 hold(x,"DELIVERY_ONLY_CALLSITE_AND_FISCAL_SCOPE_NOT_PROVEN");
});
test("source file without SHA-256 is not code evidence",()=>{
 const x=fixture();x.impressao_pedido_sha256="bad";
 hold(x,"PHP_PRINT_MODE_OR_SOURCE_INVALID");
});
test("store mismatch cannot deactivate another branch",()=>{
 const x=fixture();x.store_id="0002";
 hold(x,"PHP_PRINT_MODE_OR_SOURCE_INVALID");
});
test("positive self-attested user flags have no authority",()=>{
 const x=fixture();x.installed=true;x.paper_output_blocked=true;
 x.authorize_change=true;
 assert.equal(check(x).can_set_live_mode,false);
});
test("the real order origin is still unproven even with synthetically complete scope",()=>{
 const r=check(fixture());
 assert.equal(r.status,"REVIEW_CANDIDATE_ONLY");
 assert.equal(r.real_first_print_callsite_identified_here,false);
});
test("N never changes Windows, Tek, GP, printer or fiscal in this module",()=>{
 const r=check(fixture());assert.ok(Object.values(r.effects).every(x=>x===false));
});
test("the source cannot be treated as customer/paper proof",()=>{
 const r=check(fixture());
 assert.equal(r.old_production_vias_suppressed_in_world,false);
 assert.equal(r.fiscal_and_reports_independently_proven,false);
});
test("bad object input always holds",()=>{
 for(const v of [null,[],{},false]) {
  const r=check(v);assert.equal(r.status,"HOLD");
 }
});
console.log("COMANDAS_TEK_NATIVE_PRINT_MODE_V1="+n+"/"+n+
 " N_IS_CONDITIONAL_SOURCE_CANDIDATE NOT_DLV_FIRST_PRINT_PROOF NO_OPERATIONAL_CHANGE");

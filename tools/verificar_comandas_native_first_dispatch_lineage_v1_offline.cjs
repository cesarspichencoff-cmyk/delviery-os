"use strict";
const assert=require("node:assert/strict");
const {reviewNativeFirstDispatch:review,SCHEMA,EFFECTS,NON_TRIGGER}=
 require("./comandas_native_first_dispatch_lineage_v1_offline.cjs");
const h="a".repeat(64);
function fixture(){return {
 store_id:"0001",store_unit:"01",
 installed_or_observed_source_sha256:h,
 event_type:"NATIVE_FIRST_PRODUCTION_DISPATCH_CLAIM",
 order_origin:"DLV_IFO",
 native_order_revision_ref:"SYNTHETIC_REVISION_NO_ACTUAL_ORDER",
 native_revision_snapshot_sha256:h,
 dispatcher_component_ref:"SYNTHETIC_DISPATCHER_NOT_ATTESTED",
 dispatcher_source_sha256:h,
 preorder_import_is_not_print_proof:true,
 forsale_comanda_is_not_dispatch_proof:true,
 post_sale_report_not_reused_as_first_print:true,
 gp_and_gestor_not_reused_as_native_trigger:true,
 station_route_censused:true,
 first_attempt_identity_censused:true,
 cancellation_revision_reconciled:true
};}
let n=0;function test(name,f){f();console.log("PASS "+(++n)+" "+name);}
function check(x){
 const old=JSON.stringify(x),r=review(x);assert.equal(JSON.stringify(x),old);
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 for(const k of ["actual_first_native_print_event_proven",
 "valid_order_to_production_link_proven","physical_paper_proven",
 "can_authorize_cutover"])assert.equal(r[k],false,k);
 assert.ok(!JSON.stringify(r).includes("SYNTHETIC_REVISION_NO_ACTUAL_ORDER"));
 return r;
}
function hold(x,reason){
 const r=check(x);assert.equal(r.status,"HOLD",JSON.stringify(r));
 assert.ok(r.reason.includes(reason),r.reason);
}
test("complete synthetic lineage only proposes review, never attests first native dispatch",()=>{
 assert.equal(check(fixture()).status,"REVIEW_CANDIDATE_NOT_INDEPENDENTLY_ATTESTED");
});
for(const kind of NON_TRIGGER){
 test(kind+" cannot be promoted to first native production dispatch",()=>{
  const x=fixture();x.event_type=kind;
  hold(x,"NOT_NATIVE_PRODUCTION_DISPATCH:"+kind);
 });
}
test("unknown event kind is HOLD",()=>{
 const x=fixture();delete x.event_type;hold(x,"FIRST_EVENT_KIND_UNKNOWN");
});
test("invented kind is HOLD",()=>{
 const x=fixture();x.event_type="PRINTED";hold(x,"UNSUPPORTED_EVENT_KIND");
});
test("forSale creation is not native dispatch even with real-looking SHA",()=>{
 const x=fixture();x.event_type="FORSALE_COMANDA_CREATED";
 hold(x,"NOT_NATIVE_PRODUCTION_DISPATCH");
});
test("iFood GP Windows job cannot be Teknisa first print",()=>{
 const x=fixture();x.event_type="IFOOD_GP_HTTP_PRINT";
 hold(x,"NOT_NATIVE_PRODUCTION_DISPATCH");
});
test("wrong store cannot become Itaim first dispatch",()=>{
 const x=fixture();x.store_id="0002";hold(x,"SOURCE_AND_STORE_NOT_IDENTIFIED");
});
test("unknown DLV_IFO revision refuses proposed dispatch",()=>{
 const x=fixture();x.native_revision_snapshot_sha256="bad";
 hold(x,"DLV_IFO_REVISION_OR_DISPATCHER_LINK_MISSING");
});
test("ForSale dispatch not proven if component absent",()=>{
 const x=fixture();delete x.dispatcher_component_ref;
 hold(x,"DLV_IFO_REVISION_OR_DISPATCHER_LINK_MISSING");
});
test("marketplace preorder does not carry printing permission",()=>{
 const x=fixture();x.preorder_import_is_not_print_proof=false;
 hold(x,"EVENT_BOUNDARIES_NOT_SEPARATED");
});
test("ForSale creation is a step not a physical print",()=>{
 const x=fixture();x.forsale_comanda_is_not_dispatch_proof=false;
 hold(x,"EVENT_BOUNDARIES_NOT_SEPARATED");
});
test("post-sale delivery report cannot be reused as first production",()=>{
 const x=fixture();x.post_sale_report_not_reused_as_first_print=false;
 hold(x,"EVENT_BOUNDARIES_NOT_SEPARATED");
});
test("GP and Gestor old tickets cannot be used as native first event",()=>{
 const x=fixture();x.gp_and_gestor_not_reused_as_native_trigger=false;
 hold(x,"EVENT_BOUNDARIES_NOT_SEPARATED");
});
test("unknown native station route blocks first dispatch claim",()=>{
 const x=fixture();x.station_route_censused=false;
 hold(x,"PRODUCTION_ATTEMPT_ROUTE_REVISION_NOT_RECONCILED");
});
test("missing first-attempt identity cannot be inferred from status P or X",()=>{
 const x=fixture();x.first_attempt_identity_censused=false;
 hold(x,"PRODUCTION_ATTEMPT_ROUTE_REVISION_NOT_RECONCILED");
});
test("unreconciled cancellation makes first print unsafe",()=>{
 const x=fixture();x.cancellation_revision_reconciled=false;
 hold(x,"PRODUCTION_ATTEMPT_ROUTE_REVISION_NOT_RECONCILED");
});
test("caller cannot self-grant deployment or printing",()=>{
 const x=fixture();x.authorized=true;x.printed=true;
 const r=check(x);assert.equal(r.can_authorize_cutover,false);
});
test("malformed null/array/empty requests fail closed",()=>{
 for(const v of [null,[],{},false])assert.equal(check(v).status,"HOLD");
});
console.log("COMANDAS_FIRST_NATIVE_DISPATCH_LINEAGE_V1="+n+"/"+n+
 " PREORDER_NOT_PRINT FORSALE_NOT_FIRST_DISPATCH PAPER_UNPROVEN ZERO_EFFECTS");

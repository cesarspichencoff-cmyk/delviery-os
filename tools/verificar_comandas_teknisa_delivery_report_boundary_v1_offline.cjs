"use strict";
const assert=require("node:assert/strict");
const {reviewDeliveryReportBoundary:review,SCHEMA,EFFECTS}=
 require("./comandas_teknisa_delivery_report_boundary_v1_offline.cjs");
const h="a".repeat(64);
function base(){
 return {store_id:"0001",store_unit:"01",
  installed_source_sha256:{venda:h,impressao_delivery:h,
   delivery_controller:h,msde_query:h},
  path:"SALE_FINALIZATION",evidence_level:"VENDAS_CODE_ONLY",
  sale_committed_without_error:true,is_delivery:true,
  gross_total_positive:true,caixa_auto_delivery_report_flag:"S"};
}
let n=0;
function test(name,f){f();console.log("PASS "+(++n)+" "+name);}
function get(x){
 const before=JSON.stringify(x),r=review(x);
 assert.equal(JSON.stringify(x),before,"pure");
 assert.equal(r.schema,SCHEMA);assert.deepEqual(r.effects,EFFECTS);
 for(const k of ["source_files_are_runtime_proof",
 "source_census_covers_all_printers","first_production_ticket_proven",
 "physical_paper_or_nonpaper_proven","real_cashier_setting_known",
 "delivery_origin_is_ifood_proven","can_disable_or_redirect",
 "fiscal_preservation_proven"]) assert.equal(r[k],false,k);
 return r;
}
function hold(x,reason){
 const r=get(x);assert.equal(r.status,"HOLD",JSON.stringify(r));
 assert.equal(r.reason,reason);return r;
}
function candidate(x,reason){
 const r=get(x);assert.equal(r.status,"SOURCE_PATH_CANDIDATE_ONLY");
 assert.equal(r.reason,reason);return r;
}
test("success delivery positive sale and S invokes delivery report branch only",()=>{
 const r=candidate(base(),"S_CALLS_IMPRESSAO_DELIVERY_AFTER_SUCCESSFUL_SALE");
 assert.equal(r.report_content_kind,"RELATORIO_DE_ENTREGA");
 assert.equal(r.printer_selection,"BUSCA_IMPRESSORA_DELIVERY");
 assert.equal(r.first_production_ticket_proven,false);
});
test("N omits automatic report but never implies old production print off",()=>{
 const x=base();x.caixa_auto_delivery_report_flag="N";
 const r=candidate(x,"N_PREVENTS_AUTOMATIC_REPORT_BRANCH_ONLY_NOT_ALL_LEGACY_PAPER");
 assert.equal(r.manual_print_endpoint_still_exists,true);
});
test("unknown real caixa flag stays hold",()=>{
 const x=base();x.caixa_auto_delivery_report_flag="UNKNOWN";
 hold(x,"CURRENT_CAIXA_IDIMPAUTENTREG_UNVERIFIED");
});
test("sale errors skip report code branch, not all print channels",()=>{
 const x=base();x.sale_committed_without_error=false;
 candidate(x,"AUTOMATIC_DELIVERY_REPORT_BRANCH_NOT_ENTERED_FOR_THIS_CLAIM");
});
test("non-delivery sales do not run this auto report",()=>{
 const x=base();x.is_delivery=false;
 candidate(x,"AUTOMATIC_DELIVERY_REPORT_BRANCH_NOT_ENTERED_FOR_THIS_CLAIM");
});
test("zero gross value skips auto report but not necessarily production",()=>{
 const x=base();x.gross_total_positive=false;
 candidate(x,"AUTOMATIC_DELIVERY_REPORT_BRANCH_NOT_ENTERED_FOR_THIS_CLAIM");
});
test("manual controller report endpoint is independent of auto flag",()=>{
 const x=base();x.path="MANUAL_DELIVERY_REPORT_REQUEST";
 delete x.caixa_auto_delivery_report_flag;
 const r=candidate(x,"MANUAL_REPORT_ENDPOINT_EXISTS_INDEPENDENT_OF_AUTO_CAIXA_FLAG");
 assert.equal(r.automatic_sale_setting_suppresses_manual_path,false);
});
test("manual report still exists when N is proposed",()=>{
 const x=base();x.path="MANUAL_DELIVERY_REPORT_REQUEST";
 x.caixa_auto_delivery_report_flag="N";
 const r=candidate(x,"MANUAL_REPORT_ENDPOINT_EXISTS_INDEPENDENT_OF_AUTO_CAIXA_FLAG");
 assert.equal(r.route_kind,"MANUAL_REPORT");
});
test("no first sushi/production print event can be proved by the report",()=>{
 const r=get(base());assert.equal(r.first_production_ticket_proven,false);
});
test("auto S does not prove physical output was produced",()=>{
 const r=get(base());assert.equal(r.physical_paper_or_nonpaper_proven,false);
});
test("cashier-wide flag is not specific to DLV_IFO",()=>{
 const r=get(base());assert.equal(r.cashier_wide_delivery_report_setting,true);
 assert.equal(r.delivery_origin_is_ifood_proven,false);
});
test("manual route cannot be disabled by pretend cashier flag",()=>{
 const x=base();x.path="MANUAL_DELIVERY_REPORT_REQUEST";x.caixa_auto_delivery_report_flag="N";
 const r=get(x);assert.equal(r.can_disable_or_redirect,false);
});
test("code-only evidence cannot attest live runtime",()=>{
 const r=get(base());assert.equal(r.real_cashier_setting_known,false);
});
test("unexpected value cannot be interpreted as off",()=>{
 const x=base();x.caixa_auto_delivery_report_flag="0";
 hold(x,"CAIXA_AUTO_DELIVERY_REPORT_SETTING_INVALID");
});
test("missing actual successful sale boolean fails closed",()=>{
 const x=base();delete x.sale_committed_without_error;
 hold(x,"SALE_PRECONDITIONS_NOT_ATTESTED");
});
test("unknown order origin cannot be inferred from iFood label on report",()=>{
 const x=base();x.origin="DLV_IFO";const r=get(x);
 assert.equal(r.delivery_origin_is_ifood_proven,false);
});
test("printer selector is dedicated delivery report mapping, not production",()=>{
 const r=get(base());assert.equal(r.printer_parameter_origin,
  "CAIXA_NRSEQIMPRLOJA7_FALLBACK_NRSEQIMPRLOJA3");
});
test("wrong branch location stays hold",()=>{
 const x=base();x.store_id="0002";hold(x,"INSTALLED_SOURCE_IDENTITY_INVALID");
});
test("missing query source fingerprint cannot be accepted",()=>{
 const x=base();x.installed_source_sha256.msde_query="bad";
 hold(x,"INSTALLED_SOURCE_IDENTITY_INVALID");
});
test("unrecognized event type stays hold",()=>{
 const x=base();x.path="KITCHEN_FIRST_PRINT";
 hold(x,"REPORT_PATH_KIND_OR_SOURCE_INVALID");
});
test("malformed input cannot grant disabling or print",()=>{
 for(const x of [null,[],{},false]){const r=get(x);assert.equal(r.status,"HOLD");}
});
console.log("COMANDAS_TEK_DELIVERY_REPORT_BOUNDARY_V1="+n+"/"+n+
 " REPORT_NOT_FIRST_PRODUCTION AUTO_N_NOT_MANUAL_OFF SOURCE_ONLY");

"use strict";
/**
 * Static sale-finalization delivery report boundary (Itaim).
 * Authoritative for source-branch shape only; never verifies live CAIXA flag,
 * first kitchen print, last output, transport, or physical paper.
 * Installed Venda::trataVenda, ImpressaoDelivery, Delivery Controller.
 */
const SCHEMA="tata.comandas.delivery-report-boundary.v1.review-only";
const SHA=/^[a-f0-9]{64}$/i;
const EFFECTS=Object.freeze({host_read:false,sql_read:false,sql_write:false,
 print:false,queue_read:false,queue_write:false,peripheral:false,
 fiscal:false,config_change:false,service_change:false,deploy:false,
 sequence_write:false,network:false});
const VALID_EVIDENCE=["VENDAS_CODE_ONLY","SALE_SOURCE_CLAIM"];
function result(status,reason,extra={}){
 return {schema:SCHEMA,status,reason,
  effects:EFFECTS,source_branch_review_only:true,
  source_files_are_runtime_proof:false,
  source_census_covers_all_printers:false,
  first_production_ticket_proven:false,
  physical_paper_or_nonpaper_proven:false,
  real_cashier_setting_known:false,
  delivery_origin_is_ifood_proven:false,
  can_disable_or_redirect:false,
  fiscal_preservation_proven:false,
  ...extra};
}
function reviewDeliveryReportBoundary(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  input.store_id!=="0001"||input.store_unit!=="01"||
  !input.installed_source_sha256||
  !SHA.test(input.installed_source_sha256.venda||"")||
  !SHA.test(input.installed_source_sha256.impressao_delivery||"")||
  !SHA.test(input.installed_source_sha256.delivery_controller||"")||
  !SHA.test(input.installed_source_sha256.msde_query||""))
  return result("HOLD","INSTALLED_SOURCE_IDENTITY_INVALID");
 if(!["SALE_FINALIZATION","MANUAL_DELIVERY_REPORT_REQUEST"].includes(input.path)||
  !VALID_EVIDENCE.includes(input.evidence_level))
  return result("HOLD","REPORT_PATH_KIND_OR_SOURCE_INVALID");
 if(input.path==="MANUAL_DELIVERY_REPORT_REQUEST")
  return result("SOURCE_PATH_CANDIDATE_ONLY",
   "MANUAL_REPORT_ENDPOINT_EXISTS_INDEPENDENT_OF_AUTO_CAIXA_FLAG",{
    route_kind:"MANUAL_REPORT",
    report_content_kind:"RELATORIO_DE_ENTREGA",
    automatic_sale_setting_suppresses_manual_path:false
   });
 if(typeof input.sale_committed_without_error!=="boolean"||
  typeof input.is_delivery!=="boolean"||
  typeof input.gross_total_positive!=="boolean")
  return result("HOLD","SALE_PRECONDITIONS_NOT_ATTESTED");
 if(!(input.sale_committed_without_error&&input.is_delivery&&input.gross_total_positive))
  return result("SOURCE_PATH_CANDIDATE_ONLY",
   "AUTOMATIC_DELIVERY_REPORT_BRANCH_NOT_ENTERED_FOR_THIS_CLAIM",{
    route_kind:"POST_SALE_DELIVERY_REPORT",
    never_equate_no_report_to_no_production_print:true
   });
 if(!["S","N","UNKNOWN"].includes(input.caixa_auto_delivery_report_flag))
  return result("HOLD","CAIXA_AUTO_DELIVERY_REPORT_SETTING_INVALID");
 if(input.caixa_auto_delivery_report_flag==="UNKNOWN")
  return result("HOLD","CURRENT_CAIXA_IDIMPAUTENTREG_UNVERIFIED",{
   route_kind:"POST_SALE_DELIVERY_REPORT"});
 if(input.caixa_auto_delivery_report_flag==="N")
  return result("SOURCE_PATH_CANDIDATE_ONLY",
   "N_PREVENTS_AUTOMATIC_REPORT_BRANCH_ONLY_NOT_ALL_LEGACY_PAPER",{
    route_kind:"POST_SALE_DELIVERY_REPORT",
    report_content_kind:"RELATORIO_DE_ENTREGA",
    manual_print_endpoint_still_exists:true,
    cashier_wide_delivery_report_setting:true
   });
 return result("SOURCE_PATH_CANDIDATE_ONLY",
   "S_CALLS_IMPRESSAO_DELIVERY_AFTER_SUCCESSFUL_SALE",{
    route_kind:"POST_SALE_DELIVERY_REPORT",
    report_content_kind:"RELATORIO_DE_ENTREGA",
    printer_selection:"BUSCA_IMPRESSORA_DELIVERY",
    printer_parameter_origin:"CAIXA_NRSEQIMPRLOJA7_FALLBACK_NRSEQIMPRLOJA3",
    manual_print_endpoint_still_exists:true,
    cashier_wide_delivery_report_setting:true
   });
}
module.exports={reviewDeliveryReportBoundary,SCHEMA,EFFECTS};

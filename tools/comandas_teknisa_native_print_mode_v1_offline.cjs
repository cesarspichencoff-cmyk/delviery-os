"use strict";
/**
 * Pure view of IDIMPPEDPROD in installed ImpressaoPedido.php.
 * No backend calls, never writes this parameter.
 * The function's N/S/M/T predicates are observed; their invocation scope
 * for a real DLV_IFO first-production event is NOT observed here.
 */
const SCHEMA="tata.comandas.native-production-print-mode.v1.review-only";
const SHA=/^[a-f0-9]{64}$/i;
const GROUPS=Object.freeze([
 "impressoraProducao","impressoraProducao2","impressoraPuxa"
]);
const EFFECTS=Object.freeze({live_host_read:false,print:false,
 service:false,config_change:false,teknisa_write:false,ifood_write:false,
 spooler:false,windows_printer_change:false,network:false,
 sequence_write:false,sql_read:false,sql_write:false,
 fiscal:false,deploy:false});
function answer(status,reason,other={}){
 return {schema:SCHEMA,status,reason,
  old_production_vias_suppressed_in_world:false,
  real_first_print_callsite_identified_here:false,
  delivery_only_scope_attested_here:false,
  safe_for_other_order_types_proven:false,
  fiscal_and_reports_independently_proven:false,
  can_set_live_mode:false,cutover_authorized:false,
  effects:EFFECTS,...other};
}
function reviewNativeProductionPrintMode(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
    input.store_id!=="0001"||input.store_unit!=="01"||
    !SHA.test(input.impressao_pedido_sha256||"")||
    !["N","S","M","T"].includes(input.mode))
  return answer("HOLD","PHP_PRINT_MODE_OR_SOURCE_INVALID");
 const allowedProduction=["S","T"].includes(input.mode);
 const allowedDevice=["M","T"].includes(input.mode);
 const groupPredicates=GROUPS.map(group=>({
  group,production_printer_eligible:allowedProduction,
  maquininha_eligible:allowedDevice
 }));
 if(input.mode!=="N")
  return answer("HOLD","NATIVE_MODE_STILL_ALLOWS_SOME_PRODUCTION_OUTPUT",{
   group_predicates:groupPredicates});
 const target=input.intended_scope;
 if(!target||typeof target!=="object"||Array.isArray(target)||
    target.origin!=="DLV_IFO"||
    target.kind!=="DELIVERY_PRODUCTION_TICKET_ONLY"||
    target.other_tek_orders_preserved!==true||
    target.fiscal_outputs_preserved!==true||
    typeof target.callsite_evidence_ref!=="string"||
    target.callsite_evidence_ref.length<8||
    !SHA.test(target.callsite_snapshot_sha256||""))
  return answer("HOLD","DELIVERY_ONLY_CALLSITE_AND_FISCAL_SCOPE_NOT_PROVEN",{
   group_predicates:groupPredicates});
 // Source audit found that the runtime flag is loaded from cashier
 // configuration into session and reused in mesa, balcao and reprint
 // paths. Never treat changing that shared configuration as a delivery-only
 // suppression, even when caller claims other orders will be preserved.
 const proposed=input.proposed_application;
 if(!proposed||typeof proposed!=="object"||Array.isArray(proposed)||
    proposed.kind!=="DELIVERY_ONLY_PER_INVOCATION_CLAIM"||
    proposed.shared_cashier_setting_untouched!==true||
    proposed.mesa_and_balcao_unchanged!==true||
    typeof proposed.override_evidence_ref!=="string"||
    proposed.override_evidence_ref.length<8||
    !SHA.test(proposed.override_snapshot_sha256||""))
  return answer("HOLD","CASHIER_WIDE_IDIMPPEDPROD_MUST_NOT_BE_CHANGED",{
   group_predicates:groupPredicates,
   cashier_session_shared_across_order_types:true});
 return answer("REVIEW_CANDIDATE_ONLY",
  "PHP_N_CONDITION_SEEN_BUT_RUNTIME_EFFECT_AND_SCOPE_NOT_ATTESTED",{
   group_predicates:groupPredicates,
   target_scope_claim_only:true,php_n_is_only_source_code_candidate:true
  });
}
module.exports={reviewNativeProductionPrintMode,SCHEMA,EFFECTS,GROUPS};

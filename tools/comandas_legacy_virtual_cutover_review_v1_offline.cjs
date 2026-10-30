"use strict";
/**
 * TATÁ Comandas — virtual print cutover review V1.
 * Pure architecture assessment, NOT interception, no host/driver/spooler API.
 * Windows NUL means PAPER SINK only: never an authenticated order trigger.
 * Claims from a caller are not independently attested by this module.
 */
const {identifyTeknisaPrintTransport}=
 require("./comandas_teknisa_transport_census_v1_offline.cjs");
const {reviewNativeProductionPrintMode}=
 require("./comandas_teknisa_native_print_mode_v1_offline.cjs");
const {assessBridgeLegacyOutput}=
 require("./comandas_peripheral_bridge_ack_backup_v1_offline.cjs");
const {reviewDeliveryReportBoundary}=
 require("./comandas_teknisa_delivery_report_boundary_v1_offline.cjs");
const {reviewIfoodInstalledPrintChannels}=
 require("./comandas_ifood_installed_print_channels_v1_offline.cjs");
const {reviewNativeFirstDispatch}=
 require("./comandas_native_first_dispatch_lineage_v1_offline.cjs");
const SCHEMA="tata.comandas.legacy-output-cutover-review.v1";
const ORIGINS=["TEKNISA","IFOOD_GESTOR"];
const EFFECTS=Object.freeze({read_host:false,read_spooler:false,
 read_print_job:false,print:false,reprint:false,install:false,deploy:false,
 change_printer:false,change_port:false,change_queue:false,clear_queue:false,
 change_service:false,change_teknisa:false,change_ifood:false,
 sql_read:false,sql_write:false,sequence_allocate:false,sequence_write:false,
 filesystem_write:false,network:false,fiscal:false});
const HEX=/^[0-9a-f]{64}$/i;
function result(stage,status,reasons,extra={}){
 return {schema:SCHEMA,stage,status,reasons:[...new Set(reasons)].sort(),
  legacy_printers_changed:false,legacy_paper_suppressed_proven:false,
  virtual_output_is_an_order_trigger:false,
  old_print_completed_implies_new_print_completed:false,
  live_order_ingress_proven:false,source_disabling_proven:false,
  new_emitter_exclusive_proven:false,roll_back_executed:false,
  paper_proven:false,customer_facing_cutover_authorized:false,
  installation_authorized:false,can_activate:false,
  effects:EFFECTS,...extra};
}
function checkSource(s,stage){
 if(!s||typeof s!=="object"||Array.isArray(s)||
  !ORIGINS.includes(s.origin)||
  !["WINDOWS_QUEUE","DIRECT_PRINTER","APP_LEVEL","UNKNOWN"].includes(s.path)||
  !["KEEP_LEGACY","UPSTREAM_PRINT_OFF","WINDOWS_NUL_REDIRECT"].includes(s.proposed_legacy_action)||
  !["OBSERVED_ROUTE_CANDIDATE","UNVERIFIED"].includes(s.route_evidence)||
  typeof s.route_ref!=="string"||!s.route_ref||s.route_ref.length>256||
  typeof s.has_other_unobserved_output!=="boolean")return "LEGACY_SOURCE_SCHEMA_INVALID";
 if(s.proposed_legacy_action==="WINDOWS_NUL_REDIRECT"&&
  s.path!=="WINDOWS_QUEUE")return "NUL_DOES_NOT_INTERCEPT_NON_WINDOWS_OUTPUT";
 if(s.proposed_legacy_action==="WINDOWS_NUL_REDIRECT"&&
  s.has_other_unobserved_output)return "NUL_CANNOT_SUPPRESS_OTHER_PRINT_PATH";
 if(s.proposed_legacy_action==="KEEP_LEGACY"&&stage!=="SHADOW")return "OLD_PHYSICAL_OUTPUT_REMAINS_ACTIVE";
 if(stage!=="SHADOW"&&s.route_evidence!=="OBSERVED_ROUTE_CANDIDATE")
  return "LEGACY_PATH_NOT_OBSERVED";
 if(stage!=="SHADOW"&&s.has_other_unobserved_output)return "UNOBSERVED_LEGACY_PRINT_PATH";
 return null;
}
function isProof(p){
 return p&&typeof p==="object"&&!Array.isArray(p)&&
  p.status==="CANDIDATE_EVIDENCE"&&typeof p.evidence_ref==="string"&&
  p.evidence_ref.length>6&&p.evidence_ref.length<=256&&
  typeof p.snapshot_sha256==="string"&&HEX.test(p.snapshot_sha256);
}
function reviewLegacyPrintCutover(input){
 const stage=input?.stage??"UNKNOWN";
 if(!input||typeof input!=="object"||Array.isArray(input)||
  !["SHADOW","PREPARE_CUTOVER","RECOVERY_REVIEW"].includes(stage)||
  input.store_id!=="0001"||input.store_unit!=="01"||
  !Array.isArray(input.legacy_sources)||input.legacy_sources.length!==2)
  return result(stage,"HOLD",["COVERAGE_OR_STAGE_INVALID"]);
 const byOrigin=new Map();
 const invalid=[];
 for(const s of input.legacy_sources){
  if(byOrigin.has(s?.origin))invalid.push("DUPLICATE_ORIGIN");
  const v=checkSource(s,stage);
  if(v)invalid.push(s?.origin&&ORIGINS.includes(s.origin)?
    s.origin+":"+v:v);
  if(ORIGINS.includes(s?.origin))byOrigin.set(s.origin,s);
 }
 for(const o of ORIGINS)if(!byOrigin.has(o))invalid.push(o+":SOURCE_COVERAGE_MISSING");
 if(invalid.length)return result(stage,"HOLD",invalid);
 if(stage==="SHADOW"&&input.legacy_sources.some(
   s=>s.proposed_legacy_action!=="KEEP_LEGACY"))
  return result(stage,"HOLD",["SHADOW_MUST_KEEP_LEGACY_OUTPUT_UNCHANGED"]);
 if(stage==="SHADOW")return result(stage,"SHADOW_SAFE_REVIEW_ONLY",
  ["LEGACY_OUTPUT_NOT_CHANGED","TATA_NEW_PHYSICAL_OUTPUT_MUST_REMAIN_DISABLED"],{
  cutover_gates_not_evaluated:true});
 const proof=input.proofs;
 const reasons=[];
 // The deployed PHP explicitly supports three distinct transport branches.
 // An alleged route alone cannot prove that a Windows NUL port intercepts it.
 const nativeProposal=input.teknisa_transport_census;
 const nativeTransport=identifyTeknisaPrintTransport(nativeProposal);
 if(nativeTransport.status!=="REVIEW_CANDIDATE_ONLY")
  reasons.push("TEKNISA_ACTIVE_PRINT_TRANSPORT_NOT_ATTESTED:"+nativeTransport.reason);
 else if(nativeProposal.proposed_action!==byOrigin.get("TEKNISA").proposed_legacy_action)
  reasons.push("TEKNISA_TRANSPORT_AND_CUTOVER_ACTION_CONFLICT");
 // Actual /print accepts to an Odhen internal queue and may forward a
 // failed job to printerInfo.impBackup. Neither a 202 nor the primary
 // destination census alone proves suppression of all old physical outputs.
 if(nativeProposal?.runtime_flags?.utiliza_impressao_ponte===true){
  const bridge=assessBridgeLegacyOutput(input.peripheral_bridge_evidence);
  if(bridge.status!=="REVIEW_CANDIDATE_ONLY")
   reasons.push("BRIDGE_QUEUE_AND_BACKUP_PATH_NOT_ACCOUNTED_FOR:"+bridge.reason);
 }
 if(byOrigin.get("TEKNISA").proposed_legacy_action==="UPSTREAM_PRINT_OFF"){
  const sup=input.teknisa_upstream_suppression;
  if(!sup||typeof sup!=="object"||Array.isArray(sup))
   reasons.push("NATIVE_UPSTREAM_SUPPRESSION_MECHANISM_NOT_IDENTIFIED");
  else if(sup.mechanism==="IDIMPPEDPROD_N"){
   const trial=reviewNativeProductionPrintMode(sup.native_mode_evidence);
   if(trial.status!=="REVIEW_CANDIDATE_ONLY")
    reasons.push("NATIVE_UPSTREAM_SCOPE_NOT_ESTABLISHED:"+trial.reason);
  }else if(sup.mechanism==="OTHER_SOURCE_SCOPED_PRINT_OFF"){
   if(!isProof(sup.external_source_scoping))
    reasons.push("OTHER_UPSTREAM_SUPPRESSION_SCOPE_NOT_ATTESTED");
  }else reasons.push("NATIVE_UPSTREAM_SUPPRESSION_MECHANISM_NOT_IDENTIFIED");
 }
 const ifood=reviewIfoodInstalledPrintChannels(
  input.ifood_installed_print_census);
 if(ifood.status!=="REVIEW_CANDIDATE_NEEDS_INDEPENDENT_ATTESTATION")
  reasons.push("IFOOD_GP_AND_GESTOR_PRINT_PATHS_UNCENSUSED:"+
   ifood.reasons.join("|"));
 // A marketplace preorder, the ForSale comanda creation, the ForSale
 // export job, a post-sale delivery report or GP/Gestor spooler ACK cannot
 // stand in for the real native first-production dispatch event.
 const firstDispatch=reviewNativeFirstDispatch(
   input.native_first_dispatch_lineage);
 if(firstDispatch.status!=="REVIEW_CANDIDATE_NOT_INDEPENDENTLY_ATTESTED")
  reasons.push("NATIVE_FIRST_PRINT_LINEAGE_UNPROVEN:"+firstDispatch.reason);
 if(!proof||typeof proof!=="object"||Array.isArray(proof))
  reasons.push("INDEPENDENT_PROOF_SET_MISSING");
 else{
  for(const k of ["native_reader_order_revision","native_first_print_trigger",
   "station_window_catalog","tata_sequence_persisted_and_readback",
   "new_printer_route_calibration","independent_source_coexistence",
   "legacy_source_path_census","fiscal_and_other_reports_isolated",
   "rollback_snapshot_and_reconciliation"]){
   if(!isProof(proof[k]))reasons.push("PROOF_MISSING_OR_INVALID:"+k);
  }
 }
 // The Teknisa post-sale automatic delivery report and the manual
 // reprint endpoint are distinct from the kitchen first-production event.
 // A global cashier IDIMPAUTENTREG change is NOT allowed by this proposal.
 const report=input.teknisa_delivery_report_census;
 if(!report||typeof report!=="object"||Array.isArray(report))
  reasons.push("TEKNISA_POST_SALE_AND_MANUAL_REPORT_PATHS_UNCENSUSED");
 else{
  const auto=reviewDeliveryReportBoundary(report.auto_branch);
  const manual=reviewDeliveryReportBoundary(report.manual_branch);
  if(auto.status!=="SOURCE_PATH_CANDIDATE_ONLY" ||
     auto.route_kind!=="POST_SALE_DELIVERY_REPORT")
   reasons.push("TEKNISA_AUTO_REPORT_NOT_SOURCE_SCOPED:"+auto.reason);
  if(manual.status!=="SOURCE_PATH_CANDIDATE_ONLY" ||
     manual.route_kind!=="MANUAL_REPORT")
   reasons.push("TEKNISA_MANUAL_REPORT_ENDPOINT_NOT_ACCOUNTED:"+manual.reason);
  if(report.cashier_global_setting_unchanged!==true ||
     !["INDEPENDENT_REPORT_DISPOSITION_REVIEWED","PRESERVE_DIFFERENT_DOCUMENT_REVIEWED"]
       .includes(report.auto_report_intent) ||
     report.manual_report_intent!=="PRESERVE_ON_DEMAND_WITH_AUDIT")
   reasons.push("REPORT_CASHIER_SCOPE_OR_MANUAL_PATH_UNSAFE");
 }
 // Source coverage and confirmed route-to-sink are never implied by one
 // Windows "Printed" status or by past Gestor print being disabled.
 const hasNul=input.legacy_sources.some(
   s=>s.proposed_legacy_action==="WINDOWS_NUL_REDIRECT");
 // Windows NUL is an acceptable *proposal* for a paperless sink only
 // after the independent Reader and other proof gates are claimed.
 // It can NEVER serve as the trigger or identify an order in its own right.
 if(stage==="RECOVERY_REVIEW"){
  reasons.push("MANUAL_ROLLBACK_AND_DUPLICATE_RECONCILIATION_REQUIRED");
  return result(stage,"HOLD",reasons);
 }
 if(reasons.length)return result(stage,"HOLD",reasons);
 // Even complete synthetic proofs cannot confer host authority, printer
 // ownership, data custody, or actual observed duplicate-free operation.
 return result(stage,"CUTOVER_CANDIDATE_NEEDS_EXTERNAL_ATTESTATION",
  ["SUPPLIED_PROOFS_ARE_NOT_INDEPENDENTLY_ATTESTED",
   "SEPARATE_HUMAN_APPROVAL_AND_PHYSICAL_PILOT_REQUIRED"],{
   selected_legacy_actions:ORIGINS.map(o=>({
    origin:o,proposed_action:byOrigin.get(o).proposed_legacy_action})),
   virtual_sink_needs_independent_order_reader:hasNul,
   windows_nul_is_only_paperless_sink:hasNul
  });
}
module.exports={reviewLegacyPrintCutover,SCHEMA,EFFECTS,ORIGINS};

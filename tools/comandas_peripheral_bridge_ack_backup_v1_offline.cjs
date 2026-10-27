"use strict";
/**
 * Odhen Perifericos native bridge safety review. The observed /print 202
 * acknowledges saving/queueing; it never certifies physical paper delivery.
 * Backup failover is a distinct physical destination and must be inventoried.
 * No log, socket, queue, printer, file or network reads.
 */
const SCHEMA="tata.comandas.peripheral-bridge-ack-backup.v1.review-only";
const SHA=/^[a-f0-9]{64}$/i;
const EFFECTS=Object.freeze({
 host_read:false,network:false,print:false,spooler:false,
 queue_read:false,queue_write:false,backup_enqueue:false,
 filesystem_read:false,filesystem_write:false,sql_read:false,
 sql_write:false,service_change:false,config_change:false,
 install:false,deploy:false,fiscal:false,sequence_write:false
});
function out(status,reason,extra={}){
 return {schema:SCHEMA,status,reason,
  bridge_202_is_paper_confirmation:false,
  bridge_queue_saved_is_physical_delivery:false,
  backup_print_effect_verified:false,
  all_physical_legacy_outputs_suppressed:false,
  receipt_proves_canonical_order_identity:false,
  runtime_backup_config_attested_here:false,
  first_print_event_proven:false,
  ready_for_cutover:false,can_change_peripheral:false,
  effects:EFFECTS,...extra};
}
function assessBridgeLegacyOutput(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
    input.store_id!=="0001"||input.store_unit!=="01"||
    !input.code_fingerprints||typeof input.code_fingerprints!=="object"||
    !SHA.test(input.code_fingerprints.routes_imp_js||"")||
    !SHA.test(input.code_fingerprints.src_imp_js||"")||
    !SHA.test(input.code_fingerprints.printer_handler_js||""))
  return out("HOLD","PERIPHERAL_INSTALLED_CODE_OR_STORE_INVALID");
 // The source code has a configured optional backup and retry/timeout paths.
 // The actual runtime printerInfo.impBackup and config have not been read.
 const census=input.route_census;
 if(!census||typeof census!=="object"||Array.isArray(census)||
    census.scope!=="TEKNISA_DLV_IFO_PRODUCTION_VIA_CLAIM"||
    typeof census.origin_ref!=="string"||census.origin_ref.length<8||
    !SHA.test(census.snapshot_sha256||"")||
    typeof census.backup_config_observed!=="boolean")
  return out("HOLD","PERIPHERAL_ROUTE_AND_BACKUP_CENSUS_MISSING");
 const acknowledgment=input.receipt_claim;
 if(!acknowledgment||typeof acknowledgment!=="object"||
    !["JSON_STATUS_202_QUEUED","UNKNOWN","OTHER"].includes(acknowledgment.kind))
  return out("HOLD","BRIDGE_ACK_KIND_UNKNOWN");
 if(census.backup_config_observed===false)
  return out("HOLD","BACKUP_CONFIG_NOT_OBSERVED_ON_ORDER_PATH");
 if(census.backup_enabled===true){
  if(census.backup_destination_censused!==true ||
     census.backup_legacy_output_plan!=="EXPLICITLY_COVERED")
   return out("HOLD","BACKUP_PRINTER_COULD_EMIT_UNCONTROLLED_LEGACY_PAPER");
 }else if(census.backup_enabled!==false)
  return out("HOLD","BACKUP_ENABLED_STATUS_UNRESOLVED");
 if(census.primary_destination_censused!==true ||
    census.primary_legacy_output_plan!=="EXPLICITLY_COVERED")
  return out("HOLD","PRIMARY_PRINTER_CUTOVER_ROUTE_NOT_CENSUSED");
 if(acknowledgment.kind==="JSON_STATUS_202_QUEUED"){
  // The route returns status 202 immediately after saveItemRequest; the
  // worker prints asynchronously and may fall back to printerInfo.impBackup.
  return out("REVIEW_CANDIDATE_ONLY",
   "JSON_202_PROVES_QUEUE_ACCEPTANCE_ONLY_NOT_PHYSICAL_PAPER",{
    primary_route_claim_only:true,
    backup_route_claim_only:true,
    physical_receipt_required_separately:true
   });
 }
 return out("REVIEW_CANDIDATE_ONLY",
  "NON_202_BRIDGE_RECEIPT_NOT_A_PAPER_ATTESTATION",{
   primary_route_claim_only:true,backup_route_claim_only:true,
   physical_receipt_required_separately:true
  });
}
module.exports={assessBridgeLegacyOutput,SCHEMA,EFFECTS};

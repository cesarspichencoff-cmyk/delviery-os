"use strict";
/**
 * Native first-production trigger provenance — offline review, not attestation.
 * Marketplace import/pre-order, ForSale comanda, production dispatch,
 * post-sale delivery report, fiscal issuance, ForSale sale export and
 * iFood GP/Gestor printing are NOT interchangeable life-cycle events.
 * Source of native DLV_IFO first print remains UNKNOWN until independently
 * observed. Claims from input NEVER authorize an operational change.
 */
const SCHEMA="tata.comandas.marketplace-production-lineage.v1.review-only";
const HEX=/^[a-f0-9]{64}$/i;
const EFFECTS=Object.freeze({host_read:false,service:false,network:false,
 print:false,reprint:false,spooler:false,queue:false,port:false,
 sql_read:false,sql_write:false,fiscal:false,config_change:false,
 sequence_write:false,deploy:false,install:false});
const NON_TRIGGER=[
 "RETAIL_MARKETPLACE_PREORDER",
 "FORSALE_COMANDA_CREATED",
 "FORSALE_SALE_EXPORT",
 "POS_SALE_FINALIZED",
 "TEKNISA_POST_SALE_DELIVERY_REPORT",
 "IFOOD_GP_HTTP_PRINT",
 "IFOOD_GESTOR_IPC_PRINT",
 "ODHEN_BRIDGE_QUEUE_ACK",
 "WINDOWS_PRINTED_JOB_STATUS"
];
function result(status,reason,more={}){
 return {schema:SCHEMA,status,reason,effects:EFFECTS,
  source_claim_only:true,
  actual_first_native_print_event_proven:false,
  valid_order_to_production_link_proven:false,
  physical_paper_proven:false,
  false_events_rejected:true,
  can_authorize_cutover:false,...more};
}
function reviewNativeFirstDispatch(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
    input.store_id!=="0001"||input.store_unit!=="01"||
    !HEX.test(input.installed_or_observed_source_sha256||""))
  return result("HOLD","SOURCE_AND_STORE_NOT_IDENTIFIED");
 if(typeof input.event_type!=="string"||!input.event_type)
  return result("HOLD","FIRST_EVENT_KIND_UNKNOWN");
 if(NON_TRIGGER.includes(input.event_type))
  return result("HOLD","NOT_NATIVE_PRODUCTION_DISPATCH:"+input.event_type);
 if(input.event_type!=="NATIVE_FIRST_PRODUCTION_DISPATCH_CLAIM")
  return result("HOLD","UNSUPPORTED_EVENT_KIND");
 if(input.order_origin!=="DLV_IFO"||
    typeof input.native_order_revision_ref!=="string"||
    input.native_order_revision_ref.length<8||
    !HEX.test(input.native_revision_snapshot_sha256||"")||
    typeof input.dispatcher_component_ref!=="string"||
    input.dispatcher_component_ref.length<8||
    !HEX.test(input.dispatcher_source_sha256||""))
  return result("HOLD","DLV_IFO_REVISION_OR_DISPATCHER_LINK_MISSING");
 if(input.preorder_import_is_not_print_proof!==true||
    input.forsale_comanda_is_not_dispatch_proof!==true||
    input.post_sale_report_not_reused_as_first_print!==true||
    input.gp_and_gestor_not_reused_as_native_trigger!==true)
  return result("HOLD","EVENT_BOUNDARIES_NOT_SEPARATED");
 if(input.station_route_censused!==true||
    input.first_attempt_identity_censused!==true||
    input.cancellation_revision_reconciled!==true)
  return result("HOLD","PRODUCTION_ATTEMPT_ROUTE_REVISION_NOT_RECONCILED");
 return result("REVIEW_CANDIDATE_NOT_INDEPENDENTLY_ATTESTED",
  "SOURCE_DECLARATIONS_ONLY_REAL_FIRST_DISPATCH_STILL_UNKNOWN");
}
module.exports={reviewNativeFirstDispatch,SCHEMA,EFFECTS,NON_TRIGGER};

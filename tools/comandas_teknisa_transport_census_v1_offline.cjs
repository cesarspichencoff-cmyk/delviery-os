"use strict";
/**
 * Review-only native print-transport census. Evidence from installed
 * ImpressaoUtil / Printing source; actual flags not read by this module.
 * Never send to /print, a Windows port, Delphi, network or any printer.
 */
const SCHEMA="tata.comandas.teknisa-native-print-transport.v1.review-only";
const EFFECTS=Object.freeze({live_host_read:false,printer_handle:false,
 spooler:false,queue_change:false,driver_change:false,
 port_change:false,print:false,reprint:false,network:false,
 sql_read:false,sql_write:false,filesystem_read:false,
 filesystem_write:false,service_change:false,deploy:false,
 sequence_write:false,fiscal:false});
const SHA=/^[0-9a-f]{64}$/i;
const ALLOWED=["PONTE_HTTP_PRINT","PHP_PORT_WRITE","DELPHI_FILE_DISPATCH"];
function base(status,reason,more={}){
 return {schema:SCHEMA,status,reason,
  chosen_live_transport_attested_here:false,
  old_output_redirected:false,old_output_suppressed:false,
  paperless_sink_proven:false,nul_is_order_trigger:false,
  cutover_authorized:false,print_authorized:false,
  effects:EFFECTS,...more};
}
function identify(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  input.store_id!=="0001"||input.store_unit!=="01"||
  !input.code_evidence||typeof input.code_evidence!=="object"||
  !SHA.test(input.code_evidence.impressao_pedido_sha256||"")||
  !SHA.test(input.code_evidence.impressao_util_sha256||"")||
  !SHA.test(input.code_evidence.printing_sha256||""))
  return base("HOLD","SOURCE_FINGERPRINTS_OR_STORE_INVALID");
 const flags=input.runtime_flags;
 // Runtime branch is decided by actual instance parameters, NOT by seeing
 // function definitions in the installed PHP files.
 if(!flags||typeof flags!=="object"||Array.isArray(flags)||
    typeof flags.utiliza_impressao_ponte!=="boolean"||
    typeof flags.utiliza_impressao_php!=="boolean"||
    typeof flags.provenance!=="string"||flags.provenance.length<8||
    !SHA.test(flags.observation_sha256||""))
  return base("HOLD","ACTIVE_RUNTIME_PRINT_FLAGS_NOT_ATTESTED");
 const mode=flags.utiliza_impressao_ponte?"PONTE_HTTP_PRINT":
            flags.utiliza_impressao_php?"PHP_PORT_WRITE":"DELPHI_FILE_DISPATCH";
 if(!ALLOWED.includes(mode))return base("HOLD","MODE_NOT_RECOGNIZED");
 const dest=input.transport_destination;
 if(!dest||typeof dest!=="object"||Array.isArray(dest)||
  !["WINDOWS_SPOOLER_QUEUE","DIRECT_OR_NETWORK_PORT","FILE_BRIDGE","UNKNOWN"]
   .includes(dest.kind)||
  typeof dest.provenance!=="string"||dest.provenance.length<8||
  typeof dest.path_matches_order_print!=="boolean")
  return base("HOLD","DESTINATION_PATH_CENSUS_MISSING",{mode});
 if(!dest.path_matches_order_print)
  return base("HOLD","DESTINATION_NOT_BOUND_TO_NATIVE_TICKET_PATH",{mode});
 if(input.proposed_action==="WINDOWS_NUL_REDIRECT"){
  if(dest.kind!=="WINDOWS_SPOOLER_QUEUE")
   return base("HOLD","NUL_NOT_ON_ACTUAL_PRINT_TRANSPORT_PATH",{mode});
  if(mode==="PONTE_HTTP_PRINT"&&
     input.nul_target_is_downstream_bridge!==true)
   return base("HOLD","BRIDGE_HTTP_NOT_PROVEN_TO_USE_SELECTED_WINDOWS_QUEUE",{mode});
  if(mode==="DELPHI_FILE_DISPATCH"&&
     input.nul_target_is_downstream_delphi!==true)
   return base("HOLD","DELPHI_DISPATCH_NOT_PROVEN_TO_USE_SELECTED_WINDOWS_QUEUE",{mode});
  if(mode==="PONTE_HTTP_PRINT"){
   // The installed peripheral routes Epson through a native vendor DLL.
   // A Windows queue seen on the box does NOT prove that DLL uses it.
   if(dest.peripheral_backend==="EPSON_VENDOR_DLL")
    return base("HOLD","EPSON_NATIVE_LIBRARY_NOT_PROVEN_TO_USE_WINDOWS_NUL",{mode});
   if(dest.peripheral_backend!=="WINDOWS_WINSPOOL_API")
    return base("HOLD","BRIDGE_PERIPHERAL_BACKEND_NOT_ATTESTED_AS_WINDOWS_SPOOLER",{mode});
  }
  // All claims originate from caller: candidate ONLY, not an attestation.
  return base("REVIEW_CANDIDATE_ONLY",
   "WINDOWS_NUL_IS_PAPERLESS_SINK_NOT_NATIVE_ORDER_TRIGGER",{
    mode,virtual_sink_candidate:true,
    runtime_flags_source_claim_only:true
   });
 }
 if(input.proposed_action==="UPSTREAM_PRINT_OFF")
  return base("REVIEW_CANDIDATE_ONLY",
   "UPSTREAM_PRINT_OPTION_MUST_BE_SCOPED_TO_TICKETS_NOT_FISCAL",{
    mode,upstream_suppression_candidate:true,
    runtime_flags_source_claim_only:true
   });
 return base("HOLD","UNSUPPORTED_OR_UNCHANGED_LEGACY_ACTION",{mode});
}
module.exports={identifyTeknisaPrintTransport:identify,SCHEMA,EFFECTS};

"use strict";
/**
 * iFood installed print emission scope: GP local HTTP and Gestor Electron IPC.
 * Offline review ONLY: snapshots and runtime assertions are caller claims,
 * not authorization, not observed order ingress or physical paper evidence.
 * No filesystem, network, spooler, printer, session, SQL or config calls.
 */
const SCHEMA="tata.comandas.ifood-installed-print-channels.v1.review-only";
const CHANNELS=["GP_HTTP_PRINT","GESTOR_IPC_PRINTORDER"];
const SHA=/^[a-f0-9]{64}$/i;
const EFFECTS=Object.freeze({
 host_read:false,network:false,print:false,reprint:false,
 spooler_read:false,spooler_write:false,queue_change:false,
 port_change:false,printer_change:false,install:false,
 ifood_config_change:false,teknisa_config_change:false,
 sql_read:false,sql_write:false,filesystem_read:false,
 filesystem_write:false,service_change:false,sequence_write:false,
 deploy:false,fiscal:false
});
function output(status,reasons,more={}){
 return {schema:SCHEMA,status,reasons:[...new Set(reasons)].sort(),
  channels_proved_live_print:false,
  installed_app_running_proves_print_enabled:false,
  gp_listener_proves_paper:false,
  gestor_ipc_ack_proves_paper:false,
  gp_http_response_proves_paper:false,
  windows_job_id_proves_paper:false,
  application_ack_proves_order_identity:false,
  any_old_paper_suppressed_proven:false,
  can_activate:false,effects:EFFECTS,...more};
}
function reviewIfoodInstalledPrintChannels(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  input.store_id!=="0001"||input.store_unit!=="01"||
  !input.package_fingerprints||typeof input.package_fingerprints!=="object"||
  !SHA.test(input.package_fingerprints.gp_asar_sha256||"")||
  !SHA.test(input.package_fingerprints.gestor_asar_sha256||"")||
  !Array.isArray(input.channels)||input.channels.length!==2)
  return output("HOLD",["IFOD_GP_GESTOR_COVERAGE_OR_CODE_INVALID"]);
 const ids=new Set();
 const reasons=[];
 const actions=[];
 for(const c of input.channels){
  if(!c||typeof c!=="object"||Array.isArray(c)||
     !CHANNELS.includes(c.channel_id)){
   reasons.push("IFOOD_CHANNEL_UNKNOWN_OR_INVALID");continue;
  }
  if(ids.has(c.channel_id))reasons.push("IFOOD_CHANNEL_DUPLICATE:"+c.channel_id);
  ids.add(c.channel_id);
  if(!["SOURCE_OFF","WINDOWS_QUEUE_SINK_REVIEW"].includes(c.proposed_action))
   reasons.push("IFOOD_LEGACY_CHANNEL_NOT_NEUTRALIZED:"+c.channel_id);
  if(!["ACTIVE","DISABLED","UNKNOWN"].includes(c.runtime_auto_print_mode)||
      c.runtime_auto_print_mode==="UNKNOWN"||
      typeof c.runtime_observation_ref!=="string"||
      c.runtime_observation_ref.length<8||
      !SHA.test(c.runtime_observation_sha256||""))
   reasons.push("IFOOD_ACTUAL_PRINT_SETTING_UNKNOWN:"+c.channel_id);
  if(c.manual_print_path_censused!==true)
   reasons.push("IFOOD_MANUAL_PRINT_PATH_UNCENSUSED:"+c.channel_id);
  if(c.pending_or_ambiguous_jobs_reconciled!==true)
   reasons.push("IFOOD_QUEUED_OR_AMBIGUOUS_JOBS_UNRECONCILED:"+c.channel_id);
  if(c.proposed_action==="WINDOWS_QUEUE_SINK_REVIEW"&&
     (c.actual_printer_queue_censused!==true||
      c.dedicated_nonfiscal_queue_proven!==true||
      c.actual_transport!=="WINDOWS_PRINTER_DRIVER"))
   reasons.push("IFOOD_WINDOWS_SINK_NOT_BOUND_TO_EXCLUSIVE_QUEUE:"+c.channel_id);
  if(c.proposed_action==="SOURCE_OFF"&&
     c.source_control_scope_isolated!==true)
   reasons.push("IFOOD_SOURCE_OFF_SCOPE_UNVERIFIED:"+c.channel_id);
  actions.push({channel_id:c.channel_id,proposed_action:c.proposed_action});
 }
 for(const id of CHANNELS)if(!ids.has(id))
  reasons.push("IFOOD_CHANNEL_MISSING:"+id);
 if(reasons.length)return output("HOLD",reasons);
 return output("REVIEW_CANDIDATE_NEEDS_INDEPENDENT_ATTESTATION",
  ["GP_LISTENER_IS_NOT_PRINT_EVENT",
   "GESTOR_IPC_REPLY_IS_NOT_PRINT_COMPLETION",
   "PRINT_RESULT_AND_QUEUE_JOB_ARE_NOT_PAPER_PROOF",
   "LIVE_COVERAGE_AND_SOURCE_FLAGS_NOT_ATTESTED"],{
    channel_actions:actions,
    code_branches_identified_only:true,
    no_permission_to_disable_gp_or_gestor:true
   });
}
module.exports={reviewIfoodInstalledPrintChannels,SCHEMA,CHANNELS,EFFECTS};

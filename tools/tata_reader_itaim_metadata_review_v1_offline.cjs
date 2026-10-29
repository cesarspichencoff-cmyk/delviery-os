"use strict";
/* Pure review of FOUR existing-Reader metadata claims, never health attestation.
 * No IO, SQL, network, printer, service, fiscal or sequence effects.
 * Do not echo untrusted values, identifiers, paths or private fields.
 */
const SCHEMA="tata.comandas.itaim-reader-metadata-review.v1.offline";
const NAMES=["heartbeat","shadow_consumer","reporting_projector","production_service"];
const ROOT=["schema","captured_at_utc","device_unit","host_matches_approved_name",
 "root_directory_safe","files","status","reader_service_running_proven",
 "reader_content_valid_proven","native_first_dispatch_proven",
 "printer_path_proven","physical_paper_proven","ready_for_operational_print",
 "effect_boundary"];
const KEYS=["logical_name","status","last_write_utc","age_minutes",
 "clock_anomaly","length_bytes"];
const E_KEYS=["file_contents_read","file_write","sql_read","sql_write","network",
 "printer_read","print","spooler_read","spooler_write","service_read",
 "service_change","sequence_write","fiscal","deploy"];
const EFFECTS=Object.freeze(Object.fromEntries(E_KEYS.map(x=>[x,false])));
const STATES=new Set(["PRESENT_METADATA_ONLY","UNAVAILABLE",
 "BLOCKED_UNSAFE_PARENT","BLOCKED_UNSAFE_FILE"]);
const shape=(v,keys)=>v&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const utc=s=>typeof s==="string"&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,7}(?:Z|\+00:00)$/.test(s)&&
 Number.isFinite(Date.parse(s));
function output(diagnosis,more={}){
 return {schema:SCHEMA,status:"HOLD",diagnosis,claim_consistent:false,
  host_name_claim_consistent:false,inspected_file_count:0,
  all_four_file_metadata_present:false,
  reader_service_running_proven:false,json_contents_valid_proven:false,
  independent_native_source_proven:false,reader_freshness_proven:false,
  first_production_print_proven:false,physical_paper_proven:false,
  operational_print_authorized:false,effects:EFFECTS,...more};
}
function reviewItaimReaderMetadata(x){
 if(!shape(x,ROOT)||x.schema!=="tata.comandas.itaim-reader-metadata.v1.readonly"||
  x.status!=="HOLD"||x.device_unit!=="ITAIM_HUMAN_CONFIRMED_NOT_INDEPENDENTLY_ATTESTED"||
  !utc(x.captured_at_utc)||typeof x.host_matches_approved_name!=="boolean"||
  typeof x.root_directory_safe!=="boolean"||!Array.isArray(x.files)||x.files.length>4||
  !shape(x.effect_boundary,E_KEYS)||E_KEYS.some(k=>x.effect_boundary[k]!==false)||
  ["reader_service_running_proven","reader_content_valid_proven",
   "native_first_dispatch_proven","printer_path_proven","physical_paper_proven",
   "ready_for_operational_print"].some(k=>x[k]!==false))
  return output("UNTRUSTED_ENVELOPE_OR_EFFECT_CLAIM");
 if(!x.host_matches_approved_name){
  return output(x.files.length===0&&!x.root_directory_safe
   ?"UNAPPROVED_HOST":"WRONG_HOST_WITH_UNEXPECTED_OBSERVATIONS");
 }
 if(!x.root_directory_safe){
  return output(x.files.length===0?"READER_ROOT_UNAVAILABLE_OR_UNSAFE":
   "ROOT_UNSAFE_WITH_UNEXPECTED_OBSERVATIONS",{host_name_claim_consistent:true});
 }
 if(x.files.length!==4)
  return output("INCOMPLETE_FOUR_FILE_COVERAGE",{host_name_claim_consistent:true});
 const seen=new Set();
 for(const f of x.files){
  if(!shape(f,KEYS)||!NAMES.includes(f.logical_name)||seen.has(f.logical_name)||
    !STATES.has(f.status))
   return output("FILE_METADATA_INVALID_OR_DUPLICATED",{host_name_claim_consistent:true});
  seen.add(f.logical_name);
  if(f.status==="PRESENT_METADATA_ONLY"){
   if(!utc(f.last_write_utc)||!Number.isSafeInteger(f.length_bytes)||
      f.length_bytes<0||typeof f.clock_anomaly!=="boolean"||
      (f.clock_anomaly?f.age_minutes!==null:
       typeof f.age_minutes!=="number"||!Number.isFinite(f.age_minutes)||
       f.age_minutes<0))
    return output("FILE_METADATA_CONTRADICTION",{host_name_claim_consistent:true});
  }else if(f.last_write_utc!==null||f.age_minutes!==null||
           f.clock_anomaly!==null||f.length_bytes!==null)
   return output("UNAVAILABLE_FILE_CLAIMS_TIMESTAMPS",{host_name_claim_consistent:true});
 }
 const known={host_name_claim_consistent:true,claim_consistent:true,inspected_file_count:4};
 if(x.files.some(f=>f.status.startsWith("BLOCKED_")))
  return output("UNSAFE_PATH_OR_REPARSE_POINT",known);
 if(x.files.some(f=>f.status==="UNAVAILABLE"))
  return output("FILE_ABSENT_OR_ACCESS_DENIED",known);
 if(x.files.some(f=>f.length_bytes===0))
  return output("EMPTY_FILE_NOT_VALIDATED",known);
 if(x.files.some(f=>f.clock_anomaly))
  return output("FILE_CLOCK_ANOMALY",known);
 return output("FOUR_METADATA_PRESENT_NOT_SERVICE_HEALTH",{
  ...known,all_four_file_metadata_present:true});
}
module.exports={SCHEMA,EFFECTS,NAMES,reviewItaimReaderMetadata};

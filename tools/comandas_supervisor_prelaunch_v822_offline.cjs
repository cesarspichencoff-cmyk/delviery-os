'use strict';
/**
 * V8.22 offline source-pinned preview only. Adds a second generation check
 * immediately before the supervisor's child Process.Start. NEVER deploys,
 * changes an installed file or starts the supervisor.
 * A late check NARROWS but DOES NOT CLOSE a time-of-check/time-of-use race.
 */
const {transform:previous,SHA,SOURCE_SHA,SOURCE_BYTES}=require('./comandas_supervisor_guard_v820_offline.cjs');
const SCHEMA='deliveryos.comandas.v822.supervisor-prelaunch-preview';
const LAUNCH='    $proc = [Diagnostics.Process]::Start($psi)';
const START=['  $proc = $null','  try {',LAUNCH];
const INJECT=[
 '    # V8.22: check again immediately before child Process.Start.',
 '    # Not atomic; external quiescent cutover still required.',
 '    $preLaunchGenerations = Test-CutoverGenerationsQuiet',
 '    if ($preLaunchGenerations -ne "CLEAN") {',
 '      Stop-Fatal "CUTOVER_PRELAUNCH_NOT_QUIET"',
 '    }'
];
const hold=(reason)=>Object.freeze({schema:SCHEMA,status:'HOLD',reason,
 candidate_supervisor_text:null,source_pinned:false,
 runtime_supervisor_tested:false,atomic_cutover_proven:false,
 operational_activation_allowed:false,host_effects:false});
function preview(sourceBytes,pin={sha:SOURCE_SHA,size:SOURCE_BYTES}){
 const first=previous(sourceBytes,pin);
 if(first.status!=='REVIEW_ONLY_UNINSTALLED')return hold('SOURCE_V820_'+first.reason);
 const raw=first.proposed_supervisor_text;
 const nl=raw.includes('\r\n')?'\r\n':'\n';
 const anchor=START.join(nl);
 if(raw.split(anchor).length!==2||raw.split(LAUNCH).length!==2)
   return hold('PRELAUNCH_ANCHOR_NOT_UNIQUE');
 if(raw.includes('CUTOVER_PRELAUNCH_NOT_QUIET'))return hold('SECOND_GATE_ALREADY_PRESENT');
 const modified=raw.replace(anchor,START.slice(0,2).join(nl)+nl+INJECT.join(nl)+nl+LAUNCH);
 if(modified.split('Test-CutoverGenerationsQuiet').length!==4)
   return hold('THREE_GUARD_REFERENCES_NOT_PROVEN');
 if(modified.split('CUTOVER_PRELAUNCH_NOT_QUIET').length!==2)
   return hold('PRELAUNCH_HOLD_NOT_UNIQUE');
 if(modified.indexOf('CUTOVER_PRELAUNCH_NOT_QUIET')>=modified.indexOf(LAUNCH))
   return hold('HOLD_MUST_PRECEDE_PROCESS_START');
 return {
  schema:SCHEMA,status:'REVIEW_ONLY_UNINSTALLED',
  reason:'SOURCE_PINNED_DUAL_GUARD_PREVIEW_NOT_ATOMIC_NOT_RUNTIME_TESTED',
  original_sha256:SHA(sourceBytes),candidate_sha256:SHA(Buffer.from(modified,'utf8')),
  original_length_bytes:sourceBytes.length,candidate_length_bytes:Buffer.byteLength(modified,'utf8'),
  startup_gate_preserved:true,second_gate_precedes_process_start:true,
  both_generations_checked_by_shared_function:true,
  no_existing_process_termination_added:true,
  recovery_logic_unchanged:true,source_pinned:(pin.sha===SOURCE_SHA&&pin.size===SOURCE_BYTES),
  runtime_supervisor_tested:false,atomic_cutover_proven:false,
  human_approval_authenticated:false,operational_activation_allowed:false,
  host_effects:false,candidate_supervisor_text:modified
 };
}
const safeReport=r=>{const {candidate_supervisor_text,...rest}=r;return rest};
module.exports={preview,safeReport,hold,SCHEMA,LAUNCH,START,INJECT,SOURCE_SHA,SOURCE_BYTES};

'use strict';
/**
 * V8.20 — SOURCE-PINNED PREVIEW ONLY for the installed Windows V1 supervisor.
 * The supervisor source is never committed. This only proposes a conservative
 * startup barrier that refuses to launch a batch when any old/staged watcher
 * is visible or CIM enumeration is incomplete. It does NOT prove an atomic
 * service cutover and it must NOT be installed without human authorization.
 */
const crypto=require('node:crypto');
const SOURCE_SHA='2B6DC012918F317C8D244531B3CCB2FD33E33B226C6E6E668BEE4B698936BEF5';
const SOURCE_BYTES=34708;
const OLD="C:\\ProgramData\\TataComandaReader\\bin\\tata_reader_continuous_watch_candidate_v2.ps1";
const STAGED="C:\\ProgramData\\TataComandaReader\\bin\\tata_reader_continuous_watch_candidate_v2_protected_v815.ps1";
const MAIN='# ------------------------------------------------------------------- laco --';
const LOOP='  $orphan = "NONE"';
const LEGACY='if ($cl.IndexOf($cfg.watcher_path, [StringComparison]::OrdinalIgnoreCase) -ge 0)';
const SHA=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const HOLD=reason=>Object.freeze({schema:'deliveryos.comandas.v820.supervisor-guard-preview',
  status:'HOLD',reason,proposed_supervisor_text:null,
  original_supervisor_installed:false,operational_deployment_authorized:false,
  real_supervisor_executed:false,host_effects:false});
const FUNCTION=[
 'function Test-CutoverGenerationsQuiet {',
 '  # No process termination; fail closed if enumeration/identity is unknown.',
 '  $paths = @(',
 "    '"+OLD+"',",
 "    '"+STAGED+"'",
 '  )',
 '  try {',
 '    $processes = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='+"'powershell.exe' OR Name='pwsh.exe'"+'" -ErrorAction Stop)',
 '    foreach ($process in $processes) {',
 '      if ([int]$process.ProcessId -eq $PID) { continue }',
 '      $cmd = [string]$process.CommandLine',
 '      if ([string]::IsNullOrWhiteSpace($cmd)) { return "UNKNOWN" }',
 '      foreach ($path in $paths) {',
 '        if ($cmd.IndexOf($path, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return "ACTIVE" }',
 '      }',
 '    }',
 '  } catch { return "UNKNOWN" }',
 '  return "CLEAN"',
 '}',
 ''
];
const INVOCATION=[
 '  # V8.20: no watcher generation may survive a supervisor startup.',
 '  # This is defense-in-depth, NOT proof service restart was inhibited.',
 '  $crossGeneration = Test-CutoverGenerationsQuiet',
 '  if ($crossGeneration -ne "CLEAN") {',
 '    $state.blocked = "CUTOVER_GENERATION_" + $crossGeneration',
 '    Stop-Fatal "CUTOVER_QUIESCENCE_NOT_PROVEN"',
 '  }'
];
function transform(sourceBytes,pin={sha:SOURCE_SHA,size:SOURCE_BYTES}){
 if(!Buffer.isBuffer(sourceBytes)||sourceBytes.length<1000||sourceBytes.length>120000)
   return HOLD('SOURCE_BYTES_BOUNDED');
 if(SHA(sourceBytes)!==pin.sha||sourceBytes.length!==pin.size)return HOLD('ORIGINAL_SUPERVISOR_SHA_OR_SIZE_DRIFT');
 const text=sourceBytes.toString('utf8');
 if(!Buffer.from(text,'utf8').equals(sourceBytes))return HOLD('UTF8_NOT_EXACT');
 if(text.includes('Test-CutoverGenerationsQuiet')||text.includes('CUTOVER_QUIESCENCE_NOT_PROVEN'))
   return HOLD('ALREADY_PATCHED');
 if([MAIN,LOOP,LEGACY,'function Stop-UnrecordedBatches {'].some(v=>text.split(v).length!==2))
   return HOLD('SOURCE_ANCHORS_CHANGED');
 const newline=text.includes('\r\n')?'\r\n':'\n';
 const prefix=FUNCTION.join(newline)+newline;
 const afterFunction=text.replace(MAIN,prefix+MAIN);
 const start='try {'+newline+LOOP;
 if(afterFunction.split(start).length!==2)return HOLD('STARTUP_ANCHOR_NOT_UNIQUE');
 const next=afterFunction.replace(start,'try {'+newline+INVOCATION.join(newline)+newline+LOOP);
 if(next.includes('try {'+newline+INVOCATION.join(newline)+newline+LOOP)===false||
    next.split('Test-CutoverGenerationsQuiet').length!==3)
   return HOLD('PREVIEW_PATCH_INVARIANT');
 const report={schema:'deliveryos.comandas.v820.supervisor-guard-preview',
  status:'REVIEW_ONLY_UNINSTALLED',reason:'REQUIRES_ISOLATED_POWERSHELL_AND_CUTOVER_TESTS',
  original_sha256:SHA(sourceBytes),preview_sha256:SHA(Buffer.from(next,'utf8')),
  original_length:sourceBytes.length,preview_length:Buffer.byteLength(next,'utf8'),
  new_function_count:1,new_startup_guard_count:1,
  existing_orphan_hunt_preserved:true,
  unknown_inventory_blocks:true,old_and_staged_paths_checked:true,
  does_not_terminate_other_processes:true,real_supervisor_executed:false,
  atomic_cutover_proven:false,human_authorization_authenticated:false,
  operational_deployment_authorized:false,host_effects:false,
  proposed_supervisor_text:next};
 return report;
}
const previewPinned=bytes=>transform(bytes);
const safeReport=result=>{
 const {proposed_supervisor_text,...rest}=result;
 return rest;
};
module.exports={transform,previewPinned,safeReport,SHA,HOLD,
 SOURCE_SHA,SOURCE_BYTES,MAIN,LOOP,LEGACY,OLD,STAGED,FUNCTION,INVOCATION};

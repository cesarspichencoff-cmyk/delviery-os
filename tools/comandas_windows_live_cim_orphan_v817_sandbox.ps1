# V8.17: REAL Win32_Process enumeration of harmless simulated watcher processes.
# Only runs on a disposable GitHub-hosted Windows worker. No actual watcher code.
# No operational device, supervisor, SQL, state, registry, printer or spooler.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted') {
  throw 'GITHUB_HOSTED_WINDOWS_ONLY'
}
$old='C:\ProgramData\TataComandaReader\bin\tata_reader_continuous_watch_candidate_v2.ps1'
$staged='C:\ProgramData\TataComandaReader\bin\tata_reader_continuous_watch_candidate_v2_protected_v815.ps1'
$shell=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if(-not (Test-Path -LiteralPath $shell -PathType Leaf)){throw 'SYSTEM_POWERSHELL_NOT_FOUND'}
$nonce=[guid]::NewGuid().ToString('N')
$tagOld='V817_OLD_'+$nonce
$tagNew='V817_NEW_'+$nonce
$owned=[Collections.Generic.List[Diagnostics.Process]]::new()
function Start-TestProcess([string]$Tag,[string]$MarkerPath) {
  # The marker is a comment in a benign sleep command, NOT an executed path.
  $argument='-NoLogo -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 40; # '+$Tag+' '+$MarkerPath+'"'
  $child=Start-Process -FilePath $shell -ArgumentList $argument -PassThru -WindowStyle Hidden
  $owned.Add($child)
  if($child.Id -le 0){throw 'SYNTHETIC_PROCESS_ID_MISSING'}
  return $child
}
function Read-MarkedProcess([string]$Tag,[int]$ExpectedPid) {
  $items=@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction Stop |
    Where-Object{ ([string]$_.CommandLine).Contains($Tag) })
  if($items.Count -ne 1){throw ('MARKED_PROCESS_COUNT_'+$items.Count)}
  if([int]$items[0].ProcessId -ne $ExpectedPid){throw 'PROCESS_IDENTITY_MISMATCH'}
  return $items[0]
}
function Contains-Path([string]$Line,[string]$Path) {
  return $Line.IndexOf($Path,[StringComparison]::OrdinalIgnoreCase) -ge 0
}
try {
  $a=Start-TestProcess $tagOld $old
  $b=Start-TestProcess $tagNew $staged
  $s1=$null
  $s2=$null
  for($i=0;$i -lt 25;$i++){
    Start-Sleep -Milliseconds 200
    try{
      $s1=Read-MarkedProcess $tagOld $a.Id
      $s2=Read-MarkedProcess $tagNew $b.Id
      break
    }catch { $s1=$null;$s2=$null }
  }
  if($null -eq $s1 -or $null -eq $s2){throw 'WINDOWS_WMI_CHILD_PROCESS_NOT_VISIBLE'}
  if($a.HasExited -or $b.HasExited){throw 'SYNTHETIC_CHILD_EXITED_EARLY'}
  $oldLine=[string]$s1.CommandLine
  $newLine=[string]$s2.CommandLine
  $oldVisible=Contains-Path $oldLine $old
  $newVisible=Contains-Path $newLine $staged
  $oldNotVisibleToNewOnlyFilter=-not (Contains-Path $oldLine $staged)
  $newNotVisibleToOldOnlyFilter=-not (Contains-Path $newLine $old)
  if(-not ($oldVisible -and $newVisible -and
           $oldNotVisibleToNewOnlyFilter -and $newNotVisibleToOldOnlyFilter)) {
    throw 'CROSS_GENERATION_DETECTION_ASSERTION_FAILED'
  }
  $deltaOld=[math]::Abs((([datetime]$s1.CreationDate).ToUniversalTime()-
    $a.StartTime.ToUniversalTime()).TotalSeconds)
  $deltaNew=[math]::Abs((([datetime]$s2.CreationDate).ToUniversalTime()-
    $b.StartTime.ToUniversalTime()).TotalSeconds)
  if($deltaOld -gt 2 -or $deltaNew -gt 2){throw 'WIN32_PROCESS_TIME_IDENTITY_MISMATCH'}
  # V8.18: feed real, harmless CIM process identities to the V8.16 pure gate.
  # Operational stop/restart/lock fields below are SYNTHETIC TEST ASSUMPTIONS,
  # never measurements or authorizations on the restaurant machine.
  function Probe-NodeGuard([object[]]$Observed,[bool]$InventoryComplete,[bool]$ExpectedClean) {
    $snap=[ordered]@{
      schema='deliveryos.comandas.cutover-process-inventory.v816.synthetic'
      source='SYNTHETIC_TEST_INPUT'
      observed_at_utc=(Get-Date).ToUniversalTime().ToString('o')
      inventory_complete=$InventoryComplete
      inventory_error=if($InventoryComplete){$null}else{'LIST_UNKNOWN'}
      windows_service_stopped=$true
      service_restart_inhibited=$true
      supervisor_lock_released=$true
      child_record=$null
      processes=@($Observed)
    }
    $env:V818_CIM_SNAPSHOT=($snap|ConvertTo-Json -Depth 8 -Compress)
    $env:V818_EXPECT_CLEAN=if($ExpectedClean){'true'}else{'false'}
    $js=@'
const {evaluate}=require("./tools/comandas_cutover_quiescence_v816_offline.cjs");
const s=JSON.parse(process.env.V818_CIM_SNAPSHOT);
const r=evaluate(s,Date.parse(s.observed_at_utc));
const expected=process.env.V818_EXPECT_CLEAN==="true";
if(expected) {
  if(r.status!=="SYNTHETIC_QUIESCENCE_CONSISTENT_REVIEW_ONLY"||r.reasons.length)
    process.exit(18);
} else {
  if(r.status!=="HOLD"||!r.reasons.length)process.exit(19);
}
if(r.activation_authorized!==false||r.world_inventory_attested!==false||
   r.human_authorization_authenticated!==false)process.exit(20);
console.log(JSON.stringify({status:r.status,reasons:r.reasons}));
'@
    try {
      $output=& node --eval $js
      if($LASTEXITCODE -ne 0){throw ('V818_NODE_PREDICATE_EXIT_'+$LASTEXITCODE)}
      return ($output|Select-Object -Last 1|ConvertFrom-Json)
    }finally {
      Remove-Item Env:V818_CIM_SNAPSHOT -ErrorAction SilentlyContinue
      Remove-Item Env:V818_EXPECT_CLEAN -ErrorAction SilentlyContinue
    }
  }
  function To-Record([object]$Cim) {
    return [ordered]@{
      pid=[int]$Cim.ProcessId
      started_utc=([datetime]$Cim.CreationDate).ToUniversalTime().ToString('o')
      command_line=[string]$Cim.CommandLine
    }
  }
  $both=Probe-NodeGuard @((To-Record $s1),(To-Record $s2)) $true $false
  if($both.reasons -notcontains 'OLD_GENERATION_PROCESS_PRESENT' -or
     $both.reasons -notcontains 'STAGED_GENERATION_PROCESS_PRESENT'){
    throw 'V818_BOTH_GENERATIONS_NOT_HELD'
  }
  # V8.21 exercises the EXACT V8.20 function text produced by its JS module.
  # It uses only the disposable runner's benign processes, never the installed
  # supervisor, a TATA watcher, operational state, services, or printing.
  $v821FunctionJavaScript=@'
const m=require("./tools/comandas_supervisor_guard_v820_offline.cjs");
if(m.SOURCE_SHA!=="2B6DC012918F317C8D244531B3CCB2FD33E33B226C6E6E668BEE4B698936BEF5")
  process.exit(21);
if(m.FUNCTION.length!==20 || m.INVOCATION.length!==7)process.exit(22);
process.stdout.write(m.FUNCTION.join("\n")+"\n");
'@
  $v821FunctionLines=@(& node --eval $v821FunctionJavaScript)
  if($LASTEXITCODE -ne 0 -or $v821FunctionLines.Count -ne 20){
    throw 'V821_FUNCTION_SOURCE_NOT_PINNED'
  }
  $v821Code=($v821FunctionLines -join [Environment]::NewLine)
  $v821Errors=$null
  $v821Tokens=$null
  $null=[Management.Automation.Language.Parser]::ParseInput(
    $v821Code,[ref]$v821Tokens,[ref]$v821Errors)
  if($v821Errors.Count -ne 0){throw 'V821_ACTUAL_FUNCTION_PARSE_FAILED'}
  . ([scriptblock]::Create($v821Code))
  if((Test-CutoverGenerationsQuiet) -cne 'ACTIVE'){
    throw 'V821_BOTH_LIVE_GENERATIONS_NOT_BLOCKED'
  }
  if(-not $b.HasExited){$b.Kill();$null=$b.WaitForExit(8000)}
  if(-not $b.HasExited){throw 'V818_OWN_STAGED_PROCESS_NOT_TERMINATED'}
  if((Test-CutoverGenerationsQuiet) -cne 'ACTIVE'){
    throw 'V821_UNRECORDED_OLD_GENERATION_NOT_BLOCKED'
  }
  $oldOnly=Read-MarkedProcess $tagOld $a.Id
  $one=Probe-NodeGuard @((To-Record $oldOnly)) $true $false
  if($one.reasons -notcontains 'OLD_GENERATION_PROCESS_PRESENT'){
    throw 'V818_ORPHAN_OLD_PROCESS_NOT_HELD'
  }
  if(-not $a.HasExited){$a.Kill();$null=$a.WaitForExit(8000)}
  if(-not $a.HasExited){throw 'V818_OWN_OLD_PROCESS_NOT_TERMINATED'}
  if((Test-CutoverGenerationsQuiet) -cne 'CLEAN'){
    throw 'V821_OWNED_PROCESSES_GONE_BUT_FUNCTION_NOT_CLEAN'
  }
  # Use dynamic scoping to replace CIM only within this isolated test scope.
  $v821Unknown=& {
    function Get-CimInstance {throw 'V821_SIMULATED_ENUMERATION_DENIED'}
    Test-CutoverGenerationsQuiet
  }
  if($v821Unknown -cne 'UNKNOWN'){throw 'V821_UNKNOWN_CIM_NOT_HELD'}
  # Incomplete enumeration must HOLD even if no test process is visible.
  $unknown=Probe-NodeGuard @() $false $false
  if($unknown.reasons -notcontains 'PROCESS_ENUMERATION_NOT_CONFIRMED'){
    throw 'V818_INCOMPLETE_ENUMERATION_NOT_HELD'
  }
  $clean=Probe-NodeGuard @() $true $true
  if($clean.status -ne 'SYNTHETIC_QUIESCENCE_CONSISTENT_REVIEW_ONLY'){
    throw 'V818_SYNTHETIC_CLEAN_REVIEW_NOT_CONFIRMED'
  }

  # V8.19 — execute the actual V8.15 pair module against disposable inputs,
  # after the V8.18 host-process/guard integration, without installing either.
  $pairJs=@'
"use strict";
const assert=require("node:assert/strict");
const {OLD_PATH}=require("./tools/comandas_watcher_shift_path_v814_offline.cjs");
const {simulateWithPins,previewPinnedPair,safeReport,SHA,
  OLD_WATCHER_PATH,NEW_WATCHER_PATH}=require("./tools/comandas_watcher_supervisor_pair_v815_offline.cjs");
const watcher=[
  '$CheckpointPath = "C:\\ProgramData\\TataComandaReader\\state\\reader-watch-checkpoint-v1.json"',
  '$EventDir = "C:\\ProgramData\\TataComandaReader\\state\\reader-events-v1"',
  '$ExpectedLogin = "NT SERVICE\\TataComandaReader"',
  OLD_PATH,
  'function Read-ServiceState([datetime]$OrderOpenedAt) {',
  '  $state = Get-Content -LiteralPath $ServiceStatePath -Raw -Encoding UTF8 | ConvertFrom-Json',
  '  if ($null -eq $state.valid_from_local) { throw "SERVICE_STATE_VALID_FROM_REQUIRED" }',
  '  if ($OrderOpenedAt -ge [datetime]$state.valid_until_local) { throw "SERVICE_STATE_EXPIRED_FOR_ORDER" }',
  '}',
  ...Array.from({length:70},(_,i)=>"# synthetic no-effect watcher fixture "+i)
].join("\r\n")+"\r\n";
const watcherBuffer=Buffer.from(watcher,"utf8");
const cfg={
 schema:"deliveryos.tata-reader-supervisor-config.v1",
 watcher_path:OLD_WATCHER_PATH,watcher_sha256:SHA(watcherBuffer),
 heartbeat_path:"C:\\ProgramData\\TataComandaReader\\state\\reader-heartbeat-v1.json",
 child_record_path:"C:\\ProgramData\\TataComandaReader\\state\\reader-supervisor-child-v1.json",
 lock_path:"C:\\ProgramData\\TataComandaReader\\state\\reader-supervisor-v1.lock",
 powershell_exe:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
 batch_polls:20,min_backoff_seconds:3,max_backoff_seconds:60,heartbeat_every_seconds:5
};
const buf=c=>Buffer.from(JSON.stringify(c,null,2),"utf8");
const cfgBuffer=buf(cfg);
const pins={watcher:SHA(watcherBuffer),config:SHA(cfgBuffer)};
let checks=0;
const good=simulateWithPins(watcherBuffer,cfgBuffer,pins);checks++;
assert.equal(good.status,"REVIEW_ONLY_UNINSTALLED",JSON.stringify(safeReport(good)));
assert.deepEqual(good.changed_config_fields,["watcher_path","watcher_sha256"]);checks++;
assert.equal(good.changed_watcher_lines,1);checks++;
assert.equal(JSON.parse(good.staged_config_text).watcher_path,NEW_WATCHER_PATH);checks++;
assert.equal(JSON.parse(good.staged_config_text).watcher_sha256,
  SHA(Buffer.from(good.staged_watcher_text,"utf8")));checks++;
assert.equal(good.staged_watcher_text.replace(good.new_shift_path,good.old_shift_path),watcher);checks++;
assert.equal(good.operational_activation_allowed,false);checks++;
assert.equal(good.runtime_supervisor_tested,false);checks++;
assert.equal(good.human_authorization_authenticated,false);checks++;
assert.equal(safeReport(good).staged_config_text,undefined);checks++;
assert.equal(safeReport(good).staged_watcher_text,undefined);checks++;
assert.equal(previewPinnedPair(watcherBuffer,cfgBuffer).reason,"PAIR_SOURCE_DIGEST_DRIFT");checks++;
const changedSource=Buffer.from(watcherBuffer);
changedSource[changedSource.length-5]^=1;
assert.equal(simulateWithPins(changedSource,cfgBuffer,pins).reason,"PAIR_SOURCE_DIGEST_DRIFT");checks++;
const wrongPin=buf({...cfg,watcher_sha256:"0".repeat(64)});
assert.equal(simulateWithPins(watcherBuffer,wrongPin,{...pins,config:SHA(wrongPin)}).reason,
 "SUPERVISOR_PIN_MISMATCH");checks++;
const rogueKey=buf({...cfg,deploy:true});
assert.equal(simulateWithPins(watcherBuffer,rogueKey,{...pins,config:SHA(rogueKey)}).reason,
 "CONFIG_EXACT_KEYS_DRIFT");checks++;
assert.equal(simulateWithPins(watcherBuffer,Buffer.from("{}"),pins).reason,"PAIR_BYTES_UNBOUNDED");checks++;
const duplicateWatcher=Buffer.from(watcher+OLD_PATH+"\n");
assert.equal(simulateWithPins(duplicateWatcher,cfgBuffer,{...pins,watcher:SHA(duplicateWatcher)}).reason,
 "WATCHER_EXACT_SHIFT_PATH_NOT_UNIQUE");checks++;
const heartbeatOutside=buf({...cfg,heartbeat_path:"C:\\other\\heartbeat.json"});
assert.equal(simulateWithPins(watcherBuffer,heartbeatOutside,{...pins,config:SHA(heartbeatOutside)}).reason,
 "RUNTIME_PATH_NOT_IN_STATE");checks++;
const badPolling=buf({...cfg,batch_polls:0});
assert.equal(simulateWithPins(watcherBuffer,badPolling,{...pins,config:SHA(badPolling)}).reason,
 "SUPERVISOR_SETTINGS_INVALID");checks++;
console.log(JSON.stringify({schema:"deliveryos.comandas.v819.hosted-windows-pair-module",
 status:"PASS",checks,actual_v815_module_used:true,
 synthetic_watcher_and_config_only:true,real_supervisor_started:false,
 real_shift_authentication_proven:false,host_effects:false,
 print:false,sql:false,deploy:false}));
'@
  $pairProof=& node --eval $pairJs
  if($LASTEXITCODE -ne 0){throw ('V819_V815_PAIR_MODULE_TEST_FAILED_'+$LASTEXITCODE)}
  $pairData=$pairProof|Select-Object -Last 1|ConvertFrom-Json
  if($pairData.status -ne 'PASS' -or $pairData.checks -lt 19 -or
     $pairData.actual_v815_module_used -ne $true){throw 'V819_PAIR_PROOF_INVALID'}

  # A new-path-only orphan scan misses the OLD live process with no record.
  # This is an observation, not an attempt to kill any production process.
  [ordered]@{
    integrated_v816_v818_guard_tested=$true
    v815_pair_module_synthetic_contract_pass=($pairData.status -eq 'PASS')
    v820_function_executed_on_real_benign_windows_processes=$true
    v820_two_live_generations_blocked=$true
    v820_old_generation_without_child_record_blocked=$true
    v820_no_owned_generations_returns_clean=$true
    v820_injected_cim_failure_returns_unknown=$true
    v820_full_supervisor_executed=$false
    v815_pair_module_synthetic_checks=[int]$pairData.checks
    v815_real_supervisor_pair_activated=$false
    real_cim_old_and_staged_gates_hold=$true
    old_only_unrecorded_orphan_gates_hold=$true
    incomplete_enumeration_gates_hold=$true
    clean_synthetic_assumptions_remain_review_only=$true
    no_real_service_state_attested=$true
    schema='deliveryos.comandas.v817.windows-live-cim-orphan'
    status='PASS'
    execution_environment='GITHUB_HOSTED_EPHEMERAL_WINDOWS'
    benign_sleep_processes_started=2
    old_generation_detected_by_combined_scan=$oldVisible
    staged_generation_detected_by_combined_scan=$newVisible
    new_only_scan_would_miss_old_generation=$oldNotVisibleToNewOnlyFilter
    old_only_scan_would_miss_staged_generation=$newNotVisibleToOldOnlyFilter
    pid_and_start_time_matched=$true
    child_record_used=$false
    real_watcher_script_executed=$false
    actual_supervisor_cutover_tested=$false
    host_operational_change=$false
    human_approval_authenticated=$false
    deployment_authorized=$false
  }|ConvertTo-Json -Compress
}finally{
  # Owned subprocesses only; do not enumerate and terminate anything else.
  foreach($p in $owned){
    try{if(-not $p.HasExited){$p.Kill();$null=$p.WaitForExit(8000)}}catch{}
    try{$p.Dispose()}catch{}
  }
}

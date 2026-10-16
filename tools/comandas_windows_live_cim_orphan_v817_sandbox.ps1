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
  if(-not $b.HasExited){$b.Kill();$null=$b.WaitForExit(8000)}
  if(-not $b.HasExited){throw 'V818_OWN_STAGED_PROCESS_NOT_TERMINATED'}
  $oldOnly=Read-MarkedProcess $tagOld $a.Id
  $one=Probe-NodeGuard @((To-Record $oldOnly)) $true $false
  if($one.reasons -notcontains 'OLD_GENERATION_PROCESS_PRESENT'){
    throw 'V818_ORPHAN_OLD_PROCESS_NOT_HELD'
  }
  if(-not $a.HasExited){$a.Kill();$null=$a.WaitForExit(8000)}
  if(-not $a.HasExited){throw 'V818_OWN_OLD_PROCESS_NOT_TERMINATED'}
  # Incomplete enumeration must HOLD even if no test process is visible.
  $unknown=Probe-NodeGuard @() $false $false
  if($unknown.reasons -notcontains 'PROCESS_ENUMERATION_NOT_CONFIRMED'){
    throw 'V818_INCOMPLETE_ENUMERATION_NOT_HELD'
  }
  $clean=Probe-NodeGuard @() $true $true
  if($clean.status -ne 'SYNTHETIC_QUIESCENCE_CONSISTENT_REVIEW_ONLY'){
    throw 'V818_SYNTHETIC_CLEAN_REVIEW_NOT_CONFIRMED'
  }
  # A new-path-only orphan scan misses the OLD live process with no record.
  # This is an observation, not an attempt to kill any production process.
  [ordered]@{
    integrated_v816_v818_guard_tested=$true
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

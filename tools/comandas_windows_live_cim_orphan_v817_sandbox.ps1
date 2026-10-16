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
  # A new-path-only orphan scan misses the OLD live process with no record.
  # This is an observation, not an attempt to kill any production process.
  [ordered]@{
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

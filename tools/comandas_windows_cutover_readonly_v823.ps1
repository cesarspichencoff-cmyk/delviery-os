# V8.23 — Read-only observation of Windows service cutover blockers.
# Never stops/starts services, touches NTFS ACL, edits config, reads order rows,
# executes watchers or writes state. A clean report is NOT authorization.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$reasons=[Collections.Generic.List[string]]::new()
function Hold([string]$Reason){if(-not $reasons.Contains($Reason)){$reasons.Add($Reason)}}
$expectedSupervisor='2B6DC012918F317C8D244531B3CCB2FD33E33B226C6E6E668BEE4B698936BEF5'
$expectedConfig='FE213C3E865D88C48C7A6B803459804A44C8E287B85B1C574DC42400D73DCD19'
$root='C:\ProgramData\TataComandaReader'
$old=Join-Path $root 'bin\tata_reader_continuous_watch_candidate_v2.ps1'
$new=Join-Path $root 'bin\tata_reader_continuous_watch_candidate_v2_protected_v815.ps1'
$sup=Join-Path $root 'bin\tata_reader_continuous_watch_candidate_v1.ps1'
$cfgPath=Join-Path $root 'bin\tata_reader_supervisor_v1.config.json'
$childRecord=Join-Path $root 'state\reader-supervisor-child-v1.json'
$currentShift=Join-Path $root 'state\production-service-state.json'
$protectedShiftDir=Join-Path $root 'approved-shift'
$protectedShift=Join-Path $protectedShiftDir 'production-service-state.json'
$wp=$null
$checks=[ordered]@{
 windows_host=$false;service_present=$false;service_stopped=$false
 service_restart_inhibited=$false;scm_restart_actions_present=$null
 scm_policy_observed=$false;supervisor_pin_matches=$false;config_pin_matches=$false
 watcher_hash_matches_config=$false;expected_configured_watcher=$false
 process_enumeration_complete=$false;old_watchers=0;staged_watchers=0
 supervisor_instances=0;unreadable_powershell_commandlines=0
 child_record_exists=$null;protected_shift_exists=$false
 current_v2_shift_exists=$null;proposed_shift_dir_exists=$null
 proposed_protected_shift_exists=$null
 current_v2_service_modify_allow_ace=$null
 proposed_service_modify_allow_ace=$null
}
if(-not [Environment]::OSVersion.Platform.ToString().Equals('Win32NT')){
 Hold 'NOT_WINDOWS'
}else{
 $checks.windows_host=$true
 try{
  $service=Get-CimInstance Win32_Service -Filter "Name='TataComandaReader'" -ErrorAction Stop
  if($null -eq $service){Hold 'SERVICE_MISSING'}
  else{
   $checks.service_present=$true
   $checks.service_stopped=([string]$service.State -ceq 'Stopped')
   if(-not $checks.service_stopped){Hold 'SERVICE_NOT_STOPPED'}
   # Auto/Manual are insufficient: no reactivation may occur during staged cutover.
   $checks.service_restart_inhibited=([string]$service.StartMode -ceq 'Disabled')
   if(-not $checks.service_restart_inhibited){Hold 'SERVICE_START_MODE_NOT_DISABLED'}
  }
 }catch{Hold 'SERVICE_QUERY_UNKNOWN'}
 try{
  $res=@(& sc.exe qfailure TataComandaReader 2>&1)
  $ok=($LASTEXITCODE -eq 0)
  $checks.scm_policy_observed=$ok
  if(-not $ok){Hold 'SCM_RECOVERY_POLICY_UNKNOWN'}
  else{
   $restart=(@($res|Where-Object{[string]$_ -match '(?i)\b(REINICIAR|RESTART)\b'}).Count -gt 0)
   $checks.scm_restart_actions_present=$restart
   if($restart){Hold 'SCM_RESTART_ACTIONS_CONFIGURED'}
   # The SC output is localized. Non-matching text is not a proof of "none".
   if(-not $restart){Hold 'SCM_NO_RESTART_NOT_INDEPENDENTLY_ATTESTED'}
  }
 }catch{Hold 'SCM_RECOVERY_POLICY_UNKNOWN'}
 foreach($pin in @(@($sup,$expectedSupervisor,'supervisor_pin_matches'),@($cfgPath,$expectedConfig,'config_pin_matches'))){
  try{
   $actual=(Get-FileHash -LiteralPath $pin[0] -Algorithm SHA256 -ErrorAction Stop).Hash
   $checks[$pin[2]]=($actual -ceq $pin[1])
   if(-not $checks[$pin[2]]){Hold ('SOURCE_DIGEST_DRIFT_'+$pin[2])}
  }catch{Hold ('SOURCE_DIGEST_UNKNOWN_'+$pin[2])}
 }
 try{
  $cfg=Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $wp=[string]$cfg.watcher_path
  $checks.expected_configured_watcher=($wp -ceq $old -or $wp -ceq $new)
  if(-not $checks.expected_configured_watcher){Hold 'WATCHER_PATH_UNKNOWN'}
  $checks.watcher_hash_matches_config=((Get-FileHash -LiteralPath $wp -Algorithm SHA256 -ErrorAction Stop).Hash -ceq [string]$cfg.watcher_sha256)
  if(-not $checks.watcher_hash_matches_config){Hold 'WATCHER_DIGEST_MISMATCH'}
 }catch{Hold 'WATCHER_CONFIG_UNREADABLE'}
 try{
  $procs=@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -ErrorAction Stop)
  $checks.process_enumeration_complete=$true
  foreach($p in $procs){
   if([int]$p.ProcessId -eq $PID){continue}
   $line=[string]$p.CommandLine
   if([string]::IsNullOrWhiteSpace($line)){
    $checks.unreadable_powershell_commandlines++
    Hold 'PROCESS_COMMANDLINE_INCOMPLETE'
    continue
   }
   if($line.IndexOf($old,[StringComparison]::OrdinalIgnoreCase) -ge 0){$checks.old_watchers++}
   if($line.IndexOf($new,[StringComparison]::OrdinalIgnoreCase) -ge 0){$checks.staged_watchers++}
   if($line.IndexOf($sup,[StringComparison]::OrdinalIgnoreCase) -ge 0){$checks.supervisor_instances++}
  }
  if($checks.old_watchers -gt 0){Hold 'OLD_GENERATION_PRESENT'}
  if($checks.staged_watchers -gt 0){Hold 'STAGED_GENERATION_PRESENT'}
  if($checks.supervisor_instances -gt 0){Hold 'SUPERVISOR_PROCESS_PRESENT'}
 }catch{Hold 'PROCESS_ENUMERATION_UNKNOWN'}
 try{
  $checks.child_record_exists=Test-Path -LiteralPath $childRecord -PathType Leaf -ErrorAction Stop
  if($checks.child_record_exists){Hold 'CHILD_RECORD_NOT_RECONCILED'}
 }catch{Hold 'CHILD_RECORD_STATE_UNKNOWN'}
 try{
  # Distinguish the currently installed V2 input from the planned V8.15
  # relocation. The new destination's absence is NOT evidence that the
  # current production shift state file is missing.
  $checks.current_v2_shift_exists=Test-Path -LiteralPath $currentShift -PathType Leaf -ErrorAction Stop
  $checks.proposed_shift_dir_exists=Test-Path -LiteralPath $protectedShiftDir -PathType Container -ErrorAction Stop
  $checks.proposed_protected_shift_exists=Test-Path -LiteralPath $protectedShift -PathType Leaf -ErrorAction Stop
  $checks.protected_shift_exists=$checks.proposed_protected_shift_exists
  # Inspect DACL ALLOW entries only. This is not a live effective-access
  # check and never reads or alters the shift contents or permissions.
  $modifyMask=[Security.AccessControl.FileSystemRights]::Modify
  if($checks.current_v2_shift_exists){
   try{
    $acl=Get-Acl -LiteralPath $currentShift -ErrorAction Stop
    $allow=@($acl.Access|Where-Object{
     ([string]$_.IdentityReference) -match '^NT SERVICE\\TataComandaReader  if($wp -ceq $old -and -not $checks.current_v2_shift_exists){
   Hold 'CURRENT_V2_SHIFT_INPUT_MISSING'
  }
  if(-not $checks.proposed_protected_shift_exists -or -not $checks.proposed_shift_dir_exists){
   Hold 'PROPOSED_PROTECTED_SHIFT_NOT_PREPARED'
  }
 }catch{Hold 'SHIFT_PATHS_UNKNOWN'}
}
$effects=[ordered]@{services_changed=$false;processes_killed=$false
 config_written=$false;shift_written=$false;acl_changed=$false
 sql_queried=$false;spooler_used=$false;printer_used=$false}
[pscustomobject]@{
 schema='deliveryos.comandas.v823.real-host-readonly-cutover-preflight'
 status=if($reasons.Count){'HOLD'}else{'REVIEW_ONLY_NOT_AUTHORIZED'}
 reasons=@($reasons|Sort-Object)
 checks=$checks
 human_approval_authenticated=$false
 world_custody_proven=$false
 snapshot_is_atomic=$false
 rollback_executed=$false
 supervisor_runtime_tested=$false
 deployment_authorized=$false
 effects=$effects
}|ConvertTo-Json -Depth 7 -Compress
 -and
     [string]$_.AccessControlType -eq 'Allow' -and
     (($_.FileSystemRights -band $modifyMask) -eq $modifyMask)
    })
    $checks.current_v2_service_modify_allow_ace=($allow.Count -gt 0)
    if($wp -ceq $old -and $checks.current_v2_service_modify_allow_ace){
     Hold 'CURRENT_V2_SHIFT_DACL_SERVICE_MODIFY_ALLOW'
    }
   }catch{Hold 'CURRENT_SHIFT_DACL_UNKNOWN'}
  }
  if($checks.proposed_protected_shift_exists){
   try{
    $acl=Get-Acl -LiteralPath $protectedShift -ErrorAction Stop
    $allow=@($acl.Access|Where-Object{
     ([string]$_.IdentityReference) -match '^NT SERVICE\\TataComandaReader  if($wp -ceq $old -and -not $checks.current_v2_shift_exists){
   Hold 'CURRENT_V2_SHIFT_INPUT_MISSING'
  }
  if(-not $checks.proposed_protected_shift_exists -or -not $checks.proposed_shift_dir_exists){
   Hold 'PROPOSED_PROTECTED_SHIFT_NOT_PREPARED'
  }
 }catch{Hold 'SHIFT_PATHS_UNKNOWN'}
}
$effects=[ordered]@{services_changed=$false;processes_killed=$false
 config_written=$false;shift_written=$false;acl_changed=$false
 sql_queried=$false;spooler_used=$false;printer_used=$false}
[pscustomobject]@{
 schema='deliveryos.comandas.v823.real-host-readonly-cutover-preflight'
 status=if($reasons.Count){'HOLD'}else{'REVIEW_ONLY_NOT_AUTHORIZED'}
 reasons=@($reasons|Sort-Object)
 checks=$checks
 human_approval_authenticated=$false
 world_custody_proven=$false
 snapshot_is_atomic=$false
 rollback_executed=$false
 supervisor_runtime_tested=$false
 deployment_authorized=$false
 effects=$effects
}|ConvertTo-Json -Depth 7 -Compress
 -and
     [string]$_.AccessControlType -eq 'Allow' -and
     (($_.FileSystemRights -band $modifyMask) -eq $modifyMask)
    })
    $checks.proposed_service_modify_allow_ace=($allow.Count -gt 0)
    if($checks.proposed_service_modify_allow_ace){
     Hold 'PROPOSED_SHIFT_DACL_SERVICE_MODIFY_ALLOW'
    }
   }catch{Hold 'PROPOSED_SHIFT_DACL_UNKNOWN'}
  }
  if($wp -ceq $old -and -not $checks.current_v2_shift_exists){
   Hold 'CURRENT_V2_SHIFT_INPUT_MISSING'
  }
  if(-not $checks.proposed_protected_shift_exists -or -not $checks.proposed_shift_dir_exists){
   Hold 'PROPOSED_PROTECTED_SHIFT_NOT_PREPARED'
  }
 }catch{Hold 'SHIFT_PATHS_UNKNOWN'}
}
$effects=[ordered]@{services_changed=$false;processes_killed=$false
 config_written=$false;shift_written=$false;acl_changed=$false
 sql_queried=$false;spooler_used=$false;printer_used=$false}
[pscustomobject]@{
 schema='deliveryos.comandas.v823.real-host-readonly-cutover-preflight'
 status=if($reasons.Count){'HOLD'}else{'REVIEW_ONLY_NOT_AUTHORIZED'}
 reasons=@($reasons|Sort-Object)
 checks=$checks
 human_approval_authenticated=$false
 world_custody_proven=$false
 snapshot_is_atomic=$false
 rollback_executed=$false
 supervisor_runtime_tested=$false
 deployment_authorized=$false
 effects=$effects
}|ConvertTo-Json -Depth 7 -Compress

param([ValidateSet('Plan','Apply')][string]$Mode='Plan')
$ErrorActionPreference='Stop'
$root='C:\ProgramData\TataComandaReader'
$stage=Join-Path $PSScriptRoot 'weekly-service-candidate'
$watcher=Join-Path $root 'bin\tata_reader_continuous_watch_candidate_v2.ps1'
$config=Join-Path $root 'bin\tata_reader_supervisor_v1.config.json'
$policy=Join-Path $root 'bin\production-service-weekly-policy.json'
$checkpoint=Join-Path $root 'state\reader-watch-checkpoint-v1.json'
$state=Join-Path $root 'state\production-service-state.json'
$heartbeat=Join-Path $root 'state\reader-heartbeat-v1.json'
$candidate=Join-Path $stage 'tata_reader_continuous_watch_weekly_v1.ps1'
$policyCandidate=Join-Path $stage 'production-service-weekly-policy.json'
$oldWatcherSha='A58E428826D70EDF27763C3FA47893608305A7FB48F973EE1F84F02E5DA19C5C'
$oldConfigSha='FE213C3E865D88C48C7A6B803459804A44C8E287B85B1C574DC42400D73DCD19'
function Sha([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}
function Write-AtomicBytes([string]$p,[byte[]]$bytes){
  $tmp=$p+'.weekly-tmp.'+[guid]::NewGuid().ToString('N')
  [IO.File]::WriteAllBytes($tmp,$bytes)
  if(Test-Path -LiteralPath $p){
    # WinPS 5.1 coerces a null backup argument to an invalid empty path.
    $old=$tmp+'.previous';[IO.File]::Replace($tmp,$p,$old,$true);Remove-Item -LiteralPath $old
  }else{[IO.File]::Move($tmp,$p)}
}
function Writers {
  return @(Get-CimInstance Win32_Process|Where-Object {
    $_.Name -eq 'powershell.exe' -and $_.ProcessId -ne $PID -and
    ($_.CommandLine -like ('*-File "'+$watcher+'"*') -or
     $_.CommandLine -like ('*-File "'+(Join-Path $root 'bin\tata_reader_continuous_watch_candidate_v1.ps1')+'"*'))
  })
}
function Stop-Reader {
  $known=@(Writers)
  Stop-Service -Name 'TataComandaReader'
  (Get-Service -Name 'TataComandaReader').WaitForStatus('Stopped',[timespan]::FromSeconds(20))
  foreach($p in $known){
    $live=Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ProcessId)"
    if($live -and $live.CreationDate -eq $p.CreationDate -and $live.CommandLine -eq $p.CommandLine){Stop-Process -Id $p.ProcessId -Force}
  }
  for($i=0;$i -lt 20;$i++){if(@(Writers).Count -eq 0){return};Start-Sleep -Milliseconds 250}
  throw 'READER_WRITERS_NOT_QUIESCENT'
}
function Wait-Healthy([string]$expected,[string]$previousRun,[datetime]$after){
  $deadline=[datetime]::UtcNow.AddSeconds(210);$run=$null;$servicePid=$null
  while([datetime]::UtcNow -lt $deadline){
    $svc=Get-CimInstance Win32_Service -Filter "Name='TataComandaReader'"
    if($svc.State -ne 'Running'){throw 'READER_SERVICE_NOT_RUNNING'}
    if($null -eq $servicePid){$servicePid=$svc.ProcessId}elseif($svc.ProcessId -ne $servicePid){throw 'READER_SERVICE_RESTARTED'}
    try{$h=Get-Content -LiteralPath $heartbeat -Raw -Encoding UTF8|ConvertFrom-Json}catch{Start-Sleep -Seconds 2;continue}
    $fresh=([datetimeoffset]::Parse($h.written_at).UtcDateTime -gt $after)
    if($fresh -and $h.supervisor.run_id -ne $previousRun){
      if($null -eq $run){$run=$h.supervisor.run_id}elseif($h.supervisor.run_id -ne $run){throw 'SUPERVISOR_RUN_CHANGED'}
      if($null -ne $h.fatal -or $h.consecutive_failures -gt 0){throw 'READER_FAILURE'}
      $effects=@($h.last_batch.effects_true)
      $forbidden=@($effects|Where-Object {$_ -notin @('database_read','local_checkpoint_write','local_event_write')})
      if($h.totals.ok -ge 2 -and $h.last_batch.outcome -eq 'OK' -and $forbidden.Count -eq 0 -and
         $effects.Count -gt 0 -and $h.watcher.sha256_verified -eq $true -and
         $h.watcher.expected_sha256 -eq $expected -and $h.state -eq 'RUNNING' -and
         (Get-Item -LiteralPath $checkpoint).LastWriteTimeUtc -gt $after){
        return [ordered]@{state='HEALTHY';ok_batches=$h.totals.ok;last_batch='OK';consecutive_failures=0;
          pinned_watcher_verified=$true;checkpoint_advanced=$true;supervisor_run_stable=$true;
          service_process_stable=$true;declared_effects=$effects}
      }
    }
    Start-Sleep -Seconds 3
  }
  throw 'READER_HEALTH_TIMEOUT'
}
if($env:COMPUTERNAME -cne 'CAIXA_MOOCA'){throw 'HOST_BINDING_MISMATCH'}
if((Sha $watcher) -ne $oldWatcherSha -or (Sha $config) -ne $oldConfigSha){throw 'INSTALLED_BASE_CHANGED'}
if(Test-Path -LiteralPath $policy){throw 'EXISTING_WEEKLY_POLICY_REQUIRES_REVIEW'}
$proof=Get-Content -LiteralPath (Join-Path $stage 'candidate-test-proof.json') -Raw|ConvertFrom-Json
$candidateSha=Sha $candidate;$policySha=Sha $policyCandidate
if($proof.passed -ne 82 -or $proof.sql_executed -ne $false -or
   $proof.resolver_sha256 -ne $candidateSha -or $proof.policy_sha256 -ne $policySha){throw 'CANDIDATE_PROOF_MISMATCH'}
$cfg=Get-Content -LiteralPath $config -Raw -Encoding UTF8|ConvertFrom-Json
if($cfg.watcher_path -cne $watcher -or $cfg.watcher_sha256 -ne $oldWatcherSha -or $cfg.batch_polls -ne 20){throw 'SUPERVISOR_CONFIG_MISMATCH'}
$policyJson=Get-Content -LiteralPath $policyCandidate -Raw -Encoding UTF8|ConvertFrom-Json
if($policyJson.host_name -cne 'CAIXA_MOOCA' -or $policyJson.unit_id -cne 'ITAIM'){throw 'POLICY_SCOPE_MISMATCH'}
$plan=[ordered]@{schema='deliveryos.weekly-service-install.v1';mode=$Mode;unit='ITAIM';old_watcher_sha256=$oldWatcherSha;
  candidate_sha256=$candidateSha;policy_sha256=$policySha;checks_passed=82;sql_write=$false;checkpoint_reset=$false;
  historical_events_changed=$false;legacy_state_changed=$false;service_restart=($Mode -eq 'Apply')}
if($Mode -eq 'Plan'){$plan|ConvertTo-Json;exit 0}
$lock=$null;$backup=$null;$stopped=$false
try {
  $lock=[IO.File]::Open((Join-Path $PSScriptRoot 'weekly-service-install.lock'),[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  $backup=Join-Path $PSScriptRoot ('weekly-service-backup-'+[datetime]::UtcNow.ToString('yyyyMMddTHHmmssfff'))
  New-Item -ItemType Directory -Path $backup|Out-Null
  Copy-Item -LiteralPath $watcher -Destination (Join-Path $backup 'watcher.ps1')
  Copy-Item -LiteralPath $config -Destination (Join-Path $backup 'config.json')
  $legacySha=Sha $state
  $previous=Get-Content -LiteralPath $heartbeat -Raw|ConvertFrom-Json
  # Lock to the reviewed version immediately before the first service effect.
  if((Sha $watcher) -ne $oldWatcherSha -or (Sha $config) -ne $oldConfigSha){throw 'BASE_CHANGED_BEFORE_STOP'}
  $stopped=$true;Stop-Reader
  Write-AtomicBytes $policy ([IO.File]::ReadAllBytes($policyCandidate))
  Write-AtomicBytes $watcher ([IO.File]::ReadAllBytes($candidate))
  $cfg.watcher_sha256=$candidateSha
  $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($cfg|ConvertTo-Json -Depth 12))
  Write-AtomicBytes $config $bytes
  if((Sha $watcher) -ne $candidateSha -or (Sha $policy) -ne $policySha){throw 'INSTALL_HASH_MISMATCH'}
  $started=[datetime]::UtcNow;Start-Service -Name 'TataComandaReader'
  $health=Wait-Healthy $candidateSha $previous.supervisor.run_id $started
  if((Sha $state) -ne $legacySha){throw 'HISTORICAL_STATE_CHANGED'}
  $plan.status='APPLIED_HEALTHY';$plan.observed_at_utc=[datetime]::UtcNow.ToString('o');$plan.health=$health
  $plan.backup_dir=$backup;$plan.installed_config_sha256=Sha $config
  $plan|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $stage 'install-proof.json') -Encoding UTF8
  $plan|ConvertTo-Json -Depth 6
} catch {
  if($stopped -and $backup){
    Stop-Reader
    Write-AtomicBytes $watcher ([IO.File]::ReadAllBytes((Join-Path $backup 'watcher.ps1')))
    Write-AtomicBytes $config ([IO.File]::ReadAllBytes((Join-Path $backup 'config.json')))
    if((Sha $watcher) -ne $oldWatcherSha -or (Sha $config) -ne $oldConfigSha){throw 'ROLLBACK_HASH_FAILED'}
    if(Test-Path -LiteralPath $policy){Remove-Item -LiteralPath $policy}
    $prior=Get-Content -LiteralPath $heartbeat -Raw|ConvertFrom-Json
    $at=[datetime]::UtcNow;Start-Service -Name 'TataComandaReader'
    $rollback=Wait-Healthy $oldWatcherSha $prior.supervisor.run_id $at
    [ordered]@{status='ROLLED_BACK_HEALTHY';health=$rollback;checkpoint_reset=$false}|ConvertTo-Json -Depth 5|
      Set-Content -LiteralPath (Join-Path $stage 'install-rollback-proof.json') -Encoding UTF8
  }
  throw
} finally {
  if($lock){$lock.Dispose();Remove-Item -LiteralPath (Join-Path $PSScriptRoot 'weekly-service-install.lock')}
}

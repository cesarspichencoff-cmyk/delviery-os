#Requires -Version 7.0
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

$channel='Microsoft-Windows-PrintService/Operational'
$schema='deliveryos.printservice-metadata.v885.ephemeral-review-only'
$jobTimeoutSeconds=10

if($env:GITHUB_ACTIONS -cne 'true' -or
   $env:RUNNER_OS -cne 'Windows' -or
   $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
   [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){
  throw 'V885_GITHUB_HOSTED_WINDOWS_REVIEW_ONLY'
}

function Sha256-Text([string]$value){
  if([string]::IsNullOrEmpty($value)){return $null}
  $sha=[Security.Cryptography.SHA256]::Create()
  try{
    return [Convert]::ToHexString(
      $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value))
    ).ToLowerInvariant()
  }finally{
    $sha.Dispose()
  }
}

$effects=[ordered]@{
  event_record_read=$false
  event_log_change=$false
  spooler_read=$false
  spooler_write=$false
  print=$false
  reprint=$false
  service_change=$false
  filesystem_write=$false
  network=$false
  gp_teknisa_access=$false
  fiscal=$false
  sequence_write=$false
  install=$false
  deploy=$false
}

$reasons=[Collections.Generic.List[string]]::new()
$reasons.Add('EPHEMERAL_RUNNER_METADATA_IS_NOT_OPERATIONAL_PROOF')
$metadata=$null
$job=$null
$timedOut=$false

try{
  $job=Start-Job -ScriptBlock {
    param([string]$channel)
    $log=Get-WinEvent -ListLog $channel -ErrorAction Stop
    [pscustomobject][ordered]@{
      log_name=[string]$log.LogName
      is_enabled=[bool]$log.IsEnabled
      security_descriptor=[string]$log.SecurityDescriptor
    }
  } -ArgumentList $channel

  $null=Wait-Job -Job $job -Timeout $jobTimeoutSeconds
  if($job.State -eq 'Completed'){
    try{
      $metadata=Receive-Job -Job $job -ErrorAction Stop | Select-Object -Last 1
    }catch{
      $reasons.Add('CHANNEL_METADATA_UNAVAILABLE')
    }
  }elseif($job.State -in @('Failed','Stopped','Disconnected')){
    $reasons.Add('CHANNEL_METADATA_UNAVAILABLE')
  }else{
    $timedOut=$true
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    $reasons.Add('CHANNEL_METADATA_READ_TIMEOUT')
  }
}catch{
  $reasons.Add('CHANNEL_METADATA_JOB_FAILED')
}finally{
  if($null -ne $job){
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
  }
}

$channelPresent=$null -ne $metadata -and $metadata.log_name -ceq $channel
$channelEnabled=$null
$descriptorHash=$null
if($channelPresent){
  $channelEnabled=[bool]$metadata.is_enabled
  $descriptorHash=Sha256-Text ([string]$metadata.security_descriptor)
  if(-not $channelEnabled){$reasons.Add('CHANNEL_DISABLED')}
  if($null -eq $descriptorHash){$reasons.Add('CHANNEL_SECURITY_DESCRIPTOR_UNAVAILABLE')}
}elseif(-not $timedOut -and -not $reasons.Contains('CHANNEL_METADATA_UNAVAILABLE')){
  $reasons.Add('CHANNEL_NOT_PRESENT_OR_NAME_MISMATCH')
}

$assessment=[ordered]@{
  schema=$schema
  status='HOLD_EPHEMERAL_METADATA_ONLY'
  reasons=@($reasons | Sort-Object -Unique)
  environment='GITHUB_HOSTED_WINDOWS_EPHEMERAL'
  environment_guard_is_security_boundary=$false
  channel_name=$channel
  channel_presence_observed=$channelPresent
  channel_enabled_observed=$channelEnabled
  channel_security_descriptor_sha256=$descriptorHash
  raw_security_descriptor_exported=$false
  event_records_read=$false
  event_307_read=$false
  event_307_is_physical_paper_proof=$false
  channel_read_acl_semantics_proven=$false
  actual_operational_channel_proven=$false
  actual_collector_service_sid_proven=$false
  actual_effective_token_membership_proven=$false
  gp_teknisa_exclusion_proven=$false
  coexistence_under_operational_load_proven=$false
  authorizes_live_read=$false
  authorizes_print=$false
  authorizes_reprint=$false
  automatic_retry_allowed=$false
  effects=$effects
  next_gate=@(
    'PIN_EXACT_OPERATIONAL_HOST_AND_STORE'
    'PIN_EXACT_COLLECTOR_ACCOUNT_AND_SERVICE_SID'
    'OBTAIN_SEPARATE_AUTHORIZATION_FOR_OPERATIONAL_METADATA_READ'
    'PROVE_CHANNEL_ALREADY_ENABLED_WITHOUT_CHANGE'
    'PROVE_CHANNEL_ACL_READ_WITHOUT_WRITE_OR_CLEAR'
    'PROVE_TOKEN_EXCLUDES_GP_TEKNISA_ACTORS'
    'KEEP_EVENT_RECORD_READ_DISABLED_UNTIL_NEW_GATE'
  )
}

$assessment | ConvertTo-Json -Depth 8 -Compress

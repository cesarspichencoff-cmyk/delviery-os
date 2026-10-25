#Requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^[0-9a-f]{64}$')]
  [string]$Challenge
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

$expectedComputerName='CAIXA_MOOCA'
$channel='Microsoft-Windows-PrintService/Operational'
$schema='deliveryos.printservice-metadata.v886.target-bound-review-only'
$jobTimeoutSeconds=10

if([string]::IsNullOrWhiteSpace($env:COMPUTERNAME) -or
   $env:COMPUTERNAME -cne $expectedComputerName){
  throw 'V886_EXACT_TARGET_HOST_REQUIRED'
}

function Sha256-Text([string]$value){
  if([string]::IsNullOrEmpty($value)){return $null}
  $sha=[Security.Cryptography.SHA256]::Create()
  try{
    return ([BitConverter]::ToString(
      $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value))
    )).Replace('-','').ToLowerInvariant()
  }finally{
    $sha.Dispose()
  }
}

$effects=[ordered]@{
  observer_process_execution=$true
  powershell_job_execution=$true
  utc_clock_read=$true
  host_identity_metadata_read=$true
  execution_token_metadata_read_attempted=$true
  event_channel_configuration_read_attempted=$true
  external_connector_transport_assessed_by_script=$false
  event_record_read=$false
  event_log_change=$false
  spooler_api_access=$false
  printer_configuration_read=$false
  print_job_read=$false
  print=$false
  reprint=$false
  process_inventory_read=$false
  service_configuration_read=$false
  service_change=$false
  application_file_read=$false
  application_file_write=$false
  script_network_call=$false
  gp_teknisa_access=$false
  fiscal_or_sefaz_access=$false
  sequence_read=$false
  sequence_write=$false
  install=$false
  deploy=$false
}

$reasons=[Collections.Generic.List[string]]::new()
$reasons.Add('OPERATIONAL_METADATA_DOES_NOT_PROVE_PRINT_ATTEMPT')
$reasons.Add('EVENT_RECORD_READ_REMAINS_DISABLED')
$reasons.Add('CONNECTOR_DEVICE_BINDING_REQUIRES_EXTERNAL_RECEIPT')

$executionSidHash=$null
$tokenGroupSetHash=$null
$tokenGroupCount=$null
$identity=$null
try{
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $executionSidHash=Sha256-Text ([string]$identity.User.Value)
  $groupSids=@(
    $identity.Groups |
      ForEach-Object {[string]$_.Value} |
      Sort-Object -Unique
  )
  $tokenGroupCount=$groupSids.Count
  $tokenGroupSetHash=Sha256-Text ([string]::Join("`n",$groupSids))
}catch{
  $reasons.Add('EXECUTION_IDENTITY_METADATA_UNAVAILABLE')
}finally{
  if($null -ne $identity){$identity.Dispose()}
}

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
  status='HOLD_OPERATIONAL_METADATA_ONLY'
  collected_at_utc=[DateTimeOffset]::UtcNow.ToString('o')
  freshness_challenge_sha256=Sha256-Text $Challenge
  target_alias=$expectedComputerName
  target_host_exact_match=$true
  target_logical_store_identity_proven=$false
  connector_device_binding_required=$true
  connector_device_binding_proven_by_script=$false
  environment_guard_is_security_boundary=$false
  channel_name=$channel
  channel_presence_observed=$channelPresent
  channel_enabled_observed=$channelEnabled
  channel_security_descriptor_sha256=$descriptorHash
  current_execution_sid_sha256=$executionSidHash
  current_token_group_set_sha256=$tokenGroupSetHash
  current_token_group_count=$tokenGroupCount
  raw_host_name_exported=$false
  raw_execution_sid_exported=$false
  raw_group_sids_exported=$false
  raw_security_descriptor_exported=$false
  event_records_read=$false
  event_307_read=$false
  event_307_is_physical_paper_proof=$false
  channel_read_acl_semantics_proven=$false
  dedicated_collector_identity_proven=$false
  gp_teknisa_identity_exclusion_proven=$false
  coexistence_under_operational_load_proven=$false
  authorizes_event_record_read=$false
  authorizes_print=$false
  authorizes_reprint=$false
  automatic_retry_allowed=$false
  effects=$effects
  reasons=@($reasons | Sort-Object -Unique)
  next_gate=@(
    'REQUIRE_EXTERNAL_CONNECTOR_DEVICE_RECEIPT_CAIXA_MOOCA'
    'PROVE_LOGICAL_STORE_ID_SEPARATELY'
    'PIN_EXECUTION_IDENTITY_HASH_OUTSIDE_HOST'
    'INTERPRET_CHANNEL_ACL_WITH_SEPARATE_REVIEW'
    'PROVE_DEDICATED_COLLECTOR_IDENTITY'
    'PROVE_GP_TEKNISA_IDENTITY_EXCLUSION'
    'KEEP_EVENT_RECORD_READ_DISABLED_UNTIL_NEW_GATE'
  )
}

$assessment | ConvertTo-Json -Depth 8 -Compress

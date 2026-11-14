# Compare built-in SYSTEM principal logon representations on a disposable GitHub Windows VM.
# Registration metadata only: both fixture tasks stay disabled, never execute.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:COMPUTERNAME -eq 'CAIXA_MOOCA' -or
   $env:GITHUB_ACTIONS -ne 'true' -or
   $env:GITHUB_REPOSITORY -ne 'cesarspichencoff-cmyk/delviery-os' -or
   [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP) -or
   [string]::IsNullOrWhiteSpace($env:GITHUB_WORKSPACE)){
 throw 'DISPOSABLE_GITHUB_WINDOWS_RUNNER_ONLY'
}
$node=(Get-Command node -ErrorAction Stop).Source
if([IO.Path]::GetFileName($node) -ne 'node.exe'){throw 'WINDOWS_NODE_REQUIRED'}
$action=New-ScheduledTaskAction -Execute $node -Argument '--version'
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddYears(1)
$settings=New-ScheduledTaskSettingsSet -Disable -DisallowDemandStart -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 30)
function Confirm-LabTask([string]$name){
 $found=Get-ScheduledTask -TaskName $name -ErrorAction Stop
 if([string]$found.State -ne 'Disabled' -or [bool]$found.Settings.Enabled){
  throw 'FIXTURE_MUST_BE_DISABLED'
 }
 if([string]$found.Actions[0].Execute -ne $node){throw 'FIXTURE_ACTION_CHANGED'}
 $sid=[string]$found.Principal.UserId
 if($sid -notin @('S-1-5-18','SYSTEM','NT AUTHORITY\SYSTEM','LOCALSYSTEM')){
  throw 'FIXTURE_IDENTITY_CHANGED'
 }
 return [string]$found.Principal.LogonType
}
function Probe([string]$label,[string]$logon){
 $name='DeliveryOS-Lab-SystemPrincipal-'+[Guid]::NewGuid().ToString('N').Substring(0,16)
 $registered=$false
 $outcome='UNCLASSIFIED'
 try {
  if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){
   throw 'FIXTURE_COLLISION'
  }
  $principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType $logon -RunLevel Highest
  try{
   $null=Register-ScheduledTask -TaskName $name -Principal $principal -Action $action -Trigger $trigger -Settings $settings -ErrorAction Stop
   $registered=$true
  }catch{
   if($label -eq 'SERVICE_CONTROL'){throw}
   # Failure is observed but not attributed to any particular cause or HRESULT.
   return 'REGISTRATION_FAILED_UNCLASSIFIED'
  }
  $readback=Confirm-LabTask $name
  if($label -eq 'SERVICE_CONTROL'){
   if($readback -ne 'ServiceAccount'){throw 'SERVICE_CONTROL_NOT_PRESERVED'}
   return 'SERVICE_ACCOUNT_REGISTERED_DISABLED'
  }
  if($readback -eq 'Interactive' -or $readback -eq 'InteractiveToken'){
   return 'INTERACTIVE_PRESERVED_DISABLED'
  }
  if($readback -eq 'ServiceAccount'){
   return 'INTERACTIVE_NORMALIZED_TO_SERVICE_DISABLED'
  }
  throw 'UNEXPECTED_INTERACTIVE_READBACK'
 }finally{
  # Remove only the GUID task created by THIS invocation, even on partial failure.
  $found=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if($found){
   Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction Stop
  }
 }
}
$control=Probe 'SERVICE_CONTROL' 'ServiceAccount'
if($control -ne 'SERVICE_ACCOUNT_REGISTERED_DISABLED'){throw 'SERVICE_CONTROL_NOT_PROVEN'}
$interactive=Probe 'INTERACTIVE_CANDIDATE' 'Interactive'
Write-Host ('SYSTEM_LOGON_METADATA_LAB_PASS CONTROL='+$control+' CANDIDATE='+$interactive+' TWO_DISABLED_GUID_TASKS_NO_EXECUTION_NO_WINDOWS_SAMPLED')
Write-Host 'PROOF_LIMIT=REGISTRATION_METADATA_ONLY_NOT_CASHIER_TOKEN_NOT_CASHIER_SESSION_NOT_WINDOW_CAUSALITY'

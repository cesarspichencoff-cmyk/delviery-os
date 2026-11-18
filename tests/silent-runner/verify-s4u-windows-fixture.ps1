# S4U Windows task execution test on a GitHub disposable Windows VM ONLY.
# NEVER execute on CAIXA_MOOCA, no real Reader, files, tasks or customer data.
[CmdletBinding()]
param([ValidateSet('Limited','Highest')][string]$LabRunLevel='Limited')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:COMPUTERNAME -eq 'CAIXA_MOOCA'){throw 'PRODUCTION_HOST_FORBIDDEN'}
if($env:GITHUB_ACTIONS -ne 'true' -or
   $env:GITHUB_REPOSITORY -ne 'cesarspichencoff-cmyk/delviery-os' -or
   [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP) -or
   [string]::IsNullOrWhiteSpace($env:GITHUB_WORKSPACE)){
 throw 'DISPOSABLE_GITHUB_RUNNER_REQUIRED'
}
$lab=Join-Path $env:RUNNER_TEMP 'deliveryos-s4u-lab'
if(Test-Path -LiteralPath $lab){throw 'LAB_DIRECTORY_ALREADY_PRESENT'}
$source=Join-Path $env:GITHUB_WORKSPACE 'tests\silent-runner\s4u-observer-fixture.cjs'
if(!(Test-Path -LiteralPath $source -PathType Leaf)){throw 'LAB_FIXTURE_CODE_MISSING'}
$node=(Get-Command node -ErrorAction Stop).Source
if([IO.Path]::GetFileName($node) -ne 'node.exe'){throw 'NOT_WINDOWS_NODE'}
$task='DeliveryOS-Lab-S4U-'+[Guid]::NewGuid().ToString('N').Substring(0,12)
$registered=$false
$created=$false
if(-not ('S4UWindowAudit' -as [type])){ Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class S4UWindowAudit {
  public delegate bool V(IntPtr hwnd,IntPtr parameter);
  [DllImport("user32.dll")] static extern bool EnumWindows(V callback,IntPtr parameter);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public static int Visible(uint processId){
    int count=0; EnumWindows((h,p)=>{
      uint owner=0;GetWindowThreadProcessId(h,out owner);
      if(owner==processId&&IsWindowVisible(h))count++;return true;
    },IntPtr.Zero);return count;
  }
}
'@
}
try {
 New-Item -ItemType Directory -Path $lab -ErrorAction Stop | Out-Null
 $created=$true
 [IO.File]::WriteAllText((Join-Path $lab 'LAB_ONLY.txt'),
  'DELIVERYOS_S4U_DISPOSABLE_WIN_RUNNER_ONLY_V1')
 [IO.File]::WriteAllText((Join-Path $lab 'synthetic-input.txt'),
  'FICTIONAL_LOCAL_IO_ONLY')
 $principalName=[Security.Principal.WindowsIdentity]::GetCurrent().Name
 if([string]::IsNullOrWhiteSpace($principalName)){throw 'CURRENT_USER_NOT_KNOWN'}
 $principal=New-ScheduledTaskPrincipal -UserId $principalName -LogonType S4U -RunLevel $LabRunLevel
 $argument='"'+$source+'" "--lab-dir='+$lab+'"'
 $action=New-ScheduledTaskAction -Execute $node -Argument $argument -WorkingDirectory $lab
 $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddHours(5) -RepetitionInterval (New-TimeSpan -Minutes 2)
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 45) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
 if(Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue){
  throw 'LAB_TASK_NAME_COLLISION'
 }
 $null=Register-ScheduledTask -TaskName $task -Action $action -Principal $principal -Trigger $trigger -Settings $settings -ErrorAction Stop
 $registered=$true
 $readBack=Get-ScheduledTask -TaskName $task -ErrorAction Stop
 if([string]$readBack.Principal.LogonType -ne 'S4U'){throw 'S4U_NOT_REGISTERED'}
 if([string]$readBack.Principal.RunLevel -ne $LabRunLevel){
  throw 'LAB_RUNLEVEL_CHANGED'
 }
 if([string]$readBack.Settings.MultipleInstances -ne 'IgnoreNew'){
  throw 'LAB_INSTANCE_POLICY_CHANGED'
 }
 if([string]$readBack.Triggers[0].Repetition.Interval -ne 'PT2M'){
  throw 'LAB_REPETITION_2_MIN_NOT_REGISTERED'
 }
 $focus=[S4UWindowAudit]::GetForegroundWindow()
 Start-ScheduledTask -TaskName $task -ErrorAction Stop
 $started=Join-Path $lab 'started.json'
 $complete=Join-Path $lab 'completed.json'
 $found=$false
 for($i=0;$i -lt 44;$i++){
  if(Test-Path -LiteralPath $started){$found=$true;break}
  Start-Sleep -Milliseconds 125
 }
 if(!$found){throw 'S4U_START_OR_LOCAL_ACL_NOT_PROVEN'}
 $begin=Get-Content -LiteralPath $started -Raw | ConvertFrom-Json
 if($begin.schema -ne 'deliveryos.s4u-observer-fixture-start.v1' -or
    $begin.source -ne 'FICTIONAL_ONLY' -or
    $begin.ordersPublishable -ne 0){throw 'S4U_START_RECEIPT_INVALID'}
 $processId=[uint32]$begin.pid
 $proc=Get-Process -Id $processId -ErrorAction Stop
 $session=$proc.SessionId
 $samples=0
 for($i=0;$i -lt 10;$i++){
  $proc=Get-Process -Id $processId -ErrorAction Stop
  if([S4UWindowAudit]::Visible($processId) -ne 0){
   throw 'S4U_VISIBLE_WINDOW_DETECTED'
  }
  $samples++
  Start-Sleep -Milliseconds 75
 }
 if([S4UWindowAudit]::GetForegroundWindow() -ne $focus){
  throw 'S4U_CHANGED_FOCUS'
 }
 $finished=$false
 for($i=0;$i -lt 35;$i++){
  if(Test-Path -LiteralPath $complete){$finished=$true;break}
  Start-Sleep -Milliseconds 125
 }
 if(!$finished){throw 'S4U_FINISH_AND_LOCAL_WRITE_NOT_PROVEN'}
 $result=Get-Content -LiteralPath $complete -Raw|ConvertFrom-Json
 if($result.schema -ne 'deliveryos.s4u-observer-fixture-result.v1' -or
    $result.state -ne 'LAB_LOCAL_READ_WRITE_OK' -or
    $result.source -ne 'FICTIONAL_ONLY' -or
    $result.filesRead -ne 1 -or $result.filesWritten -ne 2 -or
    $result.ordersPublishable -ne 0 -or
    $result.customerDataExported -ne $false -or
    $result.cmdExecuted -ne $false -or
    $result.processChildren -ne 0){throw 'S4U_PROOF_ENVELOPE_INVALID'}
 # 0x41301 means the Scheduler still reports RUNNING while the
 # fixture has already persisted its result. Wait for the actual exit.
 $taskCompleted=$false
 for($i=0;$i -lt 50;$i++){
  $info=Get-ScheduledTaskInfo -TaskName $task -ErrorAction Stop
  $state=(Get-ScheduledTask -TaskName $task -ErrorAction Stop).State
  if($info.LastTaskResult -eq 0 -and [string]$state -ne 'Running'){
   $taskCompleted=$true;break
  }
  if($info.LastTaskResult -ne 267009 -and $info.LastTaskResult -ne 0){
   throw ('S4U_TASK_EXIT_NONZERO_'+$info.LastTaskResult)
  }
  Start-Sleep -Milliseconds 120
 }
 if(!$taskCompleted){throw 'S4U_SCHEDULER_FINISH_NOT_CONFIRMED'}
 Write-Host ('S4U_DISPOSABLE_WINDOWS_LOCAL_IO_PASS 1/1 S4U_PRINCIPAL 10/10_NO_VISIBLE_HWND NO_FOCUS_CHANGE FICTIONAL_ONLY RUNLEVEL_'+$LabRunLevel+' REPEAT_PT2M SESSION_'+$session)
} finally {
 # The only task touched or removed is the GUID-scoped temporary CI task.
 if($registered){
  try{Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue}catch{}
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction Stop
 }
 if($created -and (Test-Path -LiteralPath $lab)){
  # Task Scheduler may release the completed Node fixture's cwd shortly after
  # LastTaskResult=0. Retry only this GUID-scoped disposable lab directory.
  # Never suppress a persistent cleanup failure or touch operational paths.
  $removed=$false
  for($cleanupAttempt=0;$cleanupAttempt -lt 15;$cleanupAttempt++){
   try{
    Remove-Item -LiteralPath $lab -Recurse -Force -ErrorAction Stop
    if(-not (Test-Path -LiteralPath $lab)){$removed=$true;break}
   }catch{
    $err=$_.Exception
    if(-not ($err -is [System.IO.IOException]) -and
       -not ($err.InnerException -is [System.IO.IOException])){
     throw
    }
   }
   Start-Sleep -Milliseconds 250
  }
  if(-not $removed){throw 'DISPOSABLE_S4U_LAB_CLEANUP_FAILED'}
 }
}

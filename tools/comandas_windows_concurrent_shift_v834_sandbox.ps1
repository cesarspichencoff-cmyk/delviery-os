# V8.34 — Windows GitHub-hosted disposable sandbox. NEVER production.
# Two distinct real Windows writer tokens contest a single NTFS lock.
# This is cooperative serialization, NOT OS-wide CAS or human approval.
[CmdletBinding()]
param(
 [ValidateSet('Parent','Writer')][string]$Role='Parent',
 [string]$SandboxRoot='',
 [string]$ExpectedSid='',
 [ValidateSet('A','B')][string]$Tag='A',
 [ValidateRange(0,2)][int]$ExpectedRevision=0,
 [ValidateRange(0,12000)][int]$HoldMilliseconds=0
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Guard-Sandbox([string]$Root){
 if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){throw 'V834_HOSTED_WINDOWS_ONLY'}
 $runner=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
 if(-not [IO.Directory]::Exists($runner) -or
    [string]::IsNullOrWhiteSpace($Root)){throw 'V834_RUNNER_TEMP_UNKNOWN'}
 $full=[IO.Path]::GetFullPath($Root)
 if(-not $full.StartsWith($runner,[StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($full) -cnotmatch '^vertice_lock_v834_[a-f0-9]{12}$'){
   throw 'V834_TEMP_ROOT_INVALID'
 }
 if($Role -eq 'Writer'){
  foreach($p in @($full,(Join-Path $full 'approved'),(Join-Path $full 'runtime'))){
   if(-not(Test-Path -LiteralPath $p -PathType Container) -or
     ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
     throw 'V834_REPARSE_OR_DIR_MISSING'
   }
  }
 }
}
function Sha([string]$File){(Get-FileHash -LiteralPath $File -Algorithm SHA256 -ErrorAction Stop).Hash}
function FailClosed([string]$Reason){throw $Reason}
if($Role -eq 'Writer'){
 Guard-Sandbox $SandboxRoot
 $approved=Join-Path $SandboxRoot 'approved'
 $runtime=Join-Path $SandboxRoot 'runtime'
 $shift=Join-Path $approved 'shift.json'
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if([string]::IsNullOrWhiteSpace($ExpectedSid) -or
    $identity -cne $ExpectedSid){FailClosed 'V834_WRONG_ACTUAL_WINDOWS_TOKEN'}
 $lockPath=Join-Path $approved 'revision.lock'
 $stream=$null
 try{
  try{
   $stream=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,
     [IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  }catch [IO.IOException]{
   exit 94
  }
  # Acquiring an exclusive real NTFS FileStream is the serialization gate.
  # Both comparing and replacing are performed WITHIN this lock scope.
  [IO.File]::WriteAllText((Join-Path $runtime ('held-'+$Tag+'.txt')),'LOCK_HELD')
  if($HoldMilliseconds -gt 0){Start-Sleep -Milliseconds $HoldMilliseconds}
  $expected=if($ExpectedRevision -eq 0){'{"revision":0,"value":"initial"}'}else{
    '{"revision":1,"value":"writer_A"}'
  }
  if([IO.File]::ReadAllText($shift) -cne $expected){exit 93}
  $next=if($ExpectedRevision -eq 0){'{"revision":1,"value":"writer_A"}'}else{
    '{"revision":2,"value":"writer_B"}'
  }
  $temp=Join-Path $approved ('pending-'+$Tag+'.json')
  $backup=Join-Path $approved ('backup-'+$Tag+'.json')
  $data=[Text.UTF8Encoding]::new($false).GetBytes($next)
  $file=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$file.Write($data,0,$data.Length);$file.Flush($true)}finally{$file.Dispose()}
  if([IO.File]::ReadAllText($shift) -cne $expected){FailClosed 'V834_STALE_AFTER_STAGE'}
  [IO.File]::Replace($temp,$shift,$backup,$true)
  if([IO.File]::ReadAllText($shift) -cne $next -or
     [IO.File]::ReadAllText($backup) -cne $expected){FailClosed 'V834_BYTES_MISMATCH'}
  [IO.File]::WriteAllText((Join-Path $runtime ('done-'+$Tag+'.txt')),'COMMITTED')
  exit 0
 }finally{if($null -ne $stream){$stream.Dispose()}}
}
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
 throw 'V834_HOSTED_ADMIN_REQUIRED'
}
$nonce=[Guid]::NewGuid().ToString('N')
$SandboxRoot=Join-Path $env:RUNNER_TEMP ('vertice_lock_v834_'+$nonce.Substring(0,12))
Guard-Sandbox $SandboxRoot
$approved=Join-Path $SandboxRoot 'approved'
$runtime=Join-Path $SandboxRoot 'runtime'
$shift=Join-Path $approved 'shift.json'
$accounts=[Collections.Generic.List[string]]::new()
$processes=[Collections.Generic.List[Diagnostics.Process]]::new()
$removedRoot=$false
try{
 $userA='va834'+$nonce.Substring(0,9)
 $userB='vb834'+$nonce.Substring(0,9)
 $passA=ConvertTo-SecureString ('A!34'+$nonce+'c5Q') -AsPlainText -Force
 $passB=ConvertTo-SecureString ('B!34'+$nonce+'c7R') -AsPlainText -Force
 $null=New-LocalUser -Name $userA -Password $passA -ErrorAction Stop
 $accounts.Add($userA)
 $null=New-LocalUser -Name $userB -Password $passB -ErrorAction Stop
 $accounts.Add($userB)
 $sidA=(Get-LocalUser $userA).SID.Value
 $sidB=(Get-LocalUser $userB).SID.Value
 if($sidA -ceq $sidB){throw 'V834_NOT_DISTINCT_TOKENS'}
 $null=New-Item -ItemType Directory -Path $SandboxRoot -ErrorAction Stop
 $null=New-Item -ItemType Directory -Path $approved -ErrorAction Stop
 $null=New-Item -ItemType Directory -Path $runtime -ErrorAction Stop
 [IO.File]::WriteAllText($shift,'{"revision":0,"value":"initial"}')
 function Restrict([string]$Target,[string[]]$Grants){
  & icacls.exe $Target '/inheritance:r' '/grant:r' @Grants |Out-Null
  if($LASTEXITCODE -ne 0){throw 'V834_NTFS_ACL_FAILED'}
 }
 $admins='*S-1-5-32-544:(OI)(CI)F'
 $system='*S-1-5-18:(OI)(CI)F'
 $ar="*$($sidA):(OI)(CI)M"
 $br="*$($sidB):(OI)(CI)M"
 Restrict $SandboxRoot @($admins,$system,$ar,$br)
 Restrict $approved @($admins,$system,$ar,$br)
 Restrict $runtime @($admins,$system,$ar,$br)
 & icacls.exe $shift '/inheritance:r' '/grant:r' '*S-1-5-32-544:F' '*S-1-5-18:F' "*$($sidA):M" "*$($sidB):M" |Out-Null
 if($LASTEXITCODE -ne 0){throw 'V834_SHIFT_ACL_FAILED'}
 $source=$MyInvocation.MyCommand.Path
 $pwsh=(Get-Process -Id $PID).Path
 function Start-Writer([string]$User,[securestring]$Secret,[string]$Sid,[string]$Label,[int]$Rev,[int]$Delay){
  $cred=[pscredential]::new(("$env:COMPUTERNAME\"+$User),$Secret)
  $arguments=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
    '-File',('"'+$source+'"'),'-Role','Writer',
    '-SandboxRoot',('"'+$SandboxRoot+'"'),'-ExpectedSid',$Sid,
    '-Tag',$Label,'-ExpectedRevision',$Rev,'-HoldMilliseconds',$Delay) -join ' '
  $proc=Start-Process -FilePath $pwsh -ArgumentList $arguments -Credential $cred -PassThru
  $processes.Add($proc)
  return $proc
 }
 function Wait-Exit([Diagnostics.Process]$Process,[int]$Ms){
  if(-not $Process.WaitForExit($Ms)){throw 'V834_CHILD_TIMEOUT'}
  return [int]$Process.ExitCode
 }
 $first=Start-Writer $userA $passA $sidA 'A' 0 6500
 $hold=Join-Path $runtime 'held-A.txt'
 $timer=[Diagnostics.Stopwatch]::StartNew()
 while(-not(Test-Path -LiteralPath $hold -PathType Leaf) -and $timer.ElapsedMilliseconds -lt 10000){
  Start-Sleep -Milliseconds 100
 }
 if(-not(Test-Path -LiteralPath $hold -PathType Leaf)){throw 'V834_FIRST_LOCK_NOT_OBSERVED'}
 if($first.HasExited){throw 'V834_FIRST_WRITER_NOT_CONCURRENT'}
 $second=Start-Writer $userB $passB $sidB 'B' 0 0
 if((Wait-Exit $second 10000) -ne 94){throw 'V834_CONTENDING_TOKEN_DID_NOT_REFUSE_LOCK'}
 if((Wait-Exit $first 18000) -ne 0){throw 'V834_FIRST_COMMIT_FAILED'}
 if([IO.File]::ReadAllText($shift) -cne '{"revision":1,"value":"writer_A"}'){
  throw 'V834_FIRST_REVISION_INVALID'
 }
 if([IO.File]::ReadAllText((Join-Path $approved 'backup-A.json')) -cne
    '{"revision":0,"value":"initial"}'){throw 'V834_FIRST_BACKUP_INVALID'}
 $beforeStale=Sha $shift
 $stale=Start-Writer $userB $passB $sidB 'B' 0 0
 if((Wait-Exit $stale 10000) -ne 93){throw 'V834_STALE_EXPECTED_REVISION_ACCEPTED'}
 if((Sha $shift) -cne $beforeStale){throw 'V834_STALE_MUTATED_COMMITTED_BYTES'}
 if(Test-Path -LiteralPath (Join-Path $approved 'pending-B.json')){throw 'V834_STALE_LEFT_PENDING'}
 $next=Start-Writer $userB $passB $sidB 'B' 1 0
 if((Wait-Exit $next 10000) -ne 0){throw 'V834_SECOND_REVISION_FAILED'}
 if([IO.File]::ReadAllText($shift) -cne '{"revision":2,"value":"writer_B"}' -or
    [IO.File]::ReadAllText((Join-Path $approved 'backup-B.json')) -cne
      '{"revision":1,"value":"writer_A"}'){throw 'V834_SECOND_REVISION_BACKUP_INVALID'}
 [ordered]@{
  schema='deliveryos.comandas.v834.hosted-concurrent-writers'
  status='PASS'
  actual_distinct_windows_writer_tokens=$true
  first_writer_held_lock_during_contention=$true
  competing_writer_exit_94=$true
  stale_revision_exit_93=$true
  second_current_revision_committed=$true
  predecessor_bytes_backed_up=$true
  cooperative_writers_serialized=$true
  arbitrary_writer_atomic_cas_proven=$false
  crash_recovery_and_external_witness_proven=$false
  human_identity_or_approval_proven=$false
  disposable_runner_only=$true
  production_effects=$false
  sql=$false;teknisa=$false;printer=$false;spooler=$false
 }|ConvertTo-Json -Compress
}finally{
 foreach($p in $processes){
  try{if(-not $p.HasExited){$p.Kill();$null=$p.WaitForExit(5000)}}catch{}
  try{$p.Dispose()}catch{}
 }
 if($SandboxRoot -and (Test-Path -LiteralPath $SandboxRoot -PathType Container)){
  try{Remove-Item -LiteralPath $SandboxRoot -Recurse -Force -ErrorAction Stop
   $removedRoot=-not(Test-Path -LiteralPath $SandboxRoot)
  }catch{[Console]::Error.WriteLine('V834_TEMP_CLEANUP_NOT_PROVEN')}
 }
 foreach($name in $accounts){Remove-LocalUser -Name $name -ErrorAction SilentlyContinue}
}

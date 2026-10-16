# V8.24: REAL NTFS replacement, child-process hard crash and rollback.
# Authorized ONLY on disposable github-hosted Windows runner, harmless fixture
# bytes in RUNNER_TEMP. Not a production installer, not supervisor execution.
[CmdletBinding()]
param([ValidateSet('Test','Apply','Recover')][string]$Mode='Test',
      [string]$Root='',[ValidateRange(0,3)][int]$CrashAfter=0)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
  $env:RUNNER_ENVIRONMENT -cne 'github-hosted'){throw 'HOSTED_WINDOWS_ONLY'}
$base=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
$names=@('watcher.ps1','supervisor.ps1','supervisor.config.json')
$marker='deliveryos.v824.disposable-test-only'
function Sha([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256 -ErrorAction Stop).Hash}
function Fixture([string]$n,[string]$v){
 if($n -eq 'supervisor.config.json'){
  return '{"schema":"v824.fixture","generation":"'+$v+'","authorized":false}'
 }
 return ('# v824 disposable '+$n+' generation='+$v+[Environment]::NewLine+
 '# no production code or network/print/sql/service'+[Environment]::NewLine)
}
function Validate-Root([string]$dir){
 if(-not $dir){throw 'ROOT_NOT_SET'}
 $full=[IO.Path]::GetFullPath($dir)
 if(-not $full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'OUTSIDE_TEMP'}
 if(-not (Test-Path -LiteralPath $full -PathType Container)){throw 'ROOT_MISSING'}
 foreach($p in @($full,(Join-Path $full 'active'),(Join-Path $full 'backup'))){
  if(-not(Test-Path -LiteralPath $p -PathType Container)){throw 'DIR_MISSING'}
  if(((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
   throw 'REPARSE_POINT_REJECTED'
  }
 }
 if([IO.File]::ReadAllText((Join-Path $full 'V824_MARKER')) -cne $marker){
  throw 'MARKER_INVALID'
 }
 return $full
}
function Pins([string]$dir){
 $m=Get-Content -LiteralPath (Join-Path $dir 'pins.json') -Raw -Encoding UTF8|ConvertFrom-Json
 if($m.schema -cne 'v824.disposable.pins'){throw 'BAD_MANIFEST'}
 foreach($n in $names){
  $b=Join-Path (Join-Path $dir 'backup') $n
  if((Sha $b) -cne [string]$m.pins.$n){throw 'BACKUP_DIGEST_INVALID'}
 }
 return $m
}
function Assert-Generation([string]$dir,[string]$v){
 foreach($n in $names){
  $p=Join-Path (Join-Path $dir 'active') $n
  if([IO.File]::ReadAllText($p) -cne (Fixture $n $v)){throw 'ACTIVE_MISMATCH'}
 }
}
function Replace([string]$dir,[string]$n,[string]$v){
 $dest=Join-Path (Join-Path $dir 'active') $n
 $tmp=$dest+'.pending'
 [IO.File]::WriteAllText($tmp,(Fixture $n $v),[Text.UTF8Encoding]::new($false))
 [IO.File]::Move($tmp,$dest,$true)
}
if($Mode -ne 'Test'){
 $Root=Validate-Root $Root
 $null=Pins $Root
 if($Mode -eq 'Apply'){Assert-Generation $Root 'old'}
 $generation=if($Mode -eq 'Apply'){'candidate'}else{'old'}
 $i=0
 foreach($n in $names){
  Replace $Root $n $generation
  $i++
  if($CrashAfter -eq $i){[Diagnostics.Process]::GetCurrentProcess().Kill()}
 }
 Assert-Generation $Root $generation
 [pscustomobject]@{status=if($Mode -eq 'Apply'){'STAGED_REVIEW_ONLY'}else{'RESTORED'};
   authorized=$false;supervisor_executed=$false}|ConvertTo-Json -Compress
 exit 0
}
$scriptPath=$PSCommandPath
$shell=Join-Path $PSHOME 'pwsh.exe'
if(-not(Test-Path -LiteralPath $shell -PathType Leaf)){throw 'NO_PWSH'}
function Child([string]$mode,[string]$dir,[int]$crash){
 $argsList=@('-NoLogo','-NoProfile','-NonInteractive','-File',$scriptPath,
             '-Mode',$mode,'-Root',$dir,'-CrashAfter',[string]$crash)
 $p=Start-Process -FilePath $shell -ArgumentList $argsList -PassThru -Wait -NoNewWindow
 return [int]$p.ExitCode
}
function Sandbox(){
 $p=Join-Path $base ('v824-'+[guid]::NewGuid().ToString('N'))
 $null=New-Item -ItemType Directory -Path $p -Force
 foreach($dir in @('active','backup')){$null=New-Item -ItemType Directory -Path (Join-Path $p $dir)}
 [IO.File]::WriteAllText((Join-Path $p 'V824_MARKER'),$marker)
 $pins=[ordered]@{}
 foreach($n in $names){
  foreach($dir in @('active','backup')){
   $f=Join-Path (Join-Path $p $dir) $n
   [IO.File]::WriteAllText($f,(Fixture $n 'old'),[Text.UTF8Encoding]::new($false))
   if($dir -eq 'backup'){$pins[$n]=Sha $f}
  }
 }
 [pscustomobject]@{schema='v824.disposable.pins';pins=$pins}|
  ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $p 'pins.json') -Encoding UTF8
 return $p
}
$passed=0
foreach($crash in @(1,2,3,0)){
 $root=Sandbox
 try{
  $exit=Child 'Apply' $root $crash
  if($crash -eq 0 -and $exit -ne 0){throw 'NORMAL_STAGE_FAIL'}
  if($crash -ne 0 -and $exit -eq 0){throw 'CRASH_NOT_OBSERVED'}
  if((Child 'Recover' $root 0) -ne 0){throw 'ROLLBACK_FAIL'}
  Assert-Generation $root 'old'
  if((Child 'Recover' $root 0) -ne 0){throw 'ROLLBACK_NOT_IDEMPOTENT'}
  Assert-Generation $root 'old'
  $passed++
 }finally{Remove-Item -LiteralPath $root -Recurse -Force}
}
foreach($crash in @(1,2)){
 $root=Sandbox
 try{
  if((Child 'Apply' $root 0) -ne 0){throw 'STAGE_BEFORE_RECOVERY_FAIL'}
  if((Child 'Recover' $root $crash) -eq 0){throw 'RECOVERY_CRASH_NOT_OBSERVED'}
  if((Child 'Recover' $root 0) -ne 0){throw 'RECOVERY_RESUME_FAIL'}
  Assert-Generation $root 'old'
  $passed++
 }finally{Remove-Item -LiteralPath $root -Recurse -Force}
}
$root=Sandbox
try{
 if((Child 'Apply' $root 0) -ne 0){throw 'TAMPER_STAGE_FAIL'}
 [IO.File]::AppendAllText((Join-Path $root 'backup\supervisor.ps1'),'#tampered')
 if((Child 'Recover' $root 0) -eq 0){throw 'TAMPERED_BACKUP_ACCEPTED'}
 Assert-Generation $root 'candidate'
 $passed++
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
if($passed -ne 7){throw 'BAD_CASE_COUNT'}
[pscustomobject]@{
 schema='deliveryos.comandas.v824.ephemeral-windows-real-ntfs-rollback'
 status='PASS';cases=$passed
 crash_after_staged_artifact=@(1,2,3)
 crash_during_rollback_after=@(1,2)
 idempotent_restoration=$true;corrupt_backup_rejected_before_restore=$true
 genuine_child_process_crashes=$true;real_ntfs_file_moves=$true
 operational_source_used=$false;full_supervisor_executed=$false
 production_host_touched=$false;service_changed=$false;sql_used=$false
 print_used=$false;deployment_authorized=$false;atomic_cutover_proven=$false
}|ConvertTo-Json -Compress

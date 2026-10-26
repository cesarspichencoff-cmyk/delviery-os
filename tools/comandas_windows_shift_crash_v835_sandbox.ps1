# V8.35: hosted Windows synthetic shift transition hard-crash journal.
# No SQL, service, reader, Teknisa, print, account or ACL changes on CAIXA.
[CmdletBinding()]
param(
 [ValidateSet('Test','Writer')][string]$Mode='Test',
 [string]$Root='',
 [ValidatePattern('^c[0-9][0-9]$')][string]$CaseId='c00',
 [string]$ExpectedSid='',
 [ValidateSet('none','intent','stage','swap')][string]$CrashAt='none'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Digest([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}
function TextDigest([string]$value){
 $h=[Security.Cryptography.SHA256]::Create()
 try{return [Convert]::ToHexString($h.ComputeHash([Text.UTF8Encoding]::new($false).GetBytes($value)))}
 finally{$h.Dispose()}
}
function Value([string]$tag,[int]$rev){
 if($rev -eq 0){return '{"revision":0,"unit":"'+$tag+'","value":"old_unique_fixture"}'}
 return '{"revision":1,"unit":"'+$tag+'","value":"new_unique_fixture"}'
}
function Durable([string]$file,[string]$content){
 $f=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$b=[Text.UTF8Encoding]::new($false).GetBytes($content);$f.Write($b,0,$b.Length);$f.Flush($true)}
 finally{$f.Dispose()}
}
function Guard([string]$r,[bool]$exists){
 if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){throw 'V835_DISPOSABLE_HOST_REQUIRED'}
 $base=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
 $full=[IO.Path]::GetFullPath($r)
 if(-not $full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($full) -cnotmatch '^vertice_shift_v835_[a-f0-9]{12}$'){
   throw 'V835_ROOT_NOT_IN_TEMP'
 }
 if($exists){
  $dirs=@($full)+@((Get-ChildItem -LiteralPath $full -Recurse -Directory -Force)|ForEach-Object FullName)
  foreach($d in $dirs){
   if(((Get-Item -LiteralPath $d -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
    throw 'V835_REPARSE_REJECTED'
   }
  }
 }
}
function Observe([string]$dir,[string]$tag){
 $a=Join-Path $dir 'approved'
 $w=Join-Path $dir 'witness\anchor.json'
 try{
  $anchor=Get-Content -LiteralPath $w -Raw|ConvertFrom-Json
  if($anchor.schema -cne 'v835.synthetic.parent-anchor' -or
     $anchor.rev -ne 0 -or
     $anchor.old_sha -cne (TextDigest (Value $tag 0)) -or
     $anchor.new_sha -cne (TextDigest (Value $tag 1))){return 'HOLD_ANCHOR_DRIFT'}
 }catch{return 'HOLD_ANCHOR_UNREADABLE'}
 $active=Join-Path $a 'shift.json'
 $j=Join-Path $a 'intent.json'
 $staged=Join-Path $a 'staged.json'
 $backup=Join-Path $a 'predecessor.json'
 if(-not(Test-Path -LiteralPath $active -PathType Leaf)){return 'HOLD_ACTIVE_MISSING'}
 $now=Digest $active
 if(-not(Test-Path -LiteralPath $j -PathType Leaf)){
  if($now -cne $anchor.old_sha){return 'HOLD_ACTIVE_WITHOUT_INTENT'}
  return 'REVIEW_ONLY_NO_TRANSACTION'
 }
 try{
  $m=Get-Content -LiteralPath $j -Raw|ConvertFrom-Json
  if($m.schema -cne 'v835.synthetic.intent' -or
     $m.old_sha -cne $anchor.old_sha -or
     $m.new_sha -cne $anchor.new_sha){return 'HOLD_JOURNAL_TAMPERED'}
 }catch{return 'HOLD_JOURNAL_UNREADABLE'}
 if(Test-Path -LiteralPath $backup -PathType Leaf){
  if((Digest $backup) -cne $anchor.old_sha){return 'HOLD_BACKUP_CORRUPTED'}
 }
 if($now -ceq $anchor.old_sha){
  if(Test-Path -LiteralPath $staged -PathType Leaf){
   if((Digest $staged) -cne $anchor.new_sha){return 'HOLD_STAGED_TAMPERED'}
   return 'HOLD_STAGED_UNCOMMITTED'
  }
  return 'HOLD_INTENT_INCOMPLETE'
 }
 if($now -ceq $anchor.new_sha){
  if(-not(Test-Path -LiteralPath $backup -PathType Leaf)){return 'HOLD_NEW_BACKUP_MISSING'}
  return 'HOLD_NEW_NOT_INDEPENDENTLY_WITNESSED'
 }
 return 'HOLD_ACTIVE_UNKNOWN'
}
if($Mode -eq 'Writer'){
 Guard $Root $true
 $current=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if(-not $ExpectedSid -or $current -cne $ExpectedSid){throw 'V835_WRITER_TOKEN_MISMATCH'}
 $dir=Join-Path $Root $CaseId
 $a=Join-Path $dir 'approved'
 $runtime=Join-Path $dir 'runtime'
 $w=Join-Path $dir 'witness\anchor.json'
 if(-not(Test-Path -LiteralPath $dir -PathType Container)){throw 'V835_CASE_MISSING'}
 $active=Join-Path $a 'shift.json'
 $journal=Join-Path $a 'intent.json'
 if(Test-Path -LiteralPath $journal -PathType Leaf){exit 95}
 $denied=$false
 try{[IO.File]::AppendAllText($w,'FORGERY')}catch [UnauthorizedAccessException]{$denied=$true}
 catch [IO.IOException]{$denied=$true}
 if(-not $denied){throw 'V835_WRITER_COULD_FORGE_WITNESS'}
 [IO.File]::WriteAllText((Join-Path $runtime 'witness-denied.txt'),'YES')
 $old=Value $CaseId 0
 $new=Value $CaseId 1
 if([IO.File]::ReadAllText($active) -cne $old){exit 93}
 Durable $journal (([ordered]@{schema='v835.synthetic.intent';old_sha=TextDigest $old;new_sha=TextDigest $new})|ConvertTo-Json -Compress)
 if($CrashAt -eq 'intent'){[Diagnostics.Process]::GetCurrentProcess().Kill()}
 $stage=Join-Path $a 'staged.json'
 Durable $stage $new
 if($CrashAt -eq 'stage'){[Diagnostics.Process]::GetCurrentProcess().Kill()}
 if((Digest $active) -cne (TextDigest $old)){throw 'V835_OLD_CHANGED'}
 [IO.File]::Replace($stage,$active,(Join-Path $a 'predecessor.json'),$true)
 if($CrashAt -eq 'swap'){[Diagnostics.Process]::GetCurrentProcess().Kill()}
 if((Digest $active) -cne (TextDigest $new)){throw 'V835_NEW_BYTES_MISMATCH'}
 [IO.File]::WriteAllText((Join-Path $runtime 'done.txt'),'STILL_REQUIRES_HUMAN_WITNESS')
 exit 0
}
$nonce=[guid]::NewGuid().ToString('N')
$Root=Join-Path $env:RUNNER_TEMP ('vertice_shift_v835_'+$nonce.Substring(0,12))
Guard $Root $false
$p=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
 throw 'V835_HOSTED_ADMIN_REQUIRED'
}
$user='vs835'+$nonce.Substring(0,9)
$userCreated=$false;$rootCreated=$false
$cleanUser=$false;$cleanRoot=$false
$children=[Collections.Generic.List[Diagnostics.Process]]::new()
$proof=$null
try{
 $secret=ConvertTo-SecureString ('A!835'+$nonce+'Q2z') -AsPlainText -Force
 $null=New-LocalUser -Name $user -Password $secret -ErrorAction Stop
 $userCreated=$true
 $sid=(Get-LocalUser $user).SID.Value
 $null=New-Item -ItemType Directory -Path $Root -ErrorAction Stop
 $rootCreated=$true
 $admin='*S-1-5-32-544:(OI)(CI)F'
 $system='*S-1-5-18:(OI)(CI)F'
 $reader="*$($sid):(OI)(CI)RX"
 $writer="*$($sid):(OI)(CI)M"
 function Acl([string]$dir,[string[]]$rights){
  & icacls.exe $dir '/inheritance:r' '/grant:r' @rights |Out-Null
  if($LASTEXITCODE -ne 0){throw 'V835_ACL_SETUP_FAILED'}
 }
 Acl $Root @($admin,$system,$reader)
 $fixtures=@(
  @{id='c01';phase='clean';want='REVIEW_ONLY_NO_TRANSACTION'},
  @{id='c02';phase='intent';want='HOLD_INTENT_INCOMPLETE'},
  @{id='c03';phase='stage';want='HOLD_STAGED_UNCOMMITTED'},
  @{id='c04';phase='swap';want='HOLD_NEW_NOT_INDEPENDENTLY_WITNESSED'},
  @{id='c05';phase='none';want='HOLD_NEW_NOT_INDEPENDENTLY_WITNESSED'},
  @{id='c06';phase='swap';want='HOLD_BACKUP_CORRUPTED'}
 )
 $checks=0
 foreach($f in $fixtures){
  $dir=Join-Path $Root $f.id
  $a=Join-Path $dir 'approved'
  $w=Join-Path $dir 'witness'
  $runtime=Join-Path $dir 'runtime'
  foreach($x in @($dir,$a,$w,$runtime)){
   $null=New-Item -ItemType Directory -Path $x -ErrorAction Stop
  }
  $old=Value $f.id 0;$new=Value $f.id 1
  [IO.File]::WriteAllText((Join-Path $a 'shift.json'),$old,[Text.UTF8Encoding]::new($false))
  $anchor=[ordered]@{schema='v835.synthetic.parent-anchor';rev=0;
    old_sha=TextDigest $old;new_sha=TextDigest $new}
  [IO.File]::WriteAllText((Join-Path $w 'anchor.json'),($anchor|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  Acl $dir @($admin,$system,$reader)
  Acl $a @($admin,$system,$writer)
  Acl $runtime @($admin,$system,$writer)
  Acl $w @($admin,$system,$reader)
  & icacls.exe (Join-Path $w 'anchor.json') '/inheritance:r' '/grant:r' '*S-1-5-32-544:F' '*S-1-5-18:F' "*$($sid):R" |Out-Null
  if($LASTEXITCODE -ne 0){throw 'V835_WITNESS_FILE_PERMISSIONS_FAILED'}
  $witnessHash=Digest (Join-Path $w 'anchor.json')
  if((Observe $dir $f.id) -cne 'REVIEW_ONLY_NO_TRANSACTION'){throw 'V835_BASELINE_INVALID'}
  $checks++
  if($f.phase -eq 'clean'){continue}
  function Spawn([string]$phase){
   $credential=[pscredential]::new(("$env:COMPUTERNAME\"+$user),$secret)
   $argsList=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
     '-File',('"'+$PSCommandPath+'"'),'-Mode','Writer',
     '-Root',('"'+$Root+'"'),'-CaseId',$f.id,'-ExpectedSid',$sid,'-CrashAt',$phase) -join ' '
   $proc=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList $argsList -Credential $credential -Wait -PassThru
   $children.Add($proc)
   return [int]$proc.ExitCode
  }
  $status=Spawn $f.phase
  if($f.phase -eq 'none'){if($status -ne 0){throw 'V835_NONCRASH_CHILD_FAILED'}}
  else{if($status -eq 0){throw 'V835_CRASH_NOT_OBSERVED'}}
  if(-not(Test-Path -LiteralPath (Join-Path $runtime 'witness-denied.txt'))){
   throw 'V835_WITNESS_DENIAL_MISSING'
  }
  if((Digest (Join-Path $w 'anchor.json')) -cne $witnessHash){
   throw 'V835_WITNESS_MODIFIED'
  }
  if($f.id -eq 'c06'){
   [IO.File]::WriteAllText((Join-Path $a 'predecessor.json'),'CORRUPTED_BACKUP')
  }
  $observed=Observe $dir $f.id
  if($observed -cne $f.want){throw ('V835_UNEXPECTED_STATE_'+$f.id+'_'+$observed)}
  $before=Digest (Join-Path $a 'shift.json')
  if((Observe $dir $f.id) -cne $observed -or (Digest (Join-Path $a 'shift.json')) -cne $before){
   throw 'V835_OBSERVER_MUTATED_STATE'
  }
  $checks+=3
  if($f.id -in @('c03','c04')){
   if((Spawn 'none') -ne 95 -or (Digest (Join-Path $a 'shift.json')) -cne $before){
    throw 'V835_AUTO_REPLAY_NOT_REFUSED'
   }
   $checks++
  }
 }
 $proof=[ordered]@{
  schema='deliveryos.comandas.v835.hosted-shift-crash-evidence'
  status='PASS';cases=$fixtures.Count;checks=$checks
  hard_child_crashes_at_intent_stage_swap=$true
  actual_windows_writer_witness_write_denied=$true
  journal_pending_or_ambiguous_states_hold=$true
  corrupt_predecessor_bytes_hold=$true
  replay_after_crash_refused=$true
  repeated_observation_read_only=$true
  self_heal_or_auto_rollback_executed=$false
  independent_human_witness_proven=$false
  production_cutover_authorized=$false
  hosted_ephemeral_only=$true
  service_changed=$false;teknisa=$false;sql=$false;printer=$false
 }
}finally{
 foreach($child in $children){
  try{if(-not $child.HasExited){$child.Kill();$null=$child.WaitForExit(5000)}}catch{}
  try{$child.Dispose()}catch{}
 }
 if($rootCreated){
  try{Remove-Item -LiteralPath $Root -Force -Recurse -ErrorAction Stop
      $cleanRoot=-not(Test-Path -LiteralPath $Root)}catch{}
 }
 if($userCreated){
  try{Remove-LocalUser -Name $user -ErrorAction Stop
      $cleanUser=$null -eq (Get-LocalUser -Name $user -ErrorAction SilentlyContinue)}catch{}
 }
}
if(-not $cleanRoot -or -not $cleanUser){throw 'V835_CLEANUP_NOT_CONFIRMED'}
$proof.temp_root_removed=$cleanRoot;$proof.temp_account_removed=$cleanUser
[pscustomobject]$proof|ConvertTo-Json -Compress

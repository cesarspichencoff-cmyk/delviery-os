# V8.13 — disposable GitHub-hosted Windows NTFS token sandbox, NOT production.
# Two local principals, synthetic JSON, and a temporary directory only.
[CmdletBinding()]
param(
 [ValidateSet('Parent','Reader','Writer')][string]$Role='Parent',
 [string]$SandboxRoot,[string]$ReaderSid,[string]$WriterSid
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
function Guard-Root([string]$Root){
 # V8.33: child principals must repeat the full ephemeral-host invariant
 # before any filesystem action. A plausible basename is NOT sufficient.
 if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){throw 'GITHUB_HOSTED_WINDOWS_ONLY'}
 $runner=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
 if(-not [IO.Directory]::Exists($runner) -or
    [string]::IsNullOrWhiteSpace($Root)){throw 'RUNNER_TEMP_MISSING'}
 $full=[IO.Path]::GetFullPath($Root)
 if(-not $full.StartsWith($runner,[StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($full) -cnotmatch '^vertice_acl_v813_[a-f0-9]{12}$'){
    throw 'TEMP_SANDBOX_REQUIRED'
 }
 if($Role -ne 'Parent'){
  foreach($p in @($full,(Join-Path $full 'approved'),(Join-Path $full 'runtime'))){
   if(-not(Test-Path -LiteralPath $p -PathType Container) -or
      ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
      throw 'TEMP_ROOT_REPARSE_OR_MISSING'
   }
  }
 }
}
function Rejected([scriptblock]$Action){
 try{ & $Action; return $false } catch {return $true}
}
if($Role -ne 'Parent'){
 Guard-Root $SandboxRoot
 $approved=Join-Path $SandboxRoot 'approved'
 $runtime=Join-Path $SandboxRoot 'runtime'
 $shift=Join-Path $approved 'shift.json'
 $actualSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $expectedSid=if($Role -eq 'Reader'){$ReaderSid}else{$WriterSid}
 if($actualSid -cne $expectedSid){throw 'WRONG_CHILD_WINDOWS_TOKEN'}
 if($Role -eq 'Reader'){
   if([IO.File]::ReadAllText($shift) -cne '{"shift":"synthetic_initial"}'){throw 'READ_UNEXPECTED'}
   [IO.File]::WriteAllText((Join-Path $runtime 'events.log'),'event_1')
   [IO.File]::AppendAllText((Join-Path $runtime 'events.log'),'|event_2')
   [IO.File]::WriteAllText((Join-Path $runtime 'replacer.json'),'{"shift":"forged"}')
   $checks=[ordered]@{
     reader_can_read=$true
     reader_can_write_events=([IO.File]::ReadAllText((Join-Path $runtime 'events.log')) -ceq 'event_1|event_2')
     cannot_overwrite=(Rejected { [IO.File]::WriteAllText($shift,'{"shift":"forged"}') })
     cannot_delete=(Rejected {Remove-Item -LiteralPath $shift -Force -ErrorAction Stop})
     cannot_rename=(Rejected {Rename-Item -LiteralPath $shift -NewName 'stolen.json' -ErrorAction Stop})
     cannot_create_neighbor=(Rejected {[IO.File]::WriteAllText((Join-Path $approved 'rogue.json'),'forged')})
     cannot_replace=(Rejected {[IO.File]::Replace((Join-Path $runtime 'replacer.json'),$shift,(Join-Path $runtime 'backup.json'),$true)})
     cannot_rename_parent=(Rejected {Rename-Item -LiteralPath $approved -NewName 'stolen-parent' -ErrorAction Stop})
   }
   [IO.File]::WriteAllText((Join-Path $runtime 'reader.json'),($checks|ConvertTo-Json -Compress))
 }else{
   # V8.33: compare-then-file-replace under a second Windows token.
   # Sequential stale replay is rejected; concurrent atomic CAS NOT proven.
   # No authenticated human approval is created by this fixture.
   $initial='{"shift":"synthetic_initial"}'
   $new='{"shift":"synthetic_writer"}'
   if([IO.File]::ReadAllText($shift) -cne $initial){exit 93}
   $tmp=Join-Path $approved 'shift.json.pending.v833'
   $bak=Join-Path $approved 'shift.json.bak.v833'
   $encoding=[Text.UTF8Encoding]::new($false)
   $stream=[IO.File]::Open($tmp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   try{
    $bytes=$encoding.GetBytes($new)
    $stream.Write($bytes,0,$bytes.Length)
    $stream.Flush($true)
   }finally{$stream.Dispose()}
   if([IO.File]::ReadAllText($shift) -cne $initial){throw 'V833_STALE_TARGET'}
   [IO.File]::Replace($tmp,$shift,$bak,$true)
   if([IO.File]::ReadAllText($shift) -cne $new -or
      [IO.File]::ReadAllText($bak) -cne $initial){throw 'V833_COMMIT_OR_BACKUP_MISMATCH'}
   [IO.File]::WriteAllText((Join-Path $runtime 'writer.json'),
     ([ordered]@{separate_token=$true;changed_shift=$true;
       before_bytes_backed_up=$true;repeat_must_refuse_exit_93=$true;
       human_authorization_proven=$false;true_concurrent_cas_proven=$false;real_production_writer_authorized=$false
     }|ConvertTo-Json -Compress))
 }
 exit 0
}
if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
   $env:RUNNER_ENVIRONMENT -cne 'github-hosted'){throw 'GITHUB_HOSTED_WINDOWS_ONLY'}
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'HOSTED_ADMIN_REQUIRED'}
$runnerTemp=[IO.Path]::GetFullPath($env:RUNNER_TEMP)
if(-not [IO.Directory]::Exists($runnerTemp)){throw 'RUNNER_TEMP_MISSING'}
$nonce=[guid]::NewGuid().ToString('N')
$SandboxRoot=Join-Path $runnerTemp ('vertice_acl_v813_'+$nonce.Substring(0,12))
Guard-Root $SandboxRoot
 # Negative boundary checks: never inspect or write the outside path.
 $outside=Join-Path $env:USERPROFILE ('vertice_acl_v813_'+$nonce.Substring(0,12))
 if(-not (Rejected { Guard-Root $outside })){throw 'V833_OUTSIDE_RUNNER_TEMP_ACCEPTED'}
 $previousAction=$env:GITHUB_ACTIONS
 try{
   $env:GITHUB_ACTIONS='false'
   if(-not (Rejected { Guard-Root $SandboxRoot })){throw 'V833_UNTRUSTED_RUNNER_ACCEPTED'}
 }finally{$env:GITHUB_ACTIONS=$previousAction}
$readerName='vr813'+$nonce.Substring(0,9)
$writerName='vw813'+$nonce.Substring(0,9)
$created=[Collections.Generic.List[string]]::new()
try{
 $readerPassword=ConvertTo-SecureString ('R!8a'+$nonce+'c3X') -AsPlainText -Force
 $writerPassword=ConvertTo-SecureString ('W!8b'+$nonce+'f4Y') -AsPlainText -Force
 $null=New-LocalUser -Name $readerName -Password $readerPassword -ErrorAction Stop
 $created.Add($readerName)
 $null=New-LocalUser -Name $writerName -Password $writerPassword -ErrorAction Stop
 $created.Add($writerName)
 $ReaderSid=(Get-LocalUser $readerName).SID.Value
 $WriterSid=(Get-LocalUser $writerName).SID.Value
 if($ReaderSid -ceq $WriterSid){throw 'NOT_SEPARATE_TOKENS'}
 $root=New-Item -ItemType Directory -Path $SandboxRoot
 $approved=New-Item -ItemType Directory -Path (Join-Path $SandboxRoot 'approved')
 $runtime=New-Item -ItemType Directory -Path (Join-Path $SandboxRoot 'runtime')
 $shift=Join-Path $approved.FullName 'shift.json'
 [IO.File]::WriteAllText($shift,'{"shift":"synthetic_initial"}')
 function Restrict([string]$Target,[string[]]$Grants){
   & icacls.exe $Target '/inheritance:r' '/grant:r' @Grants|Out-Null
   if($LASTEXITCODE -ne 0){throw 'ACL_COMMAND_FAILED'}
 }
 $admin='*S-1-5-32-544:(OI)(CI)F'
 $system='*S-1-5-18:(OI)(CI)F'
 $readerRx="*$($ReaderSid):(OI)(CI)RX"
 $readerModify="*$($ReaderSid):(OI)(CI)M"
 $writerRx="*$($WriterSid):(OI)(CI)RX"
 $writerModify="*$($WriterSid):(OI)(CI)M"
 Restrict $root.FullName @($admin,$system,$readerRx,$writerRx)
 Restrict $approved.FullName @($admin,$system,$readerRx,$writerModify)
 Restrict $runtime.FullName @($admin,$system,$readerModify,$writerModify)
 & icacls.exe $shift '/inheritance:r' '/grant:r' '*S-1-5-32-544:F' '*S-1-5-18:F' "*$($ReaderSid):R" "*$($WriterSid):M"|Out-Null
 if($LASTEXITCODE -ne 0){throw 'SHIFT_FILE_ACL_FAILED'}
 $before=(Get-FileHash -LiteralPath $shift -Algorithm SHA256).Hash
 $self=$MyInvocation.MyCommand.Path
 $pwsh=(Get-Process -Id $PID).Path
 function Invoke-Probe([string]$TargetRole,[string]$User,[securestring]$Secret,[int]$ExpectedExit=0){
   $cred=[pscredential]::new(("$env:COMPUTERNAME\"+$User),$Secret)
   $params=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
     '-File',('"' + $self + '"'),'-Role',$TargetRole,
     '-SandboxRoot',('"' + $SandboxRoot + '"'),'-ReaderSid',$ReaderSid,'-WriterSid',$WriterSid) -join ' '
   $proc=Start-Process -FilePath $pwsh -ArgumentList $params -Credential $cred -Wait -PassThru
   if($proc.ExitCode -ne $ExpectedExit){throw "CHILD_UNEXPECTED_EXIT_$TargetRole"}
 }
 Invoke-Probe 'Reader' $readerName $readerPassword
 $readerProof=Get-Content -LiteralPath (Join-Path $runtime 'reader.json') -Raw|ConvertFrom-Json
 foreach($property in $readerProof.PSObject.Properties){
   if($property.Value -ne $true){throw ('READER_ACCESS_BREACH_'+$property.Name)}
 }
 if((Get-FileHash -LiteralPath $shift -Algorithm SHA256).Hash -cne $before){throw 'READER_MUTATED_SHIFT'}
 if(@(Get-ChildItem -LiteralPath $approved.FullName -File).Count -ne 1){throw 'READER_ADDED_FILE'}
 Invoke-Probe 'Writer' $writerName $writerPassword
 $writerProof=Get-Content -LiteralPath (Join-Path $runtime 'writer.json') -Raw|ConvertFrom-Json
 if(-not $writerProof.separate_token -or -not $writerProof.changed_shift -or
    -not $writerProof.before_bytes_backed_up -or
    -not $writerProof.repeat_must_refuse_exit_93 -or
    $writerProof.true_concurrent_cas_proven -or
    $writerProof.human_authorization_proven -or
    $writerProof.real_production_writer_authorized){throw 'WRITER_SEPARATION_NOT_PROVEN'}
 if([IO.File]::ReadAllText((Join-Path $approved.FullName 'shift.json.bak.v833')) -cne
    '{"shift":"synthetic_initial"}'){throw 'V833_PINNED_BACKUP_NOT_PROVEN'}
 if([IO.File]::ReadAllText($shift) -cne '{"shift":"synthetic_writer"}'){throw 'V833_CANDIDATE_NOT_COMMITTED'}
 $committedSha=(Get-FileHash -LiteralPath $shift -Algorithm SHA256).Hash
 Invoke-Probe 'Writer' $writerName $writerPassword 93
 if((Get-FileHash -LiteralPath $shift -Algorithm SHA256).Hash -cne $committedSha){
   throw 'V833_REPLAY_MUTATED_COMMITTED_SHIFT'
 }
 if(Test-Path -LiteralPath (Join-Path $approved.FullName 'shift.json.pending.v833') -PathType Leaf){
   throw 'V833_REPLAY_LEFT_PENDING_FILE'
 }
 [ordered]@{
   schema='deliveryos.windows-ntfs-real-token.v813'
   status='PASS'
   reader_executed_as_separate_windows_principal=$true
   reader_could_write_events=$true
   reader_could_not_change_approved_shift=$true
   writer_executed_as_second_windows_principal=$true
   writer_changed_synthetic_shift=$true
   v833_sequential_stale_replay_refused=$true
   v833_atomic_compare_and_swap_proven=$false
   v833_predecessor_bytes_backed_up=$true
   v833_writer_second_token_proven=$true
   v833_child_temp_root_enforced=$true
   reader_checks=@($readerProof.PSObject.Properties).Count
   human_identity_or_approval_proven=$false
   production_effects=$false
 }|ConvertTo-Json -Compress
}finally{
 if($SandboxRoot -and (Test-Path -LiteralPath $SandboxRoot)){
   Remove-Item -LiteralPath $SandboxRoot -Force -Recurse -ErrorAction SilentlyContinue
 }
 foreach($name in $created){
   Remove-LocalUser -Name $name -ErrorAction SilentlyContinue
 }
}

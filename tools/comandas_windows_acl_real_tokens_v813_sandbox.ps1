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
 if([string]::IsNullOrWhiteSpace($Root) -or
   [IO.Path]::GetFileName($Root) -notmatch '^vertice_acl_v813_[a-f0-9]{12}$'){
   throw 'TEMP_SANDBOX_REQUIRED'
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
   [IO.File]::WriteAllText($shift,'{"shift":"synthetic_writer"}')
   [IO.File]::WriteAllText((Join-Path $runtime 'writer.json'),
     ([ordered]@{separate_token=$true;changed_shift=([IO.File]::ReadAllText($shift) -ceq '{"shift":"synthetic_writer"}');human_authorization_proven=$false}|ConvertTo-Json -Compress))
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
 function Invoke-Probe([string]$TargetRole,[string]$User,[securestring]$Secret){
   $cred=[pscredential]::new(("$env:COMPUTERNAME\"+$User),$Secret)
   $params=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
     '-File',('"' + $self + '"'),'-Role',$TargetRole,
     '-SandboxRoot',('"' + $SandboxRoot + '"'),'-ReaderSid',$ReaderSid,'-WriterSid',$WriterSid) -join ' '
   $proc=Start-Process -FilePath $pwsh -ArgumentList $params -Credential $cred -Wait -PassThru
   if($proc.ExitCode -ne 0){throw "CHILD_FAILED_$TargetRole"}
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
    $writerProof.human_authorization_proven){throw 'WRITER_SEPARATION_NOT_PROVEN'}
 [ordered]@{
   schema='deliveryos.windows-ntfs-real-token.v813'
   status='PASS'
   reader_executed_as_separate_windows_principal=$true
   reader_could_write_events=$true
   reader_could_not_change_approved_shift=$true
   writer_executed_as_second_windows_principal=$true
   writer_changed_synthetic_shift=$true
   reader_checks=$readerProof.PSObject.Properties.Count
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

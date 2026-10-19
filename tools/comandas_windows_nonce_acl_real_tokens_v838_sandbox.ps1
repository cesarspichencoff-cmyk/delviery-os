# V8.38 — GitHub-hosted Windows real-token ACL isolation for synthetic
# one-time authorization receipts. NEVER run on an operational host.
# No production identity, shift change, SQL, Teknisa or print.
[CmdletBinding()]
param(
 [ValidateSet('Parent','Reader','Custodian')][string]$Role='Parent',
 [string]$SandboxRoot='',
 [string]$ReaderSid='',
 [string]$CustodianSid='',
 [ValidateSet('Before','After','Reserve','Replay')][string]$Phase='Before'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function HostGuard([string]$Root,[bool]$RequireExisting){
 if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){
  throw 'V838_GITHUB_HOSTED_WINDOWS_ONLY'
 }
 $base=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
 $full=[IO.Path]::GetFullPath($Root)
 if(-not $full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -or
     [IO.Path]::GetFileName($full) -cnotmatch '^vertice_nonce_v838_[a-f0-9]{12}$'){
  throw 'V838_SANDBOX_ROOT_INVALID'
 }
 if($RequireExisting){
  foreach($p in @($full,(Join-Path $full 'nonce-ledger'),(Join-Path $full 'runtime'))){
   if(-not(Test-Path -LiteralPath $p -PathType Container) -or
      ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
    throw 'V838_SANDBOX_DIRECTORY_UNTRUSTED'
   }
  }
  $marker=Join-Path $full 'V838_TEST_ONLY'
  if(-not(Test-Path -LiteralPath $marker -PathType Leaf) -or
      [IO.File]::ReadAllText($marker) -cne 'HOSTED_WINDOWS_TEST_ONLY'){
   throw 'V838_MARKER_INVALID'
  }
 }
}
function Digest([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256 -ErrorAction Stop).Hash}
function Denied([scriptblock]$op){
 try{& $op;$false}catch [UnauthorizedAccessException]{$true}
 catch [System.Security.SecurityException]{$true}
}
function ReceiptBytes(){
 return '{"schema":"deliveryos.comandas.v837.synthetic-nonce-record","authorization_id":"v838_synthetic_auth_001","envelope_sha256":"'+
   ('a'*64)+'","state":"RESERVED_UNCONFIRMED","human_authorization_proven":false,"operational_authorized":false}'
}
if($Role -ne 'Parent'){
 HostGuard $SandboxRoot $true
 $current=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if($Role -eq 'Reader' -and $current -cne $ReaderSid){throw 'V838_WRONG_READER_TOKEN'}
 if($Role -eq 'Custodian' -and $current -cne $CustodianSid){throw 'V838_WRONG_CUSTODIAN_TOKEN'}
 if(-not $ReaderSid -or -not $CustodianSid -or $ReaderSid -ceq $CustodianSid){
  throw 'V838_IDENTITY_SEPARATION_MISSING'
 }
 $ledger=Join-Path $SandboxRoot 'nonce-ledger'
 $runtime=Join-Path $SandboxRoot 'runtime'
 $receipt=Join-Path $ledger 'synthetic-nonce.json'
 if($Role -eq 'Reader'){
  if($Phase -eq 'Before'){
   $createDenied=Denied {
    $s=[IO.File]::Open($receipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $s.Dispose()
   }
   $siblingDenied=Denied {
    $s=[IO.File]::Open((Join-Path $ledger 'forged.json'),[IO.FileMode]::CreateNew,
      [IO.FileAccess]::Write,[IO.FileShare]::None)
    $s.Dispose()
   }
   if(-not $createDenied -or -not $siblingDenied -or
      (Test-Path -LiteralPath $receipt) -or
      (Test-Path -LiteralPath (Join-Path $ledger 'forged.json'))){
     throw 'V838_READER_COULD_CREATE_NONCE'
   }
   [IO.File]::WriteAllText((Join-Path $runtime 'reader-before.json'),
     '{"can_create":false,"sibling_forge":false,"effective_reader_token":true}')
   exit 0
  }
  if($Phase -ne 'After'){throw 'V838_INVALID_READER_PHASE'}
  if(-not(Test-Path -LiteralPath $receipt -PathType Leaf)){throw 'V838_RECEIPT_MISSING'}
  $baseline=Digest $receipt
  $readable=[IO.File]::ReadAllText($receipt) -ceq (ReceiptBytes)
  $writeDenied=Denied {[IO.File]::WriteAllText($receipt,'FORGED_RECEIPT')}
  $deleteDenied=Denied {[IO.File]::Delete($receipt)}
  $renameDenied=Denied {[IO.File]::Move($receipt,(Join-Path $ledger 'renamed.json'))}
  $siblingDenied=Denied {
   $s=[IO.File]::Open((Join-Path $ledger 'forged.json'),[IO.FileMode]::CreateNew,
     [IO.FileAccess]::Write,[IO.FileShare]::None)
   $s.Dispose()
  }
  $unchanged=(Digest $receipt) -ceq $baseline
  if(-not($readable -and $writeDenied -and $deleteDenied -and
           $renameDenied -and $siblingDenied -and $unchanged) -or
     (Test-Path -LiteralPath (Join-Path $ledger 'forged.json')) -or
     (Test-Path -LiteralPath (Join-Path $ledger 'renamed.json'))){
   throw 'V838_READER_MUTATION_NOT_REFUSED'
  }
  [IO.File]::WriteAllText((Join-Path $runtime 'reader-after.json'),
    '{"can_read":true,"write_denied":true,"delete_denied":true,"rename_denied":true,"new_file_denied":true,"sha_unchanged":true}')
  exit 0
 }
 if($Phase -eq 'Reserve'){
  $f=$null
  try{
   $f=[IO.File]::Open($receipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   $b=[Text.UTF8Encoding]::new($false).GetBytes((ReceiptBytes))
   $f.Write($b,0,$b.Length)
   $f.Flush($true)
  }finally{if($null -ne $f){$f.Dispose()}}
  if([IO.File]::ReadAllText($receipt) -cne (ReceiptBytes)){
   throw 'V838_CUSTODIAN_RECEIPT_INVALID'
  }
  [IO.File]::WriteAllText((Join-Path $runtime 'custodian-reserved.json'),
    '{"one_file_created":true,"effective_custodian_token":true,"operational_authorized":false}')
  exit 0
 }
 if($Phase -ne 'Replay'){throw 'V838_INVALID_CUSTODIAN_PHASE'}
 $replayDenied=$false
 try{
  $f=[IO.File]::Open($receipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  $f.Dispose()
 }catch [IO.IOException]{$replayDenied=$true}
 if(-not $replayDenied){throw 'V838_CUSTODIAN_DUPLICATE_NOT_REFUSED'}
 [IO.File]::WriteAllText((Join-Path $runtime 'custodian-replay.json'),
   '{"create_new_refused":true,"operational_authorized":false}')
 exit 0
}
if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
   $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
   [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){throw 'V838_RUNNER_REQUIRED'}
$admin=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
 throw 'V838_DISPOSABLE_ADMIN_REQUIRED'
}
$nonce=[guid]::NewGuid().ToString('N')
$SandboxRoot=Join-Path $env:RUNNER_TEMP ('vertice_nonce_v838_'+$nonce.Substring(0,12))
HostGuard $SandboxRoot $false
$notHosted=$env:GITHUB_ACTIONS
try{
 $env:GITHUB_ACTIONS='false'
 $rejected=$false
 try{HostGuard $SandboxRoot $false}catch{$rejected=$true}
 if(-not $rejected){throw 'V838_HOST_CHECK_BYPASS'}
}finally{$env:GITHUB_ACTIONS=$notHosted}
$outside=Join-Path $env:USERPROFILE ('vertice_nonce_v838_'+$nonce.Substring(0,12))
$outsideRejected=$false
try{HostGuard $outside $false}catch{$outsideRejected=$true}
if(-not $outsideRejected){throw 'V838_PATH_ESCAPE'}
$readerName='vr838'+$nonce.Substring(0,9)
$custodianName='vc838'+$nonce.Substring(0,9)
$accounts=[Collections.Generic.List[string]]::new()
$rootCreated=$false
$rootRemoved=$false
$accountsRemoved=$false
$report=$null
try{
 $readerPassword=ConvertTo-SecureString ('R!38'+$nonce+'c3K') -AsPlainText -Force
 $writerPassword=ConvertTo-SecureString ('W!38'+$nonce+'t5Y') -AsPlainText -Force
 $null=New-LocalUser -Name $readerName -Password $readerPassword -ErrorAction Stop
 $accounts.Add($readerName)
 $null=New-LocalUser -Name $custodianName -Password $writerPassword -ErrorAction Stop
 $accounts.Add($custodianName)
 $ReaderSid=(Get-LocalUser $readerName).SID.Value
 $CustodianSid=(Get-LocalUser $custodianName).SID.Value
 if($ReaderSid -ceq $CustodianSid){throw 'V838_SAME_IDENTITY'}
 $root=New-Item -ItemType Directory -Path $SandboxRoot -ErrorAction Stop
 $rootCreated=$true
 $ledger=New-Item -ItemType Directory -Path (Join-Path $root.FullName 'nonce-ledger') -ErrorAction Stop
 $runtime=New-Item -ItemType Directory -Path (Join-Path $root.FullName 'runtime') -ErrorAction Stop
 [IO.File]::WriteAllText((Join-Path $root.FullName 'V838_TEST_ONLY'),'HOSTED_WINDOWS_TEST_ONLY')
 function Set-Grants([string]$target,[string[]]$grants){
  & icacls.exe $target '/inheritance:r' '/grant:r' @grants |Out-Null
  if($LASTEXITCODE -ne 0){throw 'V838_ACL_SETUP_FAILED'}
 }
 $administrator='*S-1-5-32-544:(OI)(CI)F'
 $system='*S-1-5-18:(OI)(CI)F'
 $readerRx="*$($ReaderSid):(OI)(CI)RX"
 $readerModify="*$($ReaderSid):(OI)(CI)M"
 $writerRx="*$($CustodianSid):(OI)(CI)RX"
 $writerModify="*$($CustodianSid):(OI)(CI)M"
 Set-Grants $root.FullName @($administrator,$system,$readerRx,$writerRx)
 Set-Grants $ledger.FullName @($administrator,$system,$readerRx,$writerModify)
 Set-Grants $runtime.FullName @($administrator,$system,$readerModify,$writerModify)
 HostGuard $SandboxRoot $true
 $self=$PSCommandPath
 $pwsh=(Get-Process -Id $PID).Path
 function Run-As([string]$role,[string]$phase,[string]$username,[securestring]$secret){
  $credential=[pscredential]::new(("$env:COMPUTERNAME\"+$username),$secret)
  $argsLine=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
    '-File',('"'+$self+'"'),'-Role',$role,'-Phase',$phase,
    '-SandboxRoot',('"'+$SandboxRoot+'"'),'-ReaderSid',$ReaderSid,
    '-CustodianSid',$CustodianSid) -join ' '
  $proc=Start-Process -FilePath $pwsh -ArgumentList $argsLine -Credential $credential -PassThru -Wait
  $code=[int]$proc.ExitCode
  $proc.Dispose()
  if($code -ne 0){throw ('V838_CHILD_FAILED_'+$role+'_'+$phase+'_'+$code)}
 }
 $receipt=Join-Path $ledger.FullName 'synthetic-nonce.json'
 Run-As 'Reader' 'Before' $readerName $readerPassword
 if(Test-Path -LiteralPath $receipt){throw 'V838_PREEXISTING_RECEIPT'}
 $before=Get-Content -LiteralPath (Join-Path $runtime.FullName 'reader-before.json') -Raw|ConvertFrom-Json
 if($before.can_create -ne $false -or $before.sibling_forge -ne $false){
  throw 'V838_BEFORE_PROOF_NOT_FAIL_CLOSED'
 }
 Run-As 'Custodian' 'Reserve' $custodianName $writerPassword
 $reservation=Get-Content -LiteralPath (Join-Path $runtime.FullName 'custodian-reserved.json') -Raw|ConvertFrom-Json
 if(-not $reservation.one_file_created -or $reservation.operational_authorized){
  throw 'V838_RESERVATION_FALSE_AUTHORITY'
 }
 $pin=Digest $receipt
 Run-As 'Reader' 'After' $readerName $readerPassword
 $after=Get-Content -LiteralPath (Join-Path $runtime.FullName 'reader-after.json') -Raw|ConvertFrom-Json
 foreach($property in @('can_read','write_denied','delete_denied',
                        'rename_denied','new_file_denied','sha_unchanged')){
  if($after.$property -ne $true){throw ('V838_READER_PROOF_MISSING_'+$property)}
 }
 if((Digest $receipt) -cne $pin){throw 'V838_READER_CHANGED_DIGEST'}
 Run-As 'Custodian' 'Replay' $custodianName $writerPassword
 $duplicate=Get-Content -LiteralPath (Join-Path $runtime.FullName 'custodian-replay.json') -Raw|ConvertFrom-Json
 if(-not $duplicate.create_new_refused -or $duplicate.operational_authorized){
  throw 'V838_REPLAY_NOT_REFUSED'
 }
 if((Digest $receipt) -cne $pin -or
    @(Get-ChildItem -LiteralPath $ledger.FullName -File).Count -ne 1){
  throw 'V838_LEDGER_NOT_PINNED'
 }
 $report=[ordered]@{
  schema='deliveryos.comandas.v838.actual-token-nonce-acl'
  status='PASS'
  reader_actual_windows_principal_distinct=$true
  custodian_actual_windows_principal_distinct=$true
  reader_denied_nonce_creation_when_absent=$true
  reader_can_read_existing_receipt=$true
  reader_cannot_write_receipt=$true
  reader_cannot_delete_receipt=$true
  reader_cannot_rename_receipt=$true
  reader_cannot_forge_sibling_receipt=$true
  custodian_created_receipt_once=$true
  custodian_duplicate_create_new_refused=$true
  receipt_sha_preserved_after_attack_and_replay=$true
  reader_can_write_separate_runtime_evidence=$true
  false_host_and_outside_temp_rejected=$true
  signed_v836_authorization_verified_in_this_test=$false
  real_human_custodian_authenticated=$false
  production_service_token_tested=$false
  independent_failure_domain_proven=$false
  power_loss_durability_proven=$false
  production_shift_authorized=$false
  hosted_runner_only=$true
  sql=$false;teknisa=$false;printer=$false;service=$false
 }
}finally{
 if($rootCreated){
  try{
   Remove-Item -LiteralPath $SandboxRoot -Recurse -Force -ErrorAction Stop
   $rootRemoved=-not(Test-Path -LiteralPath $SandboxRoot)
  }catch{[Console]::Error.WriteLine('V838_SANDBOX_CLEANUP_NOT_PROVEN')}
 }
 foreach($user in $accounts){
  Remove-LocalUser -Name $user -ErrorAction SilentlyContinue
 }
 $accountsRemoved=@($accounts|Where-Object{
  $null -ne (Get-LocalUser -Name $_ -ErrorAction SilentlyContinue)
 }).Count -eq 0
}
if(-not $rootRemoved -or -not $accountsRemoved){throw 'V838_CLEANUP_NOT_PROVEN'}
$report.temp_root_removed=$rootRemoved
$report.temp_users_removed=$accountsRemoved
[pscustomobject]$report|ConvertTo-Json -Compress

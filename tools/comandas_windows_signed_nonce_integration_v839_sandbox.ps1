# V8.39 — V8.36 signed authorization + V8.37 exact nonce + V8.38 NTFS
# Real Windows reader and custodian tokens, GitHub-hosted disposable only.
# No CAIXA_MOOCA, Teknisa, SQL, print, service, or active shift operations.
[CmdletBinding()]
param(
 [ValidateSet('Parent','Reader','Custodian')][string]$Role='Parent',
 [ValidateSet('Before','Negative','Reserve','After','Replay')][string]$Phase='Before',
 [string]$SandboxRoot='',
 [string]$ReaderSid='',
 [string]$CustodianSid='',
 [string]$NodeExe='',
 [string]$ChildJs=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function HostGuard([string]$dir,[bool]$mustExist){
 if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
  $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
  [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){
  throw 'V839_RUNNER_ONLY'
 }
 $base=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
 $full=[IO.Path]::GetFullPath($dir)
 if(-not $full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($full) -cnotmatch '^vertice_nonce_v837_[a-f0-9]{12}$'){
  throw 'V839_PATH_GUARD_FAIL'
 }
 if($mustExist){
  foreach($p in @($full,(Join-Path $full 'nonce-ledger'),
      (Join-Path $full 'runtime'))){
   if(-not(Test-Path -LiteralPath $p -PathType Container) -or
      ((Get-Item -LiteralPath $p -Force).Attributes -band
       [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'V839_DIRECTORY_UNTRUSTED'}
  }
  if([IO.File]::ReadAllText((Join-Path $full 'V837_TEST_ONLY')) -cne
      'EPHEMERAL_REVIEW_ONLY' -or
      [IO.File]::ReadAllText((Join-Path $full 'V839_TEST_ONLY')) -cne
      'INTEGRATED_WINDOWS_ONLY'){
   throw 'V839_MARKER_INVALID'
  }
 }
}
function Digest([string]$p){
 (Get-FileHash -LiteralPath $p -Algorithm SHA256 -ErrorAction Stop).Hash
}
if($Role -ne 'Parent'){
 HostGuard $SandboxRoot $true
 $actualSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if(-not $ReaderSid -or -not $CustodianSid -or
    $ReaderSid -ceq $CustodianSid){throw 'V839_TOKEN_SEPARATION_ABSENT'}
 if($Role -eq 'Reader' -and $actualSid -cne $ReaderSid){
  throw 'V839_READER_EFFECTIVE_SID_MISMATCH'
 }
 if($Role -eq 'Custodian' -and $actualSid -cne $CustodianSid){
  throw 'V839_CUSTODIAN_EFFECTIVE_SID_MISMATCH'
 }
 $action=''
 if($Role -eq 'Reader' -and $Phase -eq 'Before'){$action='reader-before'}
 elseif($Role -eq 'Reader' -and $Phase -eq 'After'){$action='reader-after'}
 elseif($Role -eq 'Custodian' -and $Phase -eq 'Negative'){$action='custodian-negative'}
 elseif($Role -eq 'Custodian' -and $Phase -eq 'Reserve'){$action='custodian-reserve'}
 elseif($Role -eq 'Custodian' -and $Phase -eq 'Replay'){$action='custodian-replay'}
 else{throw 'V839_UNAUTHORIZED_ROLE_PHASE'}
 if(-not(Test-Path -LiteralPath $NodeExe -PathType Leaf) -or
    -not(Test-Path -LiteralPath $ChildJs -PathType Leaf)){
  throw 'V839_NODE_OR_SCRIPT_ABSENT'
 }
 & $NodeExe $ChildJs $action $SandboxRoot
 if($LASTEXITCODE -ne 0){throw ('V839_REAL_NODE_FAILED_'+$action)}
 exit 0
}
HostGuard (Join-Path $env:RUNNER_TEMP 'vertice_nonce_v837_000000000000') $false
$p=[Security.Principal.WindowsPrincipal]::new(
 [Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
 throw 'V839_HOSTED_ADMIN_REQUIRED'
}
$nonce=[guid]::NewGuid().ToString('N')
$SandboxRoot=Join-Path $env:RUNNER_TEMP (
 'vertice_nonce_v837_'+$nonce.Substring(0,12))
HostGuard $SandboxRoot $false
$NodeExe=(Get-Command node -ErrorAction Stop).Source
$ChildJs=Join-Path $PSScriptRoot 'comandas_windows_signed_nonce_v839_child.cjs'
if(-not(Test-Path -LiteralPath $ChildJs -PathType Leaf)){
 throw 'V839_TEST_SOURCE_MISSING'
}
# This script only runs on hosted Windows CI, never on service/production.
$readerName='vr839'+$nonce.Substring(0,9)
$custodianName='vc839'+$nonce.Substring(0,9)
$accounts=[Collections.Generic.List[string]]::new()
$createdRoot=$false;$rootRemoved=$false;$accountsRemoved=$false
$report=$null
try{
 $readerPassword=ConvertTo-SecureString ('R!39'+$nonce+'c3K') -AsPlainText -Force
 $custodianPassword=ConvertTo-SecureString ('W!39'+$nonce+'t5Y') -AsPlainText -Force
 $null=New-LocalUser -Name $readerName -Password $readerPassword -ErrorAction Stop
 $accounts.Add($readerName)
 $null=New-LocalUser -Name $custodianName -Password $custodianPassword -ErrorAction Stop
 $accounts.Add($custodianName)
 $ReaderSid=(Get-LocalUser $readerName).SID.Value
 $CustodianSid=(Get-LocalUser $custodianName).SID.Value
 if($ReaderSid -ceq $CustodianSid){throw 'V839_SAME_WINDOWS_IDENTITY'}
 $root=New-Item -ItemType Directory -Path $SandboxRoot -ErrorAction Stop
 $createdRoot=$true
 $ledger=New-Item -ItemType Directory -Path (Join-Path $SandboxRoot 'nonce-ledger') -ErrorAction Stop
 $runtime=New-Item -ItemType Directory -Path (Join-Path $SandboxRoot 'runtime') -ErrorAction Stop
 [IO.File]::WriteAllText((Join-Path $SandboxRoot 'V837_TEST_ONLY'),
    'EPHEMERAL_REVIEW_ONLY')
 [IO.File]::WriteAllText((Join-Path $SandboxRoot 'V839_TEST_ONLY'),
    'INTEGRATED_WINDOWS_ONLY')
 HostGuard $SandboxRoot $true
 # Admin creates signed data and trust with ephemeral key ONLY in memory.
 & $NodeExe $ChildJs 'setup' $SandboxRoot
 if($LASTEXITCODE -ne 0){throw 'V839_SETUP_FAILED'}
 $fixture=Join-Path $SandboxRoot 'signed-fixture.json'
 $fixtureHash=Digest $fixture
 $fixtureObject=Get-Content -LiteralPath $fixture -Raw|ConvertFrom-Json
 if($fixtureObject.signed.schema -cne 'deliveryos.comandas.shift-authorization.v836.offline' -or
    $fixtureObject.trust.authority -cne 'EPHEMERAL_CI_TEST_CONTEXT_ONLY'){
  throw 'V839_UNEXPECTED_SIGNED_FIXTURE'
 }
 function ACL([string]$where,[string[]]$grants){
  & icacls.exe $where '/inheritance:r' '/grant:r' @grants |Out-Null
  if($LASTEXITCODE -ne 0){throw 'V839_NTFS_SETUP_FAILED'}
 }
 $admin='*S-1-5-32-544:(OI)(CI)F'
 $system='*S-1-5-18:(OI)(CI)F'
 $readerRx="*$($ReaderSid):(OI)(CI)RX"
 $custodianRx="*$($CustodianSid):(OI)(CI)RX"
 $readerModify="*$($ReaderSid):(OI)(CI)M"
 $custodianModify="*$($CustodianSid):(OI)(CI)M"
 ACL $root.FullName @($admin,$system,$readerRx,$custodianRx)
 ACL $ledger.FullName @($admin,$system,$readerRx,$custodianModify)
 ACL $runtime.FullName @($admin,$system,$readerModify,$custodianModify)
 ACL $fixture @('*S-1-5-32-544:F','*S-1-5-18:F',
    "*$($ReaderSid):R","*$($CustodianSid):R")
 foreach($marker in @('V837_TEST_ONLY','V839_TEST_ONLY')){
  ACL (Join-Path $SandboxRoot $marker) @(
   '*S-1-5-32-544:F','*S-1-5-18:F',
   "*$($ReaderSid):R","*$($CustodianSid):R")
 }
 if((Digest $fixture) -cne $fixtureHash){throw 'V839_FIXTURE_SETUP_DRIFT'}
 $self=$PSCommandPath
 $psh=(Get-Process -Id $PID).Path
 function Run-As([string]$who,[string]$phase,[string]$account,[securestring]$secret){
  $credential=[pscredential]::new(("$env:COMPUTERNAME\"+$account),$secret)
  $argsLine=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
   '-File',('"'+$self+'"'),'-Role',$who,'-Phase',$phase,
   '-SandboxRoot',('"'+$SandboxRoot+'"'),'-ReaderSid',$ReaderSid,
   '-CustodianSid',$CustodianSid,'-NodeExe',('"'+$NodeExe+'"'),
   '-ChildJs',('"'+$ChildJs+'"')) -join ' '
  $pr=Start-Process -FilePath $psh -ArgumentList $argsLine -Credential $credential -PassThru -Wait
  $code=[int]$pr.ExitCode
  $pr.Dispose()
  if($code -ne 0){throw ('V839_CHILD_FAILED_'+$who+'_'+$phase+'_'+$code)}
 }
 Run-As 'Reader' 'Before' $readerName $readerPassword
 Run-As 'Custodian' 'Negative' $custodianName $custodianPassword
 if(@(Get-ChildItem -LiteralPath $ledger.FullName -File).Count -ne 0){
  throw 'V839_INVALID_SIGNATURE_CREATED_RECEIPT'
 }
 Run-As 'Custodian' 'Reserve' $custodianName $custodianPassword
 $files=@(Get-ChildItem -LiteralPath $ledger.FullName -File)
 if($files.Count -ne 1){throw 'V839_EXACTLY_ONE_NONCE_REQUIRED'}
 $receipt=$files[0].FullName
 $receiptHash=Digest $receipt
 Run-As 'Reader' 'After' $readerName $readerPassword
 Run-As 'Custodian' 'Replay' $custodianName $custodianPassword
 if((Digest $receipt) -cne $receiptHash -or
    (Digest $fixture) -cne $fixtureHash -or
    @(Get-ChildItem -LiteralPath $ledger.FullName -File).Count -ne 1){
  throw 'V839_WITNESS_OR_NONCE_CHANGED'
 }
 function Evidence([string]$name,[string[]]$fields){
  $filepath=Join-Path $runtime.FullName ($name+'.json')
  $data=Get-Content -LiteralPath $filepath -Raw -ErrorAction Stop|ConvertFrom-Json
  foreach($field in $fields){
   if($data.$field -ne $true){throw ('V839_EVIDENCE_INCOMPLETE_'+$name+'_'+$field)}
  }
 }
 Evidence 'reader-before' @('reader_reserve_hold','reader_cannot_create_nonce',
  'reader_cannot_forge_sibling','reader_cannot_forge_trust_fixture','no_production_authorization')
 Evidence 'custodian-negative' @('tampered_signature_hold','expired_hold',
  'revoked_hold','stale_revocation_hold','no_unverified_reservation',
  'custodian_cannot_forge_trust_fixture')
 Evidence 'custodian-reserve' @('v836_signed_scope_validated',
  'v837_exclusive_nonce_created','reservation_review_only',
  'no_human_authorization','no_shift_mutation')
 Evidence 'reader-after' @('can_read','cannot_overwrite','cannot_delete',
  'cannot_rename','cannot_create_sibling','sha_unchanged','reader_replay_refused')
 Evidence 'custodian-replay' @('second_consumption_refused','unchanged')
 $report=[ordered]@{
  schema='deliveryos.comandas.v839.integrated-signed-nonce-acl'
  status='PASS'
  signer_private_key_written_to_disk=$false
  signed_v836_verified_under_custodian_token=$true
  signed_v836_invalid_expired_revoked_stale_all_hold=$true
  v837_actual_module_created_once_under_custodian_token=$true
  reader_actual_sid_distinct_from_custodian=$true
  reader_cannot_reserve_before_authorization=$true
  reader_cannot_forge_trust_fixture=$true
  custodian_cannot_forge_trust_fixture=$true
  reader_cannot_write_delete_rename_nonce=$true
  reader_can_read_nonce_without_modifying=$true
  both_tokens_cannot_replay_same_authorization=$true
  receipt_and_fixture_sha_unchanged=$true
  exactly_one_reserved_nonce_file=$true
  all_readers_only_review_no_shift_activation=$true
  local_test_fixture_only=$true
  real_custodian_human_authenticated=$false
  independent_time_and_revocation_proven=$false
  independent_external_witness_proven=$false
  production_reader_sid_proven=$false
  power_loss_durability_proven=$false
  actual_shift_updated=$false
  production_effects=$false
  teknisa_contacted=$false;sql=$false;printer=$false;service=$false
 }
}finally{
 if($createdRoot){
  try{
   if([IO.File]::ReadAllText((Join-Path $SandboxRoot 'V839_TEST_ONLY')) -cne
       'INTEGRATED_WINDOWS_ONLY'){throw 'V839_CLEANUP_MARKER_INVALID'}
   Remove-Item -LiteralPath $SandboxRoot -Recurse -Force -ErrorAction Stop
   $rootRemoved=-not(Test-Path -LiteralPath $SandboxRoot)
  }catch{[Console]::Error.WriteLine('V839_TEMP_DIR_CLEANUP_FAILED')}
 }
 foreach($user in $accounts){Remove-LocalUser -Name $user -ErrorAction SilentlyContinue}
 $accountsRemoved=@($accounts|Where-Object{
  $null -ne (Get-LocalUser -Name $_ -ErrorAction SilentlyContinue)
 }).Count -eq 0
}
if(-not $rootRemoved -or -not $accountsRemoved){throw 'V839_CLEANUP_NOT_PROVEN'}
$report.temp_root_removed=$rootRemoved
$report.temp_accounts_removed=$accountsRemoved
[pscustomobject]$report|ConvertTo-Json -Compress

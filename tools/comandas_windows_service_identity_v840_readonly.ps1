# V8.40 — READ ONLY Windows service identity and protected-ledger ACL inventory.
# Never starts/stops services, edits ACL/config, reads fiscal data or installs tools.
# This source is safe to run in Windows PowerShell 5.1 or pwsh 7.
[CmdletBinding()]
param(
 [ValidatePattern('^[A-Za-z0-9_-]{3,100}$')][string]$ServiceName='TataComandaReader',
 [string]$LedgerDirectory=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$report=[ordered]@{
 schema='deliveryos.comandas.v840.actual-host-readonly-identity-assessment'
 status='EVIDENCE_ONLY_HOLD'
 service_name=$ServiceName
 windows_platform_proven=$false
 service_found=$false
 service_running=$false
 service_process_id_present=$false
 service_start_principal_class='UNKNOWN'
 service_sid_derived=$false
 service_sid_type='UNKNOWN'
 ledger_directory_status='NOT_SUPPLIED'
 ledger_acl_read=$false
 ledger_inherits_acls=$null
 ledger_reader_explicit_write_allow=$null
 ledger_reader_inherited_write_allow=$null
 ledger_reader_explicit_write_deny=$null
 ledger_reader_inherited_write_deny=$null
 ledger_broad_principal_explicit_write_allow=$null
 ledger_broad_principal_inherited_write_allow=$null
 ledger_reader_is_owner=$null
 reader_effective_token_membership_proven=$false
 custodian_effective_token_proven=$false
 signer_identity_authenticated=$false
 independent_revocation_time_proven=$false
 external_witness_proven=$false
 production_shift_authorized=$false
 world_proven=$false
 files_written=$false
 service_changed=$false
 process_killed=$false
 acl_changed=$false
 sql_queried=$false
 fiscal_data_read=$false
 printer_called=$false
 teknisa_contacted=$false
 observations=@()
}
if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
 $report.observations+=@('NOT_WINDOWS')
 [pscustomobject]$report|ConvertTo-Json -Compress -Depth 4
 exit 0
}
$report.windows_platform_proven=$true
$service=$null
try{
 $quoted=$ServiceName.Replace("'","''")
 $service=Get-CimInstance -ClassName Win32_Service -Filter ("Name='"+$quoted+"'") -ErrorAction Stop
}catch{$report.observations+=@('SCM_METADATA_UNAVAILABLE')}
$serviceSid=$null
if($null -ne $service){
 $report.service_found=$true
 $report.service_running=[string]$service.State -eq 'Running'
 $report.service_process_id_present=[int]$service.ProcessId -gt 0
 $startName=[string]$service.StartName
 if($startName -match '^NT SERVICE\\'){$report.service_start_principal_class='VIRTUAL_SERVICE_ACCOUNT'}
 elseif($startName -in @('LocalSystem','NT AUTHORITY\LocalSystem','LocalService',
 'NT AUTHORITY\LocalService','NetworkService','NT AUTHORITY\NetworkService')){
  $report.service_start_principal_class='BUILTIN_SERVICE_ACCOUNT'
 }else{$report.service_start_principal_class='OTHER_NON_DISCLOSED'}
 try{
  $serviceSid=([Security.Principal.NTAccount]::new(
   ('NT SERVICE\'+$ServiceName))).Translate(
    [Security.Principal.SecurityIdentifier]).Value
  if($serviceSid -match '^S-1-5-80-[0-9-]+$'){$report.service_sid_derived=$true}
  else{$serviceSid=$null;$report.observations+=@('SERVICE_SID_UNEXPECTED_FORMAT')}
 }catch{$report.observations+=@('SERVICE_SID_DERIVATION_UNAVAILABLE')}
 try{
  $reg=Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\'+$ServiceName) -ErrorAction Stop
  $mode=if($null -ne $reg.PSObject.Properties['ServiceSidType']){
    [int]$reg.ServiceSidType
  }else{0}
  $report.service_sid_type=switch($mode){
   0 {'NONE'}
   1 {'UNRESTRICTED'}
   3 {'RESTRICTED'}
   default {'UNRECOGNIZED'}
  }
 }catch{$report.observations+=@('SERVICE_SID_TYPE_UNAVAILABLE')}
}else{$report.observations+=@('TARGET_SERVICE_NOT_FOUND')}
if(-not [string]::IsNullOrWhiteSpace($LedgerDirectory)){
 try{
  if(-not(Test-Path -LiteralPath $LedgerDirectory -PathType Container)){
   $report.ledger_directory_status='ABSENT_OR_NOT_DIRECTORY'
  }else{
   $item=Get-Item -LiteralPath $LedgerDirectory -Force -ErrorAction Stop
   if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
    $report.ledger_directory_status='REPARSE_DIRECTORY_UNTRUSTED'
   }else{
    $report.ledger_directory_status='DIRECTORY_METADATA_ONLY'
    $acl=Get-Acl -LiteralPath $LedgerDirectory -ErrorAction Stop
    $report.ledger_acl_read=$true
    $report.ledger_inherits_acls=-not [bool]$acl.AreAccessRulesProtected
    $writeMask=([long][Security.AccessControl.FileSystemRights]::Write) -bor
      ([long][Security.AccessControl.FileSystemRights]::Modify) -bor
      ([long][Security.AccessControl.FileSystemRights]::Delete) -bor
      ([long][Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles) -bor
      ([long][Security.AccessControl.FileSystemRights]::ChangePermissions) -bor
      ([long][Security.AccessControl.FileSystemRights]::TakeOwnership)
    $readerAllow=$false;$readerDeny=$false;$broadAllow=$false
    $readerInheritedAllow=$false;$readerInheritedDeny=$false;$broadInheritedAllow=$false
    $broad=@('S-1-1-0','S-1-5-11','S-1-5-32-545')
    foreach($rule in $acl.Access){
     $sid=$null
     try{
      $sid=$rule.IdentityReference.Translate(
       [Security.Principal.SecurityIdentifier]).Value
     }catch{continue}
     $grantsWrite=(([long]$rule.FileSystemRights -band $writeMask) -ne 0)
     if(-not $grantsWrite){continue}
     if($sid -eq $serviceSid -and $null -ne $serviceSid){
      if($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow){
       if($rule.IsInherited){$readerInheritedAllow=$true}else{$readerAllow=$true}
      }elseif($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Deny){
       if($rule.IsInherited){$readerInheritedDeny=$true}else{$readerDeny=$true}
      }
     }
     if($sid -in $broad -and
        $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow){
      if($rule.IsInherited){$broadInheritedAllow=$true}else{$broadAllow=$true}
     }
    }
    $report.ledger_reader_explicit_write_allow=$readerAllow
    $report.ledger_reader_inherited_write_allow=$readerInheritedAllow
    $report.ledger_reader_explicit_write_deny=$readerDeny
    $report.ledger_reader_inherited_write_deny=$readerInheritedDeny
    $report.ledger_broad_principal_explicit_write_allow=$broadAllow
    $report.ledger_broad_principal_inherited_write_allow=$broadInheritedAllow
    try{
     $owner=$acl.Owner
     $ownerSid=([Security.Principal.NTAccount]::new(
       [string]$owner)).Translate([Security.Principal.SecurityIdentifier]).Value
     $report.ledger_reader_is_owner=(
       $null -ne $serviceSid -and $ownerSid -eq $serviceSid)
    }catch{$report.observations+=@('LEDGER_OWNER_SID_NOT_RESOLVED')}
    if($readerAllow -or $readerInheritedAllow -or $broadAllow -or
       $broadInheritedAllow -or $report.ledger_reader_is_owner -eq $true){
     $report.observations+=@('POTENTIAL_LEDGER_WRITE_EXPOSURE')
    }
    if($report.ledger_inherits_acls){
     $report.observations+=@('LEDGER_ACL_INHERITANCE_PRESENT')
    }
   }
  }
 }catch{
  $report.ledger_directory_status='METADATA_UNAVAILABLE'
  $report.observations+=@('LEDGER_METADATA_UNAVAILABLE')
 }
}
# This report NEVER attests effective production token rights or shift readiness.
# Even a clean DACL snapshot is not proof: group rights and process token claims
# may differ, and the passed target may not be the operational ledger destination.
[pscustomobject]$report|ConvertTo-Json -Compress -Depth 4

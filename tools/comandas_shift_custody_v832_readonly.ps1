# V8.32 — read-only custody observation, never a token/approval attestation.
# No read of shift file CONTENT, no account names or SIDs in output.
# No SQL, service action, Process.Start, ACL write, print or spooler.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$ErrorView='NormalView'
$schema='deliveryos.comandas.v832.shift-custody-observation'
$root='C:\ProgramData\TataComandaReader'
$legacy=Join-Path $root 'state\production-service-state.json'
$approvedDir=Join-Path $root 'approved-shift'
$approved=Join-Path $approvedDir 'production-service-state.json'
$service='NT SERVICE\TataComandaReader'
$r=[ordered]@{
 schema=$schema
 observation_read_only=$true
 status='HOLD_READONLY_NO_AUTHORITY'
 service_present=$false
 service_identity_virtual=$null
 observer_distinct_from_service=$null
 local_enabled_nonbuiltin_accounts=$null
 legacy_shift_exists=$null
 legacy_shift_service_modify_allow=$null
 legacy_parent_service_modify_allow=$null
 protected_shift_dir_exists=$null
 protected_shift_exists=$null
 protected_shift_service_modify_allow=$null
 protected_shift_reader_readonly_token_proven=$false
 protected_shift_writer_separate_token_proven=$false
 human_approval_authenticated=$false
 protected_shift_history_proven=$false
 legacy_fallback_disabled_proven=$false
 supervisor_quiescent_cutover_proven=$false
 rollback_actual_bytes_proven=$false
 protected_shift_effective_permissions_tested=$false
 account_names_reported=$false
 sids_reported=$false
 turn_contents_read=$false
 effect_service_modified=$false
 effect_acl_modified=$false
 effect_file_written=$false
 effect_sql=$false
 effect_printer=$false
 inspection_errors=@()
}
$errors=[Collections.Generic.List[string]]::new()
function Observe-ModifyAce([string]$Path) {
 $a=Get-Acl -LiteralPath $Path -ErrorAction Stop
 $rights=[int][Security.AccessControl.FileSystemRights]::Modify
 foreach($ace in @($a.Access)){
  if(([string]$ace.IdentityReference -ieq $service) -and
     ([string]$ace.AccessControlType -eq 'Allow') -and
     (([int]$ace.FileSystemRights -band $rights) -eq $rights)) {return $true}
 }
 # FALSE means only "no matching direct Allow ACE was observed",
 # not that the EFFECTIVE service process token has no access.
 return $false
}
try {
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){$errors.Add('NON_WINDOWS')}
 else {
  try{
   $s=Get-CimInstance Win32_Service -Filter "Name='TataComandaReader'" -ErrorAction Stop
   if($null -ne $s){
    $r.service_present=$true
    $r.service_identity_virtual=([string]$s.StartName -ieq $service)
    $principal=[Security.Principal.WindowsIdentity]::GetCurrent()
    $r.observer_distinct_from_service=([string]$principal.Name -ine [string]$s.StartName)
   }else{$errors.Add('SERVICE_MISSING')}
  }catch{$errors.Add('SERVICE_METADATA_UNAVAILABLE')}
  try{
   $users=@(Get-LocalUser -ErrorAction Stop |Where-Object{
    $_.Enabled -and $_.Name -notin @('Administrator','Guest','DefaultAccount','WDAGUtilityAccount')
   })
   $r.local_enabled_nonbuiltin_accounts=$users.Count
  }catch{$errors.Add('LOCAL_ACCOUNT_COUNT_UNAVAILABLE')}
  try{
   $r.legacy_shift_exists=Test-Path -LiteralPath $legacy -PathType Leaf
   if($r.legacy_shift_exists){$r.legacy_shift_service_modify_allow=Observe-ModifyAce $legacy}
  }catch{$errors.Add('LEGACY_SHIFT_ACL_UNAVAILABLE')}
  try{
   $legacyParent=Split-Path -Parent $legacy
   if(Test-Path -LiteralPath $legacyParent -PathType Container){
    $r.legacy_parent_service_modify_allow=Observe-ModifyAce $legacyParent
   }
  }catch{$errors.Add('LEGACY_PARENT_ACL_UNAVAILABLE')}
  try{
   $r.protected_shift_dir_exists=Test-Path -LiteralPath $approvedDir -PathType Container
   $r.protected_shift_exists=Test-Path -LiteralPath $approved -PathType Leaf
   if($r.protected_shift_exists){
    $r.protected_shift_service_modify_allow=Observe-ModifyAce $approved
   }
  }catch{$errors.Add('PROTECTED_SHIFT_ACL_UNAVAILABLE')}
 }
}catch{$errors.Add('READONLY_OBSERVATION_INCOMPLETE')}
$r.inspection_errors=@($errors)
# There is intentionally no positive activation state, regardless of observations.
[pscustomobject]$r |ConvertTo-Json -Depth 4 -Compress

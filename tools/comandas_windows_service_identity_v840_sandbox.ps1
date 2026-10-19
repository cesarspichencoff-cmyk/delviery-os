# V8.40 hosted CI verification of non-invasive service/ACL metadata probe.
# No account creation, ACL edits, service changes, file mutations, or fiscal I/O.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
   $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
   [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){
 throw 'V840_HOSTED_WINDOWS_CI_ONLY'
}
$file=Join-Path $PSScriptRoot 'comandas_windows_service_identity_v840_readonly.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile(
 $file,[ref]$tokens,[ref]$errors)
if(@($errors).Count -ne 0){throw 'V840_SOURCE_PARSE_FAILED'}
$commands=@($ast.FindAll({
 param($node)
 $node -is [System.Management.Automation.Language.CommandAst]
},$true)|ForEach-Object{$_.GetCommandName()}|Where-Object{$_})
$denied=@('Set-Service','Stop-Service','Start-Service','Restart-Service',
 'New-Service','Remove-Service','Set-Acl','New-Item','Remove-Item','Set-Item',
 'Copy-Item','Move-Item','Rename-Item','Set-ItemProperty','New-ItemProperty',
 'Remove-ItemProperty','Set-Content','Add-Content','Out-File',
 'Invoke-WebRequest','Invoke-RestMethod','Invoke-Command','Start-Process',
 'Stop-Process','Restart-Computer','Set-ExecutionPolicy','Add-Type')
$bad=@($commands|Where-Object{$_ -in $denied})
if($bad.Count -ne 0){throw 'V840_MUTATION_COMMAND_PRESENT'}
if(@($commands|Where-Object{$_ -eq 'Get-CimInstance'}).Count -eq 0 -or
   @($commands|Where-Object{$_ -eq 'Get-Acl'}).Count -eq 0){
 throw 'V840_METADATA_READER_NOT_PRESENT'
}
$before=Get-CimInstance Win32_Service -Filter "Name='EventLog'"
if($null -eq $before){throw 'V840_WINDOWS_REFERENCE_SERVICE_MISSING'}
$raw=@(& $file -ServiceName 'EventLog' -LedgerDirectory $env:RUNNER_TEMP)
if($raw.Count -ne 1){throw 'V840_PROBE_OUTPUT_NOT_ONE'}
$proof=$raw[0]|ConvertFrom-Json
if($proof.schema -cne 'deliveryos.comandas.v840.actual-host-readonly-identity-assessment' -or
   $proof.status -cne 'EVIDENCE_ONLY_HOLD' -or
   $proof.service_name -cne 'EventLog' -or
   $proof.windows_platform_proven -ne $true -or
   $proof.service_found -ne $true -or
   $proof.ledger_directory_status -cne 'DIRECTORY_METADATA_ONLY' -or
   $proof.ledger_acl_read -ne $true -or
   $proof.reader_effective_token_membership_proven -ne $false -or
   $proof.custodian_effective_token_proven -ne $false -or
   $proof.signer_identity_authenticated -ne $false -or
   $proof.independent_revocation_time_proven -ne $false -or
   $proof.external_witness_proven -ne $false -or
   $proof.production_shift_authorized -ne $false -or
   $proof.world_proven -ne $false){throw 'V840_METADATA_PROOF_FAILED'}
foreach($flag in @('files_written','service_changed','process_killed','acl_changed',
                   'sql_queried','fiscal_data_read','printer_called','teknisa_contacted')){
 if($proof.$flag -ne $false){throw ('V840_SIDE_EFFECT_CLAIM_'+$flag)}
}
$none=@(& $file -ServiceName 'V840_INVENTED_SERVICE_001')
if($none.Count -ne 1){throw 'V840_MISSING_SERVICE_OUTPUT_INVALID'}
$absent=$none[0]|ConvertFrom-Json
if($absent.status -cne 'EVIDENCE_ONLY_HOLD' -or
   $absent.service_found -ne $false -or
   $absent.ledger_directory_status -cne 'NOT_SUPPLIED' -or
   $absent.production_shift_authorized -ne $false){
 throw 'V840_MISSING_SERVICE_FALSE_SUCCESS'
}
$missingPath=Join-Path $env:RUNNER_TEMP 'v840_no_protected_ledger_is_installed_here'
$rawMissing=@(& $file -ServiceName 'EventLog' -LedgerDirectory $missingPath)
$missing=$rawMissing[0]|ConvertFrom-Json
if($missing.ledger_directory_status -cne 'ABSENT_OR_NOT_DIRECTORY' -or
   $missing.ledger_acl_read -ne $false -or
   $missing.production_shift_authorized -ne $false){
 throw 'V840_NONEXISTENT_LEDGER_FALSE_SUCCESS'
}
$ps51=@(& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass
 -File $file -ServiceName 'EventLog' -LedgerDirectory $env:RUNNER_TEMP)
if($LASTEXITCODE -ne 0 -or $ps51.Count -ne 1){
 throw 'V840_POWERSHELL_51_EXECUTION_FAILED'
}
$old=$ps51[0]|ConvertFrom-Json
if($old.status -cne 'EVIDENCE_ONLY_HOLD' -or
   $old.service_found -ne $true -or
   $old.ledger_acl_read -ne $true -or
   $old.production_shift_authorized -ne $false){
 throw 'V840_POWERSHELL_51_PARITY_FAILED'
}
$after=Get-CimInstance Win32_Service -Filter "Name='EventLog'"
if([string]$before.State -cne [string]$after.State -or
   [int]$before.ProcessId -ne [int]$after.ProcessId -or
   [string]$before.StartMode -cne [string]$after.StartMode){
 throw 'V840_SERVICE_STATE_CHANGED'
}
[pscustomobject][ordered]@{
 schema='deliveryos.comandas.v840.hosted-readonly-preflight-evidence'
 status='PASS'
 parse_ok=$true
 source_mutation_commands_absent=$true
 actual_windows_service_metadata_read=$true
 existing_directory_acl_metadata_read=$true
 absent_service_refused_as_attestation=$true
 absent_protected_ledger_refused_as_attestation=$true
 powershell_51_readonly_parity=$true
 pwsh_7_readonly_parity=$true
 service_state_and_pid_unchanged=$true
 real_production_service_inspected=$false
 actual_production_target_acl_inspected=$false
 actual_service_token_claims_verified=$false
 actual_custodian_identity_verified=$false
 human_signer_verified=$false
 production_shift_authorized=$false
 persistent_files_written=$false
 service_changed=$false
 acl_changed=$false
 printer_called=$false
 sql_queried=$false
 teknisa_contacted=$false
 hosted_ephemeral_only=$true
}|ConvertTo-Json -Compress

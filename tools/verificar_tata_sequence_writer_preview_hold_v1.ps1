# TATÁ Comanda: verify preview-only sequence writer stays fail-closed.
# Runs only on disposable Windows developer/CI host. NEVER point at the register.
$ErrorActionPreference='Stop'
$script=Join-Path $PSScriptRoot 'tata_sequence_atomic_bind_v1.ps1'
if(-not(Test-Path -LiteralPath $script)){throw 'BINDER_MISSING'}
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('tata-seq-gate-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot -Force|Out-Null
$statePath=Join-Path $fixtureRoot 'sequence.json'
function Check([bool]$ok,[string]$message){if(-not $ok){throw $message}}
function Invoke-Writer([switch]$Commit){
 $sha=(Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash
 $args=@('-NoProfile','-NonInteractive','-File',$script,'-StatePath',$statePath,
  '-StoreId','0001','-OperationalDate','2026-10-25','-TeknisaOrderId','FAKE-ORDER-001',
  '-ExpectedStateSha256',$sha)
 if($Commit){$args+=@('-Commit','-AuthorizationId','SELF_DECLARED_NOT_AUTHORITY')}
 $stdout=& powershell.exe @args 2>&1
 $exit=$LASTEXITCODE
 $text=(@($stdout)|ForEach-Object{[string]$_}) -join [Environment]::NewLine
 $record=$text|ConvertFrom-Json -ErrorAction Stop
 return [pscustomobject]@{exit=$exit;result=$record}
}
try{
 $state=[ordered]@{schema='deliveryos.tata-sequence-state.v1';
  policy=[ordered]@{width=3;min_value=1;max_value=999};
  next_value=1;bindings=@()}
 [IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 10),
  [Text.UTF8Encoding]::new($false))
 $before=(Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash
 $dry=Invoke-Writer
 Check ($dry.exit -eq 0) 'DRY_RUN_EXIT_NONZERO'
 Check ($dry.result.status -eq 'DRY_RUN_NEW_BINDING_READY_NO_WRITE') 'DRY_RUN_NOT_READY'
 Check ([string]$dry.result.assignment.tata_sequence -eq '001') 'DRY_RUN_CANDIDATE_DIFF'
 Check (-not [bool]$dry.result.write_performed) 'DRY_RUN_WROTE'
 Check (-not [bool]$dry.result.effects.production_binding_write) 'DRY_RUN_PRODUCTION_EFFECT'
 Check (-not(Test-Path -LiteralPath ($statePath+'.lock'))) 'DRY_RUN_LOCK_FILE_SIDE_EFFECT'
 Check ((Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash -eq $before) 'DRY_RUN_STATE_CHANGED'
 Write-Output 'PASS preview is not a real sequence and does not create lock'
 $commit=Invoke-Writer -Commit
 Check ($commit.exit -ne 0) 'SELF_AUTHORIZED_COMMIT_SUCCEEDED'
 Check ($commit.result.status -eq 'FAILED') 'COMMIT_NOT_BLOCKED'
 Check ($commit.result.error -eq 'COMMIT_DISABLED_NO_INDEPENDENT_AUTHORIZATION_GATE') 'COMMIT_GUARD_MISSING'
 Check (-not(Test-Path -LiteralPath ($statePath+'.lock'))) 'COMMIT_CREATED_LOCK'
 Check ((Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash -eq $before) 'COMMIT_WROTE_STATE'
 Write-Output 'PASS caller-supplied authorization text cannot commit'
 $again=Invoke-Writer
 Check ($again.result.status -eq 'DRY_RUN_NEW_BINDING_READY_NO_WRITE') 'PREVIEW_FAKED_PERSISTENCE'
 Check ((Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json).bindings.Count -eq 0) 'BINDING_SHOULD_REMAIN_EMPTY'
 Check ((Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash -eq $before) 'SECOND_PREVIEW_WROTE'
 Write-Output 'PASS repeated preview never becomes persisted binding'
 Write-Output 'TATA_SEQUENCE_WRITER_PREVIEW_HOLD=3/3 OFFLINE ONLY'
}finally{
 if(Test-Path -LiteralPath $fixtureRoot){Remove-Item -LiteralPath $fixtureRoot -Recurse -Force}
}
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
 # Simulate a previously persisted binding exclusively in this disposable
 # runner-owned fixture. No real register state or service is accessed.
 $bound=[ordered]@{schema='deliveryos.tata-sequence-state.v1';
  policy=[ordered]@{width=3;min_value=1;max_value=999};
  next_value=2;bindings=@()}
 $canonical=[pscustomobject]@{
  scope_id='STORE:0001|DATE:2026-10-25'
  teknisa_order_id='FAKE-ORDER-001'
  tata_sequence='001'
 }
 $bound.bindings=@($canonical)
 [IO.File]::WriteAllText($statePath,($bound|ConvertTo-Json -Depth 12),
  [Text.UTF8Encoding]::new($false))
 $before=(Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash
 $reuse=Invoke-Writer
 Check ($reuse.exit -eq 0) 'VALID_REUSE_EXIT_FAILED'
 Check ($reuse.result.status -eq 'DRY_RUN_REUSE_READY_NO_WRITE') 'VALID_REUSE_BLOCKED'
 Check ([string]$reuse.result.assignment.tata_sequence -eq '001') 'VALID_REUSE_NUMBER_CHANGED'
 Check (-not [bool]$reuse.result.write_performed) 'VALID_REUSE_WROTE'
 Check ((Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash -eq $before) 'VALID_REUSE_STATE_CHANGED'
 Write-Output 'PASS unique canonical persisted binding can preview same reprint'

 $cases=@(
  [pscustomobject]@{
   label='identical duplicated state rows'
   records=@($canonical,$canonical)
   expected='DUPLICATE_ORDER_SEQUENCE_BINDING:FAKE-ORDER-001'
  },
  [pscustomobject]@{
   label='whitespace in persisted order ID'
   records=@([pscustomobject]@{
    scope_id=$canonical.scope_id;teknisa_order_id='FAKE-ORDER-001 ';tata_sequence='001'
   })
   expected='NON_CANONICAL_EXISTING_SEQUENCE_IDENTITY'
  },
  [pscustomobject]@{
   label='whitespace in persisted scope'
   records=@([pscustomobject]@{
    scope_id='STORE:0001|DATE:2026-10-25 ';teknisa_order_id=$canonical.teknisa_order_id
    tata_sequence='001'
   })
   expected='NON_CANONICAL_EXISTING_SEQUENCE_IDENTITY'
  },
  [pscustomobject]@{
   label='whitespace in persisted number'
   records=@([pscustomobject]@{
    scope_id=$canonical.scope_id;teknisa_order_id=$canonical.teknisa_order_id
    tata_sequence='001 '
   })
   expected='INVALID_EXISTING_TATA_SEQUENCE_FORMAT_OR_RANGE'
  }
 )
 foreach($case in $cases){
  $bound.bindings=@($case.records)
  [IO.File]::WriteAllText($statePath,($bound|ConvertTo-Json -Depth 12),
   [Text.UTF8Encoding]::new($false))
  $before=(Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash
  $blocked=Invoke-Writer
  Check ($blocked.exit -eq 7) ('INVALID_STATE_EXIT_NOT_BLOCKED:'+ $case.label)
  Check ($blocked.result.status -eq 'BLOCKED_NO_WRITE') ('INVALID_STATE_STATUS:'+ $case.label)
  Check (@($blocked.result.blocking_reasons) -contains $case.expected) ('INVALID_STATE_REASON:'+ $case.label)
  Check ($null -eq $blocked.result.assignment) ('INVALID_STATE_ASSIGNED:'+ $case.label)
  Check (-not [bool]$blocked.result.write_performed) ('INVALID_STATE_WROTE:'+ $case.label)
  Check (-not(Test-Path -LiteralPath ($statePath+'.lock'))) ('INVALID_STATE_LOCK:'+ $case.label)
  Check ((Get-FileHash -LiteralPath $statePath -Algorithm SHA256).Hash -eq $before) ('INVALID_STATE_CHANGED:'+ $case.label)
  Write-Output ('PASS ' + $case.label + ' refused without writing')
 }
 Write-Output 'TATA_SEQUENCE_WRITER_PREVIEW_HOLD=8/8 OFFLINE ONLY'
}finally{
 if(Test-Path -LiteralPath $fixtureRoot){Remove-Item -LiteralPath $fixtureRoot -Recurse -Force}
}
# Prior expected blocked inner powershell.exe exits are nonzero by design.
# A successful verifier must clear the inherited native-process exit code.
exit 0

# V8.29: Execute EXACT observer source with only root redirected IN MEMORY
# to harmless fixture JSON on disposable GitHub-hosted Windows. Never reads
# or executes the real operational scripts, SQL, spooler or printer.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if(-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
   $env:RUNNER_ENVIRONMENT -cne 'github-hosted'){throw 'V829_HOSTED_WINDOWS_REQUIRED'}
$runnerTemp=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
$folder=Join-Path $runnerTemp ('v829-unique-revision-'+[guid]::NewGuid().ToString('N'))
if(-not([IO.Path]::GetFullPath($folder).StartsWith($runnerTemp+'v829-', [StringComparison]::OrdinalIgnoreCase))){
 throw 'V829_ROOT_OUTSIDE_TEMP'
}
if($folder.Contains("'")){throw 'V829_UNSAFE_TEMP_ROOT'}
$names=@('reader-events-v1','reader-shadow-decisions-v1','reader-report-source-envelopes-v1')
$sourcePath=Join-Path $PSScriptRoot 'comandas_real_event_chain_v827_readonly.ps1'
$text=[IO.File]::ReadAllText($sourcePath,[Text.Encoding]::UTF8)
$anchor='$root='+[char]39+'C:\ProgramData\TataComandaReader\state'+[char]39
if($text.Split(@($anchor),[StringSplitOptions]::None).Count -ne 2){throw 'V829_SOURCE_ROOT_NOT_EXACTLY_ONE'}
$adapted=$text.Replace($anchor,('$root='+[char]39+$folder+[char]39))
# Exact observer body preserved: ONLY the hard-gated fixture root is rewritten.
if(-not $adapted.Contains("Hold 'V68_FIVE_INDEPENDENT_SOURCES_NOT_ATTESTED'")){
 throw 'V829_V68_GATE_MISSING'
}
$tokens=$null;$parseErrors=$null
$null=[Management.Automation.Language.Parser]::ParseInput($adapted,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'V829_ADAPTED_OBSERVER_PARSE_FAILED'}
$observer=[ScriptBlock]::Create($adapted)
$hash=('a'*64);$fingerprint=('b'*64)
$key='0001|01|123|456'
function Save([string]$group,[string]$name,[object]$obj){
 $p=Join-Path (Join-Path $folder $group) $name
 $obj|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $p -Encoding UTF8
}
function Reset-Fixtures(){
 foreach($n in $names){
  $path=Join-Path $folder $n
  Get-ChildItem -LiteralPath $path -File|Remove-Item -Force -ErrorAction Stop
 }
 $event=[ordered]@{
  schema='deliveryos.tata-reader-stable-order-event.v1'
  order_key=$key;snapshot_hash=$hash;ready_for_downstream_shadow=$false
  blockers=@('SERVICE_STATE_EXPIRED_FOR_ORDER')
  order=[ordered]@{items=@([ordered]@{codigo='FIXTURE';quantidade=1});observation_rows=@()}
 }
 $decision=[ordered]@{
  order_key=$key;snapshot_hash=$hash;fingerprint=$fingerprint;ready=$false
  blocking_reasons=@('SERVICE_STATE_EXPIRED_FOR_ORDER')
 }
 $envelope=[ordered]@{
  identity=[ordered]@{order_key=$key;snapshot_hash=$hash}
  source_event=[ordered]@{order_key=$key;snapshot_hash=$hash;ready_for_downstream_shadow=$false}
  shadow_decision=[ordered]@{order_key=$key;snapshot_hash=$hash;fingerprint=$fingerprint;ready=$false}
 }
 Save 'reader-events-v1' 'a.json' $event
 Save 'reader-shadow-decisions-v1' 'a.json' $decision
 Save 'reader-report-source-envelopes-v1' 'a.json' $envelope
 return [ordered]@{event=$event;decision=$decision;envelope=$envelope}
}
function Check([string]$name,[string]$expected,[string]$counter,[int]$expectedCount){
 $r=& $observer -SampleSize 2 -PairBudget 25 | ConvertFrom-Json
 if($r.status -ne 'HOLD'){throw ('V829_NOT_HOLD_'+$name)}
 if([int]$r.$counter -ne $expectedCount){throw ('V829_COUNT_NOT_PROVEN_'+$name)}
 if(@($r.reason_codes) -notcontains $expected){throw ('V829_REASON_NOT_REJECTED_'+$name)}
 if($r.independent_v68_proof_provided -ne $false -or
    $r.effects.database_read -ne $false -or
    $r.effects.files_written -ne $false -or
    $r.effects.print -ne $false -or
    $r.privacy.order_key_exported -ne $false -or
    $r.privacy.raw_observation_text_exported -ne $false){
  throw ('V829_EFFECT_OR_PRIVACY_CLAIM_FAILED_'+$name)
 }
 return $r
}
$cases=0
$null=New-Item -ItemType Directory -Path $folder -Force
foreach($n in $names){$null=New-Item -ItemType Directory -Path (Join-Path $folder $n)}
try{
 $null=Reset-Fixtures
 [pscustomobject]@{
  schema='deliveryos.comandas.v829.fixture-root-safety'
  disposable_directory_exists=(Test-Path -LiteralPath $folder -PathType Container)
  event_files=@(Get-ChildItem -LiteralPath (Join-Path $folder 'reader-events-v1') -File).Count
  decision_files=@(Get-ChildItem -LiteralPath (Join-Path $folder 'reader-shadow-decisions-v1') -File).Count
  envelope_files=@(Get-ChildItem -LiteralPath (Join-Path $folder 'reader-report-source-envelopes-v1') -File).Count
  adapted_root_is_fixture=$adapted.Contains(('$root='+[char]39+$folder+[char]39))
  fixture_only=$true
 }|ConvertTo-Json -Compress|Write-Host
 $good=& $observer -SampleSize 2 -PairBudget 25 | ConvertFrom-Json
 [pscustomobject]@{
  schema='deliveryos.comandas.v829.fixture-safe-diagnostic'
  fixture_only=$true
  status=$good.status
  sampled=$good.sampled_events
  matched_decisions=$good.matched_decisions
  matched_envelopes=$good.matched_envelopes
  unique_triplets=$good.strictly_unique_triplets
  ready=$good.pairs_ready
  reason_codes=@($good.reason_codes)
  no_ids_exported=$true
 }|ConvertTo-Json -Depth 5 -Compress|Write-Host
 if($good.status -ne 'HOLD' -or $good.strictly_unique_triplets -ne 1 -or
    $good.matched_decisions -ne 1 -or $good.matched_envelopes -ne 1 -or
    $good.pairs_ready -ne 0 -or $good.independent_v68_proof_provided -ne $false){
  throw 'V829_CLEAN_BOUNDED_FIXTURE_WRONGLY_ASSESSED'
 }
 $cases++
 $f=Reset-Fixtures
 Save 'reader-shadow-decisions-v1' 'b.json' $f.decision
 $null=Check 'DUPLICATE_DECISION' 'DECISION_REVISION_NOT_UNIQUE' 'duplicate_decision_revisions' 1
 $cases++
 $f=Reset-Fixtures
 Save 'reader-report-source-envelopes-v1' 'b.json' $f.envelope
 $null=Check 'DUPLICATE_ENVELOPE' 'ENVELOPE_REVISION_NOT_UNIQUE' 'duplicate_envelope_revisions' 1
 $cases++
 $f=Reset-Fixtures
 $f.envelope.shadow_decision.fingerprint=('c'*64)
 Save 'reader-report-source-envelopes-v1' 'a.json' $f.envelope
 $null=Check 'WRONG_FINGERPRINT' 'EMBEDDED_EVENT_DECISION_ENVELOPE_CONFLICT' 'embedded_revision_conflicts' 1
 $cases++
 $f=Reset-Fixtures
 $f.event.snapshot_hash='invalid'
 Save 'reader-events-v1' 'a.json' $f.event
 $null=Check 'INVALID_REVISION' 'EVENT_REVISION_IDENTITY_INVALID' 'invalid_event_revisions' 1
 $cases++
 $f=Reset-Fixtures
 Save 'reader-events-v1' 'b.json' $f.event
 $null=Check 'DUPLICATE_EVENT' 'EVENT_REVISION_DUPLICATED_IN_SAMPLE' 'duplicate_event_revisions' 1
 $cases++
}finally{
 $full=[IO.Path]::GetFullPath($folder)
 if($full.StartsWith($runnerTemp+'v829-', [StringComparison]::OrdinalIgnoreCase)){
  Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction Stop
 }
}
if($cases -ne 6){throw 'V829_SIX_CASES_NOT_VERIFIED'}
[pscustomobject]@{
 schema='deliveryos.comandas.v829.negative-unique-revisions-hosted'
 status='PASS';cases=$cases;actual_observer_logic_exercised=$true
 root_substituted_in_memory=$true;temporary_fixtures_removed=$true
 invalid_and_duplicate_pairs_hold=$true;embedded_fingerprint_drift_hold=$true
 real_order_ids_exported=$false;real_source_files_read=$false
 sql_query=$false;printer=$false;spooler=$false;production_write=$false
 deployment_authorized=$false;independent_v68_proof_provided=$false
}|ConvertTo-Json -Compress

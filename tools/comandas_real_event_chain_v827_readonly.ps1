# V8.27 — passive real-event-to-shadow-decision-to-report pairing.
# Never exports order identifiers, revision hashes, raw item data or client notes.
# No service calls, SQL, printer/spooler, external network, state changes or files.
[CmdletBinding()]
param([ValidateRange(1,25)][int]$SampleSize=20,
      [ValidateRange(25,100)][int]$PairBudget=60)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$reasons=[Collections.Generic.List[string]]::new()
function Hold([string]$reason){
 if(-not $reasons.Contains($reason)){$reasons.Add($reason)}
}
$root='C:\ProgramData\TataComandaReader\state'
$folders=@{event='reader-events-v1';decision='reader-shadow-decisions-v1'
 envelope='reader-report-source-envelopes-v1'}
$allowCodes='^[A-Z][A-Z0-9_]{2,75}$'
function Load-Bounded([IO.FileInfo]$f){
 if($f.Length -le 1 -or $f.Length -gt 1048576){throw 'EVENT_FILE_SIZE_OUTSIDE_LIMIT'}
 return ([IO.File]::ReadAllText($f.FullName,[Text.Encoding]::UTF8)|
  ConvertFrom-Json -ErrorAction Stop)
}
function MostRecent([string]$folder,[int]$take){
 $p=Join-Path $root $folder
 if(-not(Test-Path -LiteralPath $p -PathType Container)){throw 'DIR_ABSENT'}
 return @(Get-ChildItem -LiteralPath $p -File -Filter '*.json' -ErrorAction Stop|
  Sort-Object LastWriteTimeUtc -Descending|Select-Object -First $take)
}
function SafeCodes([object[]]$values){
 return @($values|Where-Object{$_ -is [string] -and $_ -cmatch $allowCodes})
}
$report=[ordered]@{
 schema='deliveryos.comandas.v827.real-event-pair-readonly'
 status='HOLD'
 observed_at_utc=(Get-Date).ToUniversalTime().ToString('o')
 sample_requested=$SampleSize;pair_scan_budget=$PairBudget
 sampled_events=0;event_ready=0;event_blocked=0
 matched_decisions=0;matched_envelopes=0
 same_identity_revision_decisions=0;same_identity_revision_envelopes=0
 pairs_ready=0;with_observation_rows=0;total_item_rows=0
 blockers_event=[ordered]@{};blockers_decision=[ordered]@{}
 representative=@()
 independent_v68_source_count_verified=0
 independent_v68_proof_provided=$false
 reason_codes=@()
 effects=[ordered]@{service_change=$false;files_written=$false
  database_read=$false;database_write=$false;spooler=$false
  printer=$false;print=$false;deployment=$false}
 privacy=[ordered]@{order_key_exported=$false;snapshot_hash_exported=$false
  raw_observation_text_exported=$false;customer_fields_exported=$false
  file_paths_exported=$false}
}
if(-not [Environment]::OSVersion.Platform.ToString().Equals('Win32NT')){
 Hold 'WINDOWS_HOST_REQUIRED'
}else{
 try{
  $eventFiles=MostRecent $folders.event $SampleSize
  $decFiles=MostRecent $folders.decision $PairBudget
  $envFiles=MostRecent $folders.envelope $PairBudget
  $decObjects=@(foreach($f in $decFiles){
   try{Load-Bounded $f}catch{Hold 'DECISION_READ_UNKNOWN'}
  })
  $envObjects=@(foreach($f in $envFiles){
   try{Load-Bounded $f}catch{Hold 'ENVELOPE_READ_UNKNOWN'}
  })
  if($eventFiles.Count -eq 0){Hold 'NO_REAL_EVENTS'}
  $ageNow=(Get-Date).ToUniversalTime()
  foreach($f in $eventFiles){
   $e=$null
   try{$e=Load-Bounded $f}catch{Hold 'EVENT_READ_UNKNOWN';continue}
   $report.sampled_events++
   if($e.ready_for_downstream_shadow -ceq $true){$report.event_ready++}
   else{$report.event_blocked++}
   if($null -ne $e.order){
    $report.total_item_rows+=@($e.order.items).Count
    if($null -ne $e.order.observation_rows -and
        @($e.order.observation_rows).Count -gt 0){$report.with_observation_rows++}
   }
   foreach($code in @(SafeCodes @($e.blockers))){
    if(-not $report.blockers_event.Contains($code)){$report.blockers_event[$code]=0}
    $report.blockers_event[$code]++
   }
   $dec=@($decObjects|Where-Object{
    $_ -and $_.order_key -ceq $e.order_key -and
    $_.snapshot_hash -ceq $e.snapshot_hash
   })
   $env=@($envObjects|Where-Object{
    $_ -and $_.identity -and
    $_.identity.order_key -ceq $e.order_key -and
    $_.identity.snapshot_hash -ceq $e.snapshot_hash
   })
   if($dec.Count -gt 0){
    $report.matched_decisions++
    $report.same_identity_revision_decisions++
    foreach($code in @(SafeCodes @($dec[0].blocking_reasons))){
     if(-not $report.blockers_decision.Contains($code)){$report.blockers_decision[$code]=0}
     $report.blockers_decision[$code]++
    }
   }else{Hold 'DECISION_PAIR_NOT_IN_BOUNDED_WINDOW'}
   if($env.Count -gt 0){
    $report.matched_envelopes++
    $report.same_identity_revision_envelopes++
   }else{Hold 'REPORT_ENVELOPE_NOT_IN_BOUNDED_WINDOW'}
   $ready=($dec.Count -gt 0 -and $dec[0].ready -ceq $true)
   if($ready){$report.pairs_ready++}
   if($report.representative.Count -lt 5){
    $report.representative+=@([ordered]@{
     age_minutes=[math]::Round(($ageNow-$f.LastWriteTimeUtc).TotalMinutes,1)
     event_ready=($e.ready_for_downstream_shadow -ceq $true)
     decision_same_revision=($dec.Count -gt 0)
     decision_ready=$ready
     envelope_same_revision=($env.Count -gt 0)
     event_item_count=if($null -ne $e.order){@($e.order.items).Count}else{0}
     event_blockers=@(SafeCodes @($e.blockers))
     decision_blockers=if($dec.Count){@(SafeCodes @($dec[0].blocking_reasons))}else{@()}
    })
   }
  }
 }catch{Hold 'READONLY_PAIR_INSPECTION_INCOMPLETE'}
}
# Even a complete matched event-decision-report chain is NOT five
# independent Delivery/Production/Plan/Identity/Item-observation sources.
Hold 'V68_FIVE_INDEPENDENT_SOURCES_NOT_ATTESTED'
if($report.event_blocked -gt 0 -or $report.pairs_ready -lt $report.sampled_events){
 Hold 'ACTUAL_READER_PAIR_HAS_BLOCKED_ORDERS'
}
$report.reason_codes=@($reasons|Sort-Object)
[pscustomobject]$report|ConvertTo-Json -Depth 9 -Compress

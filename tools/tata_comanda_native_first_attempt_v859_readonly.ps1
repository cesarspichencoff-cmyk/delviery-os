# TATA Comanda — single bounded native Reader + persisted sequence pulse.
# Strictly READ-ONLY; no SQL, GP, printer, spooler, service or filesystem writes.
# Only aggregate counts leave the host. Never echo identifiers or item/note texts.
[CmdletBinding()]
param([ValidateRange(1,25)][int]$SampleSize=20,
      [ValidateRange(1,100)][int]$DecisionBudget=60,
      [string]$CiFixtureRoot='')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$now=[DateTime]::UtcNow
$root='C:\ProgramData\TataComandaReader\state'
# Only GitHub-hosted synthetic tests can override the fixed production path.
# The normal store probe has no CLI-selectable arbitrary filesystem root.
if(-not [string]::IsNullOrWhiteSpace($CiFixtureRoot)){
 if($env:GITHUB_ACTIONS -cne 'true' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){
  throw 'CI_FIXTURE_OVERRIDE_NOT_ALLOWED'
 }
 $base=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar)
 $fixture=[IO.Path]::GetFullPath($CiFixtureRoot)
 if(-not $fixture.StartsWith($base+[IO.Path]::DirectorySeparatorChar,
    [StringComparison]::OrdinalIgnoreCase)){
  throw 'CI_FIXTURE_OUTSIDE_RUNNER_TEMP'
 }
 $root=$fixture
}
$reasons=[Collections.Generic.List[string]]::new()
function Flag([string]$reason) {
 if(-not $reasons.Contains($reason)){$reasons.Add($reason)}
}
function Json-Bounded([IO.FileInfo]$file){
 if($null -eq $file -or $file.Length -lt 2 -or $file.Length -gt 1048576){
  throw 'JSON_BYTES_LIMIT'
 }
 $raw=[IO.File]::ReadAllText($file.FullName,[Text.Encoding]::UTF8)
 # Preserve raw ISO timestamps in PowerShell versions that support DateKind.
 if((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')){
  return ($raw | ConvertFrom-Json -DateKind String -ErrorAction Stop)
 }
 return ($raw | ConvertFrom-Json -ErrorAction Stop)
}
function Recent-Files([string]$name,[int]$take){
 $dir=Join-Path $root $name
 if(-not(Test-Path -LiteralPath $dir -PathType Container)){throw 'DIR_MISSING'}
 return @(Get-ChildItem -LiteralPath $dir -File -Filter '*.json' -ErrorAction Stop |
  Sort-Object LastWriteTimeUtc -Descending | Select-Object -First $take)
}
function Equal-Safe([object]$a,[object]$b){
 return ([string]$a -ceq [string]$b)
}
function Valid-Quantity([object]$raw,[object]$qty){
 $s=[string]$raw
 if($s -cnotmatch '^(?:0*[1-9][0-9]*)(?:\.0+)?$'){return $false}
 try{
  $n=[decimal]::Parse($s,[Globalization.CultureInfo]::InvariantCulture)
  return ($n -gt 0 -and $n -le 999999 -and $n -eq [decimal]$qty)
 }catch{return $false}
}
function Basic-Content([object]$event,[object]$decision){
 try{
  $o=$event.order
  if($null -eq $o -or $null -eq $decision){return $false}
  if($o.IDORGCMDVENDA -cne 'DLV_IFO' -or $o.IDSTCOMANDA -cne 'A' -or
     ([string]$o.NRCOMANDAEXT) -cnotmatch '^[0-9]{1,12}$' -or
     $o.observation_scan_complete -cne $true -or
     $null -eq $o.observation_rows -or
     $decision.observation_scan_complete -cne $true -or
     $null -eq $decision.order_observations -or
     $null -eq $o.items -or $null -eq $decision.items){return $false}
  $raw=@($o.items);$lines=@($decision.items)
  if($raw.Count -eq 0 -or $raw.Count -gt 200 -or
     $raw.Count -ne $lines.Count){return $false}
  for($i=0;$i -lt $raw.Count;$i++){
   $r=$raw[$i];$d=$lines[$i]
   if($null -eq $r -or $null -eq $d -or
     $r.IDSTPRCOMVEN -cne 'A' -or
     $r.CDPRODUTO -cne $d.CDPRODUTO -or
     [int]$d.item_index -ne ($i+1) -or
     [string]::IsNullOrWhiteSpace([string]$d.product_name) -or
     [string]$d.product_name -ceq 'A DEFINIR' -or
     -not(Valid-Quantity $r.QTPRODCOMVEN $d.quantity) -or
     $null -eq $d.observations){return $false}
   $canonical=([string]$r.CDARVPROD -replace '\.','')
   if($canonical -cnotmatch '^[A-Za-z0-9]{10}$'){return $false}
   $canonicalFormatted=($canonical.Substring(0,1)+'.'+$canonical.Substring(1,2)+'.'+
    $canonical.Substring(3,2)+'.'+$canonical.Substring(5,3)+'.'+$canonical.Substring(8,2))
   if($canonicalFormatted -cne [string]$d.canonical_code){return $false}
  }
  return $true
 }catch{return $false}
}
# Compare all scanned source notes with the projected decision as a multiset.
# This proves event-to-decision parity only, NOT original SQL/source authenticity.
function Same-Notes([object[]]$expected,[object[]]$actual){
 if($expected.Count -ne $actual.Count){return $false}
 $counts=[Collections.Generic.Dictionary[string,int]]::new(
   [StringComparer]::Ordinal)
 foreach($note in $expected){
  if($null -eq $note -or $null -eq $note.source_field -or
     $null -eq $note.value){return $false}
  $f=[string]$note.source_field;$v=[string]$note.value
  if([string]::IsNullOrWhiteSpace($f)){return $false}
  $k=$f.Length.ToString([Globalization.CultureInfo]::InvariantCulture)+':'+
    $f+$v.Length.ToString([Globalization.CultureInfo]::InvariantCulture)+':'+$v
  if($counts.ContainsKey($k)){$counts[$k]++}else{$counts[$k]=1}
 }
 foreach($note in $actual){
  if($null -eq $note -or $null -eq $note.source_field -or
     $null -eq $note.value){return $false}
  $f=[string]$note.source_field;$v=[string]$note.value
  $k=$f.Length.ToString([Globalization.CultureInfo]::InvariantCulture)+':'+
    $f+$v.Length.ToString([Globalization.CultureInfo]::InvariantCulture)+':'+$v
  if(-not $counts.ContainsKey($k)){return $false}
  if($counts[$k] -eq 1){[void]$counts.Remove($k)}
  else{$counts[$k]--}
 }
 return ($counts.Count -eq 0)
}
function Note-Parity([object]$event,[object]$decision){
 try{
  $o=$event.order
  $rawItems=@($o.items);$decisionItems=@($decision.items)
  $rows=@($o.observation_rows)
  foreach($row in $rows){
   if($null -eq $row -or $row.join_proven -cne $true -or
      $null -eq $row.source_field -or $null -eq $row.value){
    return $false
   }
   if($row.scope_hint -ceq 'item'){
    $indexText=[string]$row.item_index
    if($indexText -cnotmatch '^(?:0|[1-9][0-9]{0,2})
 schema='tata.comanda.native-first-attempt.v859.readonly'
 status='INSPECTION_INCOMPLETE'
 observed_at_utc=$now.ToString('o')
 sample_limit=$SampleSize;decision_budget=$DecisionBudget
 scanned_events=0;last_event_age_minutes=$null
 unique_event_decision_pairs=0
 note_parity_verified_candidates=0
 note_parity_conflicts=0
 basic_essential_content_candidates=0
 paired_with_persisted_tata_sequence=0
 content_valid_but_sequence_missing=0
 sequence_scope_collisions=0
 sequence_state_status='UNKNOWN'
 sequence_bindings_total=$null
 unpaired_or_ambiguous=0
 incomplete_essential_content=0
 gp_receipt_proven=$false
 full_ifood_uuid_proven=$false
 event_snapshot_hash_independently_recomputed=$false
 print_paper_proven=$false
 source_authenticity_proven=$false
 printing_authorized=$false
 blocking_codes=@()
 effects=[ordered]@{
  sql=$false;network=$false;api=$false;ack=$false;print=$false
  spooler=$false;service_change=$false;sequence_write=$false
  file_write=$false;install=$false;deploy=$false;fiscal=$false
 }
 privacy=[ordered]@{
  order_ids_exported=$false;hashes_exported=$false;notes_exported=$false
  customer_exported=$false;file_paths_exported=$false
 }
}
try{
 if(-not [Environment]::OSVersion.Platform.ToString().Equals('Win32NT')){
  throw 'WINDOWS_HOST_REQUIRED'
 }
 $eventFiles=@(Recent-Files 'reader-events-v1' $SampleSize)
 $decFiles=@(Recent-Files 'reader-shadow-decisions-v1' $DecisionBudget)
 $decisions=@(foreach($file in $decFiles){
  try{Json-Bounded $file}catch{Flag 'DECISION_READ_UNAVAILABLE'}
 })
 $sequencePath=Join-Path $root 'tata-sequence-state.json'
 $sequence=$null
 if(Test-Path -LiteralPath $sequencePath -PathType Leaf){
  try{
   $f=Get-Item -LiteralPath $sequencePath -ErrorAction Stop
   $sequence=Json-Bounded $f
   if($sequence.schema -cne 'deliveryos.tata-sequence-state.v1' -or
      [int]$sequence.policy.width -ne 3 -or
      [int]$sequence.policy.min_value -ne 1 -or
      [int]$sequence.policy.max_value -ne 999 -or
      $null -eq $sequence.bindings){throw 'STATE_POLICY_INVALID'}
   $out.sequence_state_status='STRUCTURALLY_VALID_NOT_AUTHENTICATED'
   $out.sequence_bindings_total=@($sequence.bindings|Where-Object{$null -ne $_}).Count
  }catch{$sequence=$null;$out.sequence_state_status='INVALID_OR_UNREADABLE';
   Flag 'TATA_SEQUENCE_STATE_INVALID_OR_UNREADABLE'}
 }else{$out.sequence_state_status='ABSENT';Flag 'TATA_SEQUENCE_STATE_ABSENT'}
 if($eventFiles.Count -eq 0){Flag 'NO_READER_EVENTS_IN_DIRECTORY'}
 foreach($file in $eventFiles){
  $e=$null
  try{$e=Json-Bounded $file}catch{Flag 'EVENT_READ_UNAVAILABLE';continue}
  $out.scanned_events++
  $age=[math]::Round(($now-$file.LastWriteTimeUtc).TotalMinutes,1)
  if($null -eq $out.last_event_age_minutes){$out.last_event_age_minutes=$age}
  $k=[string]$e.order_key;$h=[string]$e.snapshot_hash
  if($k -cnotmatch '^[0-9]{4}\|[0-9]{2}\|[0-9]{1,12}\|[0-9]{1,12}$' -or
    $h -cnotmatch '^[0-9a-fA-F]{64}$'){
   $out.unpaired_or_ambiguous++;continue
  }
  $matches=@($decisions|Where-Object{$_ -and
    $_.order_key -ceq $k -and $_.snapshot_hash -ceq $h})
  if($matches.Count -ne 1){$out.unpaired_or_ambiguous++;continue}
  $d=$matches[0];$out.unique_event_decision_pairs++
  if($e.schema -cne 'deliveryos.tata-reader-stable-order-event.v1' -or
     $d.schema -cne 'deliveryos.live-shadow-decision.v1' -or
     $d.ifood_sequence -cne $e.order.NRCOMANDAEXT -or
     $d.teknisa_sequence -cne $e.order.NRCOMANDA -or
     -not(Basic-Content $e $d)){
    $out.incomplete_essential_content++;continue
  }
  if(-not (Note-Parity $e $d)){
   $out.note_parity_conflicts++
   $out.incomplete_essential_content++
   continue
  }
  $out.note_parity_verified_candidates++
  $out.basic_essential_content_candidates++
  if($null -eq $sequence){continue}
  $o=$e.order
  $sourceDate=$o.DTHRABERMESA
  if($sourceDate -is [datetime]){
   $day=$sourceDate.ToString('yyyy-MM-dd',
    [Globalization.CultureInfo]::InvariantCulture)
  }elseif($sourceDate -is [string] -and $sourceDate.Length -ge 10){
   $day=$sourceDate.Substring(0,10)
  }else{continue}
  if($day -cnotmatch '^\d{4}-\d{2}-\d{2}$'){continue}
  $scope='STORE:'+([string]$o.CDFILIAL)+'|DATE:'+$day
  $entries=@($sequence.bindings|Where-Object{$null -ne $_ -and
    $_.scope_id -ceq $scope})
  $own=@($entries|Where-Object{$_.teknisa_order_id -ceq $o.NRCOMANDA})
  if($own.Count -ne 1){
   $out.content_valid_but_sequence_missing++;continue
  }
  $bound=[string]$own[0].tata_sequence
  if($bound -cnotmatch '^\d{3}$' -or [int]$bound -eq 0 -or
     @($entries|Where-Object{$_.teknisa_order_id -cne $o.NRCOMANDA -and
      $_.tata_sequence -ceq $bound}).Count -gt 0){
   $out.sequence_scope_collisions++;continue
  }
  $out.paired_with_persisted_tata_sequence++
 }
 if($out.scanned_events -eq 0){Flag 'NO_READABLE_EVENTS'}
 if($out.basic_essential_content_candidates -eq 0){
  Flag 'NO_BASIC_ESSENTIAL_CANDIDATE_IN_SAMPLE'
 }
 if($out.note_parity_conflicts -gt 0){
  Flag 'ITEM_OR_ORDER_OBSERVATION_PARITY_FAILED'
 }
 if($out.content_valid_but_sequence_missing -gt 0){
  Flag 'EXISTING_TATA_BINDING_MISSING_FOR_SOME_ORDERS'
 }
 if($out.sequence_scope_collisions -gt 0){Flag 'SEQUENCE_COLLISION_IN_SAMPLE'}
 if($out.last_event_age_minutes -gt 60){Flag 'LATEST_READER_EVENT_STALE'}
 $out.status='READONLY_DIAGNOSTIC_ONLY'
}catch{
 Flag 'READONLY_INSPECTION_UNAVAILABLE'
 $out.status='INSPECTION_INCOMPLETE'
}
$out.blocking_codes=@($reasons|Sort-Object)
[pscustomobject]$out|ConvertTo-Json -Depth 6 -Compress
){return $false}
    $index=[int]$indexText
    if($index -ge $rawItems.Count -or
       [string]$row.CDPRODUTO -cne [string]$rawItems[$index].CDPRODUTO){
     return $false
    }
   }elseif($row.scope_hint -cne 'order'){return $false}
  }
  for($i=0;$i -lt $rawItems.Count;$i++){
   $expected=@($rows|Where-Object{
     $_.scope_hint -ceq 'item' -and [int]$_.item_index -eq $i
   })
   $actual=@($decisionItems[$i].observations)
   if(-not (Same-Notes -expected $expected -actual $actual)){return $false}
  }
  $orderExpected=@($rows|Where-Object{$_.scope_hint -ceq 'order'})
  $orderActual=@($decision.order_observations)
  return (Same-Notes -expected $orderExpected -actual $orderActual)
 }catch{return $false}
}
$out=[ordered]@{
 schema='tata.comanda.native-first-attempt.v859.readonly'
 status='INSPECTION_INCOMPLETE'
 observed_at_utc=$now.ToString('o')
 sample_limit=$SampleSize;decision_budget=$DecisionBudget
 scanned_events=0;last_event_age_minutes=$null
 unique_event_decision_pairs=0
 basic_essential_content_candidates=0
 paired_with_persisted_tata_sequence=0
 content_valid_but_sequence_missing=0
 sequence_scope_collisions=0
 sequence_state_status='UNKNOWN'
 sequence_bindings_total=$null
 unpaired_or_ambiguous=0
 incomplete_essential_content=0
 gp_receipt_proven=$false
 full_ifood_uuid_proven=$false
 event_snapshot_hash_independently_recomputed=$false
 print_paper_proven=$false
 source_authenticity_proven=$false
 printing_authorized=$false
 blocking_codes=@()
 effects=[ordered]@{
  sql=$false;network=$false;api=$false;ack=$false;print=$false
  spooler=$false;service_change=$false;sequence_write=$false
  file_write=$false;install=$false;deploy=$false;fiscal=$false
 }
 privacy=[ordered]@{
  order_ids_exported=$false;hashes_exported=$false;notes_exported=$false
  customer_exported=$false;file_paths_exported=$false
 }
}
try{
 if(-not [Environment]::OSVersion.Platform.ToString().Equals('Win32NT')){
  throw 'WINDOWS_HOST_REQUIRED'
 }
 $eventFiles=@(Recent-Files 'reader-events-v1' $SampleSize)
 $decFiles=@(Recent-Files 'reader-shadow-decisions-v1' $DecisionBudget)
 $decisions=@(foreach($file in $decFiles){
  try{Json-Bounded $file}catch{Flag 'DECISION_READ_UNAVAILABLE'}
 })
 $sequencePath=Join-Path $root 'tata-sequence-state.json'
 $sequence=$null
 if(Test-Path -LiteralPath $sequencePath -PathType Leaf){
  try{
   $f=Get-Item -LiteralPath $sequencePath -ErrorAction Stop
   $sequence=Json-Bounded $f
   if($sequence.schema -cne 'deliveryos.tata-sequence-state.v1' -or
      [int]$sequence.policy.width -ne 3 -or
      [int]$sequence.policy.min_value -ne 1 -or
      [int]$sequence.policy.max_value -ne 999 -or
      $null -eq $sequence.bindings){throw 'STATE_POLICY_INVALID'}
   $out.sequence_state_status='STRUCTURALLY_VALID_NOT_AUTHENTICATED'
   $out.sequence_bindings_total=@($sequence.bindings|Where-Object{$null -ne $_}).Count
  }catch{$sequence=$null;$out.sequence_state_status='INVALID_OR_UNREADABLE';
   Flag 'TATA_SEQUENCE_STATE_INVALID_OR_UNREADABLE'}
 }else{$out.sequence_state_status='ABSENT';Flag 'TATA_SEQUENCE_STATE_ABSENT'}
 if($eventFiles.Count -eq 0){Flag 'NO_READER_EVENTS_IN_DIRECTORY'}
 foreach($file in $eventFiles){
  $e=$null
  try{$e=Json-Bounded $file}catch{Flag 'EVENT_READ_UNAVAILABLE';continue}
  $out.scanned_events++
  $age=[math]::Round(($now-$file.LastWriteTimeUtc).TotalMinutes,1)
  if($null -eq $out.last_event_age_minutes){$out.last_event_age_minutes=$age}
  $k=[string]$e.order_key;$h=[string]$e.snapshot_hash
  if($k -cnotmatch '^[0-9]{4}\|[0-9]{2}\|[0-9]{1,12}\|[0-9]{1,12}$' -or
    $h -cnotmatch '^[0-9a-fA-F]{64}$'){
   $out.unpaired_or_ambiguous++;continue
  }
  $matches=@($decisions|Where-Object{$_ -and
    $_.order_key -ceq $k -and $_.snapshot_hash -ceq $h})
  if($matches.Count -ne 1){$out.unpaired_or_ambiguous++;continue}
  $d=$matches[0];$out.unique_event_decision_pairs++
  if($e.schema -cne 'deliveryos.tata-reader-stable-order-event.v1' -or
     $d.schema -cne 'deliveryos.live-shadow-decision.v1' -or
     $d.ifood_sequence -cne $e.order.NRCOMANDAEXT -or
     $d.teknisa_sequence -cne $e.order.NRCOMANDA -or
     -not(Basic-Content $e $d)){
    $out.incomplete_essential_content++;continue
  }
  $out.basic_essential_content_candidates++
  if($null -eq $sequence){continue}
  $o=$e.order
  $sourceDate=$o.DTHRABERMESA
  if($sourceDate -is [datetime]){
   $day=$sourceDate.ToString('yyyy-MM-dd',
    [Globalization.CultureInfo]::InvariantCulture)
  }elseif($sourceDate -is [string] -and $sourceDate.Length -ge 10){
   $day=$sourceDate.Substring(0,10)
  }else{continue}
  if($day -cnotmatch '^\d{4}-\d{2}-\d{2}$'){continue}
  $scope='STORE:'+([string]$o.CDFILIAL)+'|DATE:'+$day
  $entries=@($sequence.bindings|Where-Object{$null -ne $_ -and
    $_.scope_id -ceq $scope})
  $own=@($entries|Where-Object{$_.teknisa_order_id -ceq $o.NRCOMANDA})
  if($own.Count -ne 1){
   $out.content_valid_but_sequence_missing++;continue
  }
  $bound=[string]$own[0].tata_sequence
  if($bound -cnotmatch '^\d{3}$' -or [int]$bound -eq 0 -or
     @($entries|Where-Object{$_.teknisa_order_id -cne $o.NRCOMANDA -and
      $_.tata_sequence -ceq $bound}).Count -gt 0){
   $out.sequence_scope_collisions++;continue
  }
  $out.paired_with_persisted_tata_sequence++
 }
 if($out.scanned_events -eq 0){Flag 'NO_READABLE_EVENTS'}
 if($out.basic_essential_content_candidates -eq 0){
  Flag 'NO_BASIC_ESSENTIAL_CANDIDATE_IN_SAMPLE'
 }
 if($out.content_valid_but_sequence_missing -gt 0){
  Flag 'EXISTING_TATA_BINDING_MISSING_FOR_SOME_ORDERS'
 }
 if($out.sequence_scope_collisions -gt 0){Flag 'SEQUENCE_COLLISION_IN_SAMPLE'}
 if($out.last_event_age_minutes -gt 60){Flag 'LATEST_READER_EVENT_STALE'}
 $out.status='READONLY_DIAGNOSTIC_ONLY'
}catch{
 Flag 'READONLY_INSPECTION_UNAVAILABLE'
 $out.status='INSPECTION_INCOMPLETE'
}
$out.blocking_codes=@($reasons|Sort-Object)
[pscustomobject]$out|ConvertTo-Json -Depth 6 -Compress

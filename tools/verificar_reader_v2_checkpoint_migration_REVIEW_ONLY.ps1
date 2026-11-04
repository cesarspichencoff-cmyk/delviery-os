# Offline Foxxy fixture. Extracts and tests ONLY Load-Checkpoint's function AST.
# No Windows service, SQL, source event, real checkpoint, print or network action.
param(
 [string]$CandidatePath = (Join-Path $PSScriptRoot 'tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1')
)
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -eq 'CAIXA_MOOCA'){throw 'CASHIER_HOST_FORBIDDEN'}
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($CandidatePath,[ref]$tokens,[ref]$parseErrors)
if(@($parseErrors).Count -ne 0){
  $details = @($parseErrors | ForEach-Object {
    ([string]$_.Message+' at '+$_.Extent.StartLineNumber+':'+$_.Extent.StartColumnNumber)
  }) -join ' | '
  throw ('CANDIDATE_POWERSHELL_PARSE_ERROR_COUNT_'+@($parseErrors).Count+' '+$details)
}
$matches=@($ast.FindAll({
 param($node)
 $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
 $node.Name -eq 'Load-Checkpoint'
},$true))
if($matches.Count -ne 1){throw 'EXPECTED_EXACTLY_ONE_LOAD_CHECKPOINT'}
$func=[ScriptBlock]::Create($matches[0].Extent.Text)
. $func
$lab=Join-Path ([IO.Path]::GetTempPath()) ('reader-v2-hash-migration-lab-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($lab) | Out-Null
$CheckpointPath=Join-Path $lab 'checkpoint.json'
try {
  $checks=0
  function Write-Fixture($Value) {
    $Value | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $CheckpointPath -Encoding UTF8
  }
  function Expect-Blocked([string]$Expected) {
    $blocked=$false
    try { $null=Load-Checkpoint } catch {
      if($_.Exception.Message -cne $Expected) { throw }
      $blocked=$true
    }
    if(-not $blocked) { throw ('SHOULD_HAVE_BLOCKED_'+$Expected) }
  }
  $old=[ordered]@{schema='deliveryos.tata-reader-continuous-checkpoint.v1';bootstrap_complete=$true;entries=@(
    [ordered]@{order_key='LAB|01|LABSALE|LABCMD';snapshot_hash=('A'*64);
      emitted_hash=('A'*64);stable_count=4;last_seen_order_time='2026-11-03T18:30:00'}
  )}
  Write-Fixture $old
  Expect-Blocked 'CHECKPOINT_HASH_MIGRATION_REQUIRED';$checks++

  # Editing only the version is not a legitimate migration.
  $old.hash_contract_version='NODE_CANONICAL_JSON_SHA256_V1'
  Write-Fixture $old
  Expect-Blocked 'CHECKPOINT_ORIGIN_NOT_VERIFIED';$checks++

  $old.checkpoint_origin='FRESH_NODE_CANONICAL_V2'
  Write-Fixture $old
  Expect-Blocked 'CHECKPOINT_GENERATION_ID_INVALID';$checks++

  $old.checkpoint_generation=[Guid]::NewGuid().ToString('N')
  Write-Fixture $old
  Expect-Blocked 'CHECKPOINT_SNAPSHOT_HASH_NOT_CANONICAL';$checks++

  $old.entries[0].snapshot_hash=('a'*64)
  Write-Fixture $old
  Expect-Blocked 'CHECKPOINT_EMITTED_HASH_NOT_CANONICAL';$checks++

  # Shape acceptance below is NOT provenance, canonical digest validation,
  # real migration, or permission to run the Reader on a cashier.
  $old.entries[0].emitted_hash=('a'*64)
  Write-Fixture $old
  $single=Load-Checkpoint
  if($single.seen.Count -ne 1 -or $single.bootstrap_complete -ne $true) { throw 'SYNTHETIC_ENTRY_NOT_PRESERVED' }
  if($single.seen['LAB|01|LABSALE|LABCMD'].emitted_hash -cne ('a'*64)) { throw 'EMITTED_FINGERPRINT_LOST' }
  $checks++

  # Exercise exactly 250 fabricated previously-emitted records; same hashes
  # must survive the checkpoint loader without resetting them to null.
  $entries=@(for($i=0;$i -lt 250;$i++){
    $k=('LAB|01|SALE'+$i.ToString('D3')+'|CMD'+$i.ToString('D3'))
    $h=([string]($i+1)).PadLeft(64,'0')
    [ordered]@{order_key=$k;snapshot_hash=$h;emitted_hash=$h;
      stable_count=2;last_seen_order_time='2026-11-03T18:30:00'}
  })
  $old.entries=$entries
  Write-Fixture $old
  $many=Load-Checkpoint
  if($many.seen.Count -ne 250) { throw 'CHECKPOINT_250_KEYS_NOT_PRESERVED' }
  foreach($e in $entries) {
    $loaded=$many.seen[[string]$e.order_key]
    if($null -eq $loaded -or $loaded.snapshot_hash -cne $e.snapshot_hash -or
       $loaded.emitted_hash -cne $e.emitted_hash) { throw 'CHECKPOINT_250_FINGERPRINTS_NOT_PRESERVED' }
  }
  $checks++

  $entries[249].order_key=$entries[0].order_key
  Write-Fixture $old
  Expect-Blocked 'CHECKPOINT_DUPLICATE_ORDER_KEY';$checks++
  $entries[249].order_key='LAB|01|SALE249|CMD249'

  $old.entries=@($entries)+@([ordered]@{order_key='LAB|01|SALE250|CMD250';
    snapshot_hash=('f'*64);emitted_hash=('f'*64);stable_count=2;
    last_seen_order_time='2026-11-03T18:30:00'})
  Write-Fixture $old
  Expect-Blocked 'CHECKPOINT_ENTRY_COUNT_EXCEEDED';$checks++

  [IO.File]::Delete($CheckpointPath)
  $empty=Load-Checkpoint
  if($empty.bootstrap_complete -ne $false -or $empty.seen.Count -ne 0) { throw 'NEW_CHECKPOINT_BOOTSTRAP_UNSAFE' }
  if($empty.hash_contract_version -cne 'NODE_CANONICAL_JSON_SHA256_V1' -or
     $empty.checkpoint_origin -cne 'FRESH_NODE_CANONICAL_V2' -or
     [string]$empty.checkpoint_generation -cnotmatch '^[0-9a-f]{32}$') {
    throw 'NEW_EMPTY_CHECKPOINT_MISSING_ORIGIN_FIELDS'
  }
  $checks++
  if($checks -ne 10) { throw 'UNEXPECTED_TEST_COUNT' }
  Write-Output ('READER_V2_CHECKPOINT_MIGRATION_GATE_PASS '+$checks+'/'+$checks+' SYNTHETIC_ONLY_NO_MIGRATION')

}finally{
  if(Test-Path -LiteralPath $lab){Remove-Item -LiteralPath $lab -Recurse -Force}
}

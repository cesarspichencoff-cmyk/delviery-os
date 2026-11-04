# Offline Foxxy fixture. Extracts and tests ONLY Load-Checkpoint's function AST.
# No Windows service, SQL, source event, real checkpoint, print or network action.
param(
 [string]$CandidatePath = (Join-Path $PSScriptRoot 'tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1')
)
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -eq 'CAIXA_MOOCA'){throw 'CASHIER_HOST_FORBIDDEN'}
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($CandidatePath,[ref]$tokens,[ref]$parseErrors)
if(@($parseErrors).Count -ne 0){throw ('CANDIDATE_POWERSHELL_PARSE_ERROR_COUNT_'+@($parseErrors).Count)}
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
  $old=[ordered]@{schema='deliveryos.tata-reader-continuous-checkpoint.v1';bootstrap_complete=$true;entries=@(
    [ordered]@{order_key='LAB|01|LABSALE|LABCMD';snapshot_hash=('A'*64);
      emitted_hash=('A'*64);stable_count=4;last_seen_order_time='2026-11-03T18:30:00'}
  )}
  $old|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $CheckpointPath -Encoding UTF8
  $blocked=$false
  try{$null=Load-Checkpoint}catch{
    if($_.Exception.Message -cne 'CHECKPOINT_HASH_MIGRATION_REQUIRED'){throw}
    $blocked=$true
  }
  if(-not $blocked){throw 'LEGACY_CHECKPOINT_MIGRATION_NOT_BLOCKED'}
  $old.hash_contract_version='NODE_CANONICAL_JSON_SHA256_V1'
  $old|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $CheckpointPath -Encoding UTF8
  $good=Load-Checkpoint
  if($good.hash_contract_version -cne 'NODE_CANONICAL_JSON_SHA256_V1'){throw 'NEW_CONTRACT_NOT_READ'}
  if($good.seen.Count -ne 1){throw 'NEW_CHECKPOINT_LOST_KEY'}
  if($good.bootstrap_complete -ne $true){throw 'BOOTSTRAP_MISREAD'}
  [IO.File]::Delete($CheckpointPath)
  $empty=Load-Checkpoint
  if($empty.bootstrap_complete -ne $false){throw 'NEW_CHECKPOINT_BOOTSTRAP_UNSAFE'}
  if($empty.hash_contract_version -cne 'NODE_CANONICAL_JSON_SHA256_V1'){throw 'NEW_EMPTY_CONTRACT_MISSING'}
  Write-Output 'READER_V2_CHECKPOINT_MIGRATION_GATE_PASS 3/3 SYNTHETIC_ONLY'
}finally{
  if(Test-Path -LiteralPath $lab){Remove-Item -LiteralPath $lab -Recurse -Force}
}

# REVIEW ONLY Windows synthetic file lab; only extracts one candidate function.
# No installed Reader, SQL, cashier, real event, printers or service.
param([string]$CandidatePath=(Join-Path $PSScriptRoot 'tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1'))
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -eq 'CAIXA_MOOCA'){throw 'CASHIER_HOST_FORBIDDEN'}
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($CandidatePath,[ref]$tokens,[ref]$parseErrors)
if(@($parseErrors).Count -ne 0){throw 'CANDIDATE_PS_PARSE_FAILED'}
$matches=@($ast.FindAll({
 param($node)
 $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
 $node.Name -eq 'Assert-TataPersistedEventContentReview'
},$true))
if($matches.Count -ne 1){throw 'VERIFY_FUNCTION_NOT_UNIQUE'}
. ([ScriptBlock]::Create($matches[0].Extent.Text))
$rawSource=Get-Content -LiteralPath $CandidatePath -Raw -Encoding UTF8
if($rawSource -notmatch 'Assert-TataPersistedEventContentReview -Path \$eventPath -ExpectedEvent \$event'){
 throw 'CANDIDATE_NOT_WIRED_TO_EXISTING_FILE'
}
$root=Join-Path ([IO.Path]::GetTempPath()) ('tata-event-content-guard-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$file=Join-Path $root 'LABCMD1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json'
$SushiEmoji=[char]::ConvertFromUtf32(0x1F363)
function Expected {
 return [ordered]@{
  schema='deliveryos.tata-reader-stable-order-event.v1'
  order_key='0001|01|LABSALE1|LABCMD1'
  snapshot_hash=('a'*64)
  observed_at='2026-11-04T12:25:00-03:00'
  order=[ordered]@{
   CDFILIAL='0001';CDLOJA='01';NRVENDAREST='LABSALE1';NRCOMANDA='LABCMD1'
   NRCOMANDAEXT='1234';IDORGCMDVENDA='DLV_IFO';IDSTCOMANDA='3'
   DTHRABERMESA='2026-11-04T12:20:00.0000000'
   items=@([ordered]@{
    NRPRODCOMVEN='LINE1';CDPRODUTO='LABPROD1';CDARVPROD='9200001000'
    QTPRODCOMVEN='1.000';IDSTPRCOMVEN='4'
   })
   observation_scan_complete=$true
   observation_rows=@([ordered]@{
    source_field='DSOBSPEDDIGCMD';value="FICTICIO L'IMITADO $SushiEmoji"
    scope_hint='item';join_proven=$true;item_index=0;CDPRODUTO='LABPROD1'
   })
  }
  service_resolution=[ordered]@{
   service='LUNCH';evidence='HUMAN_CONFIRMED_RULE';source_ref='LAB'
   blockers=@()
  }
  ready_for_downstream_shadow=$true
  blockers=@()
  effects=[ordered]@{
   database_read=$true;database_write=$false;local_event_write=$true
   network_call=$false;odhen_write=$false;print=$false;spooler_write=$false
   fiscal_action=$false;sefaz_call=$false;cutover=$false
  }
 }
}
function Write-Fixture($Value){
 $json=ConvertTo-Json -InputObject $Value -Depth 20
 $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes($json)
 [IO.File]::WriteAllBytes($file,$bytes)
}
function Mutated {
 # Preserve native order-opening datetime as an original STRING on PS 5.1.
 # A JSON roundtrip would coerce it to DateTime and invalidate the test.
 return (Expected)
}
$expected=Expected
$passed=0
function Pass([string]$Label,[scriptblock]$Block){
 & $Block
 $script:passed++
 Write-Output ("PASS "+$Label)
}
function Expect-Hold([string]$ExpectedReason){
 $blocked=$false
 try{Assert-TataPersistedEventContentReview -Path $file -ExpectedEvent $expected|Out-Null}
 catch{
  if($_.Exception.Message -cne $ExpectedReason){throw}
  $blocked=$true
 }
 if(-not $blocked){throw ("EXPECTED_"+$ExpectedReason)}
}
try{
 Pass 'valid event with historical observed_at is accepted only as content match' {
  $v=Expected;$v.observed_at='2026-11-04T12:20:30-03:00'
  Write-Fixture $v
  if(-not (Assert-TataPersistedEventContentReview -Path $file -ExpectedEvent $expected)){
   throw 'VALID_EVENT_NOT_ACKNOWLEDGED'
  }
 }
 Pass 'content comparator never writes or normalizes existing bytes' {
  $bytesBefore=[IO.File]::ReadAllBytes($file)
  Assert-TataPersistedEventContentReview -Path $file -ExpectedEvent $expected|Out-Null
  $bytesAfter=[IO.File]::ReadAllBytes($file)
  if(-not ([Convert]::ToBase64String($bytesBefore) -ceq [Convert]::ToBase64String($bytesAfter))){
   throw 'EVENT_BYTES_MUTATED'
  }
 }
 Pass 'missing event not silently deduplicated'{
  [IO.File]::Delete($file);Expect-Hold 'EXISTING_EVENT_FILE_MISSING'
 }
 Pass 'truncated JSON rejected' {
  [IO.File]::WriteAllText($file,'{"schema":', (New-Object Text.UTF8Encoding($false)))
  Expect-Hold 'EXISTING_EVENT_FILE_UNREADABLE'
 }
 Pass 'blank bytes are not event' {
  [IO.File]::WriteAllText($file,'', (New-Object Text.UTF8Encoding($false)))
  Expect-Hold 'EXISTING_EVENT_FILE_UNSAFE_METADATA'
 }
 Pass 'UTF8 BOM refused because writer is explicitly BOM-free' {
  Write-Fixture (Expected)
  [byte[]]$payload=[IO.File]::ReadAllBytes($file)
  [IO.File]::WriteAllBytes($file,([byte[]]@(239,187,191)+$payload))
  Expect-Hold 'EXISTING_EVENT_FILE_UNREADABLE'
 }
 Pass 'malformed UTF8 rejected instead of replacement' {
  [IO.File]::WriteAllBytes($file,[byte[]]@(123,34,255,34,125))
  Expect-Hold 'EXISTING_EVENT_FILE_UNREADABLE'
 }
 Pass 'different original event identity rejected' {
  $v=Mutated;$v.order_key='0001|01|OTHER|LABCMD1'
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_IDENTITY_MISMATCH'
 }
 Pass 'different snapshot hash rejected' {
  $v=Mutated;$v.snapshot_hash=('b'*64)
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_IDENTITY_MISMATCH'
 }
 Pass 'different schema rejected' {
  $v=Mutated;$v.schema='other'
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_IDENTITY_MISMATCH'
 }
 Pass 'changed item rejected when filename stays same'{
  $v=Mutated;$v.order.items[0].CDPRODUTO='LABPROD2'
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_CONTENT_MISMATCH'
 }
 Pass 'changed apostrophe note rejected' {
  $v=Mutated;$v.order.observation_rows[0].value="FICTICIO L'ALTERADO $SushiEmoji"
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_CONTENT_MISMATCH'
 }
 Pass 'printing effect escalation rejected'{
  $v=Mutated;$v.effects.print=$true
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_CONTENT_MISMATCH'
 }
 Pass 'unexpected extra envelope field rejected'{
  $v=Mutated
  $v['extra']='inject'
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_CONTENT_MISMATCH'
 }
 Pass 'service metadata spoofing rejected'{
  $v=Mutated;$v.service_resolution.source_ref='FAKE'
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_CONTENT_MISMATCH'
 }
 Pass 'observation scan false cannot be accepted'{
  $v=Mutated;$v.order.observation_scan_complete=$false
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_CONTENT_MISMATCH'
 }
 Pass 'native opening datetime different precision is NOT date-normalized' {
  $v=Mutated;$v.order.DTHRABERMESA='2026-11-04T12:20:00.000'
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_CONTENT_MISMATCH'
 }
 Pass 'native opening datetime timezone form cannot silently change' {
  $v=Mutated;$v.order.DTHRABERMESA='2026-11-04T12:20:00.0000000Z'
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_FILE_CONTENT_MISMATCH'
 }
 Pass 'historical observed_at must match producer timestamp shape' {
  $v=Mutated;$v.observed_at='BAD_TIMESTAMP'
  Write-Fixture $v;Expect-Hold 'EXISTING_EVENT_OBSERVED_AT_INVALID'
 }
 Pass 'event file above cap refused' {
  [IO.File]::WriteAllBytes($file,(New-Object byte[] 4194305))
  Expect-Hold 'EXISTING_EVENT_FILE_UNSAFE_METADATA'
 }
 if($passed -ne 20){throw 'UNEXPECTED_CASE_COUNT'}
 Write-Output ('READER_EXISTING_EVENT_CONTENT_GATE_PASS '+$passed+'/'+$passed+' SYNTHETIC_ONLY NO_OPERATIONAL_EFFECTS')
} finally {
 if(Test-Path -LiteralPath $root){[IO.Directory]::Delete($root,$true)}
}

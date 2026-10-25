# V8.83 — preview-only Windows normalizer for a future read-only print source.
# It accepts synthetic fixtures ONLY on GitHub-hosted Windows RUNNER_TEMP.
# There is deliberately no live spooler, printer, service, event-log or network API.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$CiFixturePath
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

if($env:GITHUB_ACTIONS -cne 'true' -or
   [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP) -or
   [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
  throw 'V883_GITHUB_HOSTED_WINDOWS_FIXTURE_ONLY'
}
$base=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd(
  [IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
$fixture=[IO.Path]::GetFullPath($CiFixturePath)
if(-not $fixture.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){
  throw 'V883_FIXTURE_OUTSIDE_RUNNER_TEMP'
}
$file=Get-Item -LiteralPath $fixture -ErrorAction Stop
if($file.PSIsContainer -or $file.Length -lt 2 -or $file.Length -gt 65536){
  throw 'V883_FIXTURE_BYTES_INVALID'
}
$raw=[IO.File]::ReadAllText($file.FullName,[Text.Encoding]::UTF8)
if((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')){
  $inputObject=$raw|ConvertFrom-Json -DateKind String -ErrorAction Stop
}else{
  $inputObject=$raw|ConvertFrom-Json -ErrorAction Stop
}

function Exact-Keys([object]$value,[string[]]$expected){
  if($null -eq $value){return $false}
  $actual=@($value.PSObject.Properties.Name|Sort-Object)
  $wanted=@($expected|Sort-Object)
  return (@(Compare-Object -ReferenceObject $wanted -DifferenceObject $actual).Count -eq 0)
}
function Hex64([object]$value){return ([string]$value -cmatch '^[0-9a-f]{64}$')}
function Integer-Primitive([object]$value){
  if($null -eq $value){return $false}
  return @(
    [TypeCode]::Byte,[TypeCode]::SByte,[TypeCode]::Int16,[TypeCode]::UInt16,
    [TypeCode]::Int32,[TypeCode]::UInt32,[TypeCode]::Int64,[TypeCode]::UInt64
  ).Contains([Type]::GetTypeCode($value.GetType()))
}
function Canonical-Utc([object]$value){
  $text=[string]$value
  if($text -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'){
    throw 'V883_TIME_NOT_CANONICAL'
  }
  $styles=[Globalization.DateTimeStyles]::AssumeUniversal -bor
    [Globalization.DateTimeStyles]::AdjustToUniversal
  $parsed=[datetime]::ParseExact($text,'yyyy-MM-ddTHH:mm:ss.fffZ',
    [Globalization.CultureInfo]::InvariantCulture,$styles)
  return $parsed.ToString('yyyy-MM-ddTHH:mm:ss.fffZ',
    [Globalization.CultureInfo]::InvariantCulture)
}
function Add-Status([Collections.Generic.List[string]]$list,[string]$value){
  if(-not $list.Contains($value)){$list.Add($value)}
}

if(-not (Exact-Keys $inputObject @('schema','context','source')) -or
   $inputObject.schema -cne 'deliveryos.print-attempt-collector-fixture.v883'){
  throw 'V883_FIXTURE_ENVELOPE_INVALID'
}
$context=$inputObject.context
$source=$inputObject.source
if(-not (Exact-Keys $context @(
  'witness_instance_id','revision','store_id','order_binding_sha256',
  'intent_fingerprint','attempt_id','route_contract_sha256',
  'collector_instance_id','submitter_instance_id','observation_started_at',
  'observed_at','nonce'))){throw 'V883_CONTEXT_SHAPE_INVALID'}
if(-not (Exact-Keys $source @(
  'source_read_succeeded','expected_job_id','jobs','printer'))){
  throw 'V883_SOURCE_SHAPE_INVALID'
}
foreach($stringField in @(
  'witness_instance_id','store_id','order_binding_sha256','intent_fingerprint',
  'attempt_id','route_contract_sha256','collector_instance_id',
  'submitter_instance_id','observation_started_at','observed_at','nonce')){
  if($context.$stringField -isnot [string]){
    throw 'V883_CONTEXT_STRING_TYPE_INVALID'
  }
}
if([string]$context.witness_instance_id -cnotmatch '^witness:[a-z0-9._-]{8,96}$' -or
   [string]$context.collector_instance_id -cnotmatch '^collector:[a-z0-9._-]{8,96}$' -or
   [string]$context.submitter_instance_id -cnotmatch '^submitter:[a-z0-9._-]{8,96}$' -or
   [string]$context.attempt_id -cnotmatch '^attempt:[a-z0-9._-]{8,96}$' -or
   [string]$context.nonce -cnotmatch '^nonce:[a-z0-9_-]{16,96}$' -or
   [string]$context.store_id -cnotmatch '^[A-Z0-9][A-Z0-9 _.-]{0,63}$' -or
   -not (Hex64 $context.order_binding_sha256) -or
   -not (Hex64 $context.intent_fingerprint) -or
   -not (Hex64 $context.route_contract_sha256) -or
   [string]$context.collector_instance_id -ceq [string]$context.submitter_instance_id){
  throw 'V883_CONTEXT_IDENTITY_INVALID'
}
if(-not (Integer-Primitive $context.revision)){throw 'V883_REVISION_TYPE_INVALID'}
$revision=[int64]$context.revision
if($revision -lt 1 -or $revision -gt [int]::MaxValue){throw 'V883_REVISION_INVALID'}
$started=Canonical-Utc $context.observation_started_at
$observed=Canonical-Utc $context.observed_at
if([datetime]$started -gt [datetime]$observed){throw 'V883_TIME_ORDER_INVALID'}

if($source.source_read_succeeded -isnot [bool]){
  throw 'V883_SOURCE_BOOLEAN_INVALID'
}
$readSucceeded=[bool]$source.source_read_succeeded
if(-not (Integer-Primitive $source.expected_job_id)){
  throw 'V883_JOB_ID_TYPE_INVALID'
}
$expectedJobId=[int64]$source.expected_job_id
if($expectedJobId -lt 1 -or $expectedJobId -gt 999999999){
  throw 'V883_JOB_ID_INVALID'
}
if($source.jobs -isnot [array] -or @($source.jobs).Count -gt 256){
  throw 'V883_JOB_LIST_INVALID'
}
if(-not (Exact-Keys $source.printer @(
  'printer_status','detected_error_state','work_offline'))){
  throw 'V883_PRINTER_SHAPE_INVALID'
}
if($source.printer.work_offline -isnot [bool]){
  throw 'V883_PRINTER_BOOLEAN_INVALID'
}
if(-not (Integer-Primitive $source.printer.printer_status) -or
   -not (Integer-Primitive $source.printer.detected_error_state)){
  throw 'V883_PRINTER_CODE_TYPE_INVALID'
}
$printerStatusCode=[int64]$source.printer.printer_status
$printerErrorCode=[int64]$source.printer.detected_error_state
if($printerStatusCode -lt 0 -or $printerStatusCode -gt [int]::MaxValue -or
   $printerErrorCode -lt 0 -or $printerErrorCode -gt [int]::MaxValue){
  throw 'V883_PRINTER_CODE_RANGE_INVALID'
}

$safeJobs=[Collections.Generic.List[object]]::new()
$seenJobIds=[Collections.Generic.HashSet[int64]]::new()
foreach($job in @($source.jobs)){
  if(-not (Exact-Keys $job @('job_id','status_mask'))){throw 'V883_JOB_SHAPE_INVALID'}
  if(-not (Integer-Primitive $job.job_id) -or
     -not (Integer-Primitive $job.status_mask)){
    throw 'V883_JOB_VALUE_TYPE_INVALID'
  }
  $jobId=[int64]$job.job_id;$mask=[int64]$job.status_mask
  if($jobId -lt 1 -or $jobId -gt 999999999 -or $mask -lt 0 -or
     $mask -gt [int]::MaxValue){throw 'V883_JOB_VALUE_INVALID'}
  if(-not $seenJobIds.Add($jobId)){throw 'V883_DUPLICATE_JOB_ID'}
  $safeJobs.Add([ordered]@{job_id=$jobId;status_mask=$mask})
}
$matching=@($safeJobs|Where-Object{$_.job_id -eq $expectedJobId})

$jobStatuses=[Collections.Generic.List[string]]::new()
$printerStatuses=[Collections.Generic.List[string]]::new()
$jobExists=($readSucceeded -and $matching.Count -eq 1)
if($jobExists){
  $mask=[int64]$matching[0].status_mask
  foreach($mapping in @(
    @{bit=1;name='PAUSED'},@{bit=2;name='ERROR'},
    @{bit=4;name='DELETING'},@{bit=8;name='SPOOLING'},
    @{bit=16;name='PRINTING'},@{bit=32;name='OFFLINE'},
    @{bit=64;name='PAPER_OUT'},@{bit=128;name='PRINTED'},
    @{bit=256;name='DELETED'},@{bit=512;name='BLOCKED'},
    @{bit=1024;name='USER_INTERVENTION'},@{bit=2048;name='RESTARTED'},
    @{bit=4096;name='COMPLETE'},@{bit=8192;name='RETAINED'})){
    if(($mask -band [int64]$mapping.bit) -ne 0){Add-Status $jobStatuses $mapping.name}
  }
  if(($mask -band (-bnot [int64]16383)) -ne 0){
    Add-Status $jobStatuses 'UNRECOGNIZED_STATUS_MASK'
  }
}
if($readSucceeded){
  if([bool]$source.printer.work_offline){Add-Status $printerStatuses 'OFFLINE'}
  switch([int]$printerStatusCode){
    1 {Add-Status $printerStatuses 'UNRECOGNIZED_PRINTER_STATUS'}
    4 {Add-Status $printerStatuses 'PRINTING'}
    5 {Add-Status $printerStatuses 'WAITING'}
    6 {Add-Status $printerStatuses 'PAUSED'}
    7 {Add-Status $printerStatuses 'OFFLINE'}
    2 {Add-Status $printerStatuses 'SERVER_UNKNOWN'}
    3 {}
    default {Add-Status $printerStatuses 'UNRECOGNIZED_PRINTER_STATUS'}
  }
  switch([int]$printerErrorCode){
    0 {Add-Status $printerStatuses 'UNRECOGNIZED_DETECTED_ERROR_STATE'}
    1 {Add-Status $printerStatuses 'UNRECOGNIZED_DETECTED_ERROR_STATE'}
    2 {}
    3 {Add-Status $printerStatuses 'PAPER_PROBLEM'}
    4 {Add-Status $printerStatuses 'PAPER_OUT'}
    5 {Add-Status $printerStatuses 'UNRECOGNIZED_DETECTED_ERROR_STATE'}
    6 {Add-Status $printerStatuses 'UNRECOGNIZED_DETECTED_ERROR_STATE'}
    7 {Add-Status $printerStatuses 'DOOR_OPEN'}
    8 {Add-Status $printerStatuses 'PAPER_JAM'}
    9 {Add-Status $printerStatuses 'OFFLINE'}
    10 {Add-Status $printerStatuses 'USER_INTERVENTION'}
    11 {Add-Status $printerStatuses 'NOT_AVAILABLE'}
    default {Add-Status $printerStatuses 'UNRECOGNIZED_DETECTED_ERROR_STATE'}
  }
}
$jobStatusArray=@($jobStatuses|Sort-Object -Unique)
$printerStatusArray=@($printerStatuses|Sort-Object -Unique)
$safeSnapshot=[ordered]@{
  source_read_succeeded=$readSucceeded
  expected_job_id=$expectedJobId
  jobs=@($safeJobs|Sort-Object -Property job_id,status_mask)
  printer=[ordered]@{
    printer_status=[int]$printerStatusCode
    detected_error_state=[int]$printerErrorCode
    work_offline=[bool]$source.printer.work_offline
  }
}
$snapshotJson=$safeSnapshot|ConvertTo-Json -Depth 7 -Compress
$sha=[Security.Cryptography.SHA256]::Create()
try{
  $snapshotHash=[BitConverter]::ToString($sha.ComputeHash(
    [Text.Encoding]::UTF8.GetBytes($snapshotJson))).Replace('-','').ToLowerInvariant()
}finally{$sha.Dispose()}

$output=[ordered]@{
  schema='deliveryos.print-attempt-source-collector.v883.review-only'
  status='CANDIDATE_REQUIRES_EXTERNAL_V882_SIGNATURE_AND_TRUST'
  live_host_read_performed=$false
  fixture_only=$true
  signature_created=$false
  github_runner_identity_proven=$false
  collector_identity_effective_proven=$false
  collector_distinct_from_submitter_proven=$false
  independent_failure_domain_proven=$false
  physical_print_proven=$false
  proven_no_effect=$false
  fiscal_dispatch_ready=$false
  automatic_retry_allowed=$false
  authorize_print=$false
  authorize_reprint=$false
  unsigned_v882_candidate=[ordered]@{
    schema='deliveryos.print-attempt-source-witness.v882'
    witness_instance_id=[string]$context.witness_instance_id
    revision=$revision
    store_id=[string]$context.store_id
    order_binding_sha256=[string]$context.order_binding_sha256
    intent_fingerprint=[string]$context.intent_fingerprint
    attempt_id=[string]$context.attempt_id
    route_contract_sha256=[string]$context.route_contract_sha256
    collector_instance_id=[string]$context.collector_instance_id
    submitter_instance_id=[string]$context.submitter_instance_id
    source_channel='WINDOWS_SPOOLER_READONLY'
    source_read_succeeded=$readSucceeded
    source_snapshot_sha256=$snapshotHash
    observation_started_at=$started
    observed_at=$observed
    nonce=[string]$context.nonce
    spooler_observation=[ordered]@{
      job_exists=$jobExists
      submission_rejected_before_job_creation=$false
      job_statuses=$jobStatusArray
      printer_statuses=$printerStatusArray
    }
  }
  privacy=[ordered]@{
    document_titles_exported=$false
    account_names_exported=$false
    queue_names_exported=$false
    order_ids_exported=$false
    fixture_path_exported=$false
  }
  effects=[ordered]@{
    print=$false;reprint=$false;spooler_write=$false;printer_change=$false
    service_change=$false;file_write=$false;network=$false;fiscal=$false
    sequence_write=$false;install=$false;deploy=$false
  }
}
[pscustomobject]$output|ConvertTo-Json -Depth 10 -Compress

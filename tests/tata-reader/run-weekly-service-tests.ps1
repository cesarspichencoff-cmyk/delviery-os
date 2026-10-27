param([string]$ResolverPath,[string]$PolicyPath,[string]$ReceiptPath)
$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($ResolverPath,[ref]$tokens,[ref]$errors)
if(@($errors).Count){throw 'RESOLVER_PARSE_FAILED'}
$functions=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Read-ServiceState'},$true))
if($functions.Count -ne 1){throw 'EXACTLY_ONE_RESOLVER_REQUIRED'}
# Extract only the pure resolver, even when checking a complete candidate watcher.
. ([scriptblock]::Create($functions[0].Extent.Text))
$work=Join-Path ([IO.Path]::GetTempPath()) ('deliveryos-weekly-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work|Out-Null
New-Item -ItemType Directory -Path (Join-Path $work 'state'),(Join-Path $work 'bin')|Out-Null
$ServiceStatePath=Join-Path $work 'state\production-service-state.json'
$target=Join-Path $work 'bin\production-service-weekly-policy.json'
$original=Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8|ConvertFrom-Json
$original.host_name=$env:COMPUTERNAME
$script:passed=0
function Save-Policy($p){$p|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $target -Encoding UTF8}
function Check([string]$time,[string]$expected){
  $t=[datetime]::SpecifyKind([datetime]::ParseExact($time,'yyyy-MM-ddTHH:mm:ss',[Globalization.CultureInfo]::InvariantCulture),[DateTimeKind]::Unspecified)
  $r=Read-ServiceState $t
  if($expected -eq 'BLOCKED'){if($null -ne $r.service -or @($r.blockers).Count -eq 0){throw 'EXPECTED_BLOCKED'}}
  elseif($r.service -cne $expected -or @($r.blockers).Count -ne 0 -or $r.clock_inference_used -ne $false){throw ('EXPECTED_'+$expected)}
  $script:passed++
}
try {
  Save-Policy $original
  for($d=0;$d -lt 7;$d++){
    $day=([datetime]'2026-10-26').AddDays($d);$date=$day.ToString('yyyy-MM-dd');$weekend=$day.DayOfWeek -in @('Saturday','Sunday')
    Check ($date+'T10:59:59') 'BLOCKED';Check ($date+'T11:00:00') 'LUNCH'
    Check ($date+'T14:59:59') 'LUNCH'
    if($weekend){Check ($date+'T15:00:00') 'LUNCH';Check ($date+'T16:29:59') 'LUNCH'}
    else{Check ($date+'T15:00:00') 'BLOCKED';Check ($date+'T16:29:59') 'BLOCKED'}
    Check ($date+'T16:30:00') 'BLOCKED';Check ($date+'T17:59:59') 'BLOCKED'
    Check ($date+'T18:00:00') 'DINNER';Check ($date+'T22:59:59') 'DINNER';Check ($date+'T23:00:00') 'BLOCKED'
  }
  Check '2026-11-02T12:00:00' 'LUNCH';Check '2026-11-07T16:00:00' 'LUNCH'
  Check '2026-10-25T12:00:00' 'BLOCKED'
  foreach($field in @('host_name','unit_id','timezone','evidence','order_time_basis')){
    $p=Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8|ConvertFrom-Json;$p.host_name=$env:COMPUTERNAME
    $p.$field='INVALID';Save-Policy $p;Check '2026-10-26T12:00:00' 'BLOCKED'
  }
  $p=Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8|ConvertFrom-Json;$p.host_name=$env:COMPUTERNAME
  $p.week[1].day_of_week=0;Save-Policy $p;Check '2026-10-26T12:00:00' 'BLOCKED'
  $p=Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8|ConvertFrom-Json;$p.host_name=$env:COMPUTERNAME
  $p.week[1].windows[1].start='14:00';Save-Policy $p;Check '2026-10-26T12:00:00' 'BLOCKED'
  Set-Content -LiteralPath $target -Value '{' -Encoding UTF8;Check '2026-10-26T12:00:00' 'BLOCKED'
  Remove-Item -LiteralPath $target;Check '2026-10-26T12:00:00' 'BLOCKED'
  $result=[ordered]@{schema='deliveryos.weekly-service-tests.v1';passed=$script:passed;sql_executed=$false;source_state_changed=$false;resolver_sha256=(Get-FileHash -LiteralPath $ResolverPath).Hash;policy_sha256=(Get-FileHash -LiteralPath $PolicyPath).Hash}
  if($ReceiptPath){$result|ConvertTo-Json|Set-Content -LiteralPath $ReceiptPath -Encoding UTF8}
  $result|ConvertTo-Json
} finally {Remove-Item -LiteralPath $work -Recurse -Force}

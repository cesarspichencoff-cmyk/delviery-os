param(
  [Parameter(Mandatory=$true)][string]$AuthorizationId,
  [Parameter(Mandatory=$true)][string]$ExpectedHostSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedWatcherSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedConsumerSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedLoopSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedPackagingSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedAcademySha256,
  [Parameter(Mandatory=$true)][string]$ExpectedRoutingSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedPrinterMapSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedNonProductionSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedIdentityCacheSha256,
  [string]$InstallRoot="C:\ProgramData\TataComandaReader",
  [string]$ServiceName="TataComandaReader",
  [string]$StageRoot="C:\TATA\comanda-v1\cutover\shadow-v1"
)
$ErrorActionPreference="Stop"

$ExpectedAuthorizationId="CESAR-2026-10-05-LIVE-SHADOW-CONSUMER-CUTOVER-V1"
$ExpectedPrincipal="NT SERVICE\TataComandaReader"
$Bin=Join-Path $InstallRoot "bin"
$Shadow=Join-Path $InstallRoot "shadow"
$State=Join-Path $InstallRoot "state"
$Evidence=Join-Path $InstallRoot "evidence"
$Rollback=Join-Path $State "shadow-consumer-cutover-v1"
$Manifest=Join-Path $Rollback "manifest.json"
$HostDest=Join-Path $Bin "TataComandaReader.ContinuousService.exe"
$HostBackup=Join-Path $Rollback "TataComandaReader.ContinuousService.v1.exe"

function Sha([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant()}
function StopReader{
  $s=Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if($s -and $s.Status -ne "Stopped"){Stop-Service -Name $ServiceName -Force -ErrorAction Stop}
  for($i=0;$i -lt 60;$i++){ $s=Get-Service -Name $ServiceName -ErrorAction SilentlyContinue; if($s -and $s.Status -eq "Stopped"){return};Start-Sleep -Milliseconds 500}
  throw "SERVICE_STOP_TIMEOUT"
}
function RestoreV1{
  $errs=@()
  try{StopReader}catch{$errs+=("STOP:"+$_.Exception.Message)}
  try{
    if(-not(Test-Path -LiteralPath $HostBackup)){throw "HOST_V1_BACKUP_MISSING"}
    Copy-Item -LiteralPath $HostBackup -Destination $HostDest -Force
  }catch{$errs+=("HOST:"+$_.Exception.Message)}
  try{
    if(Test-Path -LiteralPath $Shadow){Remove-Item -LiteralPath $Shadow -Recurse -Force}
  }catch{$errs+=("SHADOW:"+$_.Exception.Message)}
  try{
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 4
    $s=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
    if([string]$s.State -ne "Running"){throw "V1_RESTART_FAILED"}
  }catch{$errs+=("RESTART:"+$_.Exception.Message)}
  return @($errs)
}

if($AuthorizationId -ne $ExpectedAuthorizationId){throw "AUTHORIZATION_ID_MISMATCH"}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw "NOT_ELEVATED"}

$stage=[ordered]@{
 host=Join-Path $StageRoot "TataComandaReader.ContinuousService.v2.exe"
 watcher=Join-Path $StageRoot "tata_reader_continuous_watch_candidate_v1.ps1"
 consumer=Join-Path $StageRoot "live_shadow_consumer_v1.cjs"
 loop=Join-Path $StageRoot "live_shadow_consumer_loop_v1.cjs"
 packaging=Join-Path $StageRoot "packaging-current.js"
 academy=Join-Path $StageRoot "app-data.json"
 routing=Join-Path $StageRoot "routing.json"
 printer=Join-Path $StageRoot "printer-map.json"
 nonprod=Join-Path $StageRoot "non-production.json"
 cache=Join-Path $StageRoot "product-identity-cache-v1.json"
}
$expected=[ordered]@{
 host=$ExpectedHostSha256;watcher=$ExpectedWatcherSha256;consumer=$ExpectedConsumerSha256;loop=$ExpectedLoopSha256;
 packaging=$ExpectedPackagingSha256;academy=$ExpectedAcademySha256;routing=$ExpectedRoutingSha256;printer=$ExpectedPrinterMapSha256;
 nonprod=$ExpectedNonProductionSha256;cache=$ExpectedIdentityCacheSha256
}
foreach($key in $stage.Keys){
  $p=[string]$stage[$key]
  if(-not(Test-Path -LiteralPath $p -PathType Leaf)){throw ("STAGE_MISSING:"+$key)}
  if((Sha $p) -ne ([string]$expected[$key]).ToUpperInvariant()){throw ("STAGE_HASH_MISMATCH:"+$key)}
}

$svc=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if($null -eq $svc){throw "SERVICE_NOT_FOUND"}
if([string]$svc.State -ne "Running"){throw ("SERVICE_NOT_RUNNING_BEFORE_CUTOVER:"+[string]$svc.State)}
if(-not [string]::Equals([string]$svc.StartName,$ExpectedPrincipal,[StringComparison]::OrdinalIgnoreCase)){throw "SERVICE_IDENTITY_MISMATCH"}

New-Item -ItemType Directory -Force -Path $Rollback|Out-Null
Copy-Item -LiteralPath $HostDest -Destination $HostBackup -Force
$manifestObj=[ordered]@{
 schema="deliveryos.live-shadow-cutover-rollback-manifest.v1"
 captured_at=(Get-Date).ToString("o")
 host_v1_sha256=Sha $HostBackup
 host_v2_sha256=Sha ([string]$stage.host)
 stage_hashes=$expected
}
$manifestObj|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $Manifest -Encoding UTF8

$result=[ordered]@{
 schema="deliveryos.live-shadow-cutover-result.v1"
 status="STARTED"
 rollback=[ordered]@{attempted=$false;complete=$false;errors=@()}
 effects=[ordered]@{database_write=$false;print=$false;spooler_write=$false;odhen_write=$false;fiscal_action=$false;sefaz_call=$false}
 error=$null
}

try{
  StopReader
  New-Item -ItemType Directory -Force -Path $Shadow|Out-Null
  $stateAcl=Get-Acl -LiteralPath $State
  Set-Acl -LiteralPath $Shadow -AclObject $stateAcl

  Copy-Item -LiteralPath ([string]$stage.host) -Destination $HostDest -Force
  Copy-Item -LiteralPath ([string]$stage.watcher) -Destination (Join-Path $Bin "tata_reader_continuous_watch_candidate_v1.ps1") -Force
  Copy-Item -LiteralPath ([string]$stage.consumer) -Destination (Join-Path $Shadow "live_shadow_consumer_v1.cjs") -Force
  Copy-Item -LiteralPath ([string]$stage.loop) -Destination (Join-Path $Shadow "live_shadow_consumer_loop_v1.cjs") -Force
  Copy-Item -LiteralPath ([string]$stage.packaging) -Destination (Join-Path $Shadow "packaging-current.js") -Force
  Copy-Item -LiteralPath ([string]$stage.academy) -Destination (Join-Path $Shadow "app-data.json") -Force
  Copy-Item -LiteralPath ([string]$stage.routing) -Destination (Join-Path $Shadow "routing.json") -Force
  Copy-Item -LiteralPath ([string]$stage.printer) -Destination (Join-Path $Shadow "printer-map.json") -Force
  Copy-Item -LiteralPath ([string]$stage.nonprod) -Destination (Join-Path $Shadow "non-production.json") -Force
  Copy-Item -LiteralPath ([string]$stage.cache) -Destination (Join-Path $Shadow "product-identity-cache-v1.json") -Force

  Start-Service -Name $ServiceName
  Start-Sleep -Seconds 6

  $post=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
  if([string]$post.State -ne "Running"){throw ("SERVICE_NOT_RUNNING:"+[string]$post.State)}

  $hostStatusPath=Join-Path $Evidence "continuous-host-status.json"
  $shadowStatusPath=Join-Path $Evidence "shadow-consumer-status.json"
  if(-not(Test-Path -LiteralPath $hostStatusPath)){throw "HOST_STATUS_MISSING"}
  if(-not(Test-Path -LiteralPath $shadowStatusPath)){throw "SHADOW_STATUS_MISSING"}
  $hs=Get-Content -LiteralPath $hostStatusPath -Raw -Encoding UTF8|ConvertFrom-Json
  $ss=Get-Content -LiteralPath $shadowStatusPath -Raw -Encoding UTF8|ConvertFrom-Json
  if($hs.schema -ne "deliveryos.tata-reader-continuous-host-status.v2" -or $hs.state -ne "RUNNING"){throw "HOST_V2_STATUS_INVALID"}
  if($ss.schema -ne "deliveryos.live-shadow-consumer-status.v1" -or $ss.state -ne "RUNNING"){throw "SHADOW_LOOP_STATUS_INVALID"}

  $decisionDir=Join-Path $State "reader-shadow-decisions-v1"
  $deadline=(Get-Date).AddSeconds(15)
  do{
    $decisions=@()
    if(Test-Path -LiteralPath $decisionDir){$decisions=@(Get-ChildItem -LiteralPath $decisionDir -File -Filter "*.decision.json")}
    if($decisions.Count -gt 0){break}
    Start-Sleep -Milliseconds 500
  }while((Get-Date)-lt $deadline)
  if($decisions.Count -lt 1){throw "NO_SHADOW_DECISION_OBSERVED"}

  $latest=$decisions|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 1
  $decision=Get-Content -LiteralPath $latest.FullName -Raw -Encoding UTF8|ConvertFrom-Json

  $result.status="LIVE_SHADOW_RUNNING_PROVEN"
  $result.host_status=$hs
  $result.shadow_status=$ss
  $result.latest_decision=[ordered]@{file=$latest.Name;ready=[bool]$decision.ready;fingerprint=[string]$decision.fingerprint;blockers=@($decision.blocking_reasons)}
}catch{
  $result.error=[string]$_.Exception.Message
  $result.rollback.attempted=$true
  $errs=RestoreV1
  $result.rollback.errors=@($errs)
  $result.rollback.complete=($errs.Count -eq 0)
  $result.status=if($result.rollback.complete){"CUTOVER_FAILED_ROLLBACK_COMPLETE"}else{"CUTOVER_FAILED_ROLLBACK_INCOMPLETE"}
}
$result|ConvertTo-Json -Depth 12
if($result.status -eq "CUTOVER_FAILED_ROLLBACK_INCOMPLETE"){exit 9}
if($result.status -eq "CUTOVER_FAILED_ROLLBACK_COMPLETE"){exit 7}
if($result.status -ne "LIVE_SHADOW_RUNNING_PROVEN"){exit 6}
exit 0

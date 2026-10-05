param(
  [string]$AuthorizationId = "CESAR-2026-10-05-TATA-READER-SHADOW-DEDUPE-V1"
)

$ErrorActionPreference = "Stop"
$ExpectedAuthorizationId = "CESAR-2026-10-05-TATA-READER-SHADOW-DEDUPE-V1"
$ExpectedServiceName = "TataComandaReader"
$ExpectedServicePrincipal = "NT SERVICE\TataComandaReader"
$ExpectedPreflightSha256 = "3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$AuthorizationFile = Join-Path $RepoRoot "data\tata_reader_shadow_dedupe_authorization_v1.json"
$SuccessMarkerFile = Join-Path $RepoRoot "data\tata_reader_shadow_dedupe_success_20261005_v1.json"
$DedupeSource = Join-Path $RepoRoot "tools\authorized\tata_reader_shadow_dedupe_v1.ps1"
$BundleVerifier = Join-Path $RepoRoot "tools\authorized\verificar_tata_reader_shadow_dedupe_bundle_v1.ps1"
$InputSource = Join-Path $RepoRoot "data\tata_reader_shadow_route_success_20261005_v1.json"

$InstallRoot = "C:\ProgramData\TataComandaReader"
$BinDirectory = Join-Path $InstallRoot "bin"
$InstalledScript = Join-Path $BinDirectory "tata_reader_least_privilege_preflight.ps1"
$InstalledInput = Join-Path $BinDirectory "shadow_route_input_v1.json"
$EvidenceDirectory = Join-Path $InstallRoot "evidence"
$StatePath = Join-Path $EvidenceDirectory "shadow-dedupe-proof-state-v1.json"
$ResultRoot = "C:\TATA\comanda-v1\saida\fase7-shadow-dedupe"

function Assert-Administrator {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "ADMINISTRATOR_REQUIRED"
  }
}
function Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant() }
function Wait-ServiceStopped {
  for($i=0;$i -lt 120;$i++){
    $s=Get-Service -Name $ExpectedServiceName -ErrorAction SilentlyContinue
    if($s -and $s.Status -eq "Stopped"){ return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}
function Run-OneCycle([string]$Label,[string]$CycleDir) {
  $startedUtc=(Get-Date).ToUniversalTime()
  Start-Service -Name $ExpectedServiceName

  $jsonPath=Join-Path $EvidenceDirectory "preflight.json"
  $exitPath=Join-Path $EvidenceDirectory "preflight.exitcode.txt"
  $identityPath=Join-Path $EvidenceDirectory "preflight.identity.txt"
  $stderrPath=Join-Path $EvidenceDirectory "preflight.stderr.txt"

  for($i=0;$i -lt 180;$i++){
    $freshJson=(Test-Path $jsonPath) -and ((Get-Item $jsonPath).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-2))
    $freshExit=(Test-Path $exitPath) -and ((Get-Item $exitPath).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-2))
    $freshIdentity=(Test-Path $identityPath) -and ((Get-Item $identityPath).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-2))
    if($freshJson -and $freshExit -and $freshIdentity){ break }
    Start-Sleep -Milliseconds 500
  }

  if(-not (Test-Path $jsonPath)){ throw ($Label+"_JSON_NOT_PRODUCED") }
  if(-not (Test-Path $exitPath)){ throw ($Label+"_EXITCODE_NOT_PRODUCED") }
  if(-not (Test-Path $identityPath)){ throw ($Label+"_IDENTITY_NOT_PRODUCED") }

  foreach($name in @("preflight.json","preflight.stderr.txt","preflight.exitcode.txt","preflight.identity.txt")){
    $p=Join-Path $EvidenceDirectory $name
    if(Test-Path $p){ Copy-Item $p -Destination (Join-Path $CycleDir ($Label+"-"+$name)) -Force }
  }

  $code=[int](Get-Content -LiteralPath $exitPath -Raw)
  $obj=Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

  foreach($name in @("preflight.json","preflight.stderr.txt","preflight.exitcode.txt","preflight.identity.txt")){
    $p=Join-Path $EvidenceDirectory $name
    if(Test-Path $p){ Remove-Item $p -Force }
  }

  if(-not (Wait-ServiceStopped)){ throw ($Label+"_SERVICE_DID_NOT_STOP") }

  return [ordered]@{
    label=$Label
    exit_code=$code
    result=$obj
  }
}

if($AuthorizationId -ne $ExpectedAuthorizationId){ throw "AUTHORIZATION_ID_MISMATCH" }
if(Test-Path $SuccessMarkerFile -PathType Leaf){ throw "DEDUPE_ALREADY_PROVEN_NO_RERUN" }
Assert-Administrator

if(-not (Test-Path $AuthorizationFile -PathType Leaf)){ throw "DEDUPE_AUTHORIZATION_FILE_MISSING" }
$auth=Get-Content $AuthorizationFile -Raw -Encoding UTF8 | ConvertFrom-Json
if(-not [bool]$auth.human_authorized){ throw "DEDUPE_HUMAN_AUTHORIZATION_FALSE" }
if($auth.authorization_id -ne $ExpectedAuthorizationId){ throw "DEDUPE_AUTHORIZATION_ID_FILE_MISMATCH" }

foreach($p in @($DedupeSource,$BundleVerifier,$InputSource)){
  if(-not (Test-Path $p -PathType Leaf)){ throw ("SOURCE_FILE_MISSING:"+$p) }
}
if((Hash $DedupeSource) -ne [string]$auth.dedupe_script.sha256){ throw "DEDUPE_SCRIPT_HASH_MISMATCH" }
if((Hash $PSCommandPath) -ne [string]$auth.runner.sha256){ throw "DEDUPE_RUNNER_HASH_MISMATCH" }
if((Hash $InputSource) -ne [string]$auth.input.sha256){ throw "DEDUPE_INPUT_HASH_MISMATCH" }

& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $BundleVerifier
if($LASTEXITCODE -ne 0){ throw ("DEDUPE_STATIC_VERIFIER_FAILED:"+$LASTEXITCODE) }

$svc=Get-CimInstance Win32_Service -Filter "Name='$ExpectedServiceName'"
if(-not $svc){ throw "READER_SERVICE_NOT_FOUND" }
if(-not [string]::Equals($svc.StartName,$ExpectedServicePrincipal,[System.StringComparison]::OrdinalIgnoreCase)){ throw "READER_SERVICE_ACCOUNT_MISMATCH" }
if(-not [string]::Equals($svc.StartMode,"Manual",[System.StringComparison]::OrdinalIgnoreCase)){ throw "READER_SERVICE_NOT_MANUAL" }
if((Get-Service $ExpectedServiceName).Status -ne "Stopped"){ throw "READER_SERVICE_NOT_STOPPED_BEFORE_DEDUPE" }
if((Hash $InstalledScript) -ne $ExpectedPreflightSha256){ throw "INSTALLED_PREFLIGHT_HASH_MISMATCH" }

$cycleId=(Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssfffZ")
$cycleDir=Join-Path $ResultRoot ("cycle-"+$cycleId)
New-Item -ItemType Directory -Path $cycleDir -Force | Out-Null

$backupPreflight=Join-Path $cycleDir "original-preflight.ps1"
Copy-Item $InstalledScript -Destination $backupPreflight -Force
if((Hash $backupPreflight) -ne $ExpectedPreflightSha256){ throw "PREFLIGHT_BACKUP_HASH_MISMATCH" }

$inputPrior=[ordered]@{existed=$false;hash=$null;backup=$null}
if(Test-Path $InstalledInput -PathType Leaf){
  $inputPrior.existed=$true
  $inputPrior.hash=Hash $InstalledInput
  $inputPrior.backup=Join-Path $cycleDir "previous-shadow_route_input_v1.json"
  Copy-Item $InstalledInput -Destination $inputPrior.backup -Force
}

$statePrior=[ordered]@{existed=$false;hash=$null;backup=$null}
if(Test-Path $StatePath -PathType Leaf){
  $statePrior.existed=$true
  $statePrior.hash=Hash $StatePath
  $statePrior.backup=Join-Path $cycleDir "previous-shadow-dedupe-proof-state-v1.json"
  Copy-Item $StatePath -Destination $statePrior.backup -Force
}

$evidenceNames=@("preflight.json","preflight.stderr.txt","preflight.exitcode.txt","preflight.identity.txt")
$previousEvidence=@{}
foreach($name in $evidenceNames){
  $p=Join-Path $EvidenceDirectory $name
  if(Test-Path $p){
    $backup=Join-Path $cycleDir ("previous-"+$name)
    Copy-Item $p -Destination $backup -Force
    $previousEvidence[$name]=[ordered]@{hash=Hash $p;backup=$backup}
    Remove-Item $p -Force
  }
}

$restoreOk=$false
$inputRestored=$false
$stateRestored=$false
$evidenceRestored=$false
$serviceStopped=$false
$run1=$null
$run2=$null
$failure=$null

try {
  Copy-Item $DedupeSource -Destination $InstalledScript -Force
  Copy-Item $InputSource -Destination $InstalledInput -Force
  if((Hash $InstalledScript) -ne [string]$auth.dedupe_script.sha256){ throw "INSTALLED_DEDUPE_SCRIPT_HASH_MISMATCH" }
  if((Hash $InstalledInput) -ne [string]$auth.input.sha256){ throw "INSTALLED_DEDUPE_INPUT_HASH_MISMATCH" }

  if(Test-Path $StatePath){ Remove-Item $StatePath -Force }

  $run1=Run-OneCycle "run1" $cycleDir
  if($run1.exit_code -ne 0){ throw ("RUN1_EXIT_"+$run1.exit_code) }
  if([string]$run1.result.status -ne "NEW_SHADOW_ORDER_RECORDED"){ throw ("RUN1_STATUS_"+[string]$run1.result.status) }
  if(-not [bool]$run1.result.effects.dedupe_state_write){ throw "RUN1_STATE_WRITE_FALSE" }
  if(-not (Test-Path $StatePath -PathType Leaf)){ throw "RUN1_STATE_NOT_PERSISTED" }

  $run2=Run-OneCycle "run2" $cycleDir
  if($run2.exit_code -ne 0){ throw ("RUN2_EXIT_"+$run2.exit_code) }
  if([string]$run2.result.status -ne "DUPLICATE_SHADOW_ORDER_NO_ACTION"){ throw ("RUN2_STATUS_"+[string]$run2.result.status) }
  if([bool]$run2.result.effects.dedupe_state_write){ throw "RUN2_STATE_WRITE_TRUE" }
  if(-not [string]::Equals([string]$run1.result.dedupe_key,[string]$run2.result.dedupe_key,[System.StringComparison]::OrdinalIgnoreCase)){ throw "DEDUPE_KEY_CHANGED" }
}
catch {
  $failure=[string]$_.Exception.Message
}
finally {
  try {
    if((Get-Service $ExpectedServiceName -ErrorAction SilentlyContinue).Status -ne "Stopped"){ Stop-Service $ExpectedServiceName -Force -ErrorAction SilentlyContinue }
    $serviceStopped=Wait-ServiceStopped
  } catch { $serviceStopped=$false }

  try {
    Copy-Item $backupPreflight -Destination $InstalledScript -Force
    $restoreOk=((Hash $InstalledScript) -eq $ExpectedPreflightSha256)
  } catch { $restoreOk=$false }

  try {
    if([bool]$inputPrior.existed){ Copy-Item $inputPrior.backup -Destination $InstalledInput -Force }
    else { if(Test-Path $InstalledInput){ Remove-Item $InstalledInput -Force } }
    $exists=Test-Path $InstalledInput
    $inputRestored=($exists -eq [bool]$inputPrior.existed)
    if($inputRestored -and [bool]$inputPrior.existed){ $inputRestored=((Hash $InstalledInput) -eq [string]$inputPrior.hash) }
  } catch { $inputRestored=$false }

  try {
    if([bool]$statePrior.existed){ Copy-Item $statePrior.backup -Destination $StatePath -Force }
    else { if(Test-Path $StatePath){ Remove-Item $StatePath -Force } }
    $exists=Test-Path $StatePath
    $stateRestored=($exists -eq [bool]$statePrior.existed)
    if($stateRestored -and [bool]$statePrior.existed){ $stateRestored=((Hash $StatePath) -eq [string]$statePrior.hash) }
  } catch { $stateRestored=$false }

  try {
    foreach($name in $evidenceNames){
      $live=Join-Path $EvidenceDirectory $name
      if(Test-Path $live){ Remove-Item $live -Force }
      if($previousEvidence.ContainsKey($name)){ Copy-Item $previousEvidence[$name].backup -Destination $live -Force }
    }
    $evidenceRestored=$true
    foreach($name in $evidenceNames){
      $live=Join-Path $EvidenceDirectory $name
      $expected=$previousEvidence.ContainsKey($name)
      $exists=Test-Path $live
      if($exists -ne $expected){$evidenceRestored=$false;break}
      if($expected -and (Hash $live) -ne [string]$previousEvidence[$name].hash){$evidenceRestored=$false;break}
    }
  } catch { $evidenceRestored=$false }
}

$status="DEDUPE_FAILED_RESTORE_UNKNOWN"
if($restoreOk -and $inputRestored -and $stateRestored -and $evidenceRestored -and $serviceStopped){
  if($null-ne$run1 -and $null-ne$run2 -and $failure -eq $null -and
     [string]$run1.result.status -eq "NEW_SHADOW_ORDER_RECORDED" -and
     [string]$run2.result.status -eq "DUPLICATE_SHADOW_ORDER_NO_ACTION" -and
     [string]$run1.result.dedupe_key -eq [string]$run2.result.dedupe_key){
    $status="PROVEN_REPLAY_DEDUPLICATION"
  } else {
    $status="DEDUPE_FAILED_RUNTIME_RESTORED"
  }
}

$summary=[ordered]@{
  schema="deliveryos.tata-reader-shadow-dedupe-cycle.v1"
  cycle_id=$cycleId
  status=$status
  authorization_id=$ExpectedAuthorizationId
  service_identity=$ExpectedServicePrincipal
  failure=$failure
  run1=$run1
  run2=$run2
  same_dedupe_key=if($null-ne$run1 -and $null-ne$run2){[string]$run1.result.dedupe_key -eq [string]$run2.result.dedupe_key}else{$false}
  runtime_restored=[bool]($restoreOk -and $inputRestored -and $stateRestored -and $evidenceRestored)
  preflight_script_restored=[bool]$restoreOk
  input_restored=[bool]$inputRestored
  state_restored=[bool]$stateRestored
  evidence_restored=[bool]$evidenceRestored
  service_stopped=[bool]$serviceStopped
  installed_preflight_sha256=if(Test-Path $InstalledScript){Hash $InstalledScript}else{$null}
  effect_boundary=[ordered]@{
    local_input_read=$true
    dedupe_state_write_during_proof=if($null-eq$run1){$false}else{[bool]$run1.result.effects.dedupe_state_write}
    database_read=$false
    database_write=$false
    permission_change=$false
    odhen_write=$false
    network_call=$false
    print=$false
    spooler_write=$false
    fiscal_action=$false
    sefaz_call=$false
    cutover=$false
  }
  evidence_directory=$cycleDir
}
$json=$summary|ConvertTo-Json -Depth 14
[System.IO.File]::WriteAllText((Join-Path $cycleDir "cycle-result.json"),$json,(New-Object System.Text.UTF8Encoding($false)))
$json

if($status -eq "PROVEN_REPLAY_DEDUPLICATION"){exit 0}
if($status -eq "DEDUPE_FAILED_RUNTIME_RESTORED"){exit 4}
exit 5

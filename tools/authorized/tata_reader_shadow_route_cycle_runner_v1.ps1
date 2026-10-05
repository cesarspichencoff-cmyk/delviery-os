param(
  [string]$AuthorizationId = "CESAR-2026-10-05-TATA-READER-SHADOW-ROUTE-V1"
)

$ErrorActionPreference = "Stop"
$ExpectedAuthorizationId = "CESAR-2026-10-05-TATA-READER-SHADOW-ROUTE-V1"
$ExpectedServiceName = "TataComandaReader"
$ExpectedServicePrincipal = "NT SERVICE\TataComandaReader"
$ExpectedPreflightSha256 = "3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$AuthorizationFile = Join-Path $RepoRoot "data\tata_reader_shadow_route_authorization_v1.json"
$SuccessMarkerFile = Join-Path $RepoRoot "data\tata_reader_shadow_route_success_20261005_v1.json"
$ShadowSource = Join-Path $RepoRoot "tools\authorized\tata_reader_real_order_shadow_route_v1.ps1"
$BundleVerifier = Join-Path $RepoRoot "tools\authorized\verificar_tata_reader_shadow_route_bundle_v1.ps1"
$RoutingSource = Join-Path $RepoRoot "data\odhen_product_routing_compact_v1.json"
$PrinterSource = Join-Path $RepoRoot "data\runtime_printer_map_v1.json"

$InstallRoot = "C:\ProgramData\TataComandaReader"
$BinDirectory = Join-Path $InstallRoot "bin"
$InstalledScript = Join-Path $BinDirectory "tata_reader_least_privilege_preflight.ps1"
$InstalledRouting = Join-Path $BinDirectory "odhen_product_routing_compact_v1.json"
$InstalledPrinter = Join-Path $BinDirectory "runtime_printer_map_v1.json"
$EvidenceDirectory = Join-Path $InstallRoot "evidence"
$ResultRoot = "C:\TATA\comanda-v1\saida\fase6-shadow-route"

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

if($AuthorizationId -ne $ExpectedAuthorizationId){ throw "AUTHORIZATION_ID_MISMATCH" }
if(Test-Path -LiteralPath $SuccessMarkerFile -PathType Leaf){ throw "SHADOW_ROUTE_ALREADY_PROVEN_NO_RERUN" }
Assert-Administrator

if(-not (Test-Path -LiteralPath $AuthorizationFile -PathType Leaf)){ throw "SHADOW_AUTHORIZATION_FILE_MISSING" }
$auth=Get-Content -LiteralPath $AuthorizationFile -Raw -Encoding UTF8 | ConvertFrom-Json
if(-not [bool]$auth.human_authorized){ throw "SHADOW_HUMAN_AUTHORIZATION_FALSE" }
if($auth.authorization_id -ne $ExpectedAuthorizationId){ throw "SHADOW_AUTHORIZATION_ID_FILE_MISMATCH" }

foreach($p in @($ShadowSource,$BundleVerifier,$RoutingSource,$PrinterSource)){
  if(-not (Test-Path -LiteralPath $p -PathType Leaf)){ throw ("SOURCE_FILE_MISSING:"+$p) }
}
if((Hash $ShadowSource) -ne [string]$auth.shadow_script.sha256){ throw "SHADOW_SCRIPT_HASH_MISMATCH" }
if((Hash $PSCommandPath) -ne [string]$auth.runner.sha256){ throw "SHADOW_RUNNER_HASH_MISMATCH" }
if((Hash $RoutingSource) -ne [string]$auth.routing.sha256){ throw "SHADOW_ROUTING_HASH_MISMATCH" }
if((Hash $PrinterSource) -ne [string]$auth.printer_map.sha256){ throw "SHADOW_PRINTER_MAP_HASH_MISMATCH" }

& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $BundleVerifier
if($LASTEXITCODE -ne 0){ throw ("SHADOW_STATIC_VERIFIER_FAILED:"+$LASTEXITCODE) }

$svc=Get-CimInstance -ClassName Win32_Service -Filter "Name='$ExpectedServiceName'"
if(-not $svc){ throw "READER_SERVICE_NOT_FOUND" }
if(-not [string]::Equals($svc.StartName,$ExpectedServicePrincipal,[System.StringComparison]::OrdinalIgnoreCase)){
  throw ("READER_SERVICE_ACCOUNT_MISMATCH:"+$svc.StartName)
}
if(-not [string]::Equals($svc.StartMode,"Manual",[System.StringComparison]::OrdinalIgnoreCase)){
  throw ("READER_SERVICE_NOT_MANUAL:"+$svc.StartMode)
}
if((Get-Service -Name $ExpectedServiceName).Status -ne "Stopped"){ throw "READER_SERVICE_NOT_STOPPED_BEFORE_SHADOW" }
if(-not (Test-Path -LiteralPath $InstalledScript -PathType Leaf)){ throw "INSTALLED_PREFLIGHT_MISSING" }
if((Hash $InstalledScript) -ne $ExpectedPreflightSha256){ throw "INSTALLED_PREFLIGHT_HASH_MISMATCH" }

$cycleId=(Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssfffZ")
$cycleDir=Join-Path $ResultRoot ("cycle-"+$cycleId)
New-Item -ItemType Directory -Path $cycleDir -Force | Out-Null
$backupPreflight=Join-Path $cycleDir "original-preflight.ps1"
Copy-Item -LiteralPath $InstalledScript -Destination $backupPreflight -Force
if((Hash $backupPreflight) -ne $ExpectedPreflightSha256){ throw "PREFLIGHT_BACKUP_HASH_MISMATCH" }

$configNames=@("odhen_product_routing_compact_v1.json","runtime_printer_map_v1.json")
$configPrior=@{}
foreach($name in $configNames){
  $installed=Join-Path $BinDirectory $name
  if(Test-Path -LiteralPath $installed -PathType Leaf){
    $backup=Join-Path $cycleDir ("previous-"+$name)
    Copy-Item -LiteralPath $installed -Destination $backup -Force
    $configPrior[$name]=[ordered]@{ existed=$true; hash=Hash $installed; backup=$backup }
  } else {
    $configPrior[$name]=[ordered]@{ existed=$false; hash=$null; backup=$null }
  }
}

$evidenceNames=@("preflight.json","preflight.stderr.txt","preflight.exitcode.txt","preflight.identity.txt")
$previousEvidenceNames=@()
$previousEvidenceHashes=@{}
foreach($name in $evidenceNames){
  $p=Join-Path $EvidenceDirectory $name
  if(Test-Path -LiteralPath $p){
    $previousEvidenceNames += $name
    $previousEvidenceHashes[$name] = Hash $p
    Copy-Item -LiteralPath $p -Destination (Join-Path $cycleDir ("previous-"+$name)) -Force
    Remove-Item -LiteralPath $p -Force
  }
}

$startedUtc=(Get-Date).ToUniversalTime()
$restoreOk=$false
$evidenceRestored=$false
$configRestored=$false
$serviceStopped=$false
$shadowResult=$null
$childExitCode=$null
$failure=$null

try {
  Copy-Item -LiteralPath $ShadowSource -Destination $InstalledScript -Force
  Copy-Item -LiteralPath $RoutingSource -Destination $InstalledRouting -Force
  Copy-Item -LiteralPath $PrinterSource -Destination $InstalledPrinter -Force

  if((Hash $InstalledScript) -ne [string]$auth.shadow_script.sha256){ throw "INSTALLED_SHADOW_SCRIPT_HASH_MISMATCH" }
  if((Hash $InstalledRouting) -ne [string]$auth.routing.sha256){ throw "INSTALLED_ROUTING_HASH_MISMATCH" }
  if((Hash $InstalledPrinter) -ne [string]$auth.printer_map.sha256){ throw "INSTALLED_PRINTER_HASH_MISMATCH" }

  Start-Service -Name $ExpectedServiceName

  $jsonPath=Join-Path $EvidenceDirectory "preflight.json"
  $exitPath=Join-Path $EvidenceDirectory "preflight.exitcode.txt"
  $identityPath=Join-Path $EvidenceDirectory "preflight.identity.txt"
  for($i=0;$i -lt 180;$i++){
    $freshJson=(Test-Path -LiteralPath $jsonPath) -and ((Get-Item $jsonPath).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-2))
    $freshExit=(Test-Path -LiteralPath $exitPath) -and ((Get-Item $exitPath).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-2))
    $freshIdentity=(Test-Path -LiteralPath $identityPath) -and ((Get-Item $identityPath).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-2))
    if($freshJson -and $freshExit -and $freshIdentity){ break }
    Start-Sleep -Milliseconds 500
  }

  if(-not (Test-Path $jsonPath)){ throw "SHADOW_JSON_NOT_PRODUCED" }
  if(-not (Test-Path $exitPath)){ throw "SHADOW_EXITCODE_NOT_PRODUCED" }
  if(-not (Test-Path $identityPath)){ throw "SHADOW_IDENTITY_NOT_PRODUCED" }

  foreach($name in $evidenceNames){
    $p=Join-Path $EvidenceDirectory $name
    if(Test-Path $p){ Copy-Item $p -Destination (Join-Path $cycleDir $name) -Force }
  }

  $childExitCode=[int](Get-Content -LiteralPath $exitPath -Raw)
  $shadowResult=Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
catch {
  $failure=[string]$_.Exception.Message
}
finally {
  try {
    if((Get-Service -Name $ExpectedServiceName -ErrorAction SilentlyContinue).Status -ne "Stopped"){
      Stop-Service -Name $ExpectedServiceName -Force -ErrorAction SilentlyContinue
    }
    $serviceStopped=Wait-ServiceStopped
  } catch { $serviceStopped=$false }

  try {
    Copy-Item -LiteralPath $backupPreflight -Destination $InstalledScript -Force
    $restoreOk=((Hash $InstalledScript) -eq $ExpectedPreflightSha256)
  } catch { $restoreOk=$false }

  try {
    foreach($name in $configNames){
      $installed=Join-Path $BinDirectory $name
      $prior=$configPrior[$name]
      if([bool]$prior.existed){
        Copy-Item -LiteralPath ([string]$prior.backup) -Destination $installed -Force
      } else {
        if(Test-Path -LiteralPath $installed){ Remove-Item -LiteralPath $installed -Force }
      }
    }
    $configRestored=$true
    foreach($name in $configNames){
      $installed=Join-Path $BinDirectory $name
      $prior=$configPrior[$name]
      $exists=Test-Path -LiteralPath $installed
      if($exists -ne [bool]$prior.existed){ $configRestored=$false; break }
      if([bool]$prior.existed -and (Hash $installed) -ne [string]$prior.hash){ $configRestored=$false; break }
    }
  } catch { $configRestored=$false }

  try {
    foreach($name in $evidenceNames){
      $live=Join-Path $EvidenceDirectory $name
      if(Test-Path $live){ Remove-Item $live -Force }
    }
    foreach($name in $previousEvidenceNames){
      $saved=Join-Path $cycleDir ("previous-"+$name)
      $live=Join-Path $EvidenceDirectory $name
      Copy-Item $saved -Destination $live -Force
    }
    $evidenceRestored=$true
    foreach($name in $evidenceNames){
      $live=Join-Path $EvidenceDirectory $name
      $shouldExist=($previousEvidenceNames -contains $name)
      $exists=Test-Path $live
      if($exists -ne $shouldExist){ $evidenceRestored=$false; break }
      if($shouldExist -and (Hash $live) -ne [string]$previousEvidenceHashes[$name]){ $evidenceRestored=$false; break }
    }
  } catch { $evidenceRestored=$false }
}

$status="SHADOW_FAILED_RESTORE_UNKNOWN"
if($restoreOk -and $evidenceRestored -and $configRestored -and $serviceStopped){
  if($null -ne $shadowResult -and $childExitCode -eq 0 -and [string]$shadowResult.status -eq "PROVEN_REAL_ORDER_SHADOW_ROUTE"){
    $status="PROVEN_REAL_ORDER_SHADOW_ROUTE"
  } else {
    $status="SHADOW_FAILED_RUNTIME_RESTORED"
  }
}

$summary=[ordered]@{
  schema="deliveryos.tata-reader-shadow-route-cycle.v1"
  cycle_id=$cycleId
  status=$status
  authorization_id=$ExpectedAuthorizationId
  service_identity=$ExpectedServicePrincipal
  child_exit_code=$childExitCode
  shadow_status=if($null-eq$shadowResult){$null}else{[string]$shadowResult.status}
  failure=$failure
  runtime_restored=[bool]($restoreOk -and $evidenceRestored -and $configRestored)
  preflight_script_restored=[bool]$restoreOk
  evidence_restored=[bool]$evidenceRestored
  config_restored=[bool]$configRestored
  service_stopped=[bool]$serviceStopped
  installed_preflight_sha256=if(Test-Path $InstalledScript){Hash $InstalledScript}else{$null}
  shadow_result=$shadowResult
  effect_boundary=[ordered]@{
    order_row_read=if($null-eq$shadowResult){$false}else{[bool]$shadowResult.effects.order_row_read}
    database_write=$false
    permission_change=$false
    odhen_write=$false
    print=$false
    spooler_write=$false
    fiscal_action=$false
    sefaz_call=$false
    danfe_print=$false
    cutover=$false
  }
  evidence_directory=$cycleDir
}
$json=$summary|ConvertTo-Json -Depth 14
[System.IO.File]::WriteAllText((Join-Path $cycleDir "cycle-result.json"),$json,(New-Object System.Text.UTF8Encoding($false)))
$json

if($status -eq "PROVEN_REAL_ORDER_SHADOW_ROUTE"){exit 0}
if($status -eq "SHADOW_FAILED_RUNTIME_RESTORED"){exit 4}
exit 5

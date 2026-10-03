param(
  [string]$AuthorizationId = "CESAR-2026-10-03-TATA-READER-REAL-READ-V1"
)

$ErrorActionPreference = "Stop"

$ExpectedAuthorizationId = "CESAR-2026-10-03-TATA-READER-REAL-READ-V1"
$ExpectedServiceName = "TataComandaReader"
$ExpectedServicePrincipal = "NT SERVICE\TataComandaReader"
$ExpectedPreflightSha256 = "3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$AuthorizationFile = Join-Path $RepoRoot "data\tata_reader_real_read_authorization_v1.json"
$ReadScriptSource = Join-Path $RepoRoot "tools\authorized\tata_reader_real_order_read_v1.ps1"
$BundleVerifier = Join-Path $RepoRoot "tools\authorized\verificar_tata_reader_real_read_bundle_v1.ps1"

$InstallRoot = "C:\ProgramData\TataComandaReader"
$InstalledScript = Join-Path $InstallRoot "bin\tata_reader_least_privilege_preflight.ps1"
$EvidenceDirectory = Join-Path $InstallRoot "evidence"
$ResultRoot = "C:\TATA\comanda-v1\saida\fase4-real-read"

function Assert-Administrator {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "ADMINISTRATOR_REQUIRED"
  }
}

function Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Wait-ServiceStopped {
  for($i=0;$i -lt 60;$i++){
    $s=Get-Service -Name $ExpectedServiceName -ErrorAction SilentlyContinue
    if($s -and $s.Status -eq "Stopped"){ return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

if($AuthorizationId -ne $ExpectedAuthorizationId){ throw "AUTHORIZATION_ID_MISMATCH" }
Assert-Administrator

if(-not (Test-Path -LiteralPath $AuthorizationFile -PathType Leaf)){ throw "REAL_READ_AUTHORIZATION_FILE_MISSING" }
$auth=Get-Content -LiteralPath $AuthorizationFile -Raw -Encoding UTF8 | ConvertFrom-Json
if(-not [bool]$auth.human_authorized){ throw "REAL_READ_HUMAN_AUTHORIZATION_FALSE" }
if($auth.authorization_id -ne $ExpectedAuthorizationId){ throw "REAL_READ_AUTHORIZATION_ID_FILE_MISMATCH" }

if(-not (Test-Path -LiteralPath $ReadScriptSource -PathType Leaf)){ throw "REAL_READ_SCRIPT_SOURCE_MISSING" }
if((Hash $ReadScriptSource) -ne [string]$auth.read_script_sha256){ throw "REAL_READ_SCRIPT_HASH_MISMATCH" }

& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $BundleVerifier
if($LASTEXITCODE -ne 0){ throw ("REAL_READ_STATIC_VERIFIER_FAILED:"+$LASTEXITCODE) }

$svc=Get-CimInstance -ClassName Win32_Service -Filter "Name='$ExpectedServiceName'"
if(-not $svc){ throw "READER_SERVICE_NOT_FOUND" }
if(-not [string]::Equals($svc.StartName,$ExpectedServicePrincipal,[System.StringComparison]::OrdinalIgnoreCase)){
  throw ("READER_SERVICE_ACCOUNT_MISMATCH:"+$svc.StartName)
}
if(-not [string]::Equals($svc.StartMode,"Manual",[System.StringComparison]::OrdinalIgnoreCase)){
  throw ("READER_SERVICE_NOT_MANUAL:"+$svc.StartMode)
}
if((Get-Service -Name $ExpectedServiceName).Status -ne "Stopped"){ throw "READER_SERVICE_NOT_STOPPED_BEFORE_PROOF" }
if(-not (Test-Path -LiteralPath $InstalledScript -PathType Leaf)){ throw "INSTALLED_PREFLIGHT_MISSING" }
if((Hash $InstalledScript) -ne $ExpectedPreflightSha256){ throw "INSTALLED_PREFLIGHT_HASH_MISMATCH" }

$cycleId=(Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssfffZ")
$cycleDir=Join-Path $ResultRoot ("cycle-"+$cycleId)
New-Item -ItemType Directory -Path $cycleDir -Force | Out-Null
$backupPath=Join-Path $cycleDir "original-preflight.ps1"
Copy-Item -LiteralPath $InstalledScript -Destination $backupPath -Force | Out-Null
if((Hash $backupPath) -ne $ExpectedPreflightSha256){ throw "PREFLIGHT_BACKUP_HASH_MISMATCH" }

$evidenceNames=@("preflight.json","preflight.stderr.txt","preflight.exitcode.txt","preflight.identity.txt")
foreach($name in $evidenceNames){
  $p=Join-Path $EvidenceDirectory $name
  if(Test-Path -LiteralPath $p){
    Copy-Item -LiteralPath $p -Destination (Join-Path $cycleDir ("previous-"+$name)) -Force | Out-Null
    Remove-Item -LiteralPath $p -Force
  }
}

$startedUtc=(Get-Date).ToUniversalTime()
$restoreOk=$false
$serviceStopped=$false
$readResult=$null
$childExitCode=$null
$failure=$null

try {
  Copy-Item -LiteralPath $ReadScriptSource -Destination $InstalledScript -Force | Out-Null
  if((Hash $InstalledScript) -ne [string]$auth.read_script_sha256){ throw "INSTALLED_REAL_READ_SCRIPT_HASH_MISMATCH" }

  Start-Service -Name $ExpectedServiceName

  $jsonPath=Join-Path $EvidenceDirectory "preflight.json"
  $exitPath=Join-Path $EvidenceDirectory "preflight.exitcode.txt"
  $identityPath=Join-Path $EvidenceDirectory "preflight.identity.txt"
  $stderrPath=Join-Path $EvidenceDirectory "preflight.stderr.txt"

  for($i=0;$i -lt 180;$i++){
    $freshJson=(Test-Path -LiteralPath $jsonPath) -and ((Get-Item -LiteralPath $jsonPath).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-2))
    $freshExit=(Test-Path -LiteralPath $exitPath) -and ((Get-Item -LiteralPath $exitPath).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-2))
    $freshIdentity=(Test-Path -LiteralPath $identityPath) -and ((Get-Item -LiteralPath $identityPath).LastWriteTimeUtc -ge $startedUtc.AddSeconds(-2))
    if($freshJson -and $freshExit -and $freshIdentity){ break }
    Start-Sleep -Milliseconds 500
  }

  if(-not (Test-Path -LiteralPath $jsonPath)){ throw "REAL_READ_JSON_NOT_PRODUCED" }
  if(-not (Test-Path -LiteralPath $exitPath)){ throw "REAL_READ_EXITCODE_NOT_PRODUCED" }
  if(-not (Test-Path -LiteralPath $identityPath)){ throw "REAL_READ_IDENTITY_NOT_PRODUCED" }

  foreach($name in $evidenceNames){
    $p=Join-Path $EvidenceDirectory $name
    if(Test-Path -LiteralPath $p){
      Copy-Item -LiteralPath $p -Destination (Join-Path $cycleDir $name) -Force | Out-Null
    }
  }

  $childExitCode=[int](Get-Content -LiteralPath $exitPath -Raw)
  $readResult=Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
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
    Copy-Item -LiteralPath $backupPath -Destination $InstalledScript -Force | Out-Null
    $restoreOk=((Hash $InstalledScript) -eq $ExpectedPreflightSha256)
  } catch { $restoreOk=$false }
}

$status="READ_PROOF_FAILED_RESTORE_UNKNOWN"
if($restoreOk -and $serviceStopped){
  if($null -ne $readResult -and $childExitCode -eq 0 -and [string]$readResult.status -eq "PROVEN_MINIMIZED_REAL_ORDER_READ"){
    $status="PROVEN_MINIMIZED_REAL_ORDER_READ"
  } else {
    $status="READ_PROOF_FAILED_RUNTIME_RESTORED"
  }
}

$summary=[ordered]@{
  schema="deliveryos.tata-reader-real-read-cycle.v1"
  cycle_id=$cycleId
  status=$status
  authorization_id=$ExpectedAuthorizationId
  service_identity=$ExpectedServicePrincipal
  child_exit_code=$childExitCode
  read_status=if($null -eq $readResult){$null}else{[string]$readResult.status}
  failure=$failure
  runtime_restored=[bool]$restoreOk
  service_stopped=[bool]$serviceStopped
  installed_preflight_sha256=if(Test-Path -LiteralPath $InstalledScript){Hash $InstalledScript}else{$null}
  read_result=$readResult
  effect_boundary=[ordered]@{
    order_row_read=if($null -eq $readResult){$false}else{[bool]$readResult.effects.order_row_read}
    database_write=$false
    odhen_write=$false
    print=$false
    fiscal_action=$false
    sefaz_call=$false
    danfe_print=$false
    cutover=$false
  }
  evidence_directory=$cycleDir
}

$json=$summary|ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText((Join-Path $cycleDir "cycle-result.json"),$json,(New-Object System.Text.UTF8Encoding($false)))
$json

if($status -eq "PROVEN_MINIMIZED_REAL_ORDER_READ"){exit 0}
if($status -eq "READ_PROOF_FAILED_RUNTIME_RESTORED"){exit 4}
exit 5

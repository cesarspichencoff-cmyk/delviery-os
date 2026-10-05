param(
  [Parameter(Mandatory=$true)]
  [string]$AuthorizationId,

  [string]$InstallRoot = "C:\ProgramData\TataComandaReader",
  [string]$ServiceName = "TataComandaReader"
)

$ErrorActionPreference="Stop"

$ExpectedAuthorizationId="CESAR-2026-10-05-CONTINUOUS-READER-HOSTSLOT-ROLLBACK-V1"
$ExpectedOriginalPreflightSha="3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035"
$BinDir=Join-Path $InstallRoot "bin"
$StateDir=Join-Path $InstallRoot "state"
$RollbackDir=Join-Path $StateDir "hostslot-cutover-v1"
$ManifestPath=Join-Path $RollbackDir "manifest.json"
$PreflightPath=Join-Path $BinDir "tata_reader_least_privilege_preflight.ps1"
$ReaderDest=Join-Path $BinDir "tata_reader_continuous_watch_candidate_v1.ps1"
$EntrypointDest=Join-Path $BinDir "tata_reader_continuous_service_entrypoint_v1.ps1"

function Get-Sha256([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()}

if($AuthorizationId -ne $ExpectedAuthorizationId){throw "AUTHORIZATION_ID_MISMATCH"}
if(-not(Test-Path -LiteralPath $ManifestPath -PathType Leaf)){throw "ROLLBACK_MANIFEST_MISSING"}

$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw "NOT_ELEVATED"}

$m=Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8|ConvertFrom-Json
if($m.schema -ne "deliveryos.tata-reader-hostslot-cutover-rollback-manifest.v1"){throw "ROLLBACK_MANIFEST_SCHEMA_MISMATCH"}

$errors=@()
try{
  $s=Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if($s -and $s.Status -ne "Stopped"){Stop-Service -Name $ServiceName -Force -ErrorAction Stop}
}catch{$errors+=("STOP:"+$_.Exception.Message)}

try{
  $backup=[string]$m.original_preflight.backup_path
  if(-not(Test-Path -LiteralPath $backup -PathType Leaf)){throw "BACKUP_PREFLIGHT_MISSING"}
  if((Get-Sha256 $backup) -ne $ExpectedOriginalPreflightSha){throw "BACKUP_PREFLIGHT_HASH_MISMATCH"}
  Copy-Item -LiteralPath $backup -Destination $PreflightPath -Force
  if((Get-Sha256 $PreflightPath) -ne $ExpectedOriginalPreflightSha){throw "PREFLIGHT_RESTORE_HASH_MISMATCH"}
}catch{$errors+=("PREFLIGHT:"+$_.Exception.Message)}

try{
  if(Test-Path -LiteralPath $ReaderDest){Remove-Item -LiteralPath $ReaderDest -Force}
  if(Test-Path -LiteralPath $EntrypointDest){Remove-Item -LiteralPath $EntrypointDest -Force}
}catch{$errors+=("FILES:"+$_.Exception.Message)}

$svc=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
$restored=(
  $errors.Count -eq 0 -and
  [string]$svc.State -eq "Stopped" -and
  [string]$svc.PathName -eq [string]$m.service.path_name -and
  [string]$svc.StartName -eq [string]$m.service.start_name -and
  (Get-Sha256 $PreflightPath) -eq $ExpectedOriginalPreflightSha
)

[ordered]@{
 schema="deliveryos.tata-reader-hostslot-rollback-result.v1"
 status=if($restored){"ROLLBACK_COMPLETE"}else{"ROLLBACK_INCOMPLETE"}
 restored=$restored
 completed_at=(Get-Date).ToString("o")
 service=[ordered]@{state=[string]$svc.State;path_name=[string]$svc.PathName;start_name=[string]$svc.StartName;start_mode=[string]$svc.StartMode}
 preflight_sha256=if(Test-Path -LiteralPath $PreflightPath){Get-Sha256 $PreflightPath}else{$null}
 errors=@($errors)
 effects=[ordered]@{service_stop=$true;preflight_restore=$true;candidate_files_remove=$true;database_write=$false;print=$false;spooler_write=$false;odhen_write=$false;fiscal_action=$false;sefaz_call=$false}
}|ConvertTo-Json -Depth 10

if(-not $restored){exit 8}
exit 0

param(
 [Parameter(Mandatory=$true)][string]$AuthorizationId,
 [string]$InstallRoot="C:\ProgramData\TataComandaReader",
 [string]$ServiceName="TataComandaReader"
)
$ErrorActionPreference="Stop"
$ExpectedAuthorizationId="CESAR-2026-10-05-CONTINUOUS-READER-DEDICATED-HOST-ROLLBACK-V1"
$ExpectedOriginalPreflightSha="3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035"
$BinDir=Join-Path $InstallRoot "bin"
$StateDir=Join-Path $InstallRoot "state"
$ManifestPath=Join-Path $StateDir "dedicated-host-cutover-v1\manifest.json"
$Preflight=Join-Path $BinDir "tata_reader_least_privilege_preflight.ps1"
$Host=Join-Path $BinDir "TataComandaReader.ContinuousService.exe"
$Reader=Join-Path $BinDir "tata_reader_continuous_watch_candidate_v1.ps1"
$Entrypoint=Join-Path $BinDir "tata_reader_continuous_service_entrypoint_v1.ps1"
function Sha([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant()}
if($AuthorizationId -ne $ExpectedAuthorizationId){throw "AUTHORIZATION_ID_MISMATCH"}
$m=Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8|ConvertFrom-Json
if($m.schema -ne "deliveryos.tata-reader-dedicated-host-rollback-manifest.v1"){throw "MANIFEST_SCHEMA_MISMATCH"}
$errors=@()
try{$s=Get-Service -Name $ServiceName;if($s.Status -ne "Stopped"){Stop-Service -Name $ServiceName -Force -ErrorAction Stop}}catch{$errors+=("STOP:"+$_.Exception.Message)}
try{
 & sc.exe config $ServiceName binPath= ([string]$m.original_service.path_name)|Out-Null
 if($LASTEXITCODE -ne 0){throw "BINPATH_RESTORE_FAILED"}
}catch{$errors+=("BINPATH:"+$_.Exception.Message)}
try{
 $backup=[string]$m.original_preflight.backup_path
 if((Sha $backup) -ne $ExpectedOriginalPreflightSha){throw "BACKUP_HASH_MISMATCH"}
 Copy-Item -LiteralPath $backup -Destination $Preflight -Force
 if((Sha $Preflight) -ne $ExpectedOriginalPreflightSha){throw "PREFLIGHT_HASH_MISMATCH"}
}catch{$errors+=("PREFLIGHT:"+$_.Exception.Message)}
try{foreach($p in @($Host,$Reader,$Entrypoint)){if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}}catch{$errors+=("FILES:"+$_.Exception.Message)}
$svc=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
$ok=($errors.Count -eq 0 -and [string]$svc.State -eq "Stopped" -and [string]$svc.PathName -eq [string]$m.original_service.path_name -and [string]$svc.StartName -eq [string]$m.original_service.start_name -and (Sha $Preflight) -eq $ExpectedOriginalPreflightSha)
[ordered]@{schema="deliveryos.tata-reader-dedicated-host-rollback-result.v1";status=if($ok){"ROLLBACK_COMPLETE"}else{"ROLLBACK_INCOMPLETE"};restored=$ok;errors=@($errors);service=[ordered]@{state=[string]$svc.State;path_name=[string]$svc.PathName;start_name=[string]$svc.StartName};preflight_sha256=if(Test-Path $Preflight){Sha $Preflight}else{$null};effects=[ordered]@{database_write=$false;print=$false;fiscal_action=$false}}|ConvertTo-Json -Depth 8
if(-not $ok){exit 8}

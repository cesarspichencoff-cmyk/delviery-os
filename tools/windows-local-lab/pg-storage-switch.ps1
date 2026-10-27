$ErrorActionPreference='Stop'
$r=$PSScriptRoot;$node='C:\Program Files\nodejs\node.exe'
function Node-Control([string]$mode){& $node (Join-Path $r 'pg-storage-switch.cjs') $mode;if($LASTEXITCODE -ne 0){throw ('PG_CONTROL_FAILED_'+$mode)}}
function Stop-KnownPilot {
  $file=Join-Path $r 'runtime-pids.json';$record=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pilot)";$at=(Get-Item -LiteralPath $file).LastWriteTime
  if(!$p){return}
  if($p.ExecutablePath -cne $node -or $p.CommandLine -notlike '*dist/tools/entregas_pilot_server.js*' -or
     $p.CreationDate -gt $at.AddSeconds(3) -or $p.CreationDate -lt $at.AddSeconds(-20)){throw 'PILOT_IDENTITY_MISMATCH'}
  Stop-Process -Id $p.ProcessId
  for($i=0;$i -lt 30;$i++){if(!(Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue)){return};Start-Sleep -Milliseconds 100}
  throw 'PILOT_DID_NOT_STOP'
}
function Start-OwnPilot {
  & $node (Join-Path $r 'remote-pilot.cjs') start;if($LASTEXITCODE -ne 0){throw 'PILOT_START_FAILED'}
  for($i=0;$i -lt 30;$i++){
    try{$h=Invoke-RestMethod -Uri 'http://100.107.78.202:5193/api/health' -TimeoutSec 2;if($h.ok){return}}catch{}
    Start-Sleep -Milliseconds 300
  };throw 'PILOT_HEALTH_FAILED'
}
Node-Control 'prepare'
$backup=Join-Path $r ('pg-storage-backup-'+[datetime]::UtcNow.ToString('yyyyMMddTHHmmssfff'))
New-Item -ItemType Directory -Path $backup|Out-Null
foreach($n in @('store.json','ready_orders.json')){Copy-Item -LiteralPath (Join-Path $r ('data\pilot\'+$n)) -Destination (Join-Path $backup $n)}
$stopped=$false
try {
  Stop-KnownPilot;$stopped=$true;Node-Control 'apply';Start-OwnPilot
  Node-Control 'probe-begin';Stop-KnownPilot;Start-OwnPilot;Node-Control 'probe-finish'
  'PG_STORAGE_SWITCH_AND_PERSISTENCE_PASS: isolated simulated legacy console; native receipt sync disabled'
}catch{
  if($stopped){
    # This check refuses fallback after any unexported target data appeared.
    Stop-KnownPilot
    try {Node-Control 'rollback-check'} catch {Start-OwnPilot;throw 'FILE_FALLBACK_REFUSED_TARGET_PRESERVED'}
    Start-OwnPilot
  }
  throw
}

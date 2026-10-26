param([ValidateSet('Remote','Local')][string]$Mode='Remote')
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$node='C:\Program Files\nodejs\node.exe'
$launcher=Join-Path $root 'remote-pilot.cjs'
& $node $launcher check
if ($LASTEXITCODE -ne 0) {throw 'Configuration preflight failed'}
$recordPath=Join-Path $root 'runtime-pids.json'
$record=Get-Content $recordPath -Raw | ConvertFrom-Json
$process=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pilot)"
$recordedAt=(Get-Item $recordPath).LastWriteTime
if (!$process -or $process.ExecutablePath -ne $node -or
    $process.CommandLine -notlike '*dist/tools/entregas_pilot_server.js*' -or
    $process.CreationDate -gt $recordedAt.AddSeconds(3) -or
    $process.CreationDate -lt $recordedAt.AddSeconds(-20)) {throw 'Recorded pilot identity/creation time mismatch'}
# Preserve an exact PID record before touching the single test pilot process.
Copy-Item $recordPath (Join-Path $root ("runtime-pids.before-switch-"+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'.json'))
Stop-Process -Id $record.pilot
Wait-Process -Id $record.pilot -Timeout 10 -ErrorAction SilentlyContinue
$command=if ($Mode -eq 'Remote') {'start'} else {'start-local'}
& $node $launcher $command
if ($LASTEXITCODE -ne 0) {throw 'Pilot launcher failed'}
$address=if ($Mode -eq 'Remote') {'100.107.78.202'} else {'127.0.0.1'}
$ok=$false
for($attempt=0;$attempt -lt 10;$attempt++) {
  try {
    $r=Invoke-WebRequest -UseBasicParsing -Uri "http://${address}:5193/api/health" -TimeoutSec 2
    if ($r.StatusCode -eq 200) {$ok=$true;break}
  } catch {Start-Sleep -Milliseconds 300}
}
if (!$ok) {throw 'Pilot health failed; inbound must remain blocked'}
"PILOT_SWITCH_PASS: $Mode; platform/database untouched"

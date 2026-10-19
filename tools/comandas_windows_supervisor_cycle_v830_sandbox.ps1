# V8.30 — hosted Windows, actual benign child processes, synthetic supervisor
# orchestration + exact V8.20/V8.22 guards. NEVER deploy, touch SQL or print.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if (-not $IsWindows -or $env:GITHUB_ACTIONS -cne 'true' -or
    $env:RUNNER_ENVIRONMENT -cne 'github-hosted') {throw 'HOSTED_WINDOWS_ONLY'}
$base=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
$root=Join-Path $base ('v830-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $root -ErrorAction Stop
if(-not ([IO.Path]::GetFullPath($root)+'\').StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'OUTSIDE_RUNNER_TEMP'}
$shell=Join-Path $PSHOME 'pwsh.exe'
if(-not(Test-Path -LiteralPath $shell -PathType Leaf)){throw 'PWSH_ABSENT'}
$source=@'
const a=require("./tools/comandas_supervisor_guard_v820_offline.cjs");
const b=require("./tools/comandas_supervisor_prelaunch_v822_offline.cjs");
if(a.SOURCE_SHA!=="2B6DC012918F317C8D244531B3CCB2FD33E33B226C6E6E668BEE4B698936BEF5")process.exit(1);
if(a.FUNCTION.length!==20||a.INVOCATION.length!==7||b.INJECT.length!==6)process.exit(2);
process.stdout.write(JSON.stringify({func:a.FUNCTION.join("\n"),startup:a.INVOCATION.join("\n"),
prelaunch:b.INJECT.join("\n")}));
'@
$raw=@(& node --eval $source)
if($LASTEXITCODE -ne 0 -or $raw.Count -ne 1){throw 'EXACT_GUARD_SOURCE_UNAVAILABLE'}
$guard=$raw[0]|ConvertFrom-Json
if(-not $guard.func.Contains('Get-CimInstance') -or
   -not $guard.startup.Contains('CUTOVER_QUIESCENCE_NOT_PROVEN') -or
   -not $guard.prelaunch.Contains('CUTOVER_PRELAUNCH_NOT_QUIET')){throw 'GUARD_PROVENANCE_INVALID'}
$worker=@'
param([string]$Root,[ValidateSet("NORMAL","CRASH_AFTER_SPAWN")][string]$Mode="NORMAL")
Set-StrictMode -Version Latest
$ErrorActionPreference="Stop"
$lockFile=Join-Path $Root "supervisor.lock"
$record=Join-Path $Root "child.json"
$watcher=Join-Path $Root "harmless-watcher.ps1"
$marker=Join-Path $Root "watcher-starts.txt"
$script:owned=$null
$lock=$null
function Stop-Fatal([string]$Code){
 Write-Output ('SUPERVISOR_SYNTHETIC_FATAL:'+ $Code)
 exit 78
}
__EXACT_FUNCTION__
try{
 try{
  $lock=[IO.File]::Open($lockFile,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 }catch{
  Write-Output 'SYNTHETIC_LOCK_BUSY'
  exit 75
 }
 if([IO.File]::Exists($record)){
  try{$r=Get-Content -LiteralPath $record -Raw |ConvertFrom-Json}catch{Stop-Fatal 'CHILD_RECORD_UNREADABLE'}
  $child=$null
  try{$child=Get-Process -Id ([int]$r.pid) -ErrorAction Stop}catch{}
  if($null -ne $child){
   try{
    $actual=$child.StartTime.ToUniversalTime()
    $expected=[datetime]::Parse([string]$r.start_utc).ToUniversalTime()
    if([Math]::Abs(($actual-$expected).TotalSeconds) -le 1){
      Write-Output 'SYNTHETIC_ORPHAN_ACTIVE'
      exit 79
    }
   }catch{Stop-Fatal 'CHILD_IDENTITY_UNKNOWN'}
  }
  [IO.File]::Delete($record)
 }
__EXACT_STARTUP__
 $psi=[Diagnostics.ProcessStartInfo]::new()
 $psi.FileName=(Join-Path $PSHOME 'pwsh.exe')
 $psi.Arguments='-NoLogo -NoProfile -NonInteractive -File "'+$watcher+'" -Root "'+$Root+'"'
 $psi.UseShellExecute=$false
 $psi.CreateNoWindow=$true
__EXACT_PRELAUNCH__
 $script:owned=[Diagnostics.Process]::Start($psi)
 if($null -eq $script:owned){Stop-Fatal 'CHILD_START_FAILED'}
 $rec=[ordered]@{
  pid=$script:owned.Id
  start_utc=$script:owned.StartTime.ToUniversalTime().ToString('o')
  schema='v830.synthetic-child-record'
 }
 $rec|ConvertTo-Json -Compress|Set-Content -LiteralPath $record -Encoding UTF8
 Write-Output 'SYNTHETIC_CHILD_RECORDED'
 if($Mode -eq 'CRASH_AFTER_SPAWN'){
  [Diagnostics.Process]::GetCurrentProcess().Kill()
 }
 if(-not $script:owned.WaitForExit(20000)){Stop-Fatal 'CHILD_HUNG'}
 if($script:owned.ExitCode -ne 0){Stop-Fatal 'CHILD_ERROR'}
 [IO.File]::Delete($record)
 Write-Output 'SYNTHETIC_ONE_CHILD_DONE'
 exit 0
}finally{
 if($null -ne $lock){$lock.Dispose()}
}
'@
$watcher=@'
param([string]$Root)
$ErrorActionPreference='Stop'
$line=([Diagnostics.Process]::GetCurrentProcess().Id).ToString()+'|'+[DateTime]::UtcNow.ToString('o')
[IO.File]::AppendAllText((Join-Path $Root 'watcher-starts.txt'),$line+[Environment]::NewLine)
Start-Sleep -Seconds 5
exit 0
'@
$worker=$worker.Replace('__EXACT_FUNCTION__',[string]$guard.func).
 Replace('__EXACT_STARTUP__',[string]$guard.startup).
 Replace('__EXACT_PRELAUNCH__',[string]$guard.prelaunch)
if($worker.Contains('__EXACT_')){throw 'WORKER_TEMPLATE_INCOMPLETE'}
$workerPath=Join-Path $root 'synthetic-supervisor.ps1'
$watcherPath=Join-Path $root 'harmless-watcher.ps1'
[IO.File]::WriteAllText($workerPath,$worker,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($watcherPath,$watcher,[Text.UTF8Encoding]::new($false))
$parseErr=$null;$tokens=$null
[void][Management.Automation.Language.Parser]::ParseFile($workerPath,[ref]$tokens,[ref]$parseErr)
if(@($parseErr).Count -ne 0){throw 'SYNTHETIC_SUPERVISOR_PARSE_INVALID'}
$tracked=[Collections.Generic.List[Diagnostics.Process]]::new()
$passes=0
function Spawn([string]$mode){
 $argsList=@('-NoLogo','-NoProfile','-NonInteractive','-File',$workerPath,'-Root',$root,'-Mode',$mode)
 $p=Start-Process -FilePath $shell -ArgumentList $argsList -PassThru -NoNewWindow
 $tracked.Add($p)
 return $p
}
function Wait-Code([Diagnostics.Process]$p,[int]$ms){
 if(-not $p.WaitForExit($ms)){throw 'SYNTHETIC_SUPERVISOR_TIMEOUT'}
 return [int]$p.ExitCode
}
function Wait-Record([int]$milliseconds){
 $p=Join-Path $root 'child.json'
 $sw=[Diagnostics.Stopwatch]::StartNew()
 while($sw.ElapsedMilliseconds -lt $milliseconds){
  if(Test-Path -LiteralPath $p -PathType Leaf){return $true}
  Start-Sleep -Milliseconds 100
 }
 return $false
}
function Start-Count(){
 $p=Join-Path $root 'watcher-starts.txt'
 if(-not(Test-Path -LiteralPath $p -PathType Leaf)){return 0}
 return @(Get-Content -LiteralPath $p).Count
}
try{
 # Positive run, then competing instance must fail on exclusive NTFS lock.
 $a=Spawn 'NORMAL'
 if(-not(Wait-Record 7000)){throw 'FIRST_CHILD_RECORD_MISSING'}
 if((Start-Count) -ne 1){throw 'FIRST_CHILD_NOT_SINGLE'}
 $b=Spawn 'NORMAL'
 if((Wait-Code $b 6000) -ne 75){throw 'SECOND_SUPERVISOR_NOT_LOCKED_OUT'}
 if((Start-Count) -ne 1){throw 'DUPLICATE_CHILD_STARTED'}
 if((Wait-Code $a 18000) -ne 0){throw 'FIRST_SUPERVISOR_FAILED'}
 if(Test-Path -LiteralPath (Join-Path $root 'child.json')){throw 'CHILD_RECORD_NOT_CLEANED'}
 if((Start-Count) -ne 1){throw 'POSITIVE_START_COUNT_INCORRECT'}
 $passes+=3

 # A supervisor crash leaves its benign child alive with a matching record.
 $c=Spawn 'CRASH_AFTER_SPAWN'
 if(-not(Wait-Record 7000)){throw 'CRASH_CHILD_RECORD_MISSING'}
 if((Wait-Code $c 7000) -eq 0){throw 'CRASH_NOT_OBSERVED'}
 if((Start-Count) -ne 2){throw 'CRASH_CHILD_NOT_STARTED_ONCE'}
 $d=Spawn 'NORMAL'
 if((Wait-Code $d 6000) -ne 79){throw 'LIVE_ORPHAN_NOT_BLOCKED'}
 if((Start-Count) -ne 2){throw 'DUPLICATED_LIVE_ORPHAN'}
 $passes+=2

 # Wait only for the test-owned child and then recover deterministically.
 $rec=Get-Content -LiteralPath (Join-Path $root 'child.json') -Raw |ConvertFrom-Json
 $pidToWait=[int]$rec.pid
 $ownedChild=Get-Process -Id $pidToWait -ErrorAction Stop
 $startDelta=[Math]::Abs(($ownedChild.StartTime.ToUniversalTime()-
  ([datetime]::Parse([string]$rec.start_utc)).ToUniversalTime()).TotalSeconds)
 if($startDelta -gt 1){throw 'RECOVERY_CHILD_IDENTITY_DRIFT'}
 if(-not $ownedChild.WaitForExit(14000)){throw 'OWNED_CHILD_NOT_EXITED'}
 $e=Spawn 'NORMAL'
 if((Wait-Code $e 18000) -ne 0){throw 'POST_CRASH_RECOVERY_FAILED'}
 if((Start-Count) -ne 3){throw 'POST_CRASH_CHILD_COUNT_WRONG'}
 if(Test-Path -LiteralPath (Join-Path $root 'child.json')){throw 'POST_CRASH_RECORD_REMAINS'}
 $passes+=3
 [ordered]@{
  schema='deliveryos.comandas.v830.hosted-windows-synthetic-supervisor-cycle'
  status='PASS';checks=$passes
  exact_v820_and_v822_guard_blocks_embedded=$true
  real_ntfs_exclusive_lock_tested=$true
  one_benign_watcher_at_a_time=$true
  simulated_crash_after_child_spawn=$true
  live_orphan_restart_refused=$true
  retry_after_child_exit_recovered=$true
  real_supervisor_source_executed=$false
  operational_cutover_proven=$false
  window_after_prelaunch_guard_still_unproven=$true
  fixture_processes_only=$true
  service_changed=$false;sql=$false;printer=$false;spooler=$false
 }|ConvertTo-Json -Compress
}finally{
 foreach($p in $tracked){
  try{
   if(-not $p.HasExited){$p.Kill();$null=$p.WaitForExit(5000)}
  }catch{}
  try{$p.Dispose()}catch{}
 }
 # The ONLY additional child allowed belongs to this disposable fixture,
 # with a matching recorded PID and UTC creation time.
 $rfile=Join-Path $root 'child.json'
 if(Test-Path -LiteralPath $rfile){
  try{
   $rec=Get-Content -LiteralPath $rfile -Raw|ConvertFrom-Json
   $child=Get-Process -Id ([int]$rec.pid) -ErrorAction SilentlyContinue
   if($null -ne $child){
    $delta=[Math]::Abs(($child.StartTime.ToUniversalTime()-
      ([datetime]::Parse([string]$rec.start_utc)).ToUniversalTime()).TotalSeconds)
    if($delta -le 1){$child.Kill();$null=$child.WaitForExit(5000)}
   }
  }catch{}
 }
 try{Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction Stop}catch{
  [Console]::Error.WriteLine('V830_TEMP_CLEANUP_UNCONFIRMED')
 }
}

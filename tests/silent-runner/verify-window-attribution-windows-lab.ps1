# Prove a no-console, one-shot HWND -> PID/parent/session/SID correlation
# with synthetic offscreen/hidden windows on disposable GitHub Windows ONLY.
# Absolutely never run this test on CAIXA_MOOCA or inspect operational apps.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:COMPUTERNAME -eq 'CAIXA_MOOCA' -or
   $env:GITHUB_ACTIONS -ne 'true' -or
   $env:GITHUB_REPOSITORY -ne 'cesarspichencoff-cmyk/delviery-os' -or
   [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP) -or
   [string]::IsNullOrWhiteSpace($env:GITHUB_WORKSPACE)){
  throw 'DISPOSABLE_GITHUB_WINDOWS_RUNNER_ONLY'
}
$dir=Join-Path $env:RUNNER_TEMP 'deliveryos-window-attribution-lab'
if(Test-Path -LiteralPath $dir){throw 'LAB_DIRECTORY_ALREADY_EXISTS'}
$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $csc -PathType Leaf)){throw 'CS_COMPILER_MISSING'}
$root=$env:GITHUB_WORKSPACE
$source=Join-Path $root 'labs\window-attribution\WindowAttributionLab.cs'
$fake=Join-Path $root 'labs\window-attribution\SyntheticWindowFixture.cs'
$probe=Join-Path $dir 'WindowAttributionLab.exe'
$fixture=Join-Path $dir 'WindowAttributionFixture.exe'
$target=$null;$created=$false;$total=0
function Check([bool]$ok,[string]$label){
 if(!$ok){throw ('WINDOW_ATTRIBUTION_LAB_FAIL_'+$label)}
 $script:total++
}
function Read-Fixture([uint32]$processId){
 $wmi=Get-WmiObject Win32_Process -Filter ('ProcessId='+$processId) -ErrorAction Stop
 if($null -eq $wmi){throw 'SYNTHETIC_TARGET_NOT_FOUND'}
 $owner=$wmi.GetOwnerSid()
 if($null -eq $owner -or [uint32]$owner.ReturnValue -ne 0 -or
    [string]::IsNullOrWhiteSpace($owner.Sid)){throw 'SYNTHETIC_OWNER_UNAVAILABLE'}
 return @{
   pid=[uint32]$wmi.ProcessId
   parent=[uint32]$wmi.ParentProcessId
   session=[uint32]$wmi.SessionId
   created=[string]$wmi.CreationDate
   sid=[string]$owner.Sid
 }
}
function Run-Probe($info,[string]$expected){
 $argv=@(
  ('"--lab-dir='+$dir+'"'),
  ('--pid='+$info.pid),
  ('--created='+$info.created),
  ('--parent='+$info.parent),
  ('--session='+$info.session),
  ('--owner-sid='+$info.sid)
 )
 $p=Start-Process -FilePath $probe -ArgumentList $argv -Wait -PassThru -ErrorAction Stop
 if($p.ExitCode -ne 0){throw ('PROBE_FAILED_'+$p.ExitCode)}
 $receipt=Get-Content -LiteralPath (Join-Path $dir 'receipt.json') -Raw
 $data=$receipt|ConvertFrom-Json
 Check ($data.state -eq $expected) ('EXPECTED_'+$expected)
 Check ($data.source -eq 'SYNTHETIC_WINDOWS_ONLY' -and $data.fieldProof -eq $false -and
        $data.ordersPublishable -eq 0) 'NO_FIELD_PROMOTION'
 Check ($data.pidExported -eq $false -and $data.sidExported -eq $false -and
        $data.titlesRead -eq $false -and $data.screenshotsTaken -eq $false -and
        $data.commandLinesExported -eq $false -and $data.windowsModified -eq 0) 'PRIVACY'
 Check (-not $receipt.Contains($info.sid) -and
        -not $receipt.Contains($info.created)) 'IDENTIFIERS_ABSENT'
 return $data
}
try {
 [void](New-Item -ItemType Directory -Path $dir -ErrorAction Stop)
 $created=$true
 [IO.File]::WriteAllText((Join-Path $dir 'LAB_ONLY.txt'),
  'DELIVERYOS_WINDOW_ATTRIBUTION_DISPOSABLE_LAB_V1')
 & $csc /nologo /target:winexe /optimize+ /reference:System.Management.dll ("/out:$probe") $source
 if($LASTEXITCODE -ne 0){throw 'PROBE_COMPILE_FAILED'}
 & $csc /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll ("/out:$fixture") $fake
 if($LASTEXITCODE -ne 0){throw 'FIXTURE_COMPILE_FAILED'}
 foreach($name in @($probe,$fixture)){
  $bytes=[IO.File]::ReadAllBytes($name)
  $pe=[BitConverter]::ToInt32($bytes,0x3c)
  $subsystem=[BitConverter]::ToUInt16($bytes,$pe+24+68)
  Check ($subsystem -eq 2) 'GUI_SUBSYSTEM_NO_CONSOLE'
 }
 $target=Start-Process -FilePath $fixture -ArgumentList @('--mode=visible',('"--lab-dir='+$dir+'"')) -PassThru -ErrorAction Stop
 Start-Sleep -Milliseconds 600
 if($target.HasExited){throw ('VISIBLE_FIXTURE_EARLY_EXIT_'+$target.ExitCode)}
 $info=Read-Fixture ([uint32]$target.Id)
 $ok=Run-Probe $info 'LAB_ONLY_SYNTHETIC_WINDOW_PROCESS_LINK'
 Check ($ok.visibleHwndCount -eq 1) 'EXACTLY_ONE_SYNTHETIC_HWND'
 $bad=@{};foreach($key in $info.Keys){$bad[$key]=$info[$key]}
 $bad.created='00000101000000.000000+000'
 $null=Run-Probe $bad 'HOLD_PROCESS_IDENTITY_MISMATCH'
 $bad.created=$info.created;$bad.parent=[uint32]($info.parent+1)
 $null=Run-Probe $bad 'HOLD_PARENT_MISMATCH'
 $bad.parent=$info.parent;$bad.session=[uint32]($info.session+1)
 $null=Run-Probe $bad 'HOLD_SESSION_MISMATCH'
 $bad.session=$info.session;$bad.sid=$info.sid+'-1'
 $null=Run-Probe $bad 'HOLD_OWNER_MISMATCH'
 $bad.sid=$info.sid
 [IO.File]::Delete((Join-Path $dir 'LAB_ONLY.txt'))
 $argv=@(
  ('"--lab-dir='+$dir+'"'),('--pid='+$info.pid),('--created='+$info.created),
  ('--parent='+$info.parent),('--session='+$info.session),('--owner-sid='+$info.sid)
 )
 $rejected=Start-Process -FilePath $probe -ArgumentList $argv -Wait -PassThru -ErrorAction Stop
 Check ($rejected.ExitCode -eq 79) 'MARKER_MISSING_DENIED'
 [IO.File]::WriteAllText((Join-Path $dir 'LAB_ONLY.txt'),
  'DELIVERYOS_WINDOW_ATTRIBUTION_DISPOSABLE_LAB_V1')
 if(-not $target.WaitForExit(8000)){throw 'VISIBLE_FIXTURE_DID_NOT_EXIT'}
 Check ($target.ExitCode -eq 0) 'VISIBLE_FIXTURE_EXIT'
 $target=Start-Process -FilePath $fixture -ArgumentList @('--mode=hidden',('"--lab-dir='+$dir+'"')) -PassThru -ErrorAction Stop
 Start-Sleep -Milliseconds 600
 if($target.HasExited){throw ('HIDDEN_FIXTURE_EARLY_EXIT_'+$target.ExitCode)}
 $info=Read-Fixture ([uint32]$target.Id)
 $hold=Run-Probe $info 'HOLD_NO_UNIQUE_VISIBLE_HWND'
 Check ($hold.visibleHwndCount -eq 0) 'HIDDEN_HAS_NO_VISIBLE_HWND'
 Write-Host ('WINDOW_ATTRIBUTION_DISPOSABLE_LAB_PASS '+$total+'/'+$total+' SYNTHETIC_HWND_ONLY NO_FIELD_EXECUTION NO_PII')
}finally{
 if($target -and -not $target.HasExited){
  try{$target.Kill();[void]$target.WaitForExit(2000)}catch{}
 }
 if($created -and (Test-Path -LiteralPath $dir)){
  # Fixture and receipt are strictly ephemeral runner-local artifacts.
  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction Stop
 }
}

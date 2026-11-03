# Execute ONLY on a disposable Windows laboratory/CI VM, never at the cashier PC.
# This is a TEST harness. It is not a scheduled task and never opens Edge.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
if ($env:COMPUTERNAME -eq 'CAIXA_MOOCA') { throw 'PRODUCTION_CASHIER_FORBIDDEN' }
$dir=Split-Path -Parent $MyInvocation.MyCommand.Path
$root=Resolve-Path (Join-Path $dir '..\..')
$source=Join-Path $root 'runtime\silent-runner\SilentObserverLab.cs'
$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $csc -PathType Leaf)) { throw 'CSC_NOT_INSTALLED' }
$workspace=Join-Path ([IO.Path]::GetTempPath()) 'deliveryos-silent-lab'
if (Test-Path -LiteralPath $workspace) { throw 'LAB_PATH_ALREADY_EXISTS' }
$created=$false;$total=0;$running=$null
function Check([bool]$ok,[string]$name){if (!$ok){throw ('TEST_FAIL_'+$name)};$script:total++}
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class SilentWindowCheck {
 public delegate bool E(IntPtr h,IntPtr arg);
 [DllImport("user32.dll")]static extern bool EnumWindows(E callback,IntPtr arg);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint id);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 public static int VisibleForPid(uint pid){
  int result=0;
  EnumWindows((h,a)=>{uint owner=0;GetWindowThreadProcessId(h,out owner);
   if(owner==pid&&IsWindowVisible(h))result++;return true;},IntPtr.Zero);
  return result;
 }
}
'@
function Run-Lab([string[]]$arguments,[int]$maxMs=6000){
 $si=New-Object Diagnostics.ProcessStartInfo
 $si.FileName=Join-Path $workspace 'SilentObserverLab.exe'
 $si.UseShellExecute=$false;$si.CreateNoWindow=$true
 $si.Arguments=$arguments -join ' '
 $p=[Diagnostics.Process]::Start($si)
 if(!$p.WaitForExit($maxMs)){$p.Kill();throw 'CHILD_PROCESS_TIMEOUT'}
 return $p.ExitCode
}
try {
 [void](New-Item -ItemType Directory -Path $workspace -ErrorAction Stop)
 $created=$true
 [IO.File]::WriteAllText((Join-Path $workspace 'DELIVERYOS_LAB_ONLY.txt'),'DELIVERYOS_SILENT_TEST_ONLY_V1')
 $binary=Join-Path $workspace 'SilentObserverLab.exe'
 & $csc /nologo /target:winexe /platform:x64 /optimize+ ('/out:'+ $binary) $source
 Check ($LASTEXITCODE -eq 0) 'COMPILE_WINEXE'
 $valid=(@('schema=deliveryos.silent-fixture.v1','source=FICTIONAL_ONLY','reader=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF','gestor=STRUCTURE_ONLY_UNVERIFIED') -join [Environment]::NewLine)+[Environment]::NewLine
 [IO.File]::WriteAllText((Join-Path $workspace 'input.fixture'),$valid)
 $args=@('--fixture-dir='+('"'+$workspace+'"'),'--ticks=4','--sleep-ms=450')
 $si=New-Object Diagnostics.ProcessStartInfo
 $si.FileName=$binary;$si.UseShellExecute=$false;$si.CreateNoWindow=$true;$si.Arguments=$args -join ' '
 $focus=[SilentWindowCheck]::GetForegroundWindow()
 $running=[Diagnostics.Process]::Start($si)
 Start-Sleep -Milliseconds 450
 Check (!$running.HasExited) 'LONG_ENOUGH_TO_CHECK'
 for($sample=1;$sample -le 4;$sample++){
  Check ([SilentWindowCheck]::VisibleForPid([uint32]$running.Id) -eq 0) ('NO_VISIBLE_HWND_RUNNING_'+$sample)
  if($sample -lt 4){Start-Sleep -Milliseconds 80}
 }
 $duplicate=Run-Lab -arguments $args
 Check ($duplicate -eq 22) 'SECOND_INSTANCE_BLOCKED'
 if(!$running.WaitForExit(6000)){$running.Kill();throw 'MAIN_TIMEOUT'}
 Check ($running.ExitCode -eq 0) 'VALID_FIXTURE_COMPLETE'
 Check ([SilentWindowCheck]::GetForegroundWindow() -eq $focus) 'FOCUS_UNCHANGED'
 $status=Get-Content (Join-Path $workspace 'status.json') -Raw|ConvertFrom-Json
 Check ($status.state -eq 'HOLD_FIXTURE_ONLY') 'HOLD_REAL_DATA'
 Check ($status.ordersPublishable -eq 0 -and $status.orderIdsExported -eq 0 -and $status.customerFieldsExported -eq 0) 'NO_IDENTIFIERS_OR_PUBLISH'
 Check ($status.tick -eq 4) 'BOUNDED_FOUR_TICKS'
 Check ($status.networkRequests -eq 0 -and $status.windowActions -eq 0) 'NO_SIDE_EFFECTS_CLAIM'
 [IO.File]::WriteAllText((Join-Path $workspace 'input.fixture'),$valid+"orderId=1234"+[Environment]::NewLine)
 $rc=Run-Lab -arguments @('--fixture-dir='+('"'+$workspace+'"'),'--ticks=1','--sleep-ms=100')
 Check ($rc -eq 0) 'INVALID_FIXTURE_EXIT_BOUNDED'
 $status=Get-Content (Join-Path $workspace 'status.json') -Raw|ConvertFrom-Json
 Check ($status.state -eq 'HOLD_INVALID_FIXTURE' -and $status.ordersPublishable -eq 0) 'REJECT_REALISH_DATA'
 [IO.File]::Delete((Join-Path $workspace 'DELIVERYOS_LAB_ONLY.txt'))
 $rc=Run-Lab -arguments @('--fixture-dir='+('"'+$workspace+'"'),'--ticks=1','--sleep-ms=100')
 Check ($rc -eq 21) 'MISSING_LAB_MARKER_BLOCKED'
 Write-Output ('SILENT_OBSERVER_WINDOWS_LAB_PASS '+$total+'/'+$total+' NO_VISIBLE_WINDOWS')
} finally {
 if($running -and !$running.HasExited){$running.Kill();[void]$running.WaitForExit(2000)}
 if($created -and (Test-Path -LiteralPath $workspace)) { Remove-Item -LiteralPath $workspace -Recurse -Force }
}

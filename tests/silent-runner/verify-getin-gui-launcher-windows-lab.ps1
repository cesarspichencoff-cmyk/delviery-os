# GUI-subsystem launcher vs synthetic GetIn collector/visual child Node in CI.
# Never run on CAIXA_MOOCA; no actual GetIn files or customer data.
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
$root=$env:GITHUB_WORKSPACE
$lab=Join-Path $env:RUNNER_TEMP 'deliveryos-getin-silent-lab'
if(Test-Path -LiteralPath $lab){throw 'LAB_DIRECTORY_COLLISION'}
$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $csc -PathType Leaf)){throw 'CSC_NOT_FOUND'}
$src=Join-Path $root 'labs\getin-silent\LabGuiLauncher.cs'
$fixture=Join-Path $root 'labs\getin-silent\synthetic-getin-job.cjs'
if(!(Test-Path -LiteralPath $fixture -PathType Leaf)){throw 'SYNTHETIC_SCRIPT_MISSING'}
$node=(Get-Command node -ErrorAction Stop).Source
if([IO.Path]::GetFileName($node) -ne 'node.exe'){throw 'WINDOWS_NODE_REQUIRED'}
$created=$false;$count=0;$parent=$null
function Check([bool]$condition,[string]$label){
 if(-not $condition){throw ('GETIN_GUI_LAB_FAILED_'+$label)}
 $script:count++
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GetInWindowAudit {
 public delegate bool V(IntPtr h,IntPtr u);
 [DllImport("user32.dll")] static extern bool EnumWindows(V callback,IntPtr unused);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 public static int Visible(uint pid) {
  int count=0;
  if(!EnumWindows((h,u)=>{
   uint owner=0;GetWindowThreadProcessId(h,out owner);
   if(owner==pid&&IsWindowVisible(h))count++;
   return true;
  },IntPtr.Zero))throw new Exception("ENUM_WINDOWS_FAILED");
  return count;
 }
}
'@
try {
 [void](New-Item -ItemType Directory -Path $lab -ErrorAction Stop)
 $created=$true
 [IO.File]::WriteAllText((Join-Path $lab 'LAB_ONLY.txt'),'DELIVERYOS_GETIN_SILENT_DISPOSABLE_LAB_V1')
 $exe=Join-Path $lab 'LabGuiLauncher.exe'
 & $csc /nologo /target:winexe /optimize+ ("/out:$exe") $src
 if($LASTEXITCODE -ne 0){throw 'LAB_GUI_COMPILE_FAILED'}
 $bytes=[IO.File]::ReadAllBytes($exe)
 $pe=[BitConverter]::ToInt32($bytes,0x3c)
 $subsystem=[BitConverter]::ToUInt16($bytes,$pe+24+68)
 Check ($subsystem -eq 2) 'NO_CONSOLE_SUBSYSTEM'
 foreach($mode in @('collector','visual')){
  # Only the visual fixture emits two high-volume fictional pipes.
  if($mode -eq 'visual'){$env:GETIN_LAB_STDIO_STRESS='1'}
  else {Remove-Item Env:GETIN_LAB_STDIO_STRESS -ErrorAction SilentlyContinue}
  $args=@(('"--lab-dir='+$lab+'"'),('"--node-path='+$node+'"'),('--mode='+$mode))
  $focus=[GetInWindowAudit]::GetForegroundWindow()
  $parent=Start-Process -FilePath $exe -ArgumentList $args -PassThru -ErrorAction Stop
  Start-Sleep -Milliseconds 190
  Check (-not $parent.HasExited) 'GUI_PARENT_ALIVE'
  $children=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$parent.Id))
  $nodes=@($children|Where-Object {$_.Name -eq 'node.exe'})
  Check ($nodes.Count -eq 1) 'ONE_DIRECT_NODE_CHILD'
  $childId=[uint32]$nodes[0].ProcessId
  for($i=0;$i -lt 10;$i++){
   Check (-not $parent.HasExited) 'GUI_PARENT_STILL_ACTIVE'
   Check ([GetInWindowAudit]::Visible([uint32]$parent.Id) -eq 0) 'GUI_PARENT_NO_VISIBLE_HWND'
   Check ([GetInWindowAudit]::Visible($childId) -eq 0) 'NODE_CHILD_NO_VISIBLE_HWND'
   Start-Sleep -Milliseconds 65
  }
  if(-not $parent.WaitForExit(6000)){throw 'GUI_PARENT_TIMEOUT'}
  Check ($parent.ExitCode -eq 0) 'GUI_PARENT_SUCCESS'
  Check ([GetInWindowAudit]::GetForegroundWindow() -eq $focus) 'FOCUS_STABLE'
  $receipt=Get-Content -LiteralPath (Join-Path $lab 'launcher.receipt.json') -Raw
  $state=$receipt|ConvertFrom-Json
  Check ($state.state -eq 'LAB_SYNTHETIC_CHILD_COMPLETED' -and
         $state.mode -eq $mode -and $state.childStarted -eq $true) 'LAUNCH_RECEIPT'
  Check ($state.ordersPublishable -eq 0 -and $state.fieldProof -eq $false -and
         $state.shellExecuted -eq $false -and
         $state.customerDataExported -eq $false) 'LAUNCH_PRIVACY'
  $raw=Get-Content -LiteralPath (Join-Path $lab ($mode+'.child.receipt.json')) -Raw
  $child=$raw|ConvertFrom-Json
  Check ($child.mode -eq $mode -and $child.state -eq 'FIXTURE_ONLY' -and
         $child.networkRequests -eq 0 -and $child.recordsProcessed -eq 0 -and
         $child.customerDataExported -eq $false) 'CHILD_IS_FICTIONAL'
  Check (-not $receipt.Contains($node) -and -not $receipt.Contains($lab) -and
         -not $raw.Contains($lab)) 'NO_PATHS_EXPORTED'
  $parent=$null
 }
 # No execution for invalid job modes (proof of fail-closed command whitelist).
 $bad=Start-Process -FilePath $exe -ArgumentList @(
   ('"--lab-dir='+$lab+'"'),('"--node-path='+$node+'"'),'--mode=arbitrary'
 ) -Wait -PassThru -ErrorAction Stop
 Check ($bad.ExitCode -eq 78) 'WRONG_MODE_DENIED'
 Check (-not (Test-Path -LiteralPath (Join-Path $lab 'arbitrary.child.receipt.json'))) 'NO_ARBITRARY_CHILD'
 [IO.File]::Delete((Join-Path $lab 'LAB_ONLY.txt'))
 $denied=Start-Process -FilePath $exe -ArgumentList @(
   ('"--lab-dir='+$lab+'"'),('"--node-path='+$node+'"'),'--mode=collector'
 ) -Wait -PassThru -ErrorAction Stop
 Check ($denied.ExitCode -eq 79) 'MISSING_MARKER_DENIED'
 Write-Host ('GETIN_GUI_SILENT_DISPOSABLE_LAB_PASS '+$count+'/'+$count+' SYNTHETIC_ONLY NO_VISIBLE_PARENT_OR_CHILD NO_FOCUS_CHANGE')
} finally {
 Remove-Item Env:GETIN_LAB_STDIO_STRESS -ErrorAction SilentlyContinue
 if($parent -and -not $parent.HasExited){$parent.Kill();[void]$parent.WaitForExit(2000)}
 if($created -and (Test-Path -LiteralPath $lab)){
  Remove-Item -LiteralPath $lab -Recurse -Force -ErrorAction Stop
 }
}

# Isolated GitHub Windows GUI oracle for the v2 N2/N3 Reader receipt.
# NEVER use on CAIXA_MOOCA; no productive Reader, SQL or customer event access.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or
   $env:GITHUB_REPOSITORY -ne 'cesarspichencoff-cmyk/delviery-os' -or
   $env:COMPUTERNAME -eq 'CAIXA_MOOCA' -or
   [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)){
 throw 'ONLY_DISPOSABLE_GITHUB_WINDOWS_RUNNER'
}
$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $csc)) { throw 'GUI_CSC_NOT_AVAILABLE' }
$exe=Join-Path $env:RUNNER_TEMP 'DeliveryOSNativeReaderV2Lab.exe'
$source=(Resolve-Path 'labs/reader-proof/NativeReaderOneShotLabLauncherV2.cs').Path
& $csc /nologo /target:winexe /main:DeliveryOS.ReaderLab.NativeReaderOneShotLabLauncherV2 "/out:$exe" $source
if($LASTEXITCODE -ne 0) { throw 'GUI_COMPILE_FAILED' }
$pe=[IO.File]::ReadAllBytes($exe)
$peOffset=[BitConverter]::ToInt32($pe,0x3c)
$subsystem=[BitConverter]::ToUInt16($pe,$peOffset+24+68)
if($subsystem -ne 2) { throw 'GUI_SUBSYSTEM_NOT_CONFIRMED' }
$lab=Join-Path $env:RUNNER_TEMP 'deliveryos-reader-proof-v2-lab'
if(Test-Path -LiteralPath $lab) { throw 'LAB_ROOT_COLLISION' }
$node=(Get-Command node).Source
$script=(Resolve-Path 'labs/reader-proof/native_reader_one_shot_lab_cli_v2.cjs').Path
$argv=@(('"--lab-dir='+$lab+'"'),('"--node-path='+$node+'"'),('"--script-path='+$script+'"'))
try {
 node tests/reporting/build-reader-one-shot-lab-v2-fixture.cjs "--lab-dir=$lab"
 if($LASTEXITCODE -ne 0) { throw 'V2_FIXTURE_FAILED' }
 # 1. Exact path identity. A same-named script under the sandbox is rejected.
 $spoof=Join-Path $lab 'native_reader_one_shot_lab_cli_v2.cjs'
 [IO.File]::WriteAllText($spoof,'process.exit(0)')
 $badArgs=@(('"--lab-dir='+$lab+'"'),('"--node-path='+$node+'"'),('"--script-path='+$spoof+'"'))
 $bad=Start-Process -FilePath $exe -ArgumentList $badArgs -Wait -PassThru
 if($bad.ExitCode -eq 0 -or (Test-Path (Join-Path $lab 'receipt.json'))){
  throw 'SPOOF_SCRIPT_ACCEPTED'
 }
 Remove-Item -LiteralPath $spoof -Force
 # 2. New digest module's exact blob hash is pinned by the GUI launcher.
 $module=(Resolve-Path 'runtime/reporting/native_reader_legacy_ps51_digest_v1.cjs').Path
 $original=[IO.File]::ReadAllBytes($module)
 try {
  [IO.File]::WriteAllText($module,'// FIXTURE_TAMPER - MUST NOT RUN')
  $tampered=Start-Process -FilePath $exe -ArgumentList $argv -Wait -PassThru
  if($tampered.ExitCode -eq 0 -or (Test-Path (Join-Path $lab 'receipt.json'))){
   throw 'TAMPERED_NEW_DEPENDENCY_ACCEPTED'
  }
 } finally { [IO.File]::WriteAllBytes($module,$original) }
 Write-Host 'READER_V2_PINNED_IDENTITY_LAB_PASS 2/2 SCRIPT_PATH_AND_NEW_DIGEST_MODULE'
 Add-Type -TypeDefinition @'
 using System;
 using System.Runtime.InteropServices;
 public class ReaderV2WindowAudit {
  public delegate bool Visit(IntPtr hwnd,IntPtr state);
  [DllImport("user32.dll")]static extern bool EnumWindows(Visit callback,IntPtr state);
  [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
  public static int Visible(uint target){
   int count=0;
   EnumWindows((hwnd,state)=>{
    uint pid=0;GetWindowThreadProcessId(hwnd,out pid);
    if(pid==target && IsWindowVisible(hwnd))count++;
    return true;
   },IntPtr.Zero);
   return count;
  }
 }
'@
 $env:DELIVERYOS_READER_LAB_HOLD_MS='2500'
 $focus=[ReaderV2WindowAudit]::GetForegroundWindow()
 $parent=Start-Process -FilePath $exe -ArgumentList $argv -PassThru
 Start-Sleep -Milliseconds 160
 if($parent.HasExited) {throw 'V2_PROCESS_EARLY_EXIT'}
 $children=@(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($parent.Id)")
 $nodes=@($children | Where-Object {$_.Name -eq 'node.exe'})
 if($nodes.Count -ne 1) {throw 'EXPECTED_ONE_NODE_CHILD'}
 $childPid=[uint32]$nodes[0].ProcessId
 $samples=0
 for($i=0;$i -lt 10;$i++){
  if($parent.HasExited) {throw 'V2_ENDED_BEFORE_VISIBILITY_SAMPLES'}
  if([ReaderV2WindowAudit]::Visible([uint32]$parent.Id) -ne 0 -or
     [ReaderV2WindowAudit]::Visible($childPid) -ne 0){
   throw 'V2_VISIBLE_WINDOW'
  }
  $samples++
  Start-Sleep -Milliseconds 70
 }
 if(-not $parent.WaitForExit(6000)) {$parent.Kill();throw 'V2_TIMEOUT'}
 if($parent.ExitCode -ne 0) {throw 'V2_LAUNCH_FAILED'}
 if([ReaderV2WindowAudit]::GetForegroundWindow() -ne $focus){
  throw 'V2_FOCUS_CHANGED'
 }
 $text=Get-Content -LiteralPath (Join-Path $lab 'receipt.json') -Raw
 if([Text.Encoding]::UTF8.GetByteCount($text) -gt 2048) {throw 'RECEIPT_TOO_LARGE'}
 $r=$text|ConvertFrom-Json
 if($r.schema -ne 'deliveryos.native-reader-existing-event-binding.v2' -or
    $r.state -ne 'HOLD' -or
    $r.reason -ne 'N2_N3_SELF_CONSISTENT_SOURCE_UNATTESTED' -or
    $r.checkpointBound -ne $true -or
    $r.n3LegacyPs51DigestMatch -ne $true -or
    $r.n3CanonicalDigestMatch -ne $false -or
    $r.n2StructureSelfConsistent -ne $true -or
    $r.ordersPublishable -ne 0 -or
    $r.homePublishAuthorized -ne $false -or
    $r.sourceVerified -ne $false -or
    $r.customerDataExported -ne $false -or
    $text.Contains('FICT_PRIVATE_SENTINEL') -or
    $text.Contains('FICT_COMMAND') -or
    $text.Contains('FICT_PRODUCT')){
  throw 'V2_RECEIPT_SEMANTIC_OR_PRIVACY_FAILURE'
 }
 Write-Host ('NATIVE_READER_V2_ONE_SHOT_GUI_LAB_PASS '+$samples+'/'+$samples+
  ' LEGACY_PS51_DIGEST_BOUNDED_HOLD NO_VISIBLE_PARENT_OR_CHILD NO_FOCUS_CHANGE NO_PII')
}finally{
 Remove-Item Env:DELIVERYOS_READER_LAB_HOLD_MS -ErrorAction SilentlyContinue
 if(Test-Path -LiteralPath $lab){Remove-Item -LiteralPath $lab -Recurse -Force}
}

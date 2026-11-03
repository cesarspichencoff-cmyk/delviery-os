# Two-window Edge fixture laboratory. No iFood domain/session, no application changes.
# Guarded by 120s idle, isolated profile, strictly scoped cleanup.
$ErrorActionPreference='Stop'
$labProfile=Join-Path $env:LOCALAPPDATA 'DeliveryOS-Gestor-Multiwindow-Lab-20261103'
$edge='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$root=$PSScriptRoot
$observations=@()
$cleanupErrors=0
$mainPid=0
$baseline=0L
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class LabWindows {
 public delegate bool Callback(IntPtr h,IntPtr l);
 [DllImport("user32.dll")]static extern bool EnumWindows(Callback cb,IntPtr l);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint id);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int ht,uint flags);
 [StructLayout(LayoutKind.Sequential)]public struct LastInput{public uint cbSize;public uint dwTime;}
 [DllImport("user32.dll")]public static extern bool GetLastInputInfo(ref LastInput inp);
 [DllImport("kernel32.dll")]public static extern uint GetTickCount();
 public static long[] ForPid(uint pid){
  var output=new List<long>();
  EnumWindows((h,l)=>{uint id=0;GetWindowThreadProcessId(h,out id);
   if(id==pid && IsWindowVisible(h))output.Add(h.ToInt64());return true;
  },IntPtr.Zero);return output.ToArray();
 }
}
'@
function Get-LabMain {
 return @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'"|
  Where-Object{$_.CommandLine -and
   $_.CommandLine.IndexOf($labProfile,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and
   $_.CommandLine -notmatch '--type='})
}
function Read-LabWindow([long]$handle,[string]$ref){
 $min=[LabWindows]::IsIconic([intptr]$handle)
 $meta=[ordered]@{ref=$ref;visible=$true;minimized=[bool]$min;
  listMatches=0;listChildren=0;singleCodeCards=0;uniqueCodeCandidates=0;
  uiReadOnly=$true;stable=$false}
 if($min){return $meta}
 $snapshots=@()
 for($pass=0;$pass -lt 2;$pass++){
  $rootEl=[System.Windows.Automation.AutomationElement]::FromHandle([intptr]$handle)
  $nodes=$rootEl.FindAll([System.Windows.Automation.TreeScope]::Descendants,
   [System.Windows.Automation.Condition]::TrueCondition)
  if($nodes.Count -gt 1500){throw 'LAB_UI_TREE_TOO_LARGE'}
  $lists=@()
  foreach($n in $nodes){try{if($n.Current.ControlType.ProgrammaticName -eq 'ControlType.List' -and
   [string]$n.Current.Name -match '(?i)conclu[ií]d|finalizad'){$lists+=@($n)}}catch{}}
  $found=0;$single=0;$unique=0;$digest=''
  if($lists.Count -eq 1){
   $children=$lists[0].FindAll([System.Windows.Automation.TreeScope]::Children,
     [System.Windows.Automation.Condition]::TrueCondition)
   if($children.Count -gt 100){throw 'LAB_CARD_BUDGET'}
   $found=$children.Count;$codes=@();$fingerprints=@()
   $sha=[Security.Cryptography.SHA256]::Create()
   try{foreach($child in $children){
    $label=[string]$child.Current.Name
    if($label.Length -gt 200){throw 'LAB_LABEL_BUDGET'}
    $matches=@([regex]::Matches($label,'(?<!\d)\d{4}(?!\d)'))
    if($matches.Count -eq 1){$single++;$codes+=@($matches[0].Value)}
    $fingerprints+=@([Convert]::ToBase64String($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($label))))
   }}finally{$sha.Dispose()}
   $unique=@($codes|Select-Object -Unique).Count
   $digest=$fingerprints -join '|'
  }
  $snapshots+=@([pscustomobject]@{matches=$lists.Count;count=$found;single=$single;unique=$unique;fingerprint=$digest})
  if($pass -eq 0){Start-Sleep -Milliseconds 300}
 }
 $a=$snapshots[0];$b=$snapshots[1]
 $meta.listMatches=$b.matches
 $meta.listChildren=$b.count
 $meta.singleCodeCards=$b.single
 $meta.uniqueCodeCandidates=$b.unique
 $meta.stable=($a.matches -eq $b.matches -and $a.count -eq $b.count -and
   $a.fingerprint -eq $b.fingerprint)
 return $meta
}
try {
 if($env:COMPUTERNAME -ne 'CAIXA_MOOCA'){throw 'WRONG_HOST'}
 if(!(Test-Path -LiteralPath $edge -PathType Leaf)){throw 'EDGE_MISSING'}
 if(Test-Path -LiteralPath $labProfile){throw 'LAB_PROFILE_ALREADY_EXISTS'}
 if(@(Get-LabMain).Count -ne 0){throw 'LAB_ALREADY_RUNNING'}
 $lab1=Join-Path $root 'completed.html'
 if(!(Test-Path -LiteralPath $lab1 -PathType Leaf)){throw 'LAB_FIXTURE_MISSING'}
 $input=New-Object LabWindows+LastInput
 $input.cbSize=[Runtime.InteropServices.Marshal]::SizeOf([type][LabWindows+LastInput])
 if(![LabWindows]::GetLastInputInfo([ref]$input)){throw 'INPUT_IDLE_UNKNOWN'}
 $idle=[uint32]([LabWindows]::GetTickCount()-$input.dwTime)
 if($idle -lt 120000){throw ('OPERATOR_INPUT_ACTIVE_'+[Math]::Round($idle/1000))}
 $baseline=[LabWindows]::GetForegroundWindow().ToInt64()
 $uri=([uri]::new($lab1)).AbsoluteUri
 $arg='--no-first-run --no-default-browser-check --disable-extensions --disable-background-networking --disable-sync --user-data-dir="'+$labProfile+'" --new-window --app="'+$uri+'"'
 Start-Process -FilePath $edge -ArgumentList $arg -WindowStyle Minimized|Out-Null
 Start-Sleep -Seconds 4
 $apps=Get-LabMain
 if($apps.Count -ne 1){throw ('LAB_PROCESS_COUNT_'+$apps.Count)}
 $mainPid=[uint32]$apps[0].ProcessId
 $first=@([LabWindows]::ForPid($mainPid))
 if($first.Count -ne 1){throw ('LAB_FIRST_HWND_COUNT_'+$first.Count)}
 # Place first fixture offscreen and show without activation.
 [void][LabWindows]::SetWindowPos([intptr]$first[0],[intptr]::Zero,-2500,-2500,920,750,[uint32]0x0014)
 [void][LabWindows]::ShowWindow([intptr]$first[0],4)
 Start-Sleep -Milliseconds 900
 $args2='--no-first-run --no-default-browser-check --disable-extensions --disable-background-networking --disable-sync --user-data-dir="'+$labProfile+'" --new-window --app="'+$uri+'"'
 Start-Process -FilePath $edge -ArgumentList $args2 -WindowStyle Minimized|Out-Null
 Start-Sleep -Seconds 3
 $hwnds=@([LabWindows]::ForPid($mainPid))
 $second=@($hwnds|Where-Object{$_ -ne $first[0]})
 if($hwnds.Count -ne 2 -or $second.Count -ne 1){throw ('LAB_TWO_WINDOWS_MISSING_'+$hwnds.Count)}
 [void][LabWindows]::ShowWindow([intptr]$second[0],7)
 $s1=@((Read-LabWindow $first[0] 'lab1'),(Read-LabWindow $second[0] 'lab2'))
 $inputA=[ordered]@{schema='deliveryos.gestor-window-selection-input.v1';host='CAIXA_MOOCA';
  profile='DeliveryOS-Edge-Gestor-Itaim';windows=$s1}
 # This profile tag is intentionally synthetic: selector consumes only sanitized metadata.
 # Second stage: both fixture windows visible, but both kept off-screen and non-activated.
 [void][LabWindows]::SetWindowPos([intptr]$second[0],[intptr]::Zero,-2300,-2300,920,750,[uint32]0x0014)
 [void][LabWindows]::ShowWindow([intptr]$second[0],4)
 Start-Sleep -Milliseconds 800
 $s2=@((Read-LabWindow $first[0] 'lab1'),(Read-LabWindow $second[0] 'lab2'))
 $inputB=[ordered]@{schema='deliveryos.gestor-window-selection-input.v1';host='CAIXA_MOOCA';
  profile='DeliveryOS-Edge-Gestor-Itaim';windows=$s2}
 $summary=[ordered]@{schema='deliveryos.gestor-lab-two-hwnd.v1';
  observedAtUtc=[DateTime]::UtcNow.ToString('o');
  observedTwoWindows=($hwnds.Count -eq 2);operatorIdleBeforeSeconds=[Math]::Round($idle/1000);
  focusPreserved=([LabWindows]::GetForegroundWindow().ToInt64() -eq $baseline);
  profileIsDisposable=$true;noIfoodDomainVisited=$true;noOrdersModified=$true;
  stageOne=$inputA;stageTwo=$inputB}
 $result=Join-Path $root 'lab-two-window-results.json'
 [IO.File]::WriteAllText($result,($summary|ConvertTo-Json -Depth 6),
  [Text.UTF8Encoding]::new($false))
 Write-Output ('LAB_TWO_HWND_PROBE='+($summary|ConvertTo-Json -Compress -Depth 6))
} catch {
 Write-Output ('LAB_HOLD='+$_.Exception.Message)
} finally {
 $lab=@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue|
  Where-Object{$_.CommandLine -and
   $_.CommandLine.IndexOf($labProfile,[StringComparison]::OrdinalIgnoreCase) -ge 0})
 foreach($p in $lab){try{Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop}catch{$cleanupErrors++}}
 Start-Sleep -Seconds 1
 $remaining=@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue|
  Where-Object{$_.CommandLine -and
   $_.CommandLine.IndexOf($labProfile,[StringComparison]::OrdinalIgnoreCase) -ge 0})
 if($remaining.Count -eq 0 -and (Test-Path -LiteralPath $labProfile)){
  try{Remove-Item -LiteralPath $labProfile -Recurse -Force -ErrorAction Stop}catch{$cleanupErrors++}
 }
 Write-Output ('LAB_CLEANUP_REMAINING_PROCESSES='+$remaining.Count+
  ' PROFILE_EXISTS='+(Test-Path -LiteralPath $labProfile)+' CLEANUP_ERRORS='+$cleanupErrors)
}

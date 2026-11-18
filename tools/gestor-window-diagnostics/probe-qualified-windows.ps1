# Delivery OS — separate read-only UIA window qualification. DOES NOT replace active watcher.
# No credentials, cookies, URL navigation, clicks, focus changes, or order data exports.
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -ne 'CAIXA_MOOCA'){throw 'WRONG_HOST'}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DeliveryWindowEnumerator {
 public delegate bool Callback(IntPtr h,IntPtr l);
 [DllImport("user32.dll")]static extern bool EnumWindows(Callback cb,IntPtr l);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint processId);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);
 public static long[] ForProcess(uint processId){
  var result=new List<long>();
  EnumWindows((h,l)=>{
   uint id=0;GetWindowThreadProcessId(h,out id);
   if(id==processId && IsWindowVisible(h))result.Add(h.ToInt64());
   return true;
  },IntPtr.Zero);
  return result.ToArray();
 }
}
'@
$profile=Join-Path $env:LOCALAPPDATA 'DeliveryOS-Edge-Gestor-Itaim'
$sidecar=Join-Path $env:LOCALAPPDATA 'DeliveryOS-Edge-Gestor-Itaim-V2'
$apps=@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'"|Where-Object{
 $_.CommandLine -and
 $_.CommandLine.IndexOf($profile,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and
 $_.CommandLine.IndexOf($sidecar,[StringComparison]::OrdinalIgnoreCase) -lt 0 -and
 $_.CommandLine -notmatch '--type='})
$summary=[ordered]@{schema='deliveryos.gestor-window-selector-diagnostic.v1';
 observedAtUtc=[DateTime]::UtcNow.ToString('o');host=$env:COMPUTERNAME;
 edgeProcessCount=$apps.Count;windowsFound=0;qualifiedWindows=0;
 state='HOLD';reason='NO_OBSERVATION';visibleCardCount=0;
 noClicks=$true;noNavigation=$true;noFocusChange=$true;
 noNamesOrIdsExported=$true;ordersPublishable=0;readerTouched=$false}
if($apps.Count -ne 1){$summary.reason='EDGE_PROCESS_AMBIGUOUS'}
else{
 $hwnds=[DeliveryWindowEnumerator]::ForProcess([uint32]$apps[0].ProcessId)
 $summary.windowsFound=$hwnds.Count
 if($hwnds.Count -lt 1 -or $hwnds.Count -gt 12){$summary.reason='WINDOW_COUNT_UNBOUNDED'}
 else{
  $selected=@();$bad=$false
  function Sample([System.Windows.Automation.AutomationElement]$root){
   $all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,
     [System.Windows.Automation.Condition]::TrueCondition)
   if($all.Count -gt 5000){throw 'UIA_TREE_EXCEEDS_BUDGET'}
   $matching=@()
   foreach($e in $all){try{
    if($e.Current.ControlType.ProgrammaticName -eq 'ControlType.List' -and
     [string]$e.Current.Name -match '(?i)conclu[ií]d|finalizad|entregue'){$matching+=@($e)}
   }catch{}}
   if($matching.Count -ne 1){return [pscustomobject]@{qualified=$false;count=0;signature=''}}
   $cards=$matching[0].FindAll([System.Windows.Automation.TreeScope]::Children,
     [System.Windows.Automation.Condition]::TrueCondition)
   if($cards.Count -lt 1 -or $cards.Count -gt 100){return [pscustomobject]@{qualified=$false;count=0;signature=''}}
   $codes=@();$digests=@()
   $sha=[System.Security.Cryptography.SHA256]::Create()
   try{foreach($card in $cards){
    $name=[string]$card.Current.Name
    if($name.Length -gt 3000){throw 'CARD_LABEL_EXCEEDS_BUDGET'}
    $parts=@([regex]::Matches($name,'(?<!\d)\d{4}(?!\d)'))
    if($parts.Count -ne 1){return [pscustomobject]@{qualified=$false;count=0;signature=''}}
    $codes+=@($parts[0].Value)
    $digests+=@([Convert]::ToBase64String($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($name))))
   }}finally{$sha.Dispose()}
   $unique=@($codes|Select-Object -Unique).Count -eq $cards.Count
   return [pscustomobject]@{qualified=$unique;count=$cards.Count;signature=($digests -join '|')}
  }
  foreach($windowId in $hwnds){
   try{
    if([DeliveryWindowEnumerator]::IsIconic([intptr]$windowId)){continue}
    $ui=[System.Windows.Automation.AutomationElement]::FromHandle([intptr]$windowId)
    $a=Sample $ui
    if(!$a.qualified){continue}
    Start-Sleep -Milliseconds 350
    $fresh=[DeliveryWindowEnumerator]::ForProcess([uint32]$apps[0].ProcessId)
    if($windowId -notin $fresh){continue}
    $b=Sample ([System.Windows.Automation.AutomationElement]::FromHandle([intptr]$windowId))
    if($b.qualified -and $a.count -eq $b.count -and $a.signature -eq $b.signature){
      $selected+=@([pscustomobject]@{count=$b.count})
    }
   }catch{$bad=$true}
  }
  $summary.qualifiedWindows=$selected.Count
  if($bad){$summary.reason='UIA_WINDOW_READ_FAILED'}
  elseif($selected.Count -eq 0){$summary.reason='NO_QUALIFIED_WINDOW'}
  elseif($selected.Count -gt 1){$summary.reason='AMBIGUOUS_WINDOWS'}
  else{
   $summary.state='SELECTED_READ_ONLY';$summary.reason='UNIQUE_STABLE_COMPLETED_LIST'
   $summary.visibleCardCount=$selected[0].count
  }
 }
}
[pscustomobject]$summary|ConvertTo-Json -Compress

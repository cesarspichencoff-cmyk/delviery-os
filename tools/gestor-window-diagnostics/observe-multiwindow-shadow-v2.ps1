# Staged read-only replacement of single-MainWindowHandle monitor. NOT wired to scheduled tasks.
# Status output is intentionally separate from production status.json.
[CmdletBinding()]
param([switch]$Stage)
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -ne 'CAIXA_MOOCA'){throw 'WRONG_HOST'}
$probe=Join-Path $PSScriptRoot 'probe-qualified-windows.ps1'
$expectedSha256='7eeb3a9bf1575ed4259159747d7edb647101363e80349c91a4b28502b78b78e5'
if(!(Test-Path -LiteralPath $probe -PathType Leaf) -or
  (Get-FileHash -LiteralPath $probe -Algorithm SHA256).Hash.ToLower() -ne $expectedSha256){
 throw 'PROBE_INTEGRITY_MISMATCH'
}
$status=[ordered]@{schema='deliveryos.gestor.completed-visible-ui.v1';
 observedAtUtc=[DateTime]::UtcNow.ToString('o');source='ORIGINAL_EDGE_UIA_READ_ONLY';
 state='HOLD';cardsFirst=$null;cardsSecond=$null;cardsWithFinishedHint=$null;
 cardsWithSingleFourDigitCandidate=$null;uniqueFourDigitCandidates=$null;
 cardsWithAmbiguousCodes=$null;finishedListConfirmed=$false;stableAcrossSamples=$false;
 merchantVerified=$false;completeCoverageVerified=$false;nativeJoinProven=$false;
 actualOrderIdVerified=$false;noClicksOrNavigation=$true;noCustomerDataExported=$true;
 noOrderIdsExported=$true;noWriteToGestor=$true}
$raw=& $probe
if(@($raw).Count -ne 1){throw 'PROBE_DID_NOT_COMPLETE'}
$observation=($raw|Out-String|ConvertFrom-Json -ErrorAction Stop)
if($observation.schema -ne 'deliveryos.gestor-window-selector-diagnostic.v1' -or
  $observation.host -ne 'CAIXA_MOOCA' -or
  $observation.noClicks -ne $true -or
  $observation.noNavigation -ne $true -or
  $observation.noNamesOrIdsExported -ne $true -or
  $observation.ordersPublishable -ne 0){throw 'PROBE_UNEXPECTED_RESULT'}
if($observation.state -eq 'SELECTED_READ_ONLY' -and
   $observation.qualifiedWindows -eq 1 -and
   $observation.visibleCardCount -is [int] -and
   $observation.visibleCardCount -gt 0 -and
   $observation.visibleCardCount -le 100){
 $n=[int]$observation.visibleCardCount
 $status.state='VISIBLE_CANDIDATES_STABLE'
 $status.cardsFirst=$n
 $status.cardsSecond=$n
 $status.cardsWithFinishedHint=0
 $status.cardsWithSingleFourDigitCandidate=$n
 $status.uniqueFourDigitCandidates=$n
 $status.cardsWithAmbiguousCodes=0
 $status.finishedListConfirmed=$true
 $status.stableAcrossSamples=$true
}
# Leave all runtime paths and scheduled tasks unchanged.
if($Stage){
 $destination=Join-Path $PSScriptRoot 'status-multiwindow-stage.json'
 $temporary=$destination+'.writing'
 $json=$status|ConvertTo-Json -Depth 3
 [IO.File]::WriteAllText($temporary,$json,[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath $temporary -Destination $destination -Force
}
[pscustomobject]@{schema='deliveryos.gestor-multiwindow-stage-summary.v1';
 checkedAtUtc=$status.observedAtUtc;state=$status.state;visibleCards=$status.cardsSecond;
 windowsFound=$observation.windowsFound;reason=$observation.reason;
 outputSavedInStaging=[bool]$Stage;productionMonitorUnchanged=$true;
 orderIdsExported=0;customerFieldsExported=0;actionsExecuted=0}|ConvertTo-Json -Compress

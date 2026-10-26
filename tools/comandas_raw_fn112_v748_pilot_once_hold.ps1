param(
 [switch]$PrintOnce,
 [string]$Approval=''
)
# CAIXA_MOOCA only, separate fictitious approval. NO PRINT in default mode.
$ErrorActionPreference='Stop'
$dir='C:\ProgramData\TataComandaReader\pilot-readonly-20261013\figma-preview\calibration-fictitious-v741'
$payload=Join-Path $dir '01-producao-offline-fn112-fn50-v747.bin'
$bitmap=Join-Path $dir '01-producao-strong-contrast-final-v746.png'
$svg=Join-Path $dir '01-producao.svg'
$fixture=Join-Path $dir 'manifest-v741.json'
$marker=Join-Path $dir 'CAIXA_V748_RAW_ONCE_PRINT_ATTEMPT.marker'
$expectedPayload='ACE7450A2E6699133BA39FA2F3B625EB46D296EAEB6EAE477877F9F855F1C780'
$expectedBitmap='7360CF74DFAA6C957EEE4E355C7AF92242CB6F3A8C85C81C9AC104BB122A604B'
$expectedSvg='A364477C4E7E53F02AD73D6023314069316BF8C8EFA236C350F93631EF260B63'
if(-not(Test-Path $payload -PathType Leaf) -or -not(Test-Path $bitmap -PathType Leaf) -or
 -not(Test-Path $svg -PathType Leaf) -or -not(Test-Path $fixture -PathType Leaf)){
 throw 'HOLD_MISSING_SYNTHETIC_ARTIFACT'
}
$m=Get-Content -LiteralPath $fixture -Raw | ConvertFrom-Json
if($m.schema -ne 'tata.comandas.synthetic-calibration.v741' -or
 $m.real_order -ne $false -or $m.print_authorized -ne $false){throw 'HOLD_NOT_SYNTHETIC'}
foreach($f in @(@($payload,$expectedPayload),@($bitmap,$expectedBitmap),@($svg,$expectedSvg))){
 if((Get-FileHash -LiteralPath $f[0] -Algorithm SHA256).Hash -ne $f[1]){
  throw 'HOLD_SHA256_SOURCE_DRIFT'
 }
}
$source=[IO.File]::ReadAllText($svg,[Text.Encoding]::UTF8)
if(-not $source.Contains('TESTE - NAO PRODUZIR / NAO DUPLICAR') -or
 -not $source.Contains('URAMAKI FICTICIO EXTRA ESPECIAL') -or
 -not $source.Contains('0000000000')){throw 'HOLD_FICTITIOUS_MARKER_ABSENT'}
$raw=[IO.File]::ReadAllBytes($payload)
if($raw.Length -ne 30118){throw 'HOLD_PACKET_SIZE_DRIFT'}
$header=[byte[]]@(29,40,76,154,117,48,112,48,1,1,49,64,2,162,1)
$footer=[byte[]]@(29,40,76,2,0,48,50)
for($i=0;$i -lt $header.Length;$i++){
 if($raw[$i] -ne $header[$i]){throw 'HOLD_FN112_HEADER_CHANGED'}
}
for($i=0;$i -lt $footer.Length;$i++){
 if($raw[$raw.Length-7+$i] -ne $footer[$i]){throw 'HOLD_FN50_TRAILER_CHANGED'}
}
$p=Get-Printer -Name 'CAIXA' -ErrorAction Stop
if($p.DriverName -ne 'EPSON TM-T20 ReceiptE4' -or
 $p.PortName -ne 'ESDPRT001' -or [string]$p.PrinterStatus -ne 'Normal'){
 throw 'HOLD_DIFFERENT_PRINTER_OR_BUSY'
}
$port=Get-PrinterPort -Name 'ESDPRT001' -ErrorAction Stop
if($port.PortMonitor -ne 'Epson Port Handler Monitor'){throw 'HOLD_PORT_MONITOR_CHANGED'}
$processor=Get-CimInstance Win32_Printer -Filter "Name='CAIXA'" -ErrorAction Stop
if($processor.PrintProcessor -ne 'winprint'){throw 'HOLD_PRINT_PROCESSOR_CHANGED'}
if((Get-Service -Name Spooler -ErrorAction Stop).Status -ne 'Running' -or
 (Get-Service -Name TataComandaReader -ErrorAction Stop).Status -ne 'Running'){
 throw 'HOLD_SERVICES_NOT_RUNNING'
}
$jobs=@(Get-PrintJob -PrinterName 'CAIXA' -ErrorAction Stop)
if($jobs.Count -ne 0){throw 'HOLD_PRINTER_QUEUE_BUSY'}
if(Test-Path -LiteralPath $marker){throw 'HOLD_V748_ATTEMPT_ALREADY_MADE_NO_RETRY'}
if(-not $PrintOnce){
 [pscustomobject]@{status='V748_PREFLIGHT_ONLY_NOT_AUTHORIZED_TO_PRINT';
  source_hash=$expectedPayload;printer='CAIXA';port='ESDPRT001';
  copies=1;marker_exists=$false;queue_count=0;
  real_orders=$false;print_requested=$false;processor='winprint';
  port_monitor=$port.PortMonitor;driver_unchanged=$true;service_unchanged=$true;
  raw_transport_physically_unverified=$true}|ConvertTo-Json -Compress
 exit 0
}
# Never call with -PrintOnce without a *new*, specific approval for RAW V7.48.
if($Approval -cne 'CESAR_EXPLICIT_V748_RAW_FICTITIOUS_ONCE'){
 throw 'HOLD_FRESH_HUMAN_APPROVAL_TOKEN_REQUIRED'
}
# Close final race window, then irrevocably consume the ONE-ATTEMPT marker.
$p2=Get-Printer -Name 'CAIXA' -ErrorAction Stop
if($p2.DriverName -ne 'EPSON TM-T20 ReceiptE4' -or
 $p2.PortName -ne 'ESDPRT001' -or [string]$p2.PrinterStatus -ne 'Normal' -or
 @(Get-PrintJob -PrinterName 'CAIXA' -ErrorAction Stop).Count -ne 0){
 throw 'HOLD_QUEUE_OR_DRIVER_CHANGED_IMMEDIATELY_BEFORE_PRINT'
}
$f=[IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{
 $v=[Text.Encoding]::ASCII.GetBytes('V748_RAW_SINGLE_SYNTHETIC_ATTEMPT_NO_RETRY')
 $f.Write($v,0,$v.Length);$f.Flush($true)
}finally{$f.Dispose()}
$source=@'
using System;
using System.Runtime.InteropServices;
public static class TataRawOnceV748 {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 public class DocInfo {
  [MarshalAs(UnmanagedType.LPWStr)]public string pDocName;
  [MarshalAs(UnmanagedType.LPWStr)]public string pOutputFile;
  [MarshalAs(UnmanagedType.LPWStr)]public string pDatatype;
 }
 [DllImport("winspool.drv",EntryPoint="OpenPrinterW",SetLastError=true,CharSet=CharSet.Unicode)]
 public static extern bool OpenPrinter(string name,out IntPtr h,IntPtr defaults);
 [DllImport("winspool.drv",EntryPoint="StartDocPrinterW",SetLastError=true,CharSet=CharSet.Unicode)]
 public static extern int StartDocPrinter(IntPtr h,int level,[In]DocInfo info);
 [DllImport("winspool.drv",SetLastError=true)]public static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv",SetLastError=true)]public static extern bool WritePrinter(IntPtr h,byte[] bytes,int length,out int written);
 [DllImport("winspool.drv",SetLastError=true)]public static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv",SetLastError=true)]public static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv",SetLastError=true)]public static extern bool ClosePrinter(IntPtr h);
}
'@
Add-Type -TypeDefinition $source
$handle=[IntPtr]::Zero;$docStarted=$false;$pageStarted=$false;$wrote=0;$jobId=0
try{
 if(-not [TataRawOnceV748]::OpenPrinter('CAIXA',[ref]$handle,[IntPtr]::Zero)){
  throw 'RAW_OPENPRINTER_FAILED_NO_RETRY'
 }
 $info=New-Object TataRawOnceV748+DocInfo
 $info.pDocName='TATA_V748_RAW_FICTICIO_NAO_PRODUZIR'
 $info.pDatatype='RAW'
 $info.pOutputFile=$null
 $jobId=[TataRawOnceV748]::StartDocPrinter($handle,1,$info)
 if($jobId -le 0){throw 'RAW_STARTDOC_FAILED_NO_RETRY'}
 $docStarted=$true
 if(-not [TataRawOnceV748]::StartPagePrinter($handle)){throw 'RAW_STARTPAGE_FAILED_NO_RETRY'}
 $pageStarted=$true
 if(-not [TataRawOnceV748]::WritePrinter($handle,$raw,$raw.Length,[ref]$wrote)){
  throw 'RAW_WRITE_FAILED_NO_RETRY'
 }
 if($wrote -ne $raw.Length){throw 'RAW_PARTIAL_WRITE_NO_RETRY'}
 [pscustomobject]@{status='V748_SINGLE_RAW_SYNTHETIC_JOB_ATTEMPTED';
  job_id=$jobId;data_type='RAW';copies=1;bytes_written=$wrote;
  marker_created=$true;print_fully_on_paper_unverified=$true;
  real_orders_used=$false;driver_changed=$false;teknisa_modified=$false}|ConvertTo-Json -Compress
}finally{
 if($pageStarted){[void][TataRawOnceV748]::EndPagePrinter($handle)}
 if($docStarted){[void][TataRawOnceV748]::EndDocPrinter($handle)}
 if($handle -ne [IntPtr]::Zero){[void][TataRawOnceV748]::ClosePrinter($handle)}
}
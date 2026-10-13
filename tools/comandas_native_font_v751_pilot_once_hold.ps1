param(
 [switch]$PrintOnce,
 [string]$Approval=''
)
# V7.51 CAIXA_MOOCA native-font comparison; no print by default, no driver/service mutation.
# Device ESC t / ESC E / ESC G state persistence across future Teknisa jobs is UNVERIFIED; require human approval.
$ErrorActionPreference='Stop'
$dir='C:\ProgramData\TataComandaReader\pilot-readonly-20261013\figma-preview\calibration-fictitious-v741'
$payload=Join-Path $dir 'v750b-native-font-A-vs-B-offline.bin'
$bitmap=Join-Path $dir '01-producao-strong-contrast-final-v746.png'
$svg=Join-Path $dir '01-producao.svg'
$fixture=Join-Path $dir 'manifest-v741.json'
$marker=Join-Path $dir 'CAIXA_V751_NATIVE_FONT_ONCE_PRINT_ATTEMPT.marker'
$expectedPayload='624A3F8C310F6AE570A0B6768B9924AEA075FF75B2243C2F1D4992B2EB076BBE'
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
if($raw.Length -ne 842){throw 'HOLD_PACKET_SIZE_DRIFT'}
$header=[byte[]]@(27,116,2,27,97,0,29,33,0)
$footer=[byte[]]@(27,69,0,27,71,0,27,77,0,29,33,0,27,116,0,27,97,0)
for($i=0;$i -lt $header.Length;$i++){
 if($raw[$i] -ne $header[$i]){throw 'HOLD_FONT_PROTOCOL_HEADER_CHANGED'}
}
for($i=0;$i -lt $footer.Length;$i++){
 if($raw[$raw.Length-18+$i] -ne $footer[$i]){throw 'HOLD_FONT_RESET_TRAILER_CHANGED'}
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
if(Test-Path -LiteralPath $marker){throw 'HOLD_V751_ATTEMPT_ALREADY_MADE_NO_RETRY'}
if(-not $PrintOnce){
 [pscustomobject]@{status='V751_PREFLIGHT_ONLY_NOT_AUTHORIZED_TO_PRINT';
  source_hash=$expectedPayload;printer='CAIXA';port='ESDPRT001';
  copies=1;marker_exists=$false;queue_count=0;
  real_orders=$false;print_requested=$false;processor='winprint';
  port_monitor=$port.PortMonitor;driver_unchanged=$true;service_unchanged=$true;
  raw_transport_physically_unverified=$true}|ConvertTo-Json -Compress
 exit 0
}
# A new human confirmation specific to V7.51 is needed to print this candidate.
if($Approval -cne 'CESAR_EXPLICIT_V751_NATIVE_FONT_ONCE'){
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
 $v=[Text.Encoding]::ASCII.GetBytes('V751_NATIVE_FONT_SINGLE_SYNTHETIC_ATTEMPT_NO_RETRY')
 $f.Write($v,0,$v.Length);$f.Flush($true)
}finally{$f.Dispose()}
$source=@'
using System;
using System.Runtime.InteropServices;
public static class TataRawOnceV751 {
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
 if(-not [TataRawOnceV751]::OpenPrinter('CAIXA',[ref]$handle,[IntPtr]::Zero)){
  throw 'RAW_OPENPRINTER_FAILED_NO_RETRY'
 }
 $info=New-Object TataRawOnceV751+DocInfo
 $info.pDocName='TATA_V751_FONTES_NATIVAS_TESTE_NAO_PRODUZIR'
 $info.pDatatype='RAW'
 $info.pOutputFile=$null
 $jobId=[TataRawOnceV751]::StartDocPrinter($handle,1,$info)
 if($jobId -le 0){throw 'RAW_STARTDOC_FAILED_NO_RETRY'}
 $docStarted=$true
 if(-not [TataRawOnceV751]::StartPagePrinter($handle)){throw 'RAW_STARTPAGE_FAILED_NO_RETRY'}
 $pageStarted=$true
 if(-not [TataRawOnceV751]::WritePrinter($handle,$raw,$raw.Length,[ref]$wrote)){
  throw 'RAW_WRITE_FAILED_NO_RETRY'
 }
 if($wrote -ne $raw.Length){throw 'RAW_PARTIAL_WRITE_NO_RETRY'}
 [pscustomobject]@{status='V751_SINGLE_NATIVE_FONT_SYNTHETIC_JOB_ATTEMPTED';
  job_id=$jobId;data_type='RAW';copies=1;bytes_written=$wrote;
  marker_created=$true;print_fully_on_paper_unverified=$true;
  real_orders_used=$false;driver_changed=$false;teknisa_modified=$false}|ConvertTo-Json -Compress
}finally{
 if($pageStarted){[void][TataRawOnceV751]::EndPagePrinter($handle)}
 if($docStarted){[void][TataRawOnceV751]::EndDocPrinter($handle)}
 if($handle -ne [IntPtr]::Zero){[void][TataRawOnceV751]::ClosePrinter($handle)}
}
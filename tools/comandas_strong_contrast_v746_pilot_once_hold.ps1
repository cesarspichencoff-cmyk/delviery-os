param([switch]$PrintOnce)
# V7.46: separate future physical pilot, armed only with -PrintOnce after fresh human permission.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$dir='C:\ProgramData\TataComandaReader\pilot-readonly-20261013\figma-preview\calibration-fictitious-v741'
$png=Join-Path $dir '01-producao-strong-contrast-v746.png'
$svg=Join-Path $dir '01-producao.svg'
$marker=Join-Path $dir 'CAIXA_V746_ONCE_PRINT_ATTEMPT.marker'
$expectedPng='F9D67CE84F47E252E9BF9997B606D5266C9545590CC294F29CF671441F4E8A21'
$expectedSvg='A364477C4E7E53F02AD73D6023314069316BF8C8EFA236C350F93631EF260B63'
foreach($p in @($png,$svg)){if(-not(Test-Path -LiteralPath $p -PathType Leaf)){throw 'HOLD_SOURCE_MISSING'}}
if((Get-FileHash $png -Algorithm SHA256).Hash -ne $expectedPng -or
   (Get-FileHash $svg -Algorithm SHA256).Hash -ne $expectedSvg){throw 'HOLD_SOURCE_DRIFT'}
$t=[IO.File]::ReadAllText($svg,[Text.Encoding]::UTF8)
$sim='SIMULA'+[char]0x00C7+[char]0x00C3+'O'
$warn='N'+[char]0x00C3+'O PRODUZIR'
foreach($word in @('TESTE - NAO PRODUZIR / NAO DUPLICAR',$sim,$warn,
 'URAMAKI FICTICIO EXTRA ESPECIAL','0000000000')){
 if(-not $t.Contains($word)){throw 'HOLD_NOT_SYNTHETIC'}
}
$printer=Get-Printer -Name 'CAIXA' -ErrorAction Stop
if($printer.DriverName -ne 'EPSON TM-T20 ReceiptE4' -or $printer.PortName -ne 'ESDPRT001'){
 throw 'HOLD_DRIVER_OR_PORT_CHANGED'
}
if((Get-Service -Name Spooler -ErrorAction Stop).Status -ne 'Running'){
 throw 'HOLD_SPOOLER_DOWN'
}
$jobs=@(Get-PrintJob -PrinterName 'CAIXA' -ErrorAction Stop)
if($jobs.Count -ne 0 -or [string]$printer.PrinterStatus -ne 'Normal'){
 [pscustomobject]@{status='HOLD_QUEUE_OR_PRINTER_BUSY';job_count=$jobs.Count;printed=$false}|ConvertTo-Json -Compress
 exit 2
}
if(Test-Path -LiteralPath $marker){throw 'HOLD_V745_ALREADY_ATTEMPTED'}
$bmp=[Drawing.Bitmap]::FromFile($png)
try{
 if($bmp.Width -ne 576 -or $bmp.Height -ne 418 -or
    [math]::Abs($bmp.HorizontalResolution-203) -gt 1){throw 'HOLD_BITMAP_NOT_NATIVE_203DPI'}
 $settings=New-Object Drawing.Printing.PrinterSettings
 $settings.PrinterName='CAIXA'
 if(-not $settings.IsValid){throw 'HOLD_PRINTER_SETTINGS_INVALID'}
 $measure=$settings.CreateMeasurementGraphics()
 try{
  if([int]$measure.DpiX -ne 203 -or [int]$measure.DpiY -ne 203 -or
     [math]::Abs(($settings.DefaultPageSettings.PrintableArea.Width*203/100)-576) -gt 1){
   throw 'HOLD_DEVICE_GEOMETRY_CHANGED'
  }
 }finally{$measure.Dispose()}
 if(-not $PrintOnce){
  [pscustomobject]@{status='PREFLIGHT_ONLY_AUTHORIZATION_REQUIRED';printer='CAIXA';
   source_sha256=$expectedPng;source_dpi=203;image_width=576;
   future_render_unit='Pixel';future_render_bounds='576x418';queue_count=0;
   one_time_marker_exists=$false;print_requested=$false;print_authorized=$false}|ConvertTo-Json -Compress
  exit 0
 }
 # A new human authorization is mandatory before anyone invokes -PrintOnce.
 $p2=Get-Printer -Name 'CAIXA' -ErrorAction Stop
 if($p2.DriverName -ne 'EPSON TM-T20 ReceiptE4' -or $p2.PortName -ne 'ESDPRT001' -or
    [string]$p2.PrinterStatus -ne 'Normal' -or
    @(Get-PrintJob -PrinterName 'CAIXA' -ErrorAction Stop).Count -ne 0){
   throw 'HOLD_LAST_MOMENT_QUEUE_OR_CONFIG_CHANGE'
 }
 $f=[IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{
  $b=[Text.Encoding]::ASCII.GetBytes('SINGLE_V746_STRONG_CONTRAST_JOB_ATTEMPT_NO_AUTORETRY')
  $f.Write($b,0,$b.Length);$f.Flush($true)
 }finally{$f.Dispose()}
 $doc=New-Object Drawing.Printing.PrintDocument
 try{
  $doc.PrinterSettings.PrinterName='CAIXA'
  if(-not $doc.PrinterSettings.IsValid){throw 'HOLD_DOC_PRINTER_INVALID'}
  $doc.PrinterSettings.Copies=1
  $doc.DocumentName='TATA_V746_TESTE_CONTRASTE_FORTE_UNICO'
  $doc.PrintController=New-Object Drawing.Printing.StandardPrintController
  $doc.OriginAtMargins=$false
  $doc.DefaultPageSettings.Margins=New-Object Drawing.Printing.Margins(0,0,0,0)
  $doc.DefaultPageSettings.PaperSize=New-Object Drawing.Printing.PaperSize('TATA_SYNTHETIC_80MM',315,235)
  $script:nativeImage=$bmp
  $script:pageCounter=0
  $h=[Drawing.Printing.PrintPageEventHandler]{
   param($sender,$page)
   $script:pageCounter++
   if($script:pageCounter -ne 1){throw 'HOLD_UNEXPECTED_PAGE_COUNT'}
   if([int]$page.Graphics.DpiX -ne 203 -or [int]$page.Graphics.DpiY -ne 203){
    throw 'HOLD_PRINTPAGE_DPI_NOT_203'
   }
   if([math]::Abs(($page.PageSettings.PrintableArea.Width*203/100)-576) -gt 1){
    throw 'HOLD_PRINTPAGE_NOT_576_DOTS'
   }
   $page.Graphics.PageUnit=[Drawing.GraphicsUnit]::Pixel
   $page.Graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
   $page.Graphics.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::None
   $page.Graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::None
   $page.Graphics.DrawImage($script:nativeImage,(New-Object Drawing.Rectangle(0,0,576,418)))
   $page.HasMorePages=$false
  }
  $doc.add_PrintPage($h)
  try{$doc.Print()}finally{$doc.remove_PrintPage($h)}
  [pscustomobject]@{status='SINGLE_FICTITIOUS_JOB_REQUESTED';printer='CAIXA';
    document=$doc.DocumentName;copies=1;page_counter=$script:pageCounter;
    marker_created=$true;physical_paper_accepted=$false;
    service_changed=$false;teknisa_changed=$false;real_order_used=$false}|ConvertTo-Json -Compress
 }finally{$doc.Dispose()}
}finally{$bmp.Dispose()}

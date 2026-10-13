$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$dir='C:\ProgramData\TataComandaReader\pilot-readonly-20261013\figma-preview\calibration-fictitious-v737'
$png=Join-Path $dir 'calibration-gdi-render.png'
$svg=Join-Path $dir 'SOMENTE_TESTE_NAO_PRODUZIR.svg'
$marker=Join-Path $dir 'CAIXA_V737_ONCE_PRINT_ATTEMPT.marker'
$printer=Get-Printer -Name 'CAIXA' -ErrorAction Stop
if($printer.DriverName -ne 'EPSON TM-T20 ReceiptE4' -or $printer.PortName -ne 'ESDPRT001'){throw 'WRONG_PRINTER_DRIVER_OR_PORT'}
if(@(Get-PrintJob -PrinterName 'CAIXA' -ErrorAction SilentlyContinue).Count -ne 0){throw 'QUEUE_BUSY_NO_PILOT_PRINT'}
if(-not (Test-Path -LiteralPath $svg) -or -not (Test-Path -LiteralPath $png)){throw 'NO_FICTITIOUS_CALIBRATION_ARTIFACTS'}
if(-not ((Get-Content -LiteralPath $svg -Raw).Contains('PRODUZIR'))){throw 'NOT_MARKED_AS_TEST'}
$img=[Drawing.Image]::FromFile($png)
try{
 if($img.Width -ne 576 -or $img.Height -ne 386){throw 'IMAGE_DIMENSIONS_NOT_PROVEN'}
 if(Test-Path -LiteralPath $marker){throw 'ONCE_ONLY_MARKER_EXISTS'}
 $f=[IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{
  $bytes=[Text.Encoding]::ASCII.GetBytes('ONE_FICTITIOUS_RECEIPT_ONLY;DO_NOT_PRODUCE;2026-10-13')
  $f.Write($bytes,0,$bytes.Length);$f.Flush($true)
 }finally{$f.Dispose()}
 $doc=New-Object Drawing.Printing.PrintDocument
 try{
  $doc.PrinterSettings.PrinterName='CAIXA'
  if(-not $doc.PrinterSettings.IsValid){throw 'PRINTER_SETTINGS_INVALID'}
  $doc.PrinterSettings.Copies=1
  $doc.DocumentName='TATA_V737_TESTE_FICTICIO_NAO_PRODUZIR'
  $doc.PrintController=New-Object Drawing.Printing.StandardPrintController
  $doc.OriginAtMargins=$false
  $doc.DefaultPageSettings.Margins=New-Object Drawing.Printing.Margins(0,0,0,0)
  $doc.DefaultPageSettings.PaperSize=New-Object Drawing.Printing.PaperSize('TATA_FICTITIOUS_80MM',315,235)
  $handler=[Drawing.Printing.PrintPageEventHandler]{
    param($sender,$page)
    $page.Graphics.PageUnit=[Drawing.GraphicsUnit]::Display
    $page.Graphics.DrawImage($script:printImage,5,5,280,188)
    $page.HasMorePages=$false
  }
  $script:printImage=$img
  $doc.add_PrintPage($handler)
  try{$doc.Print()}finally{$doc.remove_PrintPage($handler)}
  [pscustomobject]@{status='FICTITIOUS_FIGMA_PRINT_REQUESTED_ONCE';printer='CAIXA';driver=$printer.DriverName;document='TATA_V737_TESTE_FICTICIO_NAO_PRODUZIR';copies=1;marker_created=(Test-Path $marker);real_order_reprinted=$false;teknisa_written=$false;physical_paper_accepted=$false}|ConvertTo-Json -Compress
 }finally{$doc.Dispose()}
}finally{$img.Dispose()}
param(
 [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$PreviewDirectory
)
# V7.44 offline simulated 203dpi explicit-pixel output, no printing. Never calls Print(), Get-PrintJob, service/driver mutation.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$dir=(Resolve-Path -LiteralPath $PreviewDirectory).Path
$manifestPath=Join-Path $dir 'manifest-v741.json'
if(-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)){throw 'SYNTHETIC_MANIFEST_REQUIRED'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($manifest.schema -ne 'tata.comandas.synthetic-calibration.v741' -or
   $manifest.status -ne 'FICTITIOUS_PREVIEW_ONLY' -or
   $manifest.real_order -ne $false -or
   $manifest.print_authorized -ne $false){throw 'FICTITIOUS_MANIFEST_INVALID'}
$p=Get-Printer -Name 'CAIXA' -ErrorAction Stop
if($p.DriverName -ne 'EPSON TM-T20 ReceiptE4' -or $p.PortName -ne 'ESDPRT001'){
 throw 'CAIXA_DRIVER_DRIFT'
}
$settings=New-Object Drawing.Printing.PrinterSettings
$settings.PrinterName='CAIXA'
$measurement=$settings.CreateMeasurementGraphics()
try{
 $dpi=[int]$measurement.DpiX
 $printable=[math]::Round($settings.DefaultPageSettings.PrintableArea.Width*$dpi/100,2)
 if($dpi -ne 203 -or [math]::Abs($printable-576) -ge 1){throw 'NATIVE_DOT_GEOMETRY_HOLD'}
}finally{$measurement.Dispose()}
$checks=@()
foreach($item in @(@('01-producao',418),@('02-conferencia',466))){
 $name=[string]$item[0]
 $expectedHeight=[int]$item[1]
 $input=Join-Path $dir ($name+'-fit-preview-v740.png')
 $output=Join-Path $dir ($name+'-native-203dpi-v744.png')
 if(Test-Path -LiteralPath $output){throw 'NO_REPEAT_OR_OVERWRITE_NATIVE_PROOF'}
 if(-not(Test-Path -LiteralPath $input -PathType Leaf)){throw 'INPUT_MISSING'}
 $file=Get-Item -LiteralPath $input
 if($file.Length -lt 500 -or $file.Length -gt 150000){throw 'BITMAP_BYTES_INVALID'}
 $source=[Drawing.Bitmap]::FromFile($input)
 try{
  if($source.Width -ne 576 -or $source.Height -ne $expectedHeight){
    throw 'INPUT_DIMENSIONS_INVALID'
  }
  $dest=New-Object Drawing.Bitmap(576,$expectedHeight,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $dest.SetResolution(203,203)
  try{
   $g=[Drawing.Graphics]::FromImage($dest)
   try{
    $g.Clear([Drawing.Color]::White)
    $g.PageUnit=[Drawing.GraphicsUnit]::Pixel
    $g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::None
    $g.CompositingQuality=[Drawing.Drawing2D.CompositingQuality]::HighSpeed
    $g.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::None
    $g.DrawImage($source,(New-Object Drawing.Rectangle(0,0,576,$expectedHeight)))
   }finally{$g.Dispose()}
   $changed=0;$gray=0;$black=0;$white=0
   for($y=0;$y -lt $source.Height;$y++){
    for($x=0;$x -lt $source.Width;$x++){
     $a=$source.GetPixel($x,$y)
     $b=$dest.GetPixel($x,$y)
     if($a.ToArgb() -ne $b.ToArgb()){$changed++}
     if($a.R -ne $a.G -or $a.G -ne $a.B -or
        ($a.R -ne 0 -and $a.R -ne 255)){$gray++}
     if($a.R -eq 0){$black++}
     if($a.R -eq 255){$white++}
    }
   }
   if($changed -ne 0 -or $gray -ne 0 -or ($black+$white) -ne (576*$expectedHeight)){
    throw 'NATIVE_COPY_IS_NOT_BIT_EXACT_BINARY'
   }
   $dest.Save($output,[Drawing.Imaging.ImageFormat]::Png)
   $verified=[Drawing.Bitmap]::FromFile($output)
   try{
    if($verified.Width -ne 576 -or $verified.Height -ne $expectedHeight -or
       [math]::Abs($verified.HorizontalResolution-203) -gt 1){
      throw 'NATIVE_OUTPUT_SIZE_CHANGED'
    }
   }finally{$verified.Dispose()}
   $checks += [pscustomobject]@{
     name=$name
     source_width=576
     source_dpi=[math]::Round($source.HorizontalResolution,2)
     output_dpi=[math]::Round($dest.HorizontalResolution,2)
     native_output_height=$expectedHeight
     source_black_pixels=$black
     source_white_pixels=$white
     intermediate_gray_pixels=$gray
     offscreen_changed_pixels=$changed
     offscreen_bit_exact=$true
     output_sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
   }
  }finally{$dest.Dispose()}
 }finally{$source.Dispose()}
}
[pscustomobject]@{
 schema='tata.comandas.native-width-explicit-203dpi-offline.v744'
 status='OFFLINE_203DPI_EXPLICIT_BOUNDS_IDENTICAL'
 printer='CAIXA'
 measured_dpi=203
 measured_printable_width_dots=576
 current_pilot_scaling_display_width=280
 proposed_draw_unit='GraphicsUnit.Pixel'
 proposed_command='DrawImage explicit Rectangle(0,0,576,height) on GraphicsUnit.Pixel'
 printpage_physical_origin_unverified=$true
 prints_requested=0
 print_authorized=$false
 service_changed=$false
 driver_changed=$false
 spooler_changed=$false
 results=$checks
}|ConvertTo-Json -Depth 6 -Compress

param([string]$PrinterName='CAIXA')
# Read-only 203dpi/576dot audit. No PrintDocument.Print(), no spooler mutation.
$ErrorActionPreference='Stop'
if($PrinterName -ne 'CAIXA'){throw 'ONLY_CAIXA_READONLY_GEOMETRY'}
Add-Type -AssemblyName System.Drawing
$p=Get-Printer -Name $PrinterName -ErrorAction Stop
if($p.DriverName -ne 'EPSON TM-T20 ReceiptE4' -or $p.PortName -ne 'ESDPRT001'){
 throw 'PRINTER_DRIVER_PORT_UNVERIFIED'
}
$settings=New-Object Drawing.Printing.PrinterSettings
$settings.PrinterName=$PrinterName
if(-not $settings.IsValid){throw 'INVALID_PRINTER'}
$mg=$settings.CreateMeasurementGraphics()
try{
 $dpi=[double]$mg.DpiX
 $dpiy=[double]$mg.DpiY
 $a=$settings.DefaultPageSettings.PrintableArea
 $hard=[double]$settings.DefaultPageSettings.HardMarginX
 $dots=[math]::Round($a.Width*$dpi/100,2)
 $rasterPixels=576
 $oldWidthDisplay=280
 $oldDots=[math]::Round($oldWidthDisplay*$dpi/100,2)
 $newWidthPixels=576
 $safe=$dpi -eq 203 -and $dpiy -eq 203 -and
   [math]::Abs($dots-576) -lt 1.0
 $data=[pscustomobject]@{
  schema='tata.comandas.geometry-readonly.v742'
  status=if($safe){'MEASURED_576_DOT_TARGET'}else{'HOLD_GEOMETRY_MISMATCH'}
  printer=$PrinterName
  measured_dpi_x=$dpi
  measured_dpi_y=$dpiy
  printable_dots=$dots
  hard_margin_hundredths_inch=$hard
  prior_drawimage_width_display_units=$oldWidthDisplay
  prior_drawimage_effective_dots=$oldDots
  previous_raster_source_dots=$rasterPixels
  prior_scaling_deficit_dots=[math]::Round($rasterPixels-$oldDots,2)
  candidate_draw_unit='GraphicsUnit.Pixel'
  candidate_width_device_pixels=$newWidthPixels
  candidate_interpolation='NearestNeighbor'
  candidate_print_origin='TO_VALIDATE_AT_PRINTPAGE'
  candidate_not_installed=$true
  actual_print_event_graphics_unverified=$true
  grayscale_or_density_cause_unproven=$true
  printer_job_requested=$false
  spooler_modified=$false
  service_modified=$false
  driver_modified=$false
 }
 $data|ConvertTo-Json -Compress
 if(-not $safe){exit 2}
}finally{$mg.Dispose()}

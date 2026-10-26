param([Parameter(Mandatory=$true)][string]$PreviewDirectory)
# V7.46 strong contrast candidate: exclusively offline, from verified synthetic 203dpi bitmaps.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$dir=(Resolve-Path -LiteralPath $PreviewDirectory).Path
if(-not $dir.EndsWith('calibration-fictitious-v741')){throw 'SYNTHETIC_FIXTURE_ONLY'}
$m=Get-Content (Join-Path $dir 'manifest-v741.json') -Raw | ConvertFrom-Json
if($m.status -ne 'FICTITIOUS_PREVIEW_ONLY' -or $m.real_order -ne $false -or
   $m.print_authorized -ne $false){throw 'NO_REAL_ORDER_OR_PRINT'}
$scale=576.0/302.0
$samples=@(
 [pscustomobject]@{stem='01-producao';height=418;hash='F45AFF58944E614AE45C3D99CC79E13644D1DB4299AE193A4575EB5418160249'},
 [pscustomobject]@{stem='02-conferencia';height=466;hash='03EDD4D05099113C807045D5FB70DC898EB2690D2A8075C95924FECFC903CCE1'}
)
function bpp($p){return ([int]$p.R -eq 0 -and [int]$p.G -eq 0 -and [int]$p.B -eq 0)}
$out=@()
foreach($sample in $samples){
 $srcPath=Join-Path $dir ($sample.stem+'-native-203dpi-v744.png')
 $svgPath=Join-Path $dir ($sample.stem+'.svg')
 $destPath=Join-Path $dir ($sample.stem+'-strong-contrast-v746.png')
 if((Test-Path $destPath) -or -not(Test-Path $svgPath) -or -not(Test-Path $srcPath)){
  throw 'SOURCE_OR_ONCE_ONLY_FAILURE'
 }
 if((Get-FileHash $srcPath -Algorithm SHA256).Hash -ne $sample.hash){throw 'PINNED_RASTER_MISMATCH'}
 $settings=New-Object System.Xml.XmlReaderSettings
 $settings.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit
 $settings.XmlResolver=$null
 $reader=[System.Xml.XmlReader]::Create($svgPath,$settings)
 try{$doc=New-Object System.Xml.XmlDocument;$doc.XmlResolver=$null;$doc.Load($reader)}finally{$reader.Dispose()}
 if($doc.DocumentElement.LocalName -ne 'svg' -or
    $doc.DocumentElement.GetAttribute('width') -ne '302' -or
    -not $doc.DocumentElement.InnerText.Contains('TESTE - NAO PRODUZIR / NAO DUPLICAR')){
  throw 'EXPECTED_SYNTHETIC_FIGMA_SVG_MISSING'
 }
 $rows=@($false)*$sample.height;$primary=@($false)*$sample.height
 $texts=@($doc.SelectNodes('//*[local-name()="text"]'))
 foreach($n in $texts){
  $sz=[double]::Parse($n.GetAttribute('font-size'),[Globalization.CultureInfo]::InvariantCulture)
  $y=[double]::Parse($n.GetAttribute('y'),[Globalization.CultureInfo]::InvariantCulture)
  if($sz -lt 10){continue}
  $first=[math]::Max(0,[math]::Floor(($y-$sz*1.1)*$scale))
  $last=[math]::Min($sample.height-1,[math]::Ceiling(($y+2.0)*$scale))
  for($yy=$first;$yy -le $last;$yy++){
   $rows[$yy]=$true
   if($sz -ge 17){$primary[$yy]=$true}
  }
 }
 $src=[Drawing.Bitmap]::FromFile($srcPath)
 try{
  if($src.Width -ne 576 -or $src.Height -ne $sample.height -or
    [math]::Abs($src.HorizontalResolution-203) -gt 1){throw 'SOURCE_NOT_203DPI_576'}
  $dst=New-Object Drawing.Bitmap(576,$sample.height,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
  try{
   $dst.SetResolution(203,203)
   $darkBefore=0;$darkAfter=0;$extraPrimary=0;$extraSecondary=0
   $gray=0;$sourceGray=0;$marginChanges=0
   for($y=0;$y -lt $sample.height;$y++){
    for($x=0;$x -lt 576;$x++){
     $pixel=$src.GetPixel($x,$y)
     $dark=bpp $pixel
     if($pixel.R -ne $pixel.G -or $pixel.G -ne $pixel.B -or
       ($pixel.R -ne 0 -and $pixel.R -ne 255)){$sourceGray++}
     if($dark){$darkBefore++}
     $add=$false
     if(-not $dark -and $x -ge 30 -and $x -lt 540 -and $rows[$y]){
      # 1px horizontal black growth only where the next white pixel stays white.
      # Never close an original one-pixel white gap.
      if($x -gt 30 -and $x -lt 539 -and
         (bpp ($src.GetPixel(($x-1),$y))) -and
         -not (bpp ($src.GetPixel(($x+1),$y)))){$add=$true}
      # Stronger emphasis on >=17px headline, quantity and main item, preserving
      # original 1px white vertical gaps.
      if(-not $add -and $primary[$y] -and $y -gt 0 -and $y -lt ($sample.height-1) -and
         (bpp ($src.GetPixel($x,($y-1)))) -and
         -not (bpp ($src.GetPixel($x,($y+1))))){$add=$true}
     }
     $after=$dark -or $add
     if($after){$dst.SetPixel($x,$y,[Drawing.Color]::Black);$darkAfter++}
     else{$dst.SetPixel($x,$y,[Drawing.Color]::White)}
     if($add){if($primary[$y]){$extraPrimary++}else{$extraSecondary++}}
     if($add -and ($x -lt 30 -or $x -ge 540)){$marginChanges++}
    }
   }
   if($sourceGray -ne 0 -or $marginChanges -ne 0){throw 'SOURCE_OR_MARGIN_RISK'}
   $delta=$darkAfter-$darkBefore
   $growth=[math]::Round(100.0*$delta/$darkBefore,2)
   if($growth -lt 2 -or $growth -gt 25){throw ('GROWTH_OUTSIDE_SAFE_BUDGET_'+$growth)}
   if($extraPrimary -le 0 -or $extraSecondary -le 0){throw 'CONTRAST_ZONE_NOT_ENHANCED'}
   $dst.Save($destPath,[Drawing.Imaging.ImageFormat]::Png)
   $verify=[Drawing.Bitmap]::FromFile($destPath)
   try{
    if($verify.Width -ne 576 -or $verify.Height -ne $sample.height -or
       [math]::Abs($verify.HorizontalResolution-203) -gt 1){throw 'SAVED_BITMAP_INVALID'}
   }finally{$verify.Dispose()}
   $out += [pscustomobject]@{file=[IO.Path]::GetFileName($destPath);
    width=576;height=$sample.height;dpi=203;black_before=$darkBefore;
    black_after=$darkAfter;added_primary=$extraPrimary;added_secondary=$extraSecondary;
    black_coverage_growth_pct=$growth;source_gray_pixels=$sourceGray;
    changed_pixels_in_outer_margin=$marginChanges;
    sha256=(Get-FileHash $destPath -Algorithm SHA256).Hash}
  }finally{$dst.Dispose()}
 }finally{$src.Dispose()}
}
[pscustomobject]@{status='STRONG_CONTRAST_OFFLINE_CANDIDATE_ONLY';
 version='V7.46';read_only_sources=$true;synthetic_only=$true;
 print_requested=$false;print_authorized=$false;spooler_modified=$false;
 driver_modified=$false;service_modified=$false;
 tests=$out}|ConvertTo-Json -Compress -Depth 5

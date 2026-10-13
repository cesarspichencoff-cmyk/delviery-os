param([Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$PreviewDirectory)
# V7.49 experimental font rasterizer: 2x AA supersampling then 1-bit threshold; offline only.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dir = (Resolve-Path -LiteralPath $PreviewDirectory).Path
$scale = 576.0 / 302.0
$results = @()
foreach($stem in @('01-producao','02-conferencia')){
  $source = Join-Path $dir ($stem+'.svg')
  $dest = Join-Path $dir ($stem+'-font-aa-2x-v749.png')
  if(Test-Path -LiteralPath $dest){throw 'PREVIEW_ALREADY_EXISTS'}
  $file = Get-Item -LiteralPath $source
  if($file.Length -lt 100 -or $file.Length -gt 65536){throw 'SVG_SIZE_OUT_OF_BOUNDS'}
  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver = $null
  $reader = [System.Xml.XmlReader]::Create($source,$settings)
  try{$doc = New-Object System.Xml.XmlDocument; $doc.XmlResolver = $null; $doc.Load($reader)}finally{$reader.Dispose()}
  $svg = $doc.DocumentElement
  if($svg.LocalName -ne 'svg' -or $svg.GetAttribute('width') -ne '302' -or
     -not $svg.InnerText.Contains('NAO PRODUZIR')){throw 'TEST_PREVIEW_REQUIRED'}
  $h = [int]$svg.GetAttribute('height')
  if($h -lt 80 -or $h -gt 1300){throw 'SVG_HEIGHT_OUT_OF_BOUNDS'}
  $bmp = New-Object Drawing.Bitmap(1152,([int][Math]::Ceiling($h*$scale)*2))
  $g = [Drawing.Graphics]::FromImage($bmp)
  $measBmp = New-Object Drawing.Bitmap(400,400)
  $mg = [Drawing.Graphics]::FromImage($measBmp)
  $fitted = 0; $count = 0; $minFontSize = 100
  try{
    $g.Clear([Drawing.Color]::White)
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::None
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.ScaleTransform([single]($scale*2),[single]($scale*2))
    foreach($n in $svg.ChildNodes){
      if($n.NodeType -ne [System.Xml.XmlNodeType]::Element){continue}
      $count++;if($count -gt 140){throw 'ELEMENT_BUDGET_EXCEEDED'}
      switch($n.LocalName){
        'rect' {if($n.GetAttribute('fill') -ne '#fff'){throw 'UNEXPECTED_FILL'}}
        'line' {
          $x1=[single]::Parse($n.GetAttribute('x1'),[Globalization.CultureInfo]::InvariantCulture)
          $y1=[single]::Parse($n.GetAttribute('y1'),[Globalization.CultureInfo]::InvariantCulture)
          $x2=[single]::Parse($n.GetAttribute('x2'),[Globalization.CultureInfo]::InvariantCulture)
          $y2=[single]::Parse($n.GetAttribute('y2'),[Globalization.CultureInfo]::InvariantCulture)
          $p=New-Object Drawing.Pen([Drawing.Color]::Black,1)
          try{$g.DrawLine($p,$x1,$y1,$x2,$y2)}finally{$p.Dispose()}
        }
        'text' {
          if($n.GetAttribute('fill') -notin @('','#000')){throw 'UNEXPECTED_TEXT_COLOR'}
          $x=[single]::Parse($n.GetAttribute('x'),[Globalization.CultureInfo]::InvariantCulture)
          $y=[single]::Parse($n.GetAttribute('y'),[Globalization.CultureInfo]::InvariantCulture)
          $sz=[single]::Parse($n.GetAttribute('font-size'),[Globalization.CultureInfo]::InvariantCulture)
          if($sz -lt 7 -or $sz -gt 32){throw 'FONT_SIZE_OUT_OF_BOUNDS'}
          $family=if($n.GetAttribute('font-family').Contains('Barlow Condensed')){'Bahnschrift SemiBold Condensed'}else{'Consolas'}
          $style=if($n.GetAttribute('font-weight') -eq '700'){[Drawing.FontStyle]::Bold}else{[Drawing.FontStyle]::Regular}
          $fmt=[Drawing.StringFormat]::GenericTypographic
          try{
            $txt=$n.InnerText
            if($txt.Length -gt 180){throw 'TEXT_LENGTH_OUT_OF_BOUNDS'}
            $alignment=$n.GetAttribute('text-anchor')
            $maxWidth=if($alignment -eq 'end'){$x-12}else{275-$x}
            if($maxWidth -le 0){throw 'NO_AVAILABLE_TEXT_WIDTH'}
            $initial=$sz
            do{
              $font=New-Object Drawing.Font($family,$sz,$style,[Drawing.GraphicsUnit]::Pixel)
              $w=$mg.MeasureString($txt,$font,1000,$fmt).Width
              if($w -le $maxWidth){break}
              $font.Dispose()
              $sz=[Math]::Round($sz-0.5,1)
              if($sz -lt 14 -and $initial -ge 14){throw 'TEXT_CANNOT_FIT_AT_LEGIBLE_SIZE'}
              if($sz -lt 7){throw 'TEXT_CANNOT_FIT'}
            }while($true)
            if($sz -lt $initial){$fitted++}
            $minFontSize=[Math]::Min($minFontSize,$sz)
            try{
              $drawX=if($alignment -eq 'end'){$x-$w}else{$x}
              $point=New-Object Drawing.PointF([single]$drawX,[single]($y-$sz*0.95))
              $g.DrawString($txt,$font,[Drawing.Brushes]::Black,$point,$fmt)
            }finally{$font.Dispose()}
          }finally{$fmt.Dispose()}
        }
        default {throw ('UNSUPPORTED_SVG_TAG_'+$n.LocalName)}
      }
    }
    $native = New-Object Drawing.Bitmap(576,[int][Math]::Ceiling($h*$scale),[Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $native.SetResolution(203,203)
    $dark = 0
    $gray = 0
    try {
      for($yy=0;$yy -lt $native.Height;$yy++){
        for($xx=0;$xx -lt 576;$xx++){
          $sum=0
          foreach($dy in 0,1){foreach($dx in 0,1){
            $pix=$bmp.GetPixel(($xx*2+$dx),($yy*2+$dy))
            $sum+=(255-[int]$pix.R)
          }}
          $isBlack=$sum -ge 320
          if($isBlack){$native.SetPixel($xx,$yy,[Drawing.Color]::Black);$dark++}
          else{$native.SetPixel($xx,$yy,[Drawing.Color]::White)}
        }
      }
      if($dark -lt 1000){throw 'RASTER_TOO_LIGHT'}
      $native.Save($dest,[Drawing.Imaging.ImageFormat]::Png)
    } finally {$native.Dispose()}
    $results += [pscustomobject]@{file=[IO.Path]::GetFileName($dest);width=576;height=$bmp.Height;adjusted_text_lines=$fitted;source_elements=$count;dark_pixels=$dark;gray_pixels=$gray;mode='2x AntiAliasGridFit + binary threshold 320/1020';no_print=$true;source_unchanged=$true}
  }finally{$g.Dispose();$bmp.Dispose();$mg.Dispose();$measBmp.Dispose()}
}
$results | ConvertTo-Json -Compress

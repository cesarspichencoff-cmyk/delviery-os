$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$dir='C:\ProgramData\TataComandaReader\pilot-readonly-20261013\figma-preview\calibration-fictitious-v737'
$src=Join-Path $dir 'SOMENTE_TESTE_NAO_PRODUZIR.svg'
$dest=Join-Path $dir 'calibration-gdi-render.png'
if(Test-Path -LiteralPath $dest){throw 'NO_REPEATED_RENDER'}
$fi=Get-Item -LiteralPath $src
if($fi.Length -gt 30000 -or $fi.Length -lt 100){throw 'SVG_SIZE_INVALID'}
$settings=New-Object System.Xml.XmlReaderSettings
$settings.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit
$settings.XmlResolver=$null
$reader=[System.Xml.XmlReader]::Create($src,$settings)
try{$doc=New-Object System.Xml.XmlDocument;$doc.XmlResolver=$null;$doc.Load($reader)}finally{$reader.Dispose()}
$root=$doc.DocumentElement
if($root.LocalName -ne 'svg' -or $root.GetAttribute('width') -ne '302'){throw 'UNEXPECTED_SVG_TEMPLATE'}
if(-not $root.InnerText.Contains('PRODUZIR')){throw 'NOT_A_MARKED_FICTITIOUS_TEST'}
$h=[int]$root.GetAttribute('height')
if($h -lt 80 -or $h -gt 1600){throw 'HEIGHT_OUT_OF_BOUNDS'}
$scale=576/302.0
$bmp=New-Object System.Drawing.Bitmap(576,[int][Math]::Ceiling($h*$scale))
$g=[System.Drawing.Graphics]::FromImage($bmp)
$nodes=0
try {
 $g.Clear([Drawing.Color]::White)
 $g.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
 $g.TextRenderingHint=[Drawing.Text.TextRenderingHint]::AntiAliasGridFit
 $g.ScaleTransform([single]$scale,[single]$scale)
 foreach($n in $root.ChildNodes){
  if($n.NodeType -ne [System.Xml.XmlNodeType]::Element){continue}
  $nodes++
  if($nodes -gt 140){throw 'SVG_NODE_BUDGET'}
  switch($n.LocalName){
   'rect' {
    $x=[single]::Parse($n.GetAttribute('x'),[Globalization.CultureInfo]::InvariantCulture)
    $y=[single]::Parse($n.GetAttribute('y'),[Globalization.CultureInfo]::InvariantCulture)
    $w=[single]::Parse($n.GetAttribute('width'),[Globalization.CultureInfo]::InvariantCulture)
    $hh=[single]::Parse($n.GetAttribute('height'),[Globalization.CultureInfo]::InvariantCulture)
    if($n.GetAttribute('fill') -ne '#fff'){throw 'UNEXPECTED_RECT_FILL'}
    $g.FillRectangle([Drawing.Brushes]::White,$x,$y,$w,$hh)
    $pen=New-Object Drawing.Pen([Drawing.Color]::LightGray,0.7)
    try{$g.DrawRectangle($pen,$x,$y,$w,$hh)}finally{$pen.Dispose()}
   }
   'line' {
    $x1=[single]::Parse($n.GetAttribute('x1'),[Globalization.CultureInfo]::InvariantCulture)
    $y1=[single]::Parse($n.GetAttribute('y1'),[Globalization.CultureInfo]::InvariantCulture)
    $x2=[single]::Parse($n.GetAttribute('x2'),[Globalization.CultureInfo]::InvariantCulture)
    $y2=[single]::Parse($n.GetAttribute('y2'),[Globalization.CultureInfo]::InvariantCulture)
    $pen=New-Object Drawing.Pen([Drawing.Color]::Black,1)
    try{$g.DrawLine($pen,$x1,$y1,$x2,$y2)}finally{$pen.Dispose()}
   }
   'text' {
    if($n.GetAttribute('fill') -ne '#000'){throw 'UNEXPECTED_TEXT_COLOR'}
    $x=[single]::Parse($n.GetAttribute('x'),[Globalization.CultureInfo]::InvariantCulture)
    $baseline=[single]::Parse($n.GetAttribute('y'),[Globalization.CultureInfo]::InvariantCulture)
    $size=[single]::Parse($n.GetAttribute('font-size'),[Globalization.CultureInfo]::InvariantCulture)
    $weight=$n.GetAttribute('font-weight')
    if($size -lt 7 -or $size -gt 32){throw 'FONT_SIZE_INVALID'}
    $family=if($n.GetAttribute('font-family').Contains('Barlow Condensed')){'Arial Narrow'}else{'Consolas'}
    $style=if($weight -eq '700'){$([Drawing.FontStyle]::Bold)}else{$([Drawing.FontStyle]::Regular)}
    $font=New-Object Drawing.Font($family,$size,$style,[Drawing.GraphicsUnit]::Pixel)
    try{
     $text=$n.InnerText
     if($text.Length -gt 180){throw 'LONG_LINE_NEEDS_WRAP'}
     $fmt=[Drawing.StringFormat]::GenericTypographic
     try{
      if($n.GetAttribute('text-anchor') -eq 'end'){$x-=($g.MeasureString($text,$font,1000,$fmt)).Width}
      $g.DrawString($text,$font,[Drawing.Brushes]::Black,(New-Object Drawing.PointF($x,($baseline-$size*.95))),$fmt)
     }finally{$fmt.Dispose()}
    }finally{$font.Dispose()}
   }
   default {throw ('UNSUPPORTED_SVG_TAG_'+$n.LocalName)}
  }
 }
 $bmp.Save($dest,[Drawing.Imaging.ImageFormat]::Png)
}finally{$g.Dispose();$bmp.Dispose()}
$check=[Drawing.Image]::FromFile($dest)
try{
 [pscustomobject]@{status='GDI_SVG_SUBSET_RENDERED';width=$check.Width;height=$check.Height;bytes=(Get-Item $dest).Length;svg_nodes=$nodes;synthetic_only=$true;printer_jobs_submitted=0}|ConvertTo-Json -Compress
}finally{$check.Dispose()}
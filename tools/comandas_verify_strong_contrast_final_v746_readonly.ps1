$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$source=@'
using System;
using System.Drawing;
public static class ContrastFinalMetricsV746 {
 public static long[] Compare(string before,string after){
  using(var b=new Bitmap(before))using(var a=new Bitmap(after)){
   if(b.Width!=576||a.Width!=576||b.Height!=a.Height||
      Math.Abs(b.HorizontalResolution-203)>1||Math.Abs(a.HorizontalResolution-203)>1)
    throw new Exception("DIMENSIONS_OR_DPI_CHANGED");
   long orig=0,next=0,lost=0,gray=0,margin=0;
   for(int y=0;y<b.Height;y++)for(int x=0;x<576;x++){
    var p=b.GetPixel(x,y);var q=a.GetPixel(x,y);
    if(q.R!=q.G||q.R!=q.B||(q.R!=0&&q.R!=255))gray++;
    if(p.R==0)orig++;
    if(q.R==0)next++;
    if(p.R==0&&q.R!=0)lost++;
    if((x<30||x>=540)&&p.ToArgb()!=q.ToArgb())margin++;
   }
   return new[]{orig,next,lost,gray,margin};
  }
 }
}
'@
Add-Type -TypeDefinition $source -ReferencedAssemblies 'System.Drawing'
$dir='C:\ProgramData\TataComandaReader\pilot-readonly-20261013\figma-preview\calibration-fictitious-v741'
$results=@()
foreach($stem in @('01-producao','02-conferencia')){
 $before=Join-Path $dir ($stem+'-native-203dpi-v744.png')
 $after=Join-Path $dir ($stem+'-strong-contrast-final-v746.png')
 $m=[ContrastFinalMetricsV746]::Compare($before,$after)
 if($m[2] -ne 0 -or $m[3] -ne 0 -or $m[4] -ne 0){throw 'CONTRAST_REGRESSION_DETECTED'}
 $growth=[Math]::Round(100.0*($m[1]-$m[0])/$m[0],2)
 if($growth -lt 10 -or $growth -gt 24){throw 'FINAL_GROWTH_OUT_OF_BOUNDS'}
 $results += [pscustomobject]@{view=$stem;black_before=$m[0];black_after=$m[1];growth_pct=$growth;
  baseline_black_pixels_lost=$m[2];gray_pixels=$m[3];outer_margin_changed_pixels=$m[4];
  image_hash=(Get-FileHash $after -Algorithm SHA256).Hash}
}
$results|ConvertTo-Json -Compress

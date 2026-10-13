$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$source=@'
using System;
using System.Collections.Generic;
using System.Drawing;
public static class WhiteCounterAuditV746 {
 public static int[] Scan(string path, int x0, int y0, int x1, int y1) {
  using(var bmp=new Bitmap(path)) {
   int w=x1-x0, h=y1-y0;
   if(x0<0||y0<0||x1>bmp.Width||y1>bmp.Height||w<5||h<5)throw new Exception("ROI_INVALID");
   bool[] white=new bool[w*h],seen=new bool[w*h];
   for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
    var p=bmp.GetPixel(x+x0,y+y0);
    if(p.R!=p.G||p.R!=p.B||(p.R!=0&&p.R!=255))throw new Exception("GRAY_NOT_ALLOWED");
    white[y*w+x]=p.R==255;
   }
   int holes=0, minArea=int.MaxValue, totalArea=0, topArea=0;
   int[] offsets=new[]{-1,1,-w,w};
   for(int idx=0;idx<white.Length;idx++) {
    if(!white[idx]||seen[idx])continue;
    var q=new Queue<int>();q.Enqueue(idx);seen[idx]=true;
    bool touches=false;int area=0;
    while(q.Count>0){
     int i=q.Dequeue(),x=i%w,y=i/w;area++;
     if(x==0||y==0||x==w-1||y==h-1)touches=true;
     foreach(int offset in offsets) {
      int j=i+offset;
      if(j<0||j>=white.Length)continue;
      int jx=j%w,jy=j/w;
      if(Math.Abs(jx-x)+Math.Abs(jy-y)!=1)continue;
      if(white[j]&&!seen[j]){seen[j]=true;q.Enqueue(j);}
     }
    }
    if(!touches){holes++;totalArea+=area;minArea=Math.Min(minArea,area);topArea=Math.Max(topArea,area);}
   }
   return new[]{holes,minArea==int.MaxValue?0:minArea,totalArea,topArea};
  }
 }
}
'@
Add-Type -TypeDefinition $source -ReferencedAssemblies 'System.Drawing'
$dir='C:\ProgramData\TataComandaReader\pilot-readonly-20261013\figma-preview\calibration-fictitious-v741'
$cases=@(@('01-producao',90,195,533,238),@('02-conferencia',90,186,533,231))
$out=@()
foreach($case in $cases){
 $stem=[string]$case[0];$rect=@([int]$case[1],[int]$case[2],[int]$case[3],[int]$case[4])
 $a=Join-Path $dir ($stem+'-native-203dpi-v744.png')
 $b=Join-Path $dir ($stem+'-strong-contrast-final-v746.png')
 $before=[WhiteCounterAuditV746]::Scan($a,$rect[0],$rect[1],$rect[2],$rect[3])
 $after=[WhiteCounterAuditV746]::Scan($b,$rect[0],$rect[1],$rect[2],$rect[3])
 $out += [pscustomobject]@{view=$stem;white_counters_before=$before[0];white_counters_after=$after[0];
  min_counter_area_before=$before[1];min_counter_area_after=$after[1];
  total_counter_area_before=$before[2];total_counter_area_after=$after[2];
  glyph_counters_not_lost=($after[0] -ge $before[0])}
}
$out|ConvertTo-Json -Compress
if(@($out|Where-Object {-not $_.glyph_counters_not_lost}).Count -gt 0){exit 2}

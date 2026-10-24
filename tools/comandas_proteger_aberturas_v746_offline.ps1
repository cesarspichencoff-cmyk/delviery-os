$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$source=@'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
public static class ContrastCounterPreservationV746 {
 static List<List<Point>> Enclosed(Bitmap b,int x0,int y0,int x1,int y1) {
  int w=x1-x0,h=y1-y0;
  var white=new bool[w*h];var seen=new bool[w*h];
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
   var c=b.GetPixel(x+x0,y+y0);
   if(c.R!=c.G||c.R!=c.B||(c.R!=0&&c.R!=255))
     throw new Exception("NONBINARY_SOURCE");
   white[y*w+x]=c.R==255;
  }
  var result=new List<List<Point>>();
  var dx=new[]{-1,1,0,0};var dy=new[]{0,0,-1,1};
  for(int i=0;i<white.Length;i++){
   if(!white[i]||seen[i])continue;
   var q=new Queue<int>();q.Enqueue(i);seen[i]=true;
   bool border=false;var pixels=new List<Point>();
   while(q.Count>0){
    int n=q.Dequeue(),x=n%w,y=n/w;
    pixels.Add(new Point(x+x0,y+y0));
    if(x==0||y==0||x==w-1||y==h-1)border=true;
    for(int d=0;d<4;d++){
     int xx=x+dx[d],yy=y+dy[d];
     if(xx<0||yy<0||xx>=w||yy>=h)continue;
     int j=yy*w+xx;
     if(white[j]&&!seen[j]){seen[j]=true;q.Enqueue(j);}
    }
   }
   if(!border)result.Add(pixels);
  }
  return result;
 }
 public static int[] Restore(string baseline,string candidate,string output,int y0,int y1){
  using(var src=new Bitmap(baseline))using(var stronger=new Bitmap(candidate)){
   if(src.Width!=576||stronger.Width!=576||src.Height!=stronger.Height||
      Math.Abs(src.HorizontalResolution-203)>1||
      Math.Abs(stronger.HorizontalResolution-203)>1)
    throw new Exception("EXPECTED_SAME_203DPI");
   using(var dst=new Bitmap(src.Width,src.Height,PixelFormat.Format24bppRgb)){
    dst.SetResolution(203,203);
    using(var g=Graphics.FromImage(dst)){
     g.PageUnit=GraphicsUnit.Pixel;
     g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
     g.DrawImage(stronger,new Rectangle(0,0,576,src.Height));
    }
    var previous=Enclosed(src,90,y0,533,y1);
    if(previous.Count!=8)throw new Exception("COUNTER_FIXTURE_EXPECTED_EIGHT_"+previous.Count);
    var protect=new HashSet<int>();int restored=0;
    foreach(var component in previous){
     if(component.Count<5)throw new Exception("BASELINE_ALREADY_SMALL_COUNTER");
     foreach(var p in component){
      protect.Add(p.Y*576+p.X);
      if(dst.GetPixel(p.X,p.Y).R==0){dst.SetPixel(p.X,p.Y,Color.White);restored++;}
     }
    }
    int removedArtifacts=0;
    foreach(var component in Enclosed(dst,90,y0,533,y1)){
     bool original=false;
     foreach(var p in component)if(protect.Contains(p.Y*576+p.X)){original=true;break;}
     if(!original&&component.Count<=4){
      foreach(var p in component){dst.SetPixel(p.X,p.Y,Color.Black);removedArtifacts++;}
     }
    }
    var final=Enclosed(dst,90,y0,533,y1);
    if(final.Count!=previous.Count)
     throw new Exception("GLYPH_COUNTER_TOPOLOGY_DRIFT_"+final.Count);
    if(restored<1||restored>250)throw new Exception("RESTORED_COUNTERS_OUT_OF_BOUNDS_"+restored);
    dst.Save(output,ImageFormat.Png);
    return new[]{previous.Count,final.Count,restored,removedArtifacts};
   }
  }
 }
}
'@
Add-Type -TypeDefinition $source -ReferencedAssemblies 'System.Drawing'
$dir='C:\ProgramData\TataComandaReader\pilot-readonly-20261013\figma-preview\calibration-fictitious-v741'
$cases=@(@('01-producao',195,238,'F45AFF58944E614AE45C3D99CC79E13644D1DB4299AE193A4575EB5418160249'),
@('02-conferencia',186,231,'03EDD4D05099113C807045D5FB70DC898EB2690D2A8075C95924FECFC903CCE1'))
$results=@()
foreach($c in $cases){
 $name=[string]$c[0]
 $before=Join-Path $dir ($name+'-native-203dpi-v744.png')
 $candidate=Join-Path $dir ($name+'-strong-contrast-v746.png')
 $final=Join-Path $dir ($name+'-strong-contrast-final-v746.png')
 if(Test-Path $final){throw 'ONCE_ONLY_ARTIFACT_EXISTS'}
 if((Get-FileHash $before -Algorithm SHA256).Hash -ne [string]$c[3]){throw 'ORIGINAL_SOURCE_DRIFT'}
 $stats=[ContrastCounterPreservationV746]::Restore($before,$candidate,$final,[int]$c[1],[int]$c[2])
 $results += [pscustomobject]@{
  view=$name;baseline_glyph_counters=$stats[0];candidate_glyph_counters=$stats[1];
  preserved_original_white_pixels=$stats[2];new_pinholes_filled=$stats[3];
  final_sha256=(Get-FileHash $final -Algorithm SHA256).Hash;
  print_requested=$false}
}
$results|ConvertTo-Json -Compress

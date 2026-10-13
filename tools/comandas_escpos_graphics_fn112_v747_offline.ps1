param([Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$FixtureDirectory)
# OFFLINE ONLY. Epson GS ( L fn112 / fn50 binary proof; not a printer transport.
# No printer connection, spooler operations, service calls, device writes, or side effects outside fixture.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$dir=(Resolve-Path -LiteralPath $FixtureDirectory).Path
if(-not $dir.EndsWith('calibration-fictitious-v741')){throw 'ONLY_KNOWN_SYNTHETIC_FIXTURE'}
$fixture=Join-Path $dir 'manifest-v741.json'
if(-not(Test-Path -LiteralPath $fixture)){throw 'MANIFEST_NOT_FOUND'}
$m=Get-Content -LiteralPath $fixture -Raw | ConvertFrom-Json
if($m.schema -ne 'tata.comandas.synthetic-calibration.v741' -or
   $m.status -ne 'FICTITIOUS_PREVIEW_ONLY' -or
   $m.print_authorized -ne $false -or $m.real_order -ne $false){
 throw 'NOT_A_FICTITIOUS_OFFLINE_FIXTURE'
}
$source=@'
using System;
using System.IO;
using System.Drawing;
using System.Collections.Generic;
using System.Security.Cryptography;
public static class TataEscPosFn112V747 {
 static readonly byte[] PrintBuffered = new byte[]{0x1d,0x28,0x4c,0x02,0x00,0x30,0x32};
 static void Require(bool condition,string error){if(!condition)throw new Exception(error);}
 static bool Black(Color c){
  Require(c.A==255 && c.R==c.G && c.G==c.B && (c.R==0 || c.R==255),"NON_BINARY_PIXEL");
  return c.R==0;
 }
 static byte[] Packet(Bitmap img,out int black){
  int w=img.Width,h=img.Height;
  Require(w==576 && h>0 && h<=1000,"PIXEL_DIMENSIONS_NOT_ALLOWED");
  Require(Math.Abs(img.HorizontalResolution-203)<1 && Math.Abs(img.VerticalResolution-203)<1,"DPI_NOT_203");
  int bytesPerRow=w/8, length=bytesPerRow*h, p=10+length;
  Require(p>=11 && p<=65535,"ESC_POS_PACKET_LENGTH_INVALID");
  byte[] packet=new byte[15+length+PrintBuffered.Length];
  packet[0]=0x1d;packet[1]=0x28;packet[2]=0x4c;
  packet[3]=(byte)(p & 255);packet[4]=(byte)(p >> 8);
  packet[5]=0x30;packet[6]=0x70;packet[7]=0x30;
  packet[8]=1;packet[9]=1;packet[10]=0x31;
  packet[11]=(byte)(w & 255);packet[12]=(byte)(w >> 8);
  packet[13]=(byte)(h & 255);packet[14]=(byte)(h >> 8);
  black=0;
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
   if(Black(img.GetPixel(x,y))){
    packet[15+y*bytesPerRow+(x>>3)] |= (byte)(0x80>>(x&7));
    black++;
   }
  }
  Buffer.BlockCopy(PrintBuffered,0,packet,15+length,PrintBuffered.Length);
  return packet;
 }
 static int DecodeAndCompare(Bitmap img,byte[] p){
  int w=img.Width,h=img.Height;
  int data=(w/8)*h;
  Require(p.Length==15+data+7,"PACKET_TOTAL_LENGTH_INVALID");
  Require(p[0]==0x1d && p[1]==0x28 && p[2]==0x4c,"GS_L_MAGIC_INVALID");
  Require((p[3]+256*p[4])==10+data,"GS_L_PARAM_LENGTH_INVALID");
  Require(p[5]==0x30 && p[6]==0x70 && p[7]==0x30,"FN112_INVALID");
  Require(p[8]==1 && p[9]==1 && p[10]==0x31,"SCALE_COLOR_NOT_STANDARD");
  Require((p[11]+256*p[12])==w && (p[13]+256*p[14])==h,"GEOMETRY_HEADER_INVALID");
  for(int i=0;i<7;i++)Require(p[15+data+i]==PrintBuffered[i],"FN50_TRAILER_INVALID");
  int diff=0;
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
   bool bit=(p[15+y*(w/8)+(x>>3)]&(0x80>>(x&7)))!=0;
   if(bit!=Black(img.GetPixel(x,y)))diff++;
  }
  return diff;
 }
 public static Dictionary<string,object> Prove(string source,string destination,int expectedHeight,int expectedBlack){
  Require(!File.Exists(destination),"PROOF_ALREADY_EXISTS_NO_OVERWRITE");
  using(Bitmap img=new Bitmap(source)){
   Require(img.Width==576 && img.Height==expectedHeight,"SOURCE_DIMENSIONS_DRIFT");
   int black;
   byte[] packet=Packet(img,out black);
   Require(black==expectedBlack,"SOURCE_DENSITY_DRIFT");
   int diff=DecodeAndCompare(img,packet);
   Require(diff==0,"RASTER_ROUNDTRIP_NOT_EXACT");
   byte[] corrupt=(byte[])packet.Clone();
   corrupt[15] ^= 0x80;
   Require(DecodeAndCompare(img,corrupt)==1,"MUTATION_TEST_DID_NOT_DETECT_BIT_FLIP");
   byte[] badHeader=(byte[])packet.Clone();
   badHeader[8]=2;
   bool rejected=false;
   try{DecodeAndCompare(img,badHeader);}catch(Exception){rejected=true;}
   Require(rejected,"HEADER_MUTATION_NOT_REJECTED");
   int data=(img.Width/8)*img.Height;
   using(FileStream output=new FileStream(destination,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
    output.Write(packet,0,packet.Length);
    output.Flush(true);
   }
   using(SHA256 sha=SHA256.Create()){
    string hash=BitConverter.ToString(sha.ComputeHash(packet)).Replace("-","");
    return new Dictionary<string,object>{
     {"file",Path.GetFileName(destination)},{"sha256",hash},
     {"width",img.Width},{"height",img.Height},{"dpi",Math.Round(img.HorizontalResolution,2)},
     {"black_pixels",black},{"bytes_per_row",72},{"raw_raster_bytes",data},
     {"fn112_bytes",15+data},{"fn50_bytes",7},{"total_bytes",packet.Length},
     {"roundtrip_pixel_differences",diff},{"flip_one_bit_test_detected",true},
     {"header_corruption_rejected",rejected},{"single_graphics_store",true},
     {"single_graphics_print_command",true},{"cut_command",false},
     {"initialization_command",false},{"spooler_write",false}
    };
   }
  }
 }
}
'@
Add-Type -TypeDefinition $source -ReferencedAssemblies @('System.Drawing')
$targets=@(
 [pscustomobject]@{stem='01-producao';h=418;black=19192;sha='7360CF74DFAA6C957EEE4E355C7AF92242CB6F3A8C85C81C9AC104BB122A604B'},
 [pscustomobject]@{stem='02-conferencia';h=466;black=25141;sha='2193E0A3FA0D9D8D6443FA154CD156ADBDF25CA66D797FF202DB240A8F0E48CC'}
)
$out=@()
foreach($t in $targets){
 $p=Join-Path $dir ($t.stem+'-strong-contrast-final-v746.png')
 if(-not (Test-Path -LiteralPath $p -PathType Leaf)){throw 'EXPECTED_SOURCE_MISSING'}
 if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -ne $t.sha){throw 'SHA256_SOURCE_IDENTITY_DRIFT'}
 $dest=Join-Path $dir ($t.stem+'-offline-fn112-fn50-v747.bin')
 $out += [TataEscPosFn112V747]::Prove($p,$dest,$t.h,$t.black)
}
[pscustomobject]@{schema='tata.comandas.escpos-graphics-offline.v747';
 status='OFFLINE_EPS_PINNED_ROUNDTRIP_PASS';
 protocol='Epson GS ( L fn112 followed by GS ( L fn50';
 source_fixture='SYNTHETIC_ONLY';
 actual_TM_T20_hardware_support_unverified=$true;
 Windows_RAW_port_transport_unverified=$true;
 no_printer_job_requested=$true;
 no_automatic_print=$true;
 no_service_or_driver_modifications=$true;
 no_real_orders=$true;
 proofs=$out}|ConvertTo-Json -Compress -Depth 6

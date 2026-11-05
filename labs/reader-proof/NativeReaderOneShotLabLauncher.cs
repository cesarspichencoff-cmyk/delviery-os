// Windows GUI subsystem, LAB-ONLY one-shot launcher for receipt-only Node code.
// NOT authorized for CAIXA_MOOCA and no access to production reader directories.
using System;
using System.Diagnostics;
using System.IO;
namespace DeliveryOS.ReaderLab {
 public static class NativeReaderOneShotLabLauncher {
  const string ForbiddenHost="CAIXA_MOOCA";
  const string LabName="deliveryos-reader-proof-lab";
  const string Marker="DELIVERYOS_READER_PROOF_LAB_ONLY_V1";
  static bool ValidRoot(string source,out string root) {
   root=null;
   try {
    if(String.IsNullOrWhiteSpace(source)||!Path.IsPathRooted(source)||
       source.Contains("\""))return false;
    var full=Path.GetFullPath(source).TrimEnd('\\','/');
    if(!String.Equals(Path.GetFileName(full),LabName,StringComparison.OrdinalIgnoreCase))
     return false;
    var dir=new DirectoryInfo(full);
    if(!dir.Exists||(dir.Attributes&FileAttributes.ReparsePoint)!=0)return false;
    var marker=Path.Combine(full,"LAB_ONLY.txt");
    var item=new FileInfo(marker);
    if(!item.Exists || item.Length>80 ||
       (item.Attributes&FileAttributes.ReparsePoint)!=0)return false;
    if(File.ReadAllText(marker).Trim()!=Marker)return false;
    root=full;return true;
   }catch{return false;}
  }
  static string Arg(string a) { return "\""+a+"\""; }
  [STAThread]public static int Main(string[] args) {
   // FIRST operation refuses to run on the productive cashier host.
   if(String.Equals(Environment.MachineName,ForbiddenHost,
       StringComparison.OrdinalIgnoreCase))return 77;
   if(args==null||args.Length!=3||!args[0].StartsWith("--lab-dir=",StringComparison.Ordinal)||
      !args[1].StartsWith("--node-path=",StringComparison.Ordinal)||
      !args[2].StartsWith("--script-path=",StringComparison.Ordinal))return 78;
   string lab; if(!ValidRoot(args[0].Substring("--lab-dir=".Length),out lab))return 79;
   var node=args[1].Substring("--node-path=".Length);
   var script=args[2].Substring("--script-path=".Length);
   try{
    if(node.Contains("\"")||script.Contains("\"")||!Path.IsPathRooted(node)||
       !Path.IsPathRooted(script)||
       !String.Equals(Path.GetFileName(node),"node.exe",StringComparison.OrdinalIgnoreCase)||
       !String.Equals(Path.GetFileName(script),"native_reader_one_shot_lab_cli_v1.cjs",
         StringComparison.OrdinalIgnoreCase)||!File.Exists(node)||!File.Exists(script))
     return 80;
    if(File.Exists(Path.Combine(lab,"receipt.json")))return 81;
    var settings=new ProcessStartInfo {
     FileName=node,Arguments=Arg(script)+" "+Arg("--lab-dir="+lab),
     WorkingDirectory=lab,UseShellExecute=false,CreateNoWindow=true,
     WindowStyle=ProcessWindowStyle.Hidden,
     RedirectStandardOutput=true,RedirectStandardError=true
    };
    using(var p=new Process()){
     p.StartInfo=settings;
     // Discard output even if a child dependency unexpectedly prints it.
     p.OutputDataReceived+=(s,e)=>{};p.ErrorDataReceived+=(s,e)=>{};
     if(!p.Start())return 82;
     p.BeginOutputReadLine();p.BeginErrorReadLine();
     if(!p.WaitForExit(12000)){try{p.Kill();}catch{}return 83;}
     if(p.ExitCode!=0)return 84;
    }
    var receipt=Path.Combine(lab,"receipt.json");
    var info=new FileInfo(receipt);
    if(!info.Exists||info.Length<32||info.Length>2048||
       (info.Attributes&FileAttributes.ReparsePoint)!=0)return 85;
    return 0;
   }catch{return 86;}
  }
 }
}

// LAB ONLY: candidate GUI-subsystem launcher for synthetic GetIn job shapes.
// Not a production service, installer, scheduler action or GetIn integration.
// Refuses CAIXA_MOOCA and any environment outside disposable GitHub Actions.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;

namespace DeliveryOS.GetInSilentLab {
 public static class LabGuiLauncher {
  const string LabName="deliveryos-getin-silent-lab";
  const string Marker="DELIVERYOS_GETIN_SILENT_DISPOSABLE_LAB_V1";
  static int Denied(string state) {return 77;}
  static bool ValidLab(string value,out string full) {
   full=null;
   try {
    if(String.IsNullOrWhiteSpace(value)||!Path.IsPathRooted(value))return false;
    string p=Path.GetFullPath(value).TrimEnd('\\','/');
    if(!String.Equals(Path.GetFileName(p),LabName,StringComparison.OrdinalIgnoreCase))return false;
    FileAttributes a=File.GetAttributes(p);
    if((a&FileAttributes.Directory)==0||(a&FileAttributes.ReparsePoint)!=0)return false;
    string mark=Path.Combine(p,"LAB_ONLY.txt");
    FileInfo f=new FileInfo(mark);
    if(!f.Exists||f.Length>128||(f.Attributes&FileAttributes.ReparsePoint)!=0)return false;
    if(File.ReadAllText(mark).Trim()!=Marker)return false;
    full=p;return true;
   }catch{return false;}
  }
  static void Receipt(string dir,string mode,string state,bool childStarted) {
   // No process IDs, customer data, executable paths or environment values.
   string json="{\"schema\":\"deliveryos.getin-gui-launcher-lab.v1\","+
    "\"mode\":\""+mode+"\",\"state\":\""+state+"\","+
    "\"childStarted\":"+(childStarted?"true":"false")+","+
    "\"source\":\"FICTIONAL_ONLY\",\"ordersPublishable\":0,"+
    "\"fieldProof\":false,\"shellExecuted\":false,\"customerDataExported\":false}\n";
   string tmp=Path.Combine(dir,"launcher.receipt.tmp");
   string dest=Path.Combine(dir,"launcher.receipt.json");
   File.WriteAllText(tmp,json,new UTF8Encoding(false));
   if(File.Exists(dest))File.Delete(dest);
   File.Move(tmp,dest);
  }
  [STAThread] public static int Main(string[] args) {
   if(String.Equals(Environment.MachineName,"CAIXA_MOOCA",StringComparison.OrdinalIgnoreCase)||
      Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true"||
      Environment.GetEnvironmentVariable("GITHUB_REPOSITORY")!="cesarspichencoff-cmyk/delviery-os"||
      String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("RUNNER_TEMP"))||
      String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GITHUB_WORKSPACE")))
    return 77;
   if(args==null||args.Length!=3||
      !args[0].StartsWith("--lab-dir=",StringComparison.Ordinal)||
      !args[1].StartsWith("--node-path=",StringComparison.Ordinal)||
      !args[2].StartsWith("--mode=",StringComparison.Ordinal))return 78;
   string mode=args[2].Substring(7);
   if(mode!="collector"&&mode!="visual")return 78;
   string lab;
   if(!ValidLab(args[0].Substring(10),out lab))return 79;
   string node=args[1].Substring(12);
   if(!Path.IsPathRooted(node)||
      !String.Equals(Path.GetFileName(node),"node.exe",StringComparison.OrdinalIgnoreCase)||
      !File.Exists(node))return 79;
   string root=Environment.GetEnvironmentVariable("GITHUB_WORKSPACE");
   string fixture=Path.GetFullPath(Path.Combine(root,"labs","getin-silent","synthetic-getin-job.cjs"));
   if(!File.Exists(fixture))return 79;
   // Argument path is controlled by the fixed checkout path, never passed by caller.
   var psi=new ProcessStartInfo();
   psi.FileName=node;
   psi.WorkingDirectory=lab;
   psi.Arguments="\""+fixture+"\" \"--lab-dir="+lab+"\" \"--mode="+mode+"\"";
   psi.UseShellExecute=false;
   psi.CreateNoWindow=true;
   psi.WindowStyle=ProcessWindowStyle.Hidden;
   psi.RedirectStandardInput=true;
   psi.RedirectStandardOutput=true;
   psi.RedirectStandardError=true;
   try{
    using(var child=Process.Start(psi)){
     if(child==null)return 80;
     child.StandardInput.Close();
     // Always drain both pipes: the real collection script can emit diagnostics.
     // Without readers, a full pipe can deadlock a healthy, silent Node child.
     // Discard text entirely; never export credentials, reservation content or PII.
     child.OutputDataReceived += (sender,e) => { };
     child.ErrorDataReceived += (sender,e) => { };
     child.BeginOutputReadLine();
     child.BeginErrorReadLine();
     // Short, bounded synthetic test; no console is created by this parent.
     if(!child.WaitForExit(9000)){child.Kill();child.WaitForExit(2000);return 81;}
     if(child.ExitCode!=0)return 82;
    }
    Receipt(lab,mode,"LAB_SYNTHETIC_CHILD_COMPLETED",true);
    return 0;
   }catch{return 83;}
  }
 }
}

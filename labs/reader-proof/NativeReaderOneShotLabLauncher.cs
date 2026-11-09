// Windows GUI subsystem, LAB-ONLY one-shot launcher for receipt-only Node code.
// NOT authorized for CAIXA_MOOCA and no access to production reader directories.
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Security.Cryptography;
namespace DeliveryOS.ReaderLab {
 public static class NativeReaderOneShotLabLauncher {
  const string ForbiddenHost="CAIXA_MOOCA";
  const string LabName="deliveryos-reader-proof-lab";
  const string Marker="DELIVERYOS_READER_PROOF_LAB_ONLY_V1";
  const string ApprovedRepository="cesarspichencoff-cmyk/delviery-os";
  const string ApprovedScriptGitBlob="8496af20f5e02d6d323bd62353292f696070cce4";
  // The launcher is a CI test artifact, not the field program.
  static bool ApprovedRunner() {
   return String.Equals(Environment.GetEnvironmentVariable("GITHUB_ACTIONS"),"true",
      StringComparison.OrdinalIgnoreCase) &&
      String.Equals(Environment.GetEnvironmentVariable("GITHUB_REPOSITORY"),ApprovedRepository,
      StringComparison.OrdinalIgnoreCase);
  }
  static bool CheckGitBlob(string full,string expected) {
   try{
    var info=new FileInfo(full);
    if(!info.Exists||info.Length<100||info.Length>65536||
       (info.Attributes&FileAttributes.ReparsePoint)!=0)return false;
    byte[] payload=File.ReadAllBytes(full);
    var prefix=Encoding.ASCII.GetBytes("blob "+payload.Length+"\0");
    var whole=new byte[prefix.Length+payload.Length];
    Buffer.BlockCopy(prefix,0,whole,0,prefix.Length);
    Buffer.BlockCopy(payload,0,whole,prefix.Length,payload.Length);
    string actual;
    using(var hash=SHA1.Create())
     actual=BitConverter.ToString(hash.ComputeHash(whole))
       .Replace("-","").ToLowerInvariant();
    Array.Clear(payload,0,payload.Length);
    Array.Clear(whole,0,whole.Length);
    return String.Equals(actual,expected,StringComparison.Ordinal);
   }catch{return false;}
  }
  static bool DependenciesMatch(string workspace) {
   var names=new[]{
    "native_reader_existing_event_binding_v1.cjs",
    "native_reader_n2n3_sanitized_receipt_v1.cjs",
    "native_reader_verified_legacy_hash_v1.cjs",
    "native_reader_producer_contract_review_v1.cjs",
    "native_reader_shadow_replay_v1.cjs"
   };
   var expected=new[]{
    "1552a560af3018a0d1b7c971528eb81287571502",
    "0f44bccd8acaf41465d3e8d8b15074badd0e7047",
    "6199f42c84a8fbf8170da9d05d0bbf024fc7dd1f",
    "70528fe678db944a4c098688fa608bbaef0ec3c0",
    "0d9fbe032e30371becc1fa1d469dac05131a92b5"
   };
   for(int i=0;i<names.Length;i++)
    if(!CheckGitBlob(Path.Combine(workspace,"runtime","reporting",names[i]),
        expected[i]))return false;
   return true;
  }
  static bool ScriptIdentity(string candidate) {
   try {
    var workspace=Environment.GetEnvironmentVariable("GITHUB_WORKSPACE");
    if(String.IsNullOrWhiteSpace(workspace))return false;
    string full=Path.GetFullPath(candidate);
    string expected=Path.GetFullPath(Path.Combine(workspace,"labs","reader-proof",
       "native_reader_one_shot_lab_cli_v1.cjs"));
    if(!String.Equals(full,expected,StringComparison.OrdinalIgnoreCase))return false;
    var info=new FileInfo(full);
    if(!info.Exists||info.Length<100||info.Length>65536||
       (info.Attributes&FileAttributes.ReparsePoint)!=0)return false;
    byte[] payload=File.ReadAllBytes(full);
    var header=Encoding.ASCII.GetBytes("blob "+payload.Length+"\0");
    var input=new byte[header.Length+payload.Length];
    Buffer.BlockCopy(header,0,input,0,header.Length);
    Buffer.BlockCopy(payload,0,input,header.Length,payload.Length);
    string actual;
    using(var sha=SHA1.Create())actual=BitConverter.ToString(sha.ComputeHash(input))
      .Replace("-","").ToLowerInvariant();
    Array.Clear(payload,0,payload.Length);
    Array.Clear(input,0,input.Length);
    if(!String.Equals(actual,ApprovedScriptGitBlob,StringComparison.Ordinal))return false;
    // The main script alone is NOT enough: pin every local module it imports.
    return DependenciesMatch(workspace);
   }catch{return false;}
  }
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
   if(!ApprovedRunner())return 87;
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
    // A same-name file supplied by the caller is NOT an acceptable program.
    if(!ScriptIdentity(script))return 88;
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

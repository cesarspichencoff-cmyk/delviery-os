// Windows HWND-to-process correlation. DISPOSABLE GitHub Windows LAB ONLY.
// Only matches the explicit synthetic fixture PID; no production executable,
// customer content, window title, clipboard, screenshots, network, or action.
using System;
using System.IO;
using System.Text;
using System.Globalization;
using System.Management;
using System.Runtime.InteropServices;
using System.Collections.Generic;

namespace DeliveryOS.WindowAttributionLab {
  public static class WindowAttributionLab {
    const string Marker="DELIVERYOS_WINDOW_ATTRIBUTION_DISPOSABLE_LAB_V1";
    const string LabFolder="deliveryos-window-attribution-lab";
    const string TargetExe="WindowAttributionFixture.exe";
    delegate bool WindowVisitor(IntPtr handle,IntPtr ignored);
    [DllImport("user32.dll",SetLastError=true)]
    static extern bool EnumWindows(WindowVisitor callback,IntPtr unused);
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr handle,out uint pid);
    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr handle);

    // Different read-only source for the process owner: Windows access token.
    // The Win32_Process.GetOwnerSid WMI method fails on some CI host contexts.
    // Never log, write, or return the SID outside the in-memory equality check.
    const uint ProcessQueryLimitedInformation=0x1000;
    const uint TokenQuery=0x0008;
    const int TokenUser=1;
    [DllImport("kernel32.dll",SetLastError=true)]
    static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("advapi32.dll",SetLastError=true)]
    static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)]
    static extern bool GetTokenInformation(IntPtr token,int type,IntPtr buffer,int length,out int required);
    [DllImport("advapi32.dll",EntryPoint="ConvertSidToStringSidW",SetLastError=true)]
    static extern bool ConvertSidToStringSid(IntPtr sid,out IntPtr stringSid);
    [DllImport("kernel32.dll",SetLastError=true)]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)]
    static extern IntPtr LocalFree(IntPtr pointer);
    static string ReadProcessOwnerSid(uint pid) {
      IntPtr process=IntPtr.Zero,token=IntPtr.Zero,buffer=IntPtr.Zero;
      try {
        process=OpenProcess(ProcessQueryLimitedInformation,false,pid);
        if(process==IntPtr.Zero)return null;
        if(!OpenProcessToken(process,TokenQuery,out token) || token==IntPtr.Zero)return null;
        int size=0;
        GetTokenInformation(token,TokenUser,IntPtr.Zero,0,out size);
        if(size<IntPtr.Size || size>8192)return null;
        buffer=Marshal.AllocHGlobal(size);
        int actual=0;
        if(!GetTokenInformation(token,TokenUser,buffer,size,out actual) ||
           actual<IntPtr.Size || actual>size)return null;
        IntPtr sid=Marshal.ReadIntPtr(buffer);
        if(sid==IntPtr.Zero)return null;
        IntPtr stringSid=IntPtr.Zero;
        try{
          if(!ConvertSidToStringSid(sid,out stringSid) || stringSid==IntPtr.Zero)return null;
          return Marshal.PtrToStringUni(stringSid);
        }finally{
          if(stringSid!=IntPtr.Zero)LocalFree(stringSid);
        }
      }catch{return null;}
      finally{
        if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);
        if(token!=IntPtr.Zero)CloseHandle(token);
        if(process!=IntPtr.Zero)CloseHandle(process);
      }
    }

    sealed class ProcessInfo {
      public uint Id,Parent,Session;
      public string Created,OwnerSid,Name;
    }
    sealed class LabStageError : Exception {
      public readonly string Stage;
      public LabStageError(string stage) {Stage=stage;}
    }
    static ProcessInfo Lookup(uint processId) {
      string stage="CONSTRUCT_QUERY";
      try {
        int count=0;
        ProcessInfo data=null;
        string query="SELECT Name,ProcessId,ParentProcessId,SessionId,CreationDate FROM Win32_Process WHERE ProcessId="+
          processId.ToString(CultureInfo.InvariantCulture);
        using(var search=new ManagementObjectSearcher(query)) {
          stage="QUERY_ROWS";
          using(var rows=search.Get()) {
            foreach(ManagementObject entry in rows) {
              using(entry) {
                count++;
                if(count>1)return null;
                stage="READ_ROW_FIELDS";
                var info=new ProcessInfo();
                info.Id=Convert.ToUInt32(entry["ProcessId"],CultureInfo.InvariantCulture);
                info.Parent=Convert.ToUInt32(entry["ParentProcessId"],CultureInfo.InvariantCulture);
                info.Session=Convert.ToUInt32(entry["SessionId"],CultureInfo.InvariantCulture);
                info.Created=Convert.ToString(entry["CreationDate"]);
                info.Name=Convert.ToString(entry["Name"]);
                stage="OWNER_TOKEN_READ";
                info.OwnerSid=ReadProcessOwnerSid(info.Id);
                if(String.IsNullOrWhiteSpace(info.OwnerSid))return null;
                data=info;
              }
            }
          }
        }
        return count==1?data:null;
      } catch {
        // Fixed stage string only; never include exception text or source values.
        throw new LabStageError(stage);
      }
    }
    static bool Same(ProcessInfo a,ProcessInfo b) {
      return a!=null && b!=null && a.Id!=0 && a.Id==b.Id && a.Parent==b.Parent &&
        a.Session==b.Session && String.Equals(a.OwnerSid,b.OwnerSid,StringComparison.Ordinal) &&
        String.Equals(a.Created,b.Created,StringComparison.Ordinal) &&
        String.Equals(a.Name,b.Name,StringComparison.OrdinalIgnoreCase);
    }
    static int VisibleCount(uint pid) {
      int count=0;
      if(!EnumWindows((h,ignored)=>{
        uint owner=0;
        GetWindowThreadProcessId(h,out owner);
        if(owner==pid && IsWindowVisible(h))count++;
        return true;
      },IntPtr.Zero)) throw new InvalidOperationException("ENUM_WINDOWS_FAILED");
      return count;
    }
    static bool ParseUInt(string s,out uint result) {
      return UInt32.TryParse(s,NumberStyles.None,CultureInfo.InvariantCulture,out result) && result!=0;
    }
    static bool ValidFolder(string arg,out string folder) {
      folder=null;
      try {
        if(String.IsNullOrWhiteSpace(arg) || !Path.IsPathRooted(arg)) return false;
        string full=Path.GetFullPath(arg).TrimEnd('\\','/');
        if(!String.Equals(Path.GetFileName(full),LabFolder,StringComparison.OrdinalIgnoreCase))
          return false;
        var attrs=File.GetAttributes(full);
        if((attrs&FileAttributes.Directory)==0 || (attrs&FileAttributes.ReparsePoint)!=0)return false;
        string marker=Path.Combine(full,"LAB_ONLY.txt");
        var fi=new FileInfo(marker);
        if(!fi.Exists || fi.Length>128 || (fi.Attributes&FileAttributes.ReparsePoint)!=0)return false;
        if(File.ReadAllText(marker).Trim()!=Marker)return false;
        folder=full;
        return true;
      }catch{return false;}
    }
    static string Inspect(uint pid,string created,uint parent,uint session,string ownerSid,out int hwndCount) {
      hwndCount=0;
      ProcessInfo before;
      try{before=Lookup(pid);}catch(LabStageError err){return "HOLD_PRELOOKUP_"+err.Stage;}
      catch{return "HOLD_PRELOOKUP_RUNTIME_ERROR";}
      if(before==null)return "HOLD_PROCESS_NOT_ATTESTED";
      if(!String.Equals(before.Name,TargetExe,StringComparison.OrdinalIgnoreCase))
        return "HOLD_NOT_SYNTHETIC_TARGET";
      if(!String.Equals(before.Created,created,StringComparison.Ordinal))
        return "HOLD_PROCESS_IDENTITY_MISMATCH";
      if(before.Parent!=parent)return "HOLD_PARENT_MISMATCH";
      if(before.Session!=session)return "HOLD_SESSION_MISMATCH";
      if(!String.Equals(before.OwnerSid,ownerSid,StringComparison.Ordinal))
        return "HOLD_OWNER_MISMATCH";
      try{hwndCount=VisibleCount(pid);}catch{return "HOLD_ENUM_WINDOWS_RUNTIME_ERROR";}
      ProcessInfo after;
      try{after=Lookup(pid);}catch{return "HOLD_POSTLOOKUP_RUNTIME_ERROR";}
      if(!Same(before,after))return "HOLD_PROCESS_CHANGED_DURING_OBSERVATION";
      if(hwndCount!=1)return "HOLD_NO_UNIQUE_VISIBLE_HWND";
      return "LAB_ONLY_SYNTHETIC_WINDOW_PROCESS_LINK";
    }
    static void Receipt(string folder,string state,int count) {
      // Only aggregate, bounded facts. Never publish PIDs, SIDs, titles, paths
      // command lines, handles, client data, or screenshots.
      string data="{\"schema\":\"deliveryos.window-attribution-lab.v1\","+
        "\"state\":\""+state+"\",\"source\":\"SYNTHETIC_WINDOWS_ONLY\","+
        "\"visibleHwndCount\":"+Math.Min(99,count).ToString(CultureInfo.InvariantCulture)+","+
        "\"ordersPublishable\":0,\"fieldProof\":false,"+
        "\"screenshotsTaken\":false,\"titlesRead\":false,"+
        "\"pidExported\":false,\"sidExported\":false,"+
        "\"commandLinesExported\":false,\"windowsModified\":0}\n";
      string temp=Path.Combine(folder,"receipt.json.tmp");
      string file=Path.Combine(folder,"receipt.json");
      File.WriteAllText(temp,data,new UTF8Encoding(false));
      if(File.Exists(file))File.Delete(file);
      File.Move(temp,file);
    }
    [STAThread] public static int Main(string[] args) {
      if(String.Equals(Environment.MachineName,"CAIXA_MOOCA",StringComparison.OrdinalIgnoreCase))
        return 77;
      if(Environment.GetEnvironmentVariable("GITHUB_ACTIONS")!="true" ||
         Environment.GetEnvironmentVariable("GITHUB_REPOSITORY")!="cesarspichencoff-cmyk/delviery-os" ||
         String.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("RUNNER_TEMP")))
        return 77;
      if(args==null || args.Length!=6)return 78;
      string[] keys={"--lab-dir=","--pid=","--created=","--parent=","--session=","--owner-sid="};
      for(int i=0;i<keys.Length;i++)if(!args[i].StartsWith(keys[i],StringComparison.Ordinal))
        return 78;
      string folder;
      if(!ValidFolder(args[0].Substring(keys[0].Length),out folder))return 79;
      uint pid,parent,session;
      if(!ParseUInt(args[1].Substring(keys[1].Length),out pid) ||
         !ParseUInt(args[3].Substring(keys[3].Length),out parent) ||
         !UInt32.TryParse(args[4].Substring(keys[4].Length),NumberStyles.None,
           CultureInfo.InvariantCulture,out session))return 78;
      string created=args[2].Substring(keys[2].Length);
      string sid=args[5].Substring(keys[5].Length);
      if(created.Length!=25 || sid.Length<5 || sid.Length>150)return 78;
      try{
        int count=0;
        string state=Inspect(pid,created,parent,session,sid,out count);
        Receipt(folder,state,count);
        return 0;
      }catch{
        try { Receipt(folder,"HOLD_INVENTORY_UNAVAILABLE",0);return 0; }
        catch {return 80;}
      }
    }
  }
}

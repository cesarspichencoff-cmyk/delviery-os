// Delivery OS — isolated Edge Windows inventory, evidence only.
// Compile /target:winexe /reference:System.Management.dll. No window control,
// navigation, browser attach, network, cookie access or customer output.
// Safety: laboratory-only until a separately authorized field version exists.
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.Threading;
using System.Management;
using System.Text.RegularExpressions;
using System.Globalization;
using System.Runtime.InteropServices;

namespace DeliveryOS.GestorReview {
  public static class DedicatedEdgeInventory {
    public const string Profile = @"C:\Users\Tata\AppData\Local\TataGestorObservationLab\DedicatedEdgeProfile";
    const string FixtureDir = "deliveryos-edge-inventory-lab";
    const string Marker = "DELIVERYOS_EDGE_INVENTORY_LAB_ONLY_V1";
    const string OutputName = "inventory.status.json";
    const string Source = "WINDOWS_WMI_AND_TOPLEVEL_ENUM_UNVERIFIED";
    const string Cashier = "CAIXA_MOOCA";

    [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CommandLineToArgvW(string commandLine, out int argumentCount);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr LocalFree(IntPtr memory);
    delegate bool WindowCallback(IntPtr window, IntPtr unused);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr unused);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);

    static string[] Tokens(string commandLine) {
      if (String.IsNullOrEmpty(commandLine) || commandLine.Length > 32768) return new string[0];
      int count = 0;
      IntPtr ptr = CommandLineToArgvW(commandLine, out count);
      if (ptr == IntPtr.Zero) return new string[0];
      try {
        if (count < 1 || count > 80) return new string[0];
        var args = new string[count];
        for (int i=0;i<count;i++)
          args[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(ptr, i * IntPtr.Size)) ?? "";
        return args;
      } finally { LocalFree(ptr); }
    }

    public static bool IsDedicatedMainEdge(string processName, string commandLine) {
      if (!String.Equals(processName, "msedge.exe", StringComparison.OrdinalIgnoreCase)) return false;
      var args = Tokens(commandLine);
      if (args.Length < 2) return false;
      int profileArguments = 0;
      for (int i=1;i<args.Length;i++) {
        var arg = args[i];
        if (arg.StartsWith("--type=", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(arg, "--type", StringComparison.OrdinalIgnoreCase)) return false;
        string value = null;
        if (arg.StartsWith("--user-data-dir=", StringComparison.OrdinalIgnoreCase))
          value = arg.Substring("--user-data-dir=".Length);
        else if (String.Equals(arg, "--user-data-dir", StringComparison.OrdinalIgnoreCase)) {
          if (++i >= args.Length) return false;
          value = args[i];
        } else continue;
        profileArguments++;
        if (String.IsNullOrWhiteSpace(value)) return false;
        try {
          string expected=Path.GetFullPath(Profile).TrimEnd('\\','/');
          string actual=Path.GetFullPath(value).TrimEnd('\\','/');
          if (!String.Equals(actual, expected, StringComparison.OrdinalIgnoreCase)) return false;
        } catch { return false; }
      }
      return profileArguments==1;
    }

    public static string ReviewForLab(IList<string> matchingMainCommands, int visibleTopLevels,
                                      int minimizedTopLevels) {
      if (matchingMainCommands==null || matchingMainCommands.Count!=1)
        return "HOLD_NO_UNIQUE_DEDICATED_PROCESS";
      if (!IsDedicatedMainEdge("msedge.exe", matchingMainCommands[0]))
        return "HOLD_PROFILE_NOT_MATCHED";
      if (visibleTopLevels!=1 || minimizedTopLevels!=0)
        return "HOLD_NO_UNIQUE_VISIBLE_WINDOW";
      return "CANDIDATE_UNVERIFIED";
    }

    // WMI may return a reused PID. Identity requires the SAME creation
    // timestamp, not merely the same numeric PID or executable name.
    public static bool SameInstanceIdentity(uint firstPid,string firstCreated,
                                            uint secondPid,string secondCreated) {
      return firstPid!=0 && firstPid==secondPid &&
        !String.IsNullOrEmpty(firstCreated) &&
        Regex.IsMatch(firstCreated, @"^[0-9]{14}\.[0-9]{6}[+-][0-9]{3}$") &&
        String.Equals(firstCreated,secondCreated,StringComparison.Ordinal);
    }

    static bool StillSameProcess(uint pid,string created,string originalCommand) {
      int matches=0;
      string where="SELECT Name,ProcessId,CreationDate,CommandLine FROM Win32_Process WHERE ProcessId="+
        pid.ToString(CultureInfo.InvariantCulture);
      using (var query=new ManagementObjectSearcher(where)) {
        using (var rows=query.Get()) {
          foreach (ManagementObject row in rows) {
            using(row) {
              if (++matches!=1) return false;
              uint current=Convert.ToUInt32(row["ProcessId"]);
              string createdNow=Convert.ToString(row["CreationDate"]);
              string name=Convert.ToString(row["Name"]);
              string command=Convert.ToString(row["CommandLine"]);
              if (!SameInstanceIdentity(pid,created,current,createdNow) ||
                  !IsDedicatedMainEdge(name,command) ||
                  !String.Equals(originalCommand,command,StringComparison.Ordinal))
                return false;
            }
          }
        }
      }
      return matches==1;
    }

    static void CountWindows(uint targetPid, out int visible, out int minimized) {
      int v=0,m=0;
      if (!EnumWindows((window, unused) => {
        uint owner;GetWindowThreadProcessId(window, out owner);
        if (owner==targetPid && IsWindowVisible(window)) {
          v++;
          if (IsIconic(window)) m++;
        }
        return true;
      }, IntPtr.Zero)) throw new InvalidOperationException("ENUM_WINDOWS_FAILED");
      visible=v;minimized=m;
    }

    static string Inspect() {
      var commands = new List<string>();
      var pids = new List<uint>();
      var creationTimes = new List<string>();
      using (var query = new ManagementObjectSearcher(
        "SELECT Name,ProcessId,CommandLine,CreationDate FROM Win32_Process WHERE Name='msedge.exe'")) {
        using (var rows = query.Get()) {
          foreach (ManagementObject process in rows) {
            using (process) {
              string name=Convert.ToString(process["Name"]);
              string command=Convert.ToString(process["CommandLine"]);
              if (!IsDedicatedMainEdge(name,command)) continue;
              commands.Add(command);
              pids.Add(Convert.ToUInt32(process["ProcessId"]));
              creationTimes.Add(Convert.ToString(process["CreationDate"]));
            }
          }
        }
      }
      if (commands.Count!=1) return "HOLD_NO_UNIQUE_DEDICATED_PROCESS";
      if (!StillSameProcess(pids[0],creationTimes[0],commands[0]))
        return "HOLD_PROCESS_IDENTITY_UNVERIFIED";
      int v,m;CountWindows(pids[0],out v,out m);
      if (!StillSameProcess(pids[0],creationTimes[0],commands[0]))
        return "HOLD_PROCESS_CHANGED_DURING_OBSERVATION";
      return ReviewForLab(commands,v,m);
    }

    static bool ValidLabDirectory(string input, out string path) {
      path=null;
      try {
        if (String.IsNullOrWhiteSpace(input) || !Path.IsPathRooted(input)) return false;
        string full=Path.GetFullPath(input).TrimEnd('\\','/');
        if (!String.Equals(Path.GetFileName(full),FixtureDir,
          StringComparison.OrdinalIgnoreCase)) return false;
        var attributes=File.GetAttributes(full);
        if ((attributes & FileAttributes.ReparsePoint)!=0 ||
            (attributes & FileAttributes.Directory)==0) return false;
        string marker=Path.Combine(full,"LAB_ONLY.txt");
        var info=new FileInfo(marker);
        if (!info.Exists || info.Length>128 ||
           (info.Attributes & FileAttributes.ReparsePoint)!=0) return false;
        if (File.ReadAllText(marker).Trim()!=Marker) return false;
        path=full;return true;
      } catch { return false; }
    }

    static void WriteStatus(string folder,string state) {
      // No PID, HWND, command line, order text, account data or browser URL in result.
      string utc=DateTime.UtcNow.ToString("o",System.Globalization.CultureInfo.InvariantCulture);
      string json="{\"schema\":\"deliveryos.gestor-os-inventory-lab.v1\","+
        "\"state\":\""+state+"\",\"observedAtUtc\":\""+utc+"\","+
        "\"source\":\""+Source+"\","+
        "\"merchantVerified\":false,\"sessionVerified\":false,"+
        "\"ordersPublishable\":0,\"hideAuthorized\":false,"+
        "\"windowActionsExecuted\":0,\"browserAttached\":false,"+
        "\"commandLinesExported\":false,\"personalDataExported\":false}\n";
      var file=Path.Combine(folder,OutputName);
      var temp=file+".writing";
      File.WriteAllText(temp,json,new UTF8Encoding(false));
      if (File.Exists(file)) File.Delete(file);
      File.Move(temp,file);
    }

    [STAThread] public static int Main(string[] args) {
      // No executing on a productive workstation, irrespective of arguments.
      if (String.Equals(Environment.MachineName,Cashier,StringComparison.OrdinalIgnoreCase))
        return 77;
      // The optional bounded hold is ONLY for visibility measurements on a lab VM.
      bool hold=(args!=null && args.Length==2 &&
        String.Equals(args[1],"--hold-visibility-lab-only",StringComparison.Ordinal));
      if (args==null || (args.Length!=1 && !hold) ||
          !args[0].StartsWith("--lab-dir=",StringComparison.Ordinal))
        return 78;
      string folder;
      if (!ValidLabDirectory(args[0].Substring("--lab-dir=".Length),out folder)) return 79;
      string state;
      try { state=Inspect(); } catch { state="HOLD_INVENTORY_UNAVAILABLE"; }
      try {
        WriteStatus(folder,state);
        if (hold) Thread.Sleep(1200); // observable runtime; no UI or background service
        return 0;
      } catch { return 80; }
    }
  }
}

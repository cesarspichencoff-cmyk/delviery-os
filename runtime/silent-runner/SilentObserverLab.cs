// Delivery OS — isolated, zero-console fixture runner (Windows .NET Framework 4.x).
// Compile with: csc.exe /nologo /target:winexe /platform:x64 /out:SilentObserverLab.exe SilentObserverLab.cs
// FIXTURE ONLY. Never controls a browser, scheduled task, reader, network or operator UI.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Globalization;

namespace DeliveryOS.SilentLab {
  internal static class SilentObserverLab {
    private const string MarkerName = "DELIVERYOS_LAB_ONLY.txt";
    private const string MarkerValue = "DELIVERYOS_SILENT_TEST_ONLY_V1";
    private const string InputName = "input.fixture";
    private const string StatusName = "status.json";
    private const string MutexName = @"Local\DeliveryOS_Silent_Fixture_Only_v1";
    private const string ExpectedDirectory = "deliveryos-silent-lab";
    private static readonly Encoding StrictUtf8 = new UTF8Encoding(false, true);

    [STAThread]
    private static int Main(string[] args) {
      try {
      // Fixture executable itself refuses the cashier, not only the test harness.
      if (String.Equals(Environment.MachineName, "CAIXA_MOOCA", StringComparison.OrdinalIgnoreCase)) return 27;
      // No uncaught managed exceptions: WinExe errors must never display an OS dialog.
      // Windows GUI subsystem (winexe) guarantees no console owned by this executable.
      // A shell used by an external launcher is outside this program's control.
      string root;
      int ticks, sleepMs;
      if (!TryArguments(args, out root, out ticks, out sleepMs)) return 20;
      string folder;
      if (!ValidateFixtureFolder(root, out folder)) return 21;
      bool fresh;
      using (var mutex = new Mutex(true, MutexName, out fresh)) {
        if (!fresh) return 22;
        try {
          for (int tick = 1; tick <= ticks; tick++) {
            string state = "HOLD_INVALID_FIXTURE";
            string reason = "SCHEMA_OR_VALUES_INVALID";
            try {
              if (!ValidateFixtureFolder(root, out folder)) return 23;
              if (ReadValidFixture(Path.Combine(folder, InputName))) {
                state = "HOLD_FIXTURE_ONLY";
                reason = "NO_REAL_MERCHANT_OR_ORDER_PROOF";
              }
              PairEvidence evidence = state == "HOLD_FIXTURE_ONLY" ?
                SnapshotPairAdapter.Evaluate(folder,DateTime.UtcNow) : new PairEvidence();
              WriteStatus(folder, state, reason, tick, evidence);
            } catch (IOException) {
              return 24;
            } catch (UnauthorizedAccessException) {
              return 25;
            }
            if (tick < ticks) Thread.Sleep(sleepMs);
          }
          return 0;
        } finally {
          try { mutex.ReleaseMutex(); } catch (ApplicationException) { }
        }
      }
      } catch (Exception) { return 26; }
    }

    private static bool TryArguments(string[] args, out string root, out int ticks, out int sleepMs) {
      root = null;
      ticks = 0;
      sleepMs = 0;
      if (args == null || args.Length != 3) return false;
      var seen = new HashSet<string>(StringComparer.Ordinal);
      foreach (string arg in args) {
        if (arg == null) return false;
        int equals = arg.IndexOf('=');
        if (equals < 1) return false;
        string key = arg.Substring(0, equals);
        string value = arg.Substring(equals + 1);
        if (!seen.Add(key)) return false;
        int number;
        if (key == "--fixture-dir") root = value;
        else if (key == "--ticks" && int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out number)) ticks = number;
        else if (key == "--sleep-ms" && int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out number)) sleepMs = number;
        else return false;
      }
      return root != null && ticks >= 1 && ticks <= 8 && sleepMs >= 100 && sleepMs <= 1000;
    }

    private static bool ValidateFixtureFolder(string supplied, out string folder) {
      folder = null;
      if (String.IsNullOrWhiteSpace(supplied)) return false;
      try {
        string full = Path.GetFullPath(supplied.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        if (!String.Equals(Path.GetFileName(full), ExpectedDirectory, StringComparison.OrdinalIgnoreCase)) return false;
        if (!Directory.Exists(full)) return false;
        var attributes = File.GetAttributes(full);
        if ((attributes & FileAttributes.ReparsePoint) != 0) return false;
        var marker = Path.Combine(full, MarkerName);
        if (!File.Exists(marker)) return false;
        var markerInfo = new FileInfo(marker);
        if (markerInfo.Length > 128 || (markerInfo.Attributes & FileAttributes.ReparsePoint) != 0) return false;
        if (!String.Equals(File.ReadAllText(marker, StrictUtf8).Trim(), MarkerValue, StringComparison.Ordinal)) return false;
        folder = full;
        return true;
      } catch (ArgumentException) { return false; }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
        catch (NotSupportedException) { return false; }
    }

    private static bool ReadValidFixture(string inputFile) {
      if (!File.Exists(inputFile)) return false;
      var fi = new FileInfo(inputFile);
      if (fi.Length > 1024 || (fi.Attributes & FileAttributes.ReparsePoint) != 0) return false;
      string[] lines = File.ReadAllLines(inputFile, StrictUtf8);
      if (lines.Length != 4) return false;
      var expected = new Dictionary<string,string>(StringComparer.Ordinal) {
        {"schema", "deliveryos.silent-fixture.v1"},
        {"source", "FICTIONAL_ONLY"},
        {"reader", "CONTROL_DIAGNOSTIC_NOT_REAL_PROOF"},
        {"gestor", "STRUCTURE_ONLY_UNVERIFIED"}
      };
      foreach (string line in lines) {
        int equals = line.IndexOf('=');
        if (equals < 1 || equals != line.LastIndexOf('=')) return false;
        string key = line.Substring(0,equals);
        string value = line.Substring(equals+1);
        if (!expected.ContainsKey(key)) return false;
        if (!String.Equals(expected[key], value, StringComparison.Ordinal)) return false;
        expected.Remove(key);
      }
      return expected.Count == 0;
    }

    private static void WriteStatus(string folder, string state, string reason, int tick, PairEvidence evidence) {
      // No data from the fixture is included in the output. No IDs, names or order bodies.
      string payload = "{\n"+
       "  \"schema\": \"deliveryos.silent-fixture-status.v1\",\n"+
       "  \"state\": \""+state+"\",\n"+
       "  \"reason\": \""+reason+"\",\n"+
       "  \"source\": \"FICTIONAL_ONLY\",\n"+
       "  \"checkedAtUtc\": \""+DateTime.UtcNow.ToString("o",CultureInfo.InvariantCulture)+"\",\n"+
       "  \"tick\": "+tick.ToString(CultureInfo.InvariantCulture)+",\n"+
       "  \"pairState\": \""+evidence.State+"\",\n"+
       "  \"syntheticPairCount\": "+evidence.SyntheticMatches.ToString(CultureInfo.InvariantCulture)+",\n"+
       "  \"readerFixtureRecords\": "+evidence.ReaderFixtureRecords.ToString(CultureInfo.InvariantCulture)+",\n"+
       "  \"gestorFixtureRecords\": "+evidence.GestorFixtureRecords.ToString(CultureInfo.InvariantCulture)+",\n"+
       "  \"readerDiagnosticRecent\": "+(evidence.ReaderFresh ? "true":"false")+",\n"+
       "  \"gestorStructureRecent\": "+(evidence.GestorFresh ? "true":"false")+",\n"+
       "  \"orderIdentityProven\": false,\n"+
       "  \"realReaderJoinProven\": false,\n"+
       "  \"merchantVerified\": false,\n"+
       "  \"readerJoinProven\": false,\n"+
       "  \"detailItemsProven\": false,\n"+
       "  \"ordersPublishable\": 0,\n"+
       "  \"orderIdsExported\": 0,\n"+
       "  \"customerFieldsExported\": 0,\n"+
       "  \"windowActions\": 0,\n"+
       "  \"networkRequests\": 0\n"+
       "}\n";
      string tmp = Path.Combine(folder,"status.writing");
      string status = Path.Combine(folder,StatusName);
      // Refuse leftover links, unexpected files or a concurrent writer.
      if (File.Exists(tmp) || Directory.Exists(tmp)) throw new IOException("WRITING_PATH_EXISTS");
      if (File.Exists(status)) {
        var previous = new FileInfo(status);
        if (previous.Length > 4096 || (previous.Attributes & FileAttributes.ReparsePoint) != 0)
          throw new IOException("UNSAFE_STATUS_TARGET");
      }
      File.WriteAllText(tmp,payload,StrictUtf8);
      if (File.Exists(status)) File.Replace(tmp,status,null);
      else File.Move(tmp,status);
    }
  }
}

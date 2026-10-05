using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Text;

namespace TataComandaReader.ContinuousHostV2
{
    internal static class Program
    {
        private static void Main()
        {
            ServiceBase.Run(new ContinuousReaderService());
        }
    }

    internal sealed class ContinuousReaderService : ServiceBase
    {
        private readonly object _sync = new object();
        private Process _watcher;
        private Process _shadow;
        private volatile bool _stopping;

        private const string ServiceNameValue = "TataComandaReader";
        private const string WatcherScript =
            @"C:\ProgramData\TataComandaReader\bin\tata_reader_continuous_watch_candidate_v1.ps1";
        private const string ShadowLoop =
            @"C:\ProgramData\TataComandaReader\shadow\live_shadow_consumer_loop_v1.cjs";
        private const string NodeExe =
            @"C:\Program Files\nodejs\node.exe";
        private const string StateDir =
            @"C:\ProgramData\TataComandaReader\state";
        private const string EvidenceDir =
            @"C:\ProgramData\TataComandaReader\evidence";
        private const string HostStatusPath =
            @"C:\ProgramData\TataComandaReader\evidence\continuous-host-status.json";

        public ContinuousReaderService()
        {
            ServiceName = ServiceNameValue;
            CanStop = true;
            CanPauseAndContinue = false;
            CanShutdown = true;
            AutoLog = false;
        }

        protected override void OnStart(string[] args)
        {
            _stopping = false;
            Directory.CreateDirectory(EvidenceDir);

            if (!File.Exists(WatcherScript))
                throw new FileNotFoundException("Watcher script missing.", WatcherScript);
            if (!File.Exists(ShadowLoop))
                throw new FileNotFoundException("Shadow loop missing.", ShadowLoop);
            if (!File.Exists(NodeExe))
                throw new FileNotFoundException("Node executable missing.", NodeExe);

            try
            {
                _watcher = StartProcess(
                    "WATCHER",
                    "powershell.exe",
                    "-NoProfile -ExecutionPolicy Bypass -File " + Quote(WatcherScript) +
                    " -MaxPolls 0 -PollSeconds 3 -StablePolls 2 -TopOrders 50" +
                    " -CheckpointPath " + Quote(Path.Combine(StateDir, "reader-watch-checkpoint-v1.json")) +
                    " -EventDir " + Quote(Path.Combine(StateDir, "reader-events-v1")),
                    Path.Combine(EvidenceDir, "continuous-watcher.stdout.log"),
                    Path.Combine(EvidenceDir, "continuous-watcher.stderr.log"));

                _shadow = StartProcess(
                    "SHADOW",
                    NodeExe,
                    Quote(ShadowLoop),
                    Path.Combine(EvidenceDir, "continuous-shadow.stdout.log"),
                    Path.Combine(EvidenceDir, "continuous-shadow.stderr.log"));

                WriteStatus("RUNNING", null);
            }
            catch
            {
                KillChild(_watcher);
                KillChild(_shadow);
                _watcher = null;
                _shadow = null;
                WriteStatus("START_FAILED", null);
                throw;
            }
        }

        private Process StartProcess(
            string label,
            string fileName,
            string arguments,
            string stdoutPath,
            string stderrPath)
        {
            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = Path.GetDirectoryName(WatcherScript),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            var process = new Process
            {
                StartInfo = psi,
                EnableRaisingEvents = true
            };

            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) AppendLine(stdoutPath, label + " " + e.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) AppendLine(stderrPath, label + " " + e.Data);
            };
            process.Exited += delegate(object sender, EventArgs e)
            {
                ChildExited(label, sender as Process);
            };

            if (!process.Start())
                throw new InvalidOperationException(label + "_PROCESS_START_RETURNED_FALSE");

            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }

        private void ChildExited(string label, Process process)
        {
            int exitCode = -1;
            try
            {
                if (process != null) exitCode = process.ExitCode;
            }
            catch { exitCode = -1; }

            WriteStatus(
                _stopping ? label + "_STOPPED_BY_SERVICE" : label + "_EXITED_UNEXPECTEDLY",
                "EXIT_CODE=" + exitCode.ToString());

            if (_stopping) return;

            lock (_sync)
            {
                _stopping = true;
                if (label != "WATCHER") KillChild(_watcher);
                if (label != "SHADOW") KillChild(_shadow);
            }

            ExitCode = exitCode == 0 ? 1 : exitCode;
            Environment.Exit(ExitCode);
        }

        protected override void OnStop()
        {
            lock (_sync)
            {
                _stopping = true;
                KillChild(_watcher);
                KillChild(_shadow);
                _watcher = null;
                _shadow = null;
            }
            WriteStatus("STOPPED", null);
        }

        protected override void OnShutdown()
        {
            OnStop();
            base.OnShutdown();
        }

        private static void KillChild(Process process)
        {
            if (process == null) return;
            try
            {
                if (!process.HasExited)
                {
                    process.Kill();
                    process.WaitForExit(5000);
                }
            }
            catch { }
            finally
            {
                try { process.Dispose(); } catch { }
            }
        }

        private static string Quote(string value)
        {
            return """ + value.Replace(""", "\"") + """;
        }

        private static void AppendLine(string path, string line)
        {
            try
            {
                File.AppendAllText(
                    path,
                    DateTimeOffset.Now.ToString("o") + " " + line + Environment.NewLine,
                    new UTF8Encoding(false));
            }
            catch { }
        }

        private void WriteStatus(string state, string detail)
        {
            try
            {
                int? watcherPid = null;
                int? shadowPid = null;
                try { if (_watcher != null && !_watcher.HasExited) watcherPid = _watcher.Id; } catch { }
                try { if (_shadow != null && !_shadow.HasExited) shadowPid = _shadow.Id; } catch { }

                string json =
                    "{\n" +
                    "  \"schema\": \"deliveryos.tata-reader-continuous-host-status.v2\",\n" +
                    "  \"state\": \"" + EscapeJson(state) + "\",\n" +
                    "  \"updated_at\": \"" + DateTimeOffset.Now.ToString("o") + "\",\n" +
                    "  \"watcher_pid\": " + (watcherPid.HasValue ? watcherPid.Value.ToString() : "null") + ",\n" +
                    "  \"shadow_pid\": " + (shadowPid.HasValue ? shadowPid.Value.ToString() : "null") + ",\n" +
                    "  \"detail\": " + (detail == null ? "null" : "\"" + EscapeJson(detail) + "\"") + "\n" +
                    "}\n";

                string temp = HostStatusPath + ".tmp." + Process.GetCurrentProcess().Id.ToString();
                File.WriteAllText(temp, json, new UTF8Encoding(false));
                if (File.Exists(HostStatusPath)) File.Replace(temp, HostStatusPath, null);
                else File.Move(temp, HostStatusPath);
            }
            catch { }
        }

        private static string EscapeJson(string value)
        {
            if (value == null) return "";
            return value
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n");
        }
    }
}

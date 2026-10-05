using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Text;
using System.Threading;

namespace TataComandaReader.ContinuousHost
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
        private Process _child;
        private volatile bool _stopping;

        private const string ServiceNameValue = "TataComandaReader";
        private const string ReaderEntrypoint =
            @"C:\ProgramData\TataComandaReader\bin\tata_reader_continuous_service_entrypoint_v1.ps1";
        private const string EvidenceDirectory =
            @"C:\ProgramData\TataComandaReader\evidence";
        private const string HostStatusPath =
            @"C:\ProgramData\TataComandaReader\evidence\continuous-host-status.json";
        private const string StdoutPath =
            @"C:\ProgramData\TataComandaReader\evidence\continuous-host.stdout.log";
        private const string StderrPath =
            @"C:\ProgramData\TataComandaReader\evidence\continuous-host.stderr.log";

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
            Directory.CreateDirectory(EvidenceDirectory);

            if (!File.Exists(ReaderEntrypoint))
            {
                WriteStatus("START_FAILED", null, "ENTRYPOINT_MISSING");
                throw new FileNotFoundException("Continuous reader entrypoint missing.", ReaderEntrypoint);
            }

            StartChild();
        }

        private void StartChild()
        {
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments =
                    "-NoProfile -ExecutionPolicy Bypass -File " +
                    Quote(ReaderEntrypoint),
                WorkingDirectory = Path.GetDirectoryName(ReaderEntrypoint),
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
                if (e.Data != null)
                {
                    AppendLine(StdoutPath, e.Data);
                }
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null)
                {
                    AppendLine(StderrPath, e.Data);
                }
            };
            process.Exited += ChildExited;

            if (!process.Start())
            {
                WriteStatus("START_FAILED", null, "PROCESS_START_RETURNED_FALSE");
                throw new InvalidOperationException("Could not start continuous reader process.");
            }

            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            lock (_sync)
            {
                _child = process;
            }

            WriteStatus("RUNNING", process.Id, null);
        }

        private void ChildExited(object sender, EventArgs args)
        {
            Process process = sender as Process;
            int exitCode = -1;
            try
            {
                if (process != null)
                {
                    exitCode = process.ExitCode;
                }
            }
            catch
            {
                exitCode = -1;
            }

            WriteStatus(
                _stopping ? "CHILD_STOPPED_BY_SERVICE" : "CHILD_EXITED_UNEXPECTEDLY",
                process == null ? (int?)null : process.Id,
                "EXIT_CODE=" + exitCode.ToString());

            if (!_stopping)
            {
                ExitCode = exitCode == 0 ? 1 : exitCode;

                // Terminate the Windows-service host as a failure so SCM recovery
                // can restart the service when recovery is explicitly enabled.
                Environment.Exit(ExitCode);
            }
        }

        protected override void OnStop()
        {
            _stopping = true;
            Process process = null;

            lock (_sync)
            {
                process = _child;
                _child = null;
            }

            if (process != null)
            {
                try
                {
                    if (!process.HasExited)
                    {
                        process.Kill();
                        process.WaitForExit(5000);
                    }
                }
                catch (Exception ex)
                {
                    WriteStatus("STOP_WARNING", process.Id, ex.GetType().Name);
                }
                finally
                {
                    try { process.Dispose(); } catch { }
                }
            }

            WriteStatus("STOPPED", null, null);
        }

        protected override void OnShutdown()
        {
            OnStop();
            base.OnShutdown();
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
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
            catch
            {
                // Logging must never become a reason to stop the reader.
            }
        }

        private static void WriteStatus(string state, int? childPid, string detail)
        {
            try
            {
                string json =
                    "{\n" +
                    "  \"schema\": \"deliveryos.tata-reader-continuous-host-status.v1\",\n" +
                    "  \"state\": \"" + EscapeJson(state) + "\",\n" +
                    "  \"updated_at\": \"" + DateTimeOffset.Now.ToString("o") + "\",\n" +
                    "  \"child_pid\": " + (childPid.HasValue ? childPid.Value.ToString() : "null") + ",\n" +
                    "  \"detail\": " + (detail == null ? "null" : "\"" + EscapeJson(detail) + "\"") + "\n" +
                    "}\n";

                string temp = HostStatusPath + ".tmp." + Process.GetCurrentProcess().Id.ToString();
                File.WriteAllText(temp, json, new UTF8Encoding(false));

                if (File.Exists(HostStatusPath))
                {
                    File.Replace(temp, HostStatusPath, null);
                }
                else
                {
                    File.Move(temp, HostStatusPath);
                }
            }
            catch
            {
                // Status-file failure must not interrupt the reader.
            }
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

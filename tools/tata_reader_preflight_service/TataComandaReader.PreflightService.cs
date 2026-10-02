using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.ServiceProcess;
using System.Security.Principal;
using System.Text;
using System.Threading;

namespace TataComandaReader.PreflightHost
{
    internal static class Program
    {
        private static void Main()
        {
            if (Environment.UserInteractive)
            {
                Console.Error.WriteLine("SERVICE_ONLY");
                Environment.ExitCode = 2;
                return;
            }

            ServiceBase.Run(new TataComandaReaderPreflightService());
        }
    }

    internal sealed class TataComandaReaderPreflightService : ServiceBase
    {
        private const string ServiceNameValue = "TataComandaReader";
        private const string ExpectedIdentityName = @"NT SERVICE\TataComandaReader";
        private const int TimeoutMs = 60000;

        private readonly string _scriptPath;
        private readonly string _evidenceDirectory;

        internal TataComandaReaderPreflightService()
        {
            ServiceName = ServiceNameValue;
            CanStop = true;
            CanShutdown = true;
            AutoLog = false;

            string binDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string rootDirectory = Directory.GetParent(binDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)).FullName;
            _scriptPath = Path.Combine(binDirectory, "tata_reader_least_privilege_preflight.ps1");
            _evidenceDirectory = Path.Combine(rootDirectory, "evidence");
        }

        protected override void OnStart(string[] args)
        {
            ThreadPool.QueueUserWorkItem(delegate { RunOnce(); });
        }

        private void RunOnce()
        {
            int exitCode = 125;
            StringBuilder stdout = new StringBuilder();
            StringBuilder stderr = new StringBuilder();

            try
            {
                WindowsIdentity identity = WindowsIdentity.GetCurrent();
                string identityName = identity == null ? "" : identity.Name;
                string identitySid =
                    identity == null || identity.User == null ? "" : identity.User.Value;

                if (!string.Equals(
                    identityName,
                    ExpectedIdentityName,
                    StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException(
                        "UNEXPECTED_SERVICE_IDENTITY:" + identityName + ":" + identitySid);
                }

                Directory.CreateDirectory(_evidenceDirectory);
                File.WriteAllText(
                    Path.Combine(_evidenceDirectory, "preflight.identity.txt"),
                    "name=" + identityName + Environment.NewLine +
                    "sid=" + identitySid + Environment.NewLine +
                    "user_interactive=" + Environment.UserInteractive.ToString(CultureInfo.InvariantCulture) + Environment.NewLine,
                    new UTF8Encoding(false));

                if (!File.Exists(_scriptPath))
                {
                    throw new FileNotFoundException("PREFLIGHT_SCRIPT_NOT_FOUND", _scriptPath);
                }

                string systemDirectory = Environment.GetFolderPath(Environment.SpecialFolder.System);
                string powershell = Path.Combine(systemDirectory, @"WindowsPowerShell\v1.0\powershell.exe");

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = powershell;
                psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File " + Quote(_scriptPath);
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.CreateNoWindow = true;

                using (Process process = new Process())
                {
                    process.StartInfo = psi;
                    process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null) stdout.AppendLine(e.Data);
                    };
                    process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null) stderr.AppendLine(e.Data);
                    };

                    if (!process.Start())
                    {
                        throw new InvalidOperationException("PREFLIGHT_PROCESS_START_FAILED");
                    }

                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();

                    if (!process.WaitForExit(TimeoutMs))
                    {
                        try { process.Kill(); } catch { }
                        exitCode = 124;
                        stderr.AppendLine("PREFLIGHT_TIMEOUT");
                    }
                    else
                    {
                        process.WaitForExit();
                        exitCode = process.ExitCode;
                    }
                }
            }
            catch (Exception ex)
            {
                stderr.AppendLine(ex.ToString());
                exitCode = 125;
            }

            try
            {
                Directory.CreateDirectory(_evidenceDirectory);
                File.WriteAllText(Path.Combine(_evidenceDirectory, "preflight.json"), stdout.ToString(), new UTF8Encoding(false));
                File.WriteAllText(Path.Combine(_evidenceDirectory, "preflight.stderr.txt"), stderr.ToString(), new UTF8Encoding(false));
                File.WriteAllText(Path.Combine(_evidenceDirectory, "preflight.exitcode.txt"), exitCode.ToString(CultureInfo.InvariantCulture), Encoding.ASCII);
            }
            catch
            {
                // If evidence cannot be persisted, do not attempt any alternate operational action.
            }

            try
            {
                Stop();
            }
            catch
            {
                Environment.Exit(exitCode == 0 ? 0 : exitCode);
            }
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }
    }
}
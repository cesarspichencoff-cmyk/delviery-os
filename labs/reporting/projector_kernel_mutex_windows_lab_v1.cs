using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Security.Cryptography;
using System.Runtime.InteropServices;

namespace DeliveryOS.ReportingLab
{
    // Windows kernel synchronization PROOF ONLY. No real projector or POS data.
    // The .NET named mutex belongs to the operating system. Every participating
    // writer must use the SAME mutex; this must never run beside legacy code
    // that independently deletes the file-based projector.lock.
    public static class ProjectorKernelMutexWindowsLab
    {
        const string Marker = "DELIVERYOS_PROJECTOR_KERNEL_MUTEX_LAB_ONLY_V1";
        const string LabDir = "deliveryos-kernel-mutex-lab";
        const int Busy = 32;
        const int AbandonedHold = 34;
        const int Forbidden = 77;
        const int InternalError = 78;

        [STAThread]
        public static int Main(string[] args)
        {
            try { return Run(args); }
            catch { return InternalError; } // Never leak paths or exception text.
        }

        static string Validate(string[] args, out string mode)
        {
            mode = null;
            if (args == null || args.Length != 2 ||
                !args[0].StartsWith("--lab-dir=", StringComparison.Ordinal) ||
                !args[1].StartsWith("--mode=", StringComparison.Ordinal))
                return null;
            mode = args[1].Substring(7);
            if (mode != "hold" && mode != "probe" && mode != "abandon")
                return null;
            if (Environment.GetEnvironmentVariable("GITHUB_ACTIONS") != "true" ||
                Environment.GetEnvironmentVariable("GITHUB_REPOSITORY") !=
                    "cesarspichencoff-cmyk/delviery-os" ||
                String.Equals(Environment.MachineName, "CAIXA_MOOCA",
                    StringComparison.OrdinalIgnoreCase))
                return null;
            string supplied = args[0].Substring(10);
            string runner = Environment.GetEnvironmentVariable("RUNNER_TEMP");
            if (String.IsNullOrEmpty(runner) || !Path.IsPathRooted(supplied))
                return null;
            string root = Path.GetFullPath(supplied);
            runner = Path.GetFullPath(runner);
            if (!String.Equals(root, supplied, StringComparison.OrdinalIgnoreCase) ||
                !String.Equals(Path.GetFileName(root), LabDir, StringComparison.Ordinal) ||
                !String.Equals(Path.GetDirectoryName(root), runner, StringComparison.OrdinalIgnoreCase) ||
                !Directory.Exists(root) ||
                (File.GetAttributes(root) & FileAttributes.ReparsePoint) != 0)
                return null;
            string marker = Path.Combine(root, "LAB_ONLY.txt");
            if (!File.Exists(marker) ||
                (File.GetAttributes(marker) & FileAttributes.ReparsePoint) != 0 ||
                new FileInfo(marker).Length > 100 ||
                File.ReadAllText(marker).Trim() != Marker)
                return null;
            return root;
        }

        static string MutexName(string root)
        {
            byte[] digest;
            using (SHA256 sha = SHA256.Create())
                digest = sha.ComputeHash(Encoding.UTF8.GetBytes(root.ToUpperInvariant()));
            // Global namespace is necessary to test cross-session semantics.
            // Field use would also require a restricted Windows mutex ACL.
            return @"Global\TATADeliveryOSProjectorKernelLab_" +
                BitConverter.ToString(digest, 0, 12).Replace("-", "");
        }

        static int Run(string[] args)
        {
            string mode;
            string root = Validate(args, out mode);
            if (root == null) return Forbidden;
            using (Mutex mutex = new Mutex(false, MutexName(root)))
            {
                if (mode == "abandon")
                {
                    // A live handle stays in this process while a worker
                    // thread abandons ownership: the next WaitOne MUST HOLD.
                    bool workerOwned = false;
                    Thread worker = new Thread(delegate()
                    {
                        try { workerOwned = mutex.WaitOne(0); }
                        catch { workerOwned = false; }
                        // Intentionally exits WITHOUT ReleaseMutex.
                    });
                    worker.Start();
                    if (!worker.Join(3500) || !workerOwned) return InternalError;
                    try
                    {
                        bool acquired = mutex.WaitOne(0);
                        if (acquired) mutex.ReleaseMutex();
                        return InternalError; // A silent recovery would be unsafe.
                    }
                    catch (AbandonedMutexException)
                    {
                        // WaitOne already assigned ownership of the abandoned
                        // mutex. Release it, but NEVER perform any protected work.
                        mutex.ReleaseMutex();
                        return AbandonedHold;
                    }
                }

                bool owned = false;
                try
                {
                    try { owned = mutex.WaitOne(0); }
                    catch (AbandonedMutexException)
                    {
                        owned = true;
                        return AbandonedHold;
                    }
                    if (!owned) return Busy;
                    if (mode == "hold")
                    {
                        File.WriteAllText(Path.Combine(root, "hold-acquired.lab"), "HELD\n");
                        Thread.Sleep(4200);
                    }
                    return 0; // Acquired cleanly, no real work performed.
                }
                finally { if (owned) mutex.ReleaseMutex(); }
            }
        }
    }
}

/** Encerramento de processos destacados criados exclusivamente pelos testes. */
import { execFileSync, type ChildProcess } from "node:child_process";

export async function stopTestProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (child.pid) {
        try {
          if (process.platform === "win32") {
            execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
          } else {
            process.kill(-child.pid, "SIGKILL");
          }
        } catch { /* o processo pode ter terminado neste intervalo */ }
      }
      reject(new Error("processo de teste nao encerrou no prazo; limpeza recusada"));
    }, 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  try {
    if (child.pid) {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  // SIGTERM inicia a finalizacao; so o evento exit permite apagar o diretorio.
  await exited;
}

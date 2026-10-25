/** Reproduz a escrita final que causava ENOTEMPTY na limpeza do CI. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stopTestProcess } from "./test-process-shutdown";

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "test-process-shutdown-"));
  const file = join(dir, "final-write.txt");
  const child = spawn(process.execPath, ["-e", `
    const fs = require('node:fs');
    const interval = setInterval(() => {}, 1000);
    process.on('SIGTERM', () => setTimeout(() => {
      fs.writeFileSync(process.argv[1], 'flushed');
      clearInterval(interval);
      process.exit(0);
    }, 150));
    console.log('ready');
  `, file], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("fixture nao iniciou")), 3000);
      child.stdout!.once("data", () => { clearTimeout(timer); resolve(); });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    await stopTestProcess(child);
    assert.ok(child.exitCode !== null || child.signalCode !== null,
      "limpeza nao pode comecar com processo vivo");
    if (process.platform !== "win32") assert.equal(readFileSync(file, "utf8"), "flushed");
    await stopTestProcess(child); // encerrar de novo um processo terminado e seguro
    console.log("TEST_PROCESS_SHUTDOWN_GREEN: exit confirmado antes da limpeza");
  } finally {
    await stopTestProcess(child);
    rmSync(dir, { recursive: true, force: true });
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });

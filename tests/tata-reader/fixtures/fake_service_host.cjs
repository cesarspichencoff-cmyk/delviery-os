#!/usr/bin/env node
"use strict";
/**
 * HOST FALSO do servico TataComandaReader, para o teste ponta a ponta do
 * cutover. Imita o que importa do host C# v2 (runtime/windows/
 * TataComandaReader.ContinuousService.v2.cs, outra linhagem):
 *   - inicia o watcher no CAMINHO FIXO bin\tata_reader_continuous_watch_candidate_v1.ps1
 *     com a mesma linha de comando (-MaxPolls 0 -PollSeconds ... -CheckpointPath ... -EventDir ...);
 *   - grava evidence/continuous-host-status.json (schema v2);
 *   - watcher que sai sozinho => status WATCHER_EXITED_UNEXPECTEDLY e o host sai;
 *   - parada (SIGTERM, o Stop-Service) => mata SO o processo do watcher, com
 *     SIGKILL, como Process.Kill() no Windows: netos (lotes do supervisor)
 *     sobrevivem. E exatamente o orfao que o rollback precisa achar.
 * Nao inicia o consumidor sombra (fora do escopo do cutover).
 *
 * --launch: inicia o host desacoplado (sem herdar pipes), grava o PID e sai.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const root = arg("root");
const pwsh = arg("pwsh");
const poll = arg("poll", "1");
const pidFile = arg("pidfile");
if (!root || !pwsh) {
  console.error("uso: fake_service_host.cjs --root R --pwsh P [--poll 1] [--pidfile F] [--launch]");
  process.exit(64);
}

if (process.argv.includes("--launch")) {
  const args = process.argv.slice(2).filter((a) => a !== "--launch");
  const child = spawn(process.execPath, [__filename, ...args], { detached: true, stdio: "ignore" });
  if (pidFile) fs.writeFileSync(pidFile, String(child.pid));
  child.unref();
  process.exit(0);
}

const statusPath = path.join(root, "evidence", "continuous-host-status.json");
const watcherScript = path.join(root, "bin", "tata_reader_continuous_watch_candidate_v1.ps1");
fs.mkdirSync(path.dirname(statusPath), { recursive: true });
let stopping = false;
let watcher = null;

function status(state, detail = null) {
  const tmp = `${statusPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({
    schema: "deliveryos.tata-reader-continuous-host-status.v2",
    state,
    updated_at: new Date().toISOString(),
    watcher_pid: watcher && watcher.exitCode === null ? watcher.pid : null,
    shadow_pid: null,
    detail,
  }, null, 2));
  fs.renameSync(tmp, statusPath);
}

if (!fs.existsSync(watcherScript)) {
  status("START_FAILED", "WATCHER_SCRIPT_MISSING");
  process.exit(1);
}
const log = fs.openSync(path.join(root, "evidence", "continuous-watcher.log"), "a");
watcher = spawn(pwsh, [
  "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", watcherScript,
  "-MaxPolls", "0", "-PollSeconds", poll, "-StablePolls", "2", "-TopOrders", "50",
  "-CheckpointPath", path.join(root, "state", "reader-watch-checkpoint-v1.json"),
  "-EventDir", path.join(root, "state", "reader-events-v1"),
], { stdio: ["ignore", log, log] });
status("RUNNING");

watcher.on("exit", (code) => {
  if (stopping) return;
  status("WATCHER_EXITED_UNEXPECTEDLY", `EXIT_CODE=${code}`);
  process.exit(code === 0 || code === null ? 1 : code);
});

process.on("SIGTERM", () => {
  stopping = true;
  try { process.kill(watcher.pid, "SIGKILL"); } catch { /* ja saiu */ }
  status("STOPPED");
  process.exit(0);
});
setInterval(() => {}, 1 << 30);

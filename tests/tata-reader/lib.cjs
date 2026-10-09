"use strict";
/**
 * Utilitarios comuns das suites do TATA Comanda Reader.
 *
 * As suites que dependem de ferramenta externa (PowerShell, SQL Server) se
 * declaram PULADAS em voz alta quando ela falta — ausencia de ferramenta nunca
 * vira verde silencioso, e a contagem de PULADO aparece no resumo.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync, spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");

function findPwsh() {
  const env = (process.env.TATA_PWSH || "").trim();
  if (env) return fs.existsSync(env) ? env : null;
  for (const name of ["pwsh", "pwsh.exe", "powershell.exe"]) {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").toUpperCase();
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
}

function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n", "utf8");
}

function runner(title) {
  const results = [];
  let skipped = 0;
  async function teste(nome, fn) {
    const t0 = Date.now();
    try {
      await fn();
      results.push({ nome, ok: true });
      console.log(`  ok  ${nome} (${Date.now() - t0} ms)`);
    } catch (e) {
      results.push({ nome, ok: false, erro: e && e.stack ? e.stack : String(e) });
      console.log(`  XX  ${nome}\n      ${String(e && e.message ? e.message : e).split("\n").join("\n      ")}`);
    }
  }
  function pular(motivo) {
    skipped += 1;
    console.log(`  PULADO  ${motivo}`);
  }
  function fim(marca) {
    const falhas = results.filter((r) => !r.ok);
    const passou = results.length - falhas.length;
    console.log(`\n${title}: ${passou}/${results.length} PASS${skipped ? `, ${skipped} PULADO` : ""}`);
    if (falhas.length) {
      console.log(`${marca}_RED`);
      process.exit(1);
    }
    console.log(skipped ? `${marca}_SKIPPED_LOUDLY` : `${marca}_GREEN`);
    process.exit(0);
  }
  return { teste, pular, fim };
}

// Windows PowerShell 5.1 aberto a partir do PowerShell 7 herda o PSModulePath
// dele e tenta carregar modulos do 7 (no CI: Get-FileHash quebrou e todo lote
// virou WATCHER_UNREADABLE). O proprio pwsh limpa isso quando abre o
// powershell.exe direto; com o node no meio, a limpeza e aqui — e e assim que
// o servico da CAIXA o executa, sem PowerShell 7 na cadeia.
function envPara(pwsh, extra) {
  const env = { ...process.env, ...(extra || {}) };
  if (!/(^|[\\/])powershell\.exe$/i.test(pwsh)) return env;
  for (const k of Object.keys(env)) {
    if (k.toLowerCase() !== "psmodulepath") continue;
    env[k] = String(env[k]).split(";").filter((p) => p && !/(^|[\\/])PowerShell([\\/]|$)/i.test(p)).join(";");
  }
  return env;
}

function runPwsh(pwsh, args, opts = {}) {
  return spawnSync(pwsh, ["-NoProfile", "-NonInteractive", ...args], {
    encoding: "utf8",
    timeout: opts.timeout || 120000,
    env: envPara(pwsh, opts.env),
  });
}

function spawnPwsh(pwsh, args, opts = {}) {
  return spawn(pwsh, ["-NoProfile", "-NonInteractive", ...args], {
    env: envPara(pwsh, opts.env),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Linhas de comando de todos os processos: "ps" no Linux, CIM no Windows.
function linhasDeComando() {
  if (process.platform === "win32") {
    const exe = `${process.env.SystemRoot || "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    const r = spawnSync(exe, ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { [string]$_.CommandLine }"], {
      encoding: "utf8",
      env: envPara(exe),
      timeout: 60000,
    });
    if (r.status !== 0) throw new Error(`lista de processos falhou: ${r.stderr}`);
    return r.stdout.split(/\r?\n/).filter(Boolean);
  }
  const r = spawnSync("ps", ["-eo", "args"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ps falhou: ${r.stderr}`);
  return r.stdout.split("\n").filter(Boolean);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred, timeoutMs, stepMs = 200) {
  const t0 = Date.now();
  for (;;) {
    const v = await pred();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(stepMs);
  }
}

module.exports = { ROOT, findPwsh, sha256File, tmpDir, readJson, writeJson, runner, runPwsh, spawnPwsh, envPara, linhasDeComando, sleep, waitFor };

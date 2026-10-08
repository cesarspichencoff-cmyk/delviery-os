"use strict";
/**
 * Cutover PONTA A PONTA com SCM simulado — o Apply e o rollback EXECUTADOS.
 * ============================================================================
 * O que roda de verdade: o script de cutover inteiro (preflight, auditoria
 * estatica real, backup, instalacao atomica, gates com o avaliador de saude
 * real, caca de processos por linha de comando, rollback, recibo, codigo de
 * saida), o supervisor real e processos PowerShell reais.
 * O que e simulado: o Service Control Manager do Windows (por um host falso
 * que imita o host C# v2, inclusive matando SO o processo do watcher na
 * parada), o watcher v1 instalado e o candidato v2 (sem SQL).
 *
 * Isto NAO e prova na CAIXA: Restart-Service real, ACL e Windows PowerShell
 * 5.1 continuam fora daqui.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const L = require("./lib.cjs");

const { teste, pular, fim } = L.runner("TATA_READER_CUTOVER_E2E");
const RUNTIME = path.join(L.ROOT, "runtime", "tata-reader");
const CUT = path.join(RUNTIME, "tata_reader_supervisor_cutover_v1.ps1");
const SUP = path.join(RUNTIME, "tata_reader_supervisor_v1.ps1");
const FIX = path.join(L.ROOT, "tests", "tata-reader", "fixtures");
const PROBE = path.join(L.ROOT, "tests", "tata-reader", "cutover_e2e_probe.ps1");
const HOSTJS = path.join(FIX, "fake_service_host.cjs");
const V1 = path.join(FIX, "fake_watcher_v1_continuous.ps1");
const CAND = path.join(FIX, "fake_candidate_v2.ps1");
const pwsh = L.findPwsh();
const vivos = [];

function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function hostPid(ctx) {
  try { return Number(fs.readFileSync(ctx.pidFile, "utf8").trim()); } catch { return null; }
}
function processosCom(texto) {
  const ps = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" }).stdout;
  return ps.split("\n").map((l) => l.trim()).filter((l) => l && l.includes(texto) && !l.includes("ps -eo"))
    .map((l) => Number(l.split(/\s+/)[0]));
}
function limpar(ctx) {
  const h = hostPid(ctx);
  if (h && vivo(h)) try { process.kill(h, "SIGKILL"); } catch { /* */ }
  for (const pid of processosCom(ctx.root)) try { process.kill(pid, "SIGKILL"); } catch { /* */ }
}
function arquivosDe(dir, ignorar) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!ignorar.some((re) => re.test(p))) out[path.relative(dir, p)] = L.sha256File(p);
    }
  };
  walk(dir);
  return out;
}

async function montar(nome, comportamento) {
  const root = L.tmpDir(`tata-e2e-${nome}-`);
  for (const d of ["bin", "state", "evidence"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.copyFileSync(V1, path.join(root, "bin", "tata_reader_continuous_watch_candidate_v1.ps1"));
  const fonte = path.join(L.tmpDir(`tata-e2e-src-${nome}-`), "tata_reader_continuous_watch_candidate_v2.ps1");
  fs.copyFileSync(CAND, fonte);
  L.writeJson(path.join(root, "state", "candidate-behavior.json"), { behavior: comportamento });
  const ctx = { root, fonte, pidFile: path.join(root, "fake-scm.pid") };
  vivos.push(ctx);
  const r = spawnSync(process.execPath, [HOSTJS, "--launch", "--root", root, "--pwsh", pwsh, "--poll", "1", "--pidfile", ctx.pidFile], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const ck = path.join(root, "state", "reader-watch-checkpoint-v1.json");
  const m0 = await L.waitFor(() => (fs.existsSync(ck) ? fs.statSync(ck).mtimeMs : null), 30000);
  assert.ok(m0, "o v1 instalado nao comecou a gravar o checkpoint");
  assert.ok(await L.waitFor(() => fs.statSync(ck).mtimeMs > m0, 15000), "o v1 instalado nao esta andando");
  ctx.sha = {
    installed: L.sha256File(path.join(root, "bin", "tata_reader_continuous_watch_candidate_v1.ps1")),
    host: L.sha256File(HOSTJS),
    supervisor: L.sha256File(SUP),
    v1: L.sha256File(V1),
  };
  ctx.hostPid0 = hostPid(ctx);
  return ctx;
}

function sonda(ctx, modo, opts = {}) {
  const args = ["-File", PROBE, "-CutoverScript", CUT, "-Root", ctx.root, "-HostJs", HOSTJS, "-Node", process.execPath,
    "-Pwsh", pwsh, "-PidFile", ctx.pidFile, "-ScenarioMode", modo, "-Candidate", ctx.fonte, "-RuntimeDir", RUNTIME,
    "-HealthWait", String(opts.healthWait ?? 45), "-RollbackProof", String(opts.rollbackProof ?? 30)];
  if (opts.confirm !== false) {
    args.push("-ConfirmInstalled", opts.installed ?? ctx.sha.installed, "-ConfirmHost", opts.host ?? ctx.sha.host);
    if (opts.supervisor !== null) args.push("-ConfirmSupervisor", opts.supervisor ?? ctx.sha.supervisor);
  }
  if (opts.rollbackDir) args.push("-RollbackDir", opts.rollbackDir);
  if (opts.failStartOnce) args.push("-FailStartOnce");
  const r = L.runPwsh(pwsh, args, { timeout: 300000 });
  let recibo = null;
  try { recibo = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"), r.stdout.lastIndexOf("}") + 1)); } catch { /* */ }
  return { code: r.status, recibo, stderr: r.stderr, stdout: r.stdout };
}

function semCandidatoVivo(ctx) {
  return processosCom(path.join(ctx.root, "bin", "tata_reader_continuous_watch_candidate_v2.ps1")).length === 0;
}

(async () => {
  console.log("\n=== TATA COMANDA READER — CUTOVER PONTA A PONTA (SCM SIMULADO) ===\n");
  if (process.platform === "win32") {
    pular("Windows: este ensaio usa SCM SIMULADO (sinais POSIX); no Windows a prova e o SCM REAL — tests/tata-reader/windows/real_scm_cutover_e2e.ps1");
    return fim("TATA_READER_CUTOVER_E2E");
  }
  if (!pwsh) {
    pular("PowerShell ausente — nada do cutover foi executado");
    return fim("TATA_READER_CUTOVER_E2E");
  }
  console.log(`  pwsh: ${pwsh}\n`);
  try {
    await teste("E1 Plan e SO leitura: PLAN_OK, devolve os tres SHA exigidos, nao toca arquivo nem servico", async () => {
      const ctx = await montar("plan", "ok");
      const ignorar = [/reader-watch-checkpoint-v1\.json/, /[\\/]evidence[\\/]/, /fake-scm\.pid$/];
      const antes = arquivosDe(ctx.root, ignorar);
      const r = sonda(ctx, "Plan");
      assert.equal(r.code, 0, r.stdout.slice(-800) + r.stderr);
      assert.equal(r.recibo.decision, "PLAN_OK");
      assert.deepEqual(r.recibo.apply_requires, {
        ExpectedInstalledWatcherSha256: ctx.sha.installed,
        ExpectedHostBinarySha256: ctx.sha.host,
        SupervisorSha256: ctx.sha.supervisor,
      });
      assert.equal(r.recibo.checks.candidate_audit.recommendation, "INSTALL_ONLY_UNDER_SUPERVISOR");
      assert.equal(r.recibo.checks.candidate_checkpoint, "COMPATIBLE");
      assert.deepEqual(arquivosDe(ctx.root, ignorar), antes, "o Plan alterou arquivo");
      assert.equal(hostPid(ctx), ctx.hostPid0);
      assert.ok(vivo(ctx.hostPid0), "o Plan parou o servico");
      assert.equal(r.recibo.effects.service_stop, false);
      limpar(ctx);
    });

    await teste("E2 Apply sem a confirmacao do SHA do supervisor: aborta ANTES de qualquer efeito (servico e arquivos intactos)", async () => {
      const ctx = await montar("noconf", "ok");
      const antes = L.sha256File(path.join(ctx.root, "bin", "tata_reader_continuous_watch_candidate_v1.ps1"));
      const r = sonda(ctx, "Apply", { supervisor: null });
      assert.equal(r.code, 2);
      assert.equal(r.recibo.decision, "ABORTED_SUPERVISOR_SHA_NOT_CONFIRMED");
      assert.equal(r.recibo.effects.service_stop, false);
      assert.equal(hostPid(ctx), ctx.hostPid0);
      assert.ok(vivo(ctx.hostPid0));
      assert.equal(L.sha256File(path.join(ctx.root, "bin", "tata_reader_continuous_watch_candidate_v1.ps1")), antes);
      const r2 = sonda(ctx, "Apply", { host: "0".repeat(64) });
      assert.equal(r2.recibo.decision, "ABORTED_HOST_BINARY_SHA_NOT_CONFIRMED");
      assert.equal(hostPid(ctx), ctx.hostPid0);
      limpar(ctx);
    });

    let aplicado = null;
    await teste("E3 Apply saudavel: para, faz backup, instala, inicia e so declara APPLIED_HEALTHY com gates reais (0)", async () => {
      const ctx = await montar("ok", "ok");
      const r = sonda(ctx, "Apply");
      assert.equal(r.code, 0, `${r.recibo && r.recibo.decision}\n${JSON.stringify(r.recibo && r.recibo.gate, null, 1)}\n${r.stderr}`);
      assert.equal(r.recibo.decision, "APPLIED_HEALTHY");
      assert.equal(r.recibo.gate.pass, true);
      assert.deepEqual(r.recibo.gate.failed, []);
      assert.equal(L.sha256File(path.join(ctx.root, "bin", "tata_reader_continuous_watch_candidate_v1.ps1")), ctx.sha.supervisor, "o supervisor nao esta no caminho fixo do host");
      assert.ok(fs.existsSync(path.join(ctx.root, "bin", "tata_reader_supervisor_v1.config.json")));
      const hb = L.readJson(path.join(ctx.root, "state", "reader-heartbeat-v1.json"));
      assert.equal(hb.last_batch.outcome, "OK");
      assert.deepEqual(hb.last_batch.effects_true, ["database_read", "local_checkpoint_write", "local_event_write"]);
      const man = L.readJson(path.join(r.recibo.backup_dir, "manifest.json"));
      assert.ok(man.items.some((i) => i.backup === "installed_watcher.ps1" && i.sha256 === ctx.sha.installed), "backup sem o v1");
      assert.equal(r.recibo.checks.old_watcher_processes_killed >= 0, true);
      assert.ok(fs.existsSync(path.join(path.dirname(r.recibo.backup_dir), "receipt-apply.json")), "recibo nao gravado");
      aplicado = { ctx, backupDir: r.recibo.backup_dir };
    });

    await teste("E4 Rollback manual depois do Apply: encerra lotes do candidato, restaura o v1 (SHA), inicia e PROVA (3)", async () => {
      assert.ok(aplicado, "E3 nao deixou um Apply para desfazer");
      const { ctx, backupDir } = aplicado;
      const r = sonda(ctx, "Rollback", { rollbackDir: backupDir, confirm: false });
      assert.equal(r.code, 3, `${r.recibo && r.recibo.decision}\n${JSON.stringify(r.recibo && r.recibo.rollback, null, 1)}\n${r.stderr}`);
      assert.equal(r.recibo.decision, "MANUAL_ROLLBACK_PROVEN");
      assert.equal(r.recibo.rollback.restored_watcher_matches_backup, true);
      assert.equal(r.recibo.rollback.candidate_processes_alive_after, 0);
      assert.equal(L.sha256File(path.join(ctx.root, "bin", "tata_reader_continuous_watch_candidate_v1.ps1")), ctx.sha.v1);
      assert.equal(fs.existsSync(path.join(ctx.root, "state", "reader-heartbeat-v1.json")), false, "heartbeat velho ficou no caminho (saude mentiria)");
      assert.equal(fs.existsSync(path.join(ctx.root, "bin", "tata_reader_continuous_watch_candidate_v2.ps1")), false, "candidato ficou no caminho");
      assert.ok(semCandidatoVivo(ctx), "lote do candidato vivo depois do rollback");
      limpar(ctx);
    });

    await teste("E5 candidato que falha todo lote: gate nunca passa, rollback automatico PROVADO (3), v1 de volta e andando", async () => {
      const ctx = await montar("fail", "fail");
      const r = sonda(ctx, "Apply", { healthWait: 25 });
      assert.equal(r.code, 3, `${r.recibo && r.recibo.decision}\n${r.stderr}`);
      assert.equal(r.recibo.decision, "GATE_FAILED_ROLLBACK_PROVEN");
      assert.equal(r.recibo.gate_failure, "GATE_DEADLINE");
      assert.equal(r.recibo.gate.pass, false);
      assert.ok(r.recibo.gate.failed.includes("ok_batches"), r.recibo.gate.failed.join(","));
      assert.equal(r.recibo.rollback.result, "PROVEN");
      assert.equal(L.sha256File(path.join(ctx.root, "bin", "tata_reader_continuous_watch_candidate_v1.ps1")), ctx.sha.v1);
      const ck = L.readJson(path.join(ctx.root, "state", "reader-watch-checkpoint-v1.json"));
      assert.equal(ck.writer, "v1", "quem escreve o checkpoint depois do rollback nao e o v1");
      assert.ok(semCandidatoVivo(ctx));
      limpar(ctx);
    });

    await teste("E6 lote do candidato pendurado vira ORFAO na parada (o host mata so o supervisor): o rollback o acha pela linha de comando e mata (3)", async () => {
      const ctx = await montar("orfao", "hang_batch");
      const r = sonda(ctx, "Apply", { healthWait: 18 });
      assert.equal(r.code, 3, `${r.recibo && r.recibo.decision}\n${JSON.stringify(r.recibo && r.recibo.rollback, null, 1)}\n${r.stderr}`);
      assert.equal(r.recibo.decision, "GATE_FAILED_ROLLBACK_PROVEN");
      assert.ok(r.recibo.rollback.candidate_processes_killed >= 1, `orfaos mortos: ${r.recibo.rollback.candidate_processes_killed}`);
      assert.equal(r.recibo.rollback.candidate_processes_alive_after, 0);
      assert.ok(semCandidatoVivo(ctx));
      limpar(ctx);
    });

    await teste("E7 erro DEPOIS do primeiro efeito (o servico nao sobe): rollback com recibo e saida 3 — nunca saida 1", async () => {
      const ctx = await montar("starterr", "ok");
      const r = sonda(ctx, "Apply", { failStartOnce: true });
      assert.notEqual(r.code, 1, "saiu 1: erro escapou sem rollback");
      assert.equal(r.code, 3, `${r.recibo && r.recibo.decision}\n${r.stderr}`);
      assert.equal(r.recibo.decision, "ERROR_IN_START_ROLLBACK_PROVEN");
      assert.equal(r.recibo.error_phase, "START");
      assert.equal(L.sha256File(path.join(ctx.root, "bin", "tata_reader_continuous_watch_candidate_v1.ps1")), ctx.sha.v1);
      assert.ok(fs.existsSync(path.join(path.dirname(r.recibo.backup_dir), "receipt-apply.json")));
      limpar(ctx);
    });
  } finally {
    for (const ctx of vivos) limpar(ctx);
  }
  fim("TATA_READER_CUTOVER_E2E");
})().catch((e) => {
  for (const ctx of vivos) limpar(ctx);
  console.error(e);
  process.exit(1);
});

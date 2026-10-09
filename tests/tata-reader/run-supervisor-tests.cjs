"use strict";
/**
 * Supervisor do TATA Comanda Reader — prova de processo, sem SQL Server.
 *
 * O watcher aqui e FALSO (fixtures/fake_watcher.ps1): cada invocacao segue um
 * plano escrito pelo teste. O que se prova e o comportamento do SUPERVISOR:
 * pino de SHA-256, validacao do resultado do lote, efeito proibido, lote sem
 * progresso, lote acima do tempo, backoff, recuperacao, instancia unica,
 * lote orfao e privacidade do heartbeat. O mesmo supervisor contra o watcher
 * real e SQL Server real esta em run-sqlserver-harness.cjs.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const L = require("./lib.cjs");

// TATA_SUPERVISOR_UNDER_TEST permite rodar a MESMA suite contra outra versao
// do supervisor (ex.: a do commit anterior) — e assim que se prova que um
// teste novo pegaria o defeito que ele descreve.
const SUP = process.env.TATA_SUPERVISOR_UNDER_TEST || path.join(L.ROOT, "runtime", "tata-reader", "tata_reader_supervisor_v1.ps1");
const FAKE = path.join(L.ROOT, "tests", "tata-reader", "fixtures", "fake_watcher.ps1");
const { teste, pular, fim } = L.runner("TATA_READER_SUPERVISOR");
const pwsh = L.findPwsh();

function montar(nome, invocations, extra = {}) {
  const dir = L.tmpDir(`tata-sup-${nome}-`);
  const state = path.join(dir, "state");
  fs.mkdirSync(state, { recursive: true });
  // Copia propria do watcher falso (mesmos bytes, mesmo SHA): o supervisor
  // caca lote sem registro pela linha de comando que cita o watcher, e um
  // caminho compartilhado faria um teste matar lote de outro.
  const watcher = path.join(dir, "fake_watcher.ps1");
  fs.copyFileSync(FAKE, watcher);
  const cfg = {
    schema: "deliveryos.tata-reader-supervisor-config.v1",
    watcher_path: watcher,
    watcher_sha256: L.sha256File(FAKE),
    heartbeat_path: path.join(state, "reader-heartbeat-v1.json"),
    child_record_path: path.join(state, "reader-supervisor-child-v1.json"),
    lock_path: path.join(state, "reader-supervisor-v1.lock"),
    powershell_exe: pwsh,
    batch_polls: 3,
    min_backoff_seconds: 1,
    max_backoff_seconds: 2,
    heartbeat_every_seconds: 1,
    ...extra,
  };
  L.writeJson(path.join(dir, "config.json"), cfg);
  L.writeJson(path.join(state, "fake-behavior.json"), { invocations });
  return { dir, state, cfg, configPath: path.join(dir, "config.json"), hb: () => L.readJson(cfg.heartbeat_path) };
}

function argsSup(m, maxBatches) {
  return [
    "-File", SUP,
    "-MaxPolls", "0", "-PollSeconds", "1", "-StablePolls", "2", "-TopOrders", "50",
    "-CheckpointPath", path.join(m.state, "checkpoint.json"),
    "-EventDir", path.join(m.state, "events"),
    "-ConfigPath", m.configPath,
    "-MaxBatches", String(maxBatches),
  ];
}

function rodar(m, maxBatches, timeout = 120000) {
  return L.runPwsh(pwsh, argsSup(m, maxBatches), { timeout });
}

function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

(async () => {
  console.log("\n=== TATA COMANDA READER — SUPERVISOR DE LOTES (sem SQL) ===\n");
  if (!pwsh) {
    pular("PowerShell ausente (defina TATA_PWSH ou instale pwsh) — nenhum comportamento do supervisor foi provado");
    return fim("TATA_READER_SUPERVISOR");
  }
  console.log(`  pwsh: ${pwsh}\n`);

  await teste("S1 lotes OK: heartbeat RUNNING->STOPPED, SHA verificado, totais somados, sucesso datado", () => {
    const m = montar("s1", ["ok"]);
    const r = rodar(m, 2);
    assert.equal(r.status, 0, r.stderr);
    const hb = m.hb();
    assert.equal(hb.schema, "deliveryos.tata-reader-heartbeat.v1");
    assert.equal(hb.state, "STOPPED");
    assert.equal(hb.watcher.sha256_verified, true);
    assert.equal(hb.watcher.expected_sha256, L.sha256File(FAKE));
    assert.equal(hb.totals.batches, 2);
    assert.equal(hb.totals.ok, 2);
    assert.equal(hb.totals.failed, 0);
    assert.equal(hb.totals.polls, 6);
    assert.equal(hb.last_batch.outcome, "OK");
    assert.equal(hb.consecutive_failures, 0);
    assert.ok(hb.last_success_at, "sucesso sem data");
    assert.equal(hb.effects.database_write, false);
    assert.equal(hb.supervisor.script_sha256, L.sha256File(SUP));
    assert.ok(hb.seq >= 4, `heartbeat seq ${hb.seq}`);
  });

  await teste("S2 watcher diferente do auditado: recusa ANTES de rodar, FATAL, saida 78", () => {
    const m = montar("s2", ["ok"], { watcher_sha256: "0".repeat(64) });
    const r = rodar(m, 1);
    assert.equal(r.status, 78, r.stderr);
    const hb = m.hb();
    assert.equal(hb.state, "FATAL");
    assert.equal(hb.fatal, "WATCHER_HASH_MISMATCH");
    assert.equal(hb.totals.batches, 0);
    assert.equal(fs.existsSync(path.join(m.state, "fake-invocations.txt")), false, "o watcher rodou mesmo com hash errado");
  });

  await teste("S3 lote que declara efeito proibido (database_write) PARA o supervisor: FATAL, saida 78", () => {
    const m = montar("s3", ["effect_violation"]);
    const r = rodar(m, 3);
    assert.equal(r.status, 78, r.stderr);
    const hb = m.hb();
    assert.equal(hb.state, "FATAL");
    assert.equal(hb.fatal, "EFFECT_VIOLATION:database_write");
    assert.equal(hb.totals.batches, 1, "continuou depois de efeito proibido");
  });

  await teste("S4 lote sem progresso (checkpoint parado) e encerrado: PROGRESS_STALL, backoff, sem pendurar", () => {
    const m = montar("s4", ["hang"], { progress_stall_seconds: 3, batch_timeout_seconds: 60 });
    const t0 = Date.now();
    const r = rodar(m, 1, 60000);
    const ms = Date.now() - t0;
    assert.equal(r.status, 0, r.stderr);
    assert.ok(ms < 30000, `demorou ${ms} ms`);
    const hb = m.hb();
    assert.equal(hb.last_batch.outcome, "PROGRESS_STALL");
    assert.equal(hb.consecutive_failures, 1);
    assert.equal(hb.last_success_at, null);
    assert.match(r.stderr, /BATCH_FAILED seq=1 outcome=PROGRESS_STALL/);
  });

  await teste("S5 lote que progride mas nunca termina e encerrado por tempo: BATCH_TIMEOUT", () => {
    const m = montar("s5", ["progress_forever"], { progress_stall_seconds: 30, batch_timeout_seconds: 4 });
    const r = rodar(m, 1, 60000);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(m.hb().last_batch.outcome, "BATCH_TIMEOUT");
  });

  await teste("S6 falha de lock: BACKOFF visivel no heartbeat, classe fechada LOCK_TIMEOUT/1222, e o texto bruto (com numero de pedido) NAO vai ao heartbeat", async () => {
    const m = montar("s6", ["fail_lock", "hang"], { min_backoff_seconds: 4, max_backoff_seconds: 4 });
    const sup = L.spawnPwsh(pwsh, argsSup(m, 2));
    let stderr = "";
    sup.stderr.on("data", (d) => { stderr += d; });
    try {
      const raw = await L.waitFor(() => {
        if (!fs.existsSync(m.cfg.heartbeat_path)) return null;
        const t = fs.readFileSync(m.cfg.heartbeat_path, "utf8");
        try { return JSON.parse(t).state === "BACKOFF" ? t : null; } catch { return null; }
      }, 30000, 100);
      assert.ok(raw, "o heartbeat nunca mostrou BACKOFF");
      const hb = JSON.parse(raw);
      assert.equal(hb.last_batch.outcome, "WATCHER_FAILED");
      assert.equal(hb.last_batch.error_class, "LOCK_TIMEOUT");
      assert.equal(hb.last_batch.sql_error_number, 1222);
      assert.equal(hb.consecutive_failures, 1);
      assert.ok(hb.next_attempt_at, "backoff sem proxima tentativa");
      assert.equal(hb.current_batch, null);
      for (const proibido of ["0000348932", "Fulano", "Lock request", "Exception"]) {
        assert.equal(raw.includes(proibido), false, `heartbeat carregou texto bruto: ${proibido}`);
      }
      assert.equal(hb.privacy.raw_error_text, false);
      await L.waitFor(() => /class=LOCK_TIMEOUT/.test(stderr), 5000);
      assert.match(stderr, /class=LOCK_TIMEOUT/, "o log local do host deveria registrar a classe");
    } finally {
      sup.kill("SIGKILL");
      const rec = fs.existsSync(m.cfg.child_record_path) ? L.readJson(m.cfg.child_record_path) : null;
      if (rec && vivo(rec.pid)) process.kill(rec.pid, "SIGKILL");
    }
  });

  await teste("S7 recuperacao: falha, backoff e o lote seguinte OK zera as falhas consecutivas", () => {
    const m = montar("s7", ["fail_lock", "fail_lock", "ok"]);
    const r = rodar(m, 3);
    assert.equal(r.status, 0, r.stderr);
    const hb = m.hb();
    assert.equal(hb.totals.batches, 3);
    assert.equal(hb.totals.failed, 2);
    assert.equal(hb.totals.ok, 1);
    assert.equal(hb.consecutive_failures, 0);
    assert.equal(hb.last_batch.outcome, "OK");
    assert.ok(hb.last_success_at);
  });

  await teste("S8 resultado invalido nao conta como sucesso: lixo, poll_errors>0 e polls a menos", () => {
    for (const [beh, esperado] of [["garbage", "RESULT_UNPARSEABLE"], ["poll_errors", "RUN_POLL_ERRORS"], ["short", "RUN_POLL_COUNT_MISMATCH"]]) {
      const m = montar(`s8-${beh}`, [beh]);
      const r = rodar(m, 1);
      assert.equal(r.status, 0, r.stderr);
      const hb = m.hb();
      assert.equal(hb.last_batch.error_class, esperado, beh);
      assert.equal(hb.last_success_at, null, `${beh} virou sucesso`);
      assert.equal(hb.consecutive_failures, 1);
    }
  });

  await teste("S9 instancia unica: com o lock tomado, o segundo supervisor sai 75 sem rodar lote", async () => {
    const m = montar("s9", ["hang"], { progress_stall_seconds: 60, batch_timeout_seconds: 60 });
    const primeiro = L.spawnPwsh(pwsh, argsSup(m, 1));
    try {
      const pronto = await L.waitFor(() => fs.existsSync(m.cfg.child_record_path), 20000);
      assert.ok(pronto, "o primeiro supervisor nao iniciou o lote");
      const r = rodar(m, 1, 30000);
      assert.equal(r.status, 75, `segundo supervisor saiu ${r.status}: ${r.stderr}`);
      assert.match(r.stderr, /SUPERVISOR_ALREADY_RUNNING/);
      assert.equal(fs.readFileSync(path.join(m.state, "fake-invocations.txt"), "utf8"), "1", "o segundo supervisor rodou um lote");
    } finally {
      primeiro.kill("SIGKILL");
      const rec = fs.existsSync(m.cfg.child_record_path) ? L.readJson(m.cfg.child_record_path) : null;
      if (rec && vivo(rec.pid)) process.kill(rec.pid, "SIGKILL");
    }
  });

  await teste("S10 supervisor morto sem sinal: o lote orfao e encerrado pelo proximo supervisor antes de qualquer lote novo", async () => {
    const m = montar("s10", ["hang", "ok"], { progress_stall_seconds: 120, batch_timeout_seconds: 120 });
    const primeiro = L.spawnPwsh(pwsh, argsSup(m, 1));
    const rec = await L.waitFor(() => (fs.existsSync(m.cfg.child_record_path) ? L.readJson(m.cfg.child_record_path) : null), 20000);
    assert.ok(rec, "o lote nao registrou o processo filho");
    primeiro.kill("SIGKILL");
    await L.sleep(500);
    assert.ok(vivo(rec.pid), "o lote filho deveria sobreviver a morte do supervisor (e o cenario do host)");
    const r = rodar(m, 1);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /ORPHAN_BATCH ORPHAN_STOPPED/);
    const morto = await L.waitFor(() => !vivo(rec.pid), 10000);
    assert.ok(morto, `o orfao ${rec.pid} continua vivo`);
    const hb = m.hb();
    assert.equal(hb.last_batch.outcome, "OK");
  });

  await teste("S11 registro de filho com PID reutilizado (hora de inicio diferente) NAO mata processo alheio", async () => {
    const m = montar("s11", ["ok"]);
    const alheio = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 120000)"], { stdio: "ignore" });
    try {
      L.writeJson(m.cfg.child_record_path, {
        schema: "deliveryos.tata-reader-supervisor-child.v1",
        pid: alheio.pid,
        process_start_utc: "2000-01-01T00:00:00",
        supervisor_run_id: "outro",
      });
      const r = rodar(m, 1);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /PID_REUSED_NOT_TOUCHED/);
      assert.ok(vivo(alheio.pid), "o supervisor matou um processo que nao era dele");
    } finally {
      alheio.kill("SIGKILL");
    }
  });

  await teste("S12 configuracao invalida ou modo errado recusam o boot (78) sem rodar nada", () => {
    const m = montar("s12", ["ok"]);
    const cfg = L.readJson(m.configPath);
    delete cfg.heartbeat_path;
    L.writeJson(m.configPath, cfg);
    const r = rodar(m, 1);
    assert.equal(r.status, 78, r.stderr);
    assert.match(r.stderr, /CONFIG_FIELD_REQUIRED:heartbeat_path/);
    const m2 = montar("s12b", ["ok"]);
    const r2 = L.runPwsh(pwsh, argsSup(m2, 1).map((a) => (a === "0" ? "5" : a)), { timeout: 60000 });
    assert.notEqual(r2.status, 0, "MaxPolls != 0 deveria ser recusado");
    assert.match(r2.stderr + r2.stdout, /SUPERVISOR_REQUIRES_CONTINUOUS_HOST_MODE_MAXPOLLS_0/);
    assert.equal(fs.existsSync(path.join(m2.state, "fake-invocations.txt")), false);
  });

  await teste("S13 aviso impresso DEPOIS do JSON do lote nao transforma lote OK em falha", () => {
    const m = montar("s13", ["ok_trailing_warning"]);
    const r = rodar(m, 1);
    assert.equal(r.status, 0, r.stderr);
    const hb = m.hb();
    assert.equal(hb.last_batch.outcome, "OK", JSON.stringify(hb.last_batch));
  });

  await teste("S14 heartbeat que nao consegue ser gravado (lock/disco) nao derruba o supervisor: lotes seguem", () => {
    const m = montar("s14", ["ok"]);
    fs.mkdirSync(m.cfg.heartbeat_path, { recursive: true });
    const r = rodar(m, 2);
    assert.equal(r.status, 0, `supervisor caiu por falha de heartbeat: ${r.stderr}`);
    assert.match(r.stderr, /HEARTBEAT_WRITE_FAILED/);
    assert.equal(fs.readFileSync(path.join(m.state, "fake-invocations.txt"), "utf8"), "2", "os lotes pararam");
  });

  await teste("S15 checkpoint que some e volta sem parar (janela do File.Replace) nao derruba o supervisor", () => {
    const m = montar("s15", ["flap_checkpoint"]);
    const plano = L.readJson(path.join(m.state, "fake-behavior.json"));
    L.writeJson(path.join(m.state, "fake-behavior.json"), { ...plano, flap_seconds: 25 });
    const r = rodar(m, 1, 120000);
    assert.equal(r.status, 0, `supervisor saiu ${r.status}: ${r.stderr.slice(-400)}`);
    assert.equal(m.hb().last_batch.outcome, "OK");
  });

  await teste("S16 resultado de lote SEM bloco de efeitos para o supervisor: FATAL EFFECTS_UNDECLARED, saida 78", () => {
    const m = montar("s16", ["ok_no_effects"]);
    const r = rodar(m, 2);
    assert.equal(r.status, 78, r.stderr);
    const hb = m.hb();
    assert.equal(hb.state, "FATAL");
    assert.equal(hb.fatal, "EFFECTS_UNDECLARED");
    assert.equal(hb.totals.ok, 0);
  });

  await teste("S17 registro do filho que nao pode ser gravado: o filho morre na hora e o lote nao conta", async () => {
    const m = montar("s17", ["hang"], { progress_stall_seconds: 60, batch_timeout_seconds: 60 });
    fs.mkdirSync(m.cfg.child_record_path, { recursive: true });
    const r = rodar(m, 1, 60000);
    assert.equal(r.status, 0, r.stderr);
    const hb = m.hb();
    assert.equal(hb.last_batch.outcome, "CHILD_RECORD_WRITE_FAILED");
    assert.equal(hb.totals.ok, 0);
    const ps = require("node:child_process").spawnSync("ps", ["-eo", "args"], { encoding: "utf8" }).stdout;
    const vivos = ps.split("\n").filter((l) => l.includes(m.state) && l.includes("fake_watcher.ps1"));
    assert.deepEqual(vivos, [], "um lote sem registro continuou vivo");
  });

  await teste("S18 registro de filho ILEGIVEL de execucao anterior: quarentena antes do primeiro lote", () => {
    const m = montar("s18", ["ok"], { orphan_quarantine_seconds: 3 });
    fs.writeFileSync(m.cfg.child_record_path, "{quebrado");
    const t0 = Date.now();
    const r = rodar(m, 1);
    const ms = Date.now() - t0;
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /ORPHAN_BATCH RECORD_UNREADABLE/);
    assert.ok(ms >= 3000, `nao esperou a quarentena (${ms} ms)`);
    assert.equal(m.hb().last_batch.outcome, "OK");
    assert.equal(fs.existsSync(m.cfg.child_record_path), false, "registro velho ficou para tras");
  });

  await teste("S19 watcher ausente e transitorio ate o limite; persistindo vira FATAL WATCHER_MISSING (78)", () => {
    const dir = L.tmpDir("tata-sup-s19w-");
    const w = path.join(dir, "watcher.ps1");
    fs.copyFileSync(FAKE, w);
    const m = montar("s19", ["ok"], { watcher_path: w, watcher_missing_fatal_after: 2 });
    fs.renameSync(w, w + ".fora");
    const r = rodar(m, 5);
    assert.equal(r.status, 78, r.stderr);
    const hb = m.hb();
    assert.equal(hb.fatal, "WATCHER_MISSING");
    assert.equal(hb.totals.batches, 1, "deveria tolerar 1 ausencia e parar na 2a");
    assert.equal(hb.last_batch.outcome, "WATCHER_MISSING");
  });

  await teste("S20 executavel do PowerShell que nao inicia vira lote falho com backoff, nunca queda do supervisor", () => {
    const m = montar("s20", ["ok"], { powershell_exe: "/caminho/que/nao/existe/pwsh" });
    const r = rodar(m, 2);
    assert.equal(r.status, 0, `supervisor caiu: ${r.status} ${r.stderr.slice(-300)}`);
    const hb = m.hb();
    assert.match(hb.last_batch.error_class, /^BATCH_START_FAILED:/);
    assert.equal(hb.totals.failed, 2);
  });

  await teste("S21 o heartbeat carrega os efeitos que o watcher DECLAROU e a politica permitida (o gate do cutover le isso)", () => {
    const m = montar("s21", ["ok"]);
    const r = rodar(m, 1);
    assert.equal(r.status, 0, r.stderr);
    const hb = m.hb();
    assert.deepEqual(hb.last_batch.effects_true, ["database_read", "local_checkpoint_write", "local_event_write"]);
    assert.deepEqual(hb.watcher.effects_allowed_true, ["database_read", "local_checkpoint_write", "local_event_write"]);
  });

  await teste("S23 lote SEM registro (supervisor morto entre Process.Start e o registro): o proximo supervisor o acha pela linha de comando e encerra antes de qualquer lote", async () => {
    const m = montar("s23", ["hang", "ok"], { progress_stall_seconds: 120, batch_timeout_seconds: 120 });
    // O lote "sem registro": a mesma linha de comando de um lote do supervisor,
    // iniciada a mao e sem gravar o registro do filho.
    const lote = L.spawnPwsh(pwsh, ["-File", m.cfg.watcher_path, "-MaxPolls", "3", "-PollSeconds", "1", "-StablePolls", "2", "-TopOrders", "50",
      "-CheckpointPath", path.join(m.state, "checkpoint.json"), "-EventDir", path.join(m.state, "events")]);
    try {
      const comecou = await L.waitFor(() => fs.existsSync(path.join(m.state, "fake-invocations.txt")), 20000);
      assert.ok(comecou, "o lote sem registro nao comecou");
      assert.equal(fs.existsSync(m.cfg.child_record_path), false, "o cenario exige lote SEM registro");
      const r = rodar(m, 1);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /UNRECORDED_BATCH UNRECORDED_STOPPED/);
      assert.ok(await L.waitFor(() => !vivo(lote.pid), 10000), `o lote sem registro ${lote.pid} continua vivo`);
      const hb = m.hb();
      assert.equal(hb.startup.command_line_hunt, "UNRECORDED_STOPPED");
      assert.equal(hb.startup.child_record, "NONE");
      assert.equal(hb.last_batch.outcome, "OK");
      assert.equal(fs.readFileSync(path.join(m.state, "fake-invocations.txt"), "utf8"), "2", "o lote novo nao rodou depois do orfao");
    } finally {
      try { lote.kill("SIGKILL"); } catch { /* ja saiu */ }
    }
  });

  await teste("S22 arquivo do supervisor e ASCII puro (Windows PowerShell 5.1 le UTF-8 sem BOM como ANSI)", () => {
    const b = fs.readFileSync(SUP);
    const fora = [...b].findIndex((x) => x > 0x7f);
    assert.equal(fora, -1, `byte nao-ASCII na posicao ${fora}`);
  });

  fim("TATA_READER_SUPERVISOR");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

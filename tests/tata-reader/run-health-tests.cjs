"use strict";
/**
 * Avaliador de saude do TATA Comanda Reader — prova pura + CLI.
 * O caso central (H1) e a assinatura REAL de 05/10/2026: servico RUNNING,
 * consumidor RUNNING, checkpoint parado desde 21:55:45. Tem que dar STALLED.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const L = require("./lib.cjs");
const H = require("../../runtime/tata-reader/tata_reader_health_v1.cjs");

const { teste, fim } = L.runner("TATA_READER_HEALTH");
const CLI = path.join(L.ROOT, "runtime", "tata-reader", "tata_reader_health_v1.cjs");
const WRITER = path.join(L.ROOT, "tests", "tata-reader", "fixtures", "replace_two_renames_writer.cjs");

const T0 = Date.parse("2026-10-07T20:00:00-03:00");
const iso = (ms) => new Date(ms).toISOString();

function host(state = "RUNNING") {
  return { schema: "deliveryos.tata-reader-continuous-host-status.v2", state, updated_at: "2026-10-05T15:42:23-03:00", watcher_pid: 1, shadow_pid: 2, detail: null };
}
function consumer(state = "RUNNING") {
  return { schema: "deliveryos.live-shadow-consumer-status.v1", state, updated_at: iso(T0 - 1000), processed: 10 };
}
function hb(over = {}) {
  return {
    schema: "deliveryos.tata-reader-heartbeat.v1",
    supervisor: { version: "tata-reader-supervisor@1", pid: 10, run_id: "r", started_at: iso(T0 - 3600e3) },
    watcher: { file_name: "w.ps1", expected_sha256: "A".repeat(64), sha256_verified: true },
    state: "RUNNING",
    seq: 100,
    written_at: iso(T0 - 2000),
    cadence: { poll_seconds: 3, batch_polls: 60, expected_batch_seconds: 180, progress_stall_seconds: 39, batch_timeout_seconds: 1440, heartbeat_every_seconds: 5, max_backoff_seconds: 60 },
    current_batch: { seq: 9, started_at: iso(T0 - 30e3), last_progress_at: iso(T0 - 2000) },
    last_batch: { seq: 8, outcome: "OK", error_class: null },
    last_success_at: iso(T0 - 40e3),
    consecutive_failures: 0,
    next_attempt_at: null,
    fatal: null,
    totals: { batches: 8, ok: 8, failed: 0 },
    ...over,
  };
}

(async () => {
  console.log("\n=== TATA COMANDA READER — SAUDE REAL (progresso, nao existencia) ===\n");

  await teste("H1 assinatura de 05/10: host RUNNING + consumidor RUNNING + checkpoint parado ha horas = STALLED, nunca saudavel", () => {
    const r = H.evaluateTataReaderHealthV1({
      nowMs: Date.parse("2026-10-05T23:30:00-03:00"),
      heartbeat: null,
      hostStatus: host("RUNNING"),
      consumerStatus: consumer("RUNNING"),
      checkpointMtimeMs: Date.parse("2026-10-05T21:55:45-03:00"),
    });
    assert.equal(r.verdict, "STALLED");
    assert.equal(r.source_state, "stale");
    assert.deepEqual([...r.reasons], ["HEARTBEAT_MISSING", "CHECKPOINT_STALE"]);
    assert.equal(r.ages_seconds.checkpoint_s, 5655);
    assert.equal(r.evidence.host_state, "RUNNING");
  });

  await teste("H2 legado com checkpoint recente e sem heartbeat: no maximo DEGRADED (sem prova de cadencia nem de erro)", () => {
    const r = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: null, hostStatus: host(), checkpointMtimeMs: T0 - 4000 });
    assert.equal(r.verdict, "DEGRADED");
    assert.equal(r.source_state, "parcial");
  });

  await teste("H3 nenhum sinal: UNKNOWN/indisponivel — silencio nunca vira verde", () => {
    const r = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: null });
    assert.equal(r.verdict, "UNKNOWN");
    assert.equal(r.source_state, "indisponivel");
    assert.ok(r.reasons.includes("HEARTBEAT_MISSING"));
    assert.ok(r.reasons.includes("CHECKPOINT_UNOBSERVED"));
  });

  await teste("H4 supervisor vivo, sucesso recente, checkpoint recente, zero falhas: HEALTHY/saudavel", () => {
    const r = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb(), hostStatus: host(), consumerStatus: consumer(), checkpointMtimeMs: T0 - 3000 });
    assert.equal(r.verdict, "HEALTHY", JSON.stringify(r.reasons));
    assert.equal(r.source_state, "saudavel");
    assert.equal(r.exit_code, 0);
    assert.deepEqual([...r.reasons], []);
  });

  await teste("H5 supervisor calado (heartbeat velho) com host RUNNING: STALLED — RUNNING nao melhora nada", () => {
    const r = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb({ written_at: iso(T0 - 120e3) }), hostStatus: host("RUNNING"), checkpointMtimeMs: T0 - 2000 });
    assert.equal(r.verdict, "STALLED");
    assert.ok(r.reasons.includes("SUPERVISOR_SILENT"));
  });

  await teste("H6 falhas recentes com sucesso recente: DEGRADED com a classe do ultimo erro", () => {
    const r = H.evaluateTataReaderHealthV1({
      nowMs: T0,
      heartbeat: hb({ state: "BACKOFF", consecutive_failures: 2, last_batch: { seq: 9, outcome: "WATCHER_FAILED", error_class: "LOCK_TIMEOUT" } }),
      checkpointMtimeMs: T0 - 20e3,
    });
    assert.equal(r.verdict, "DEGRADED");
    assert.ok(r.reasons.includes("RECENT_FAILURES"));
    assert.ok(r.reasons.includes("LAST_ERROR_LOCK_TIMEOUT"));
  });

  await teste("H7 ultimo dado lido velho demais (falhando ha muito tempo): STALLED DATA_STALE", () => {
    const r = H.evaluateTataReaderHealthV1({
      nowMs: T0,
      heartbeat: hb({ state: "BACKOFF", consecutive_failures: 30, last_success_at: iso(T0 - 3600e3), last_batch: { outcome: "WATCHER_FAILED", error_class: "SQL_CONNECTION" } }),
      checkpointMtimeMs: T0 - 3600e3,
    });
    assert.equal(r.verdict, "STALLED");
    assert.ok(r.reasons.includes("DATA_STALE"));
    assert.ok(r.reasons.includes("LAST_ERROR_SQL_CONNECTION"));
  });

  await teste("H8 checkpoint parado com supervisor falando: STALLED CHECKPOINT_STALE", () => {
    const r = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb(), checkpointMtimeMs: T0 - 600e3 });
    assert.equal(r.verdict, "STALLED");
    assert.ok(r.reasons.includes("CHECKPOINT_STALE"));
  });

  await teste("H9 FATAL e STOPPED do supervisor, e host parado: FATAL/DOWN, indisponivel", () => {
    const f = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb({ state: "FATAL", fatal: "WATCHER_HASH_MISMATCH" }), checkpointMtimeMs: T0 });
    assert.equal(f.verdict, "FATAL");
    assert.ok(f.reasons.includes("FATAL_WATCHER_HASH_MISMATCH"));
    assert.equal(f.source_state, "indisponivel");
    const s = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb({ state: "STOPPED" }), checkpointMtimeMs: T0 });
    assert.equal(s.verdict, "DOWN");
    const d = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb(), hostStatus: host("WATCHER_EXITED_UNEXPECTEDLY"), checkpointMtimeMs: T0 });
    assert.equal(d.verdict, "DOWN");
    assert.ok(d.reasons.includes("HOST_STATE_WATCHER_EXITED_UNEXPECTEDLY"));
  });

  await teste("H10 consumidor sombra FAILED e watcher sem SHA verificado: so pioram (DEGRADED)", () => {
    const c = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb(), consumerStatus: consumer("FAILED"), checkpointMtimeMs: T0 - 1000 });
    assert.equal(c.verdict, "DEGRADED");
    assert.ok(c.reasons.includes("CONSUMER_FAILED"));
    const w = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb({ watcher: { sha256_verified: false } }), checkpointMtimeMs: T0 - 1000 });
    assert.equal(w.verdict, "DEGRADED");
    assert.ok(w.reasons.includes("WATCHER_SHA256_NOT_VERIFIED"));
  });

  await teste("H11 relogio trocado (heartbeat do futuro) e schema invalido: UNKNOWN, nunca decide em cima disso", () => {
    const f = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb({ written_at: iso(T0 + 3600e3) }), checkpointMtimeMs: T0 });
    assert.equal(f.verdict, "UNKNOWN");
    assert.ok(f.reasons.includes("HEARTBEAT_FROM_FUTURE_CLOCK_MISMATCH"));
    const s = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: { schema: "outro" }, checkpointMtimeMs: T0 });
    assert.equal(s.verdict, "UNKNOWN");
    assert.ok(s.reasons.includes("HEARTBEAT_SCHEMA_INVALID"));
  });

  await teste("H12 limiares vem da cadencia DECLARADA no heartbeat (sem numero magico) e podem ser sobrescritos explicitamente", () => {
    const t = H.thresholdsFrom(hb());
    assert.deepEqual(t, { heartbeat_silent_after_s: 30, data_stale_after_s: 2 * 180 + 39 + 60, checkpoint_stale_after_s: 39 + 60 + 30 });
    const r = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb(), checkpointMtimeMs: T0 - 50e3, thresholds: { checkpoint_stale_after_s: 10 } });
    assert.equal(r.verdict, "STALLED");
  });

  await teste("H13 supervisor recem-iniciado sem lote completo: DEGRADED (comecando), nunca HEALTHY", () => {
    const r = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb({ last_success_at: null, last_batch: null }), checkpointMtimeMs: T0 - 1000 });
    assert.equal(r.verdict, "DEGRADED");
    assert.ok(r.reasons.includes("STARTING_NO_BATCH_COMPLETED"));
  });

  await teste("H14 CLI: arquivos reais -> JSON + codigo de saida (0 saudavel, 2 parado, 3 desconhecido)", () => {
    const dir = L.tmpDir("tata-health-cli-");
    const hbPath = path.join(dir, "hb.json");
    const ckPath = path.join(dir, "ck.json");
    const now = Date.now();
    L.writeJson(hbPath, hb({ written_at: iso(now - 1000), last_success_at: iso(now - 10e3) }));
    fs.writeFileSync(ckPath, "{}");
    const ok = spawnSync(process.execPath, [CLI, "--heartbeat", hbPath, "--checkpoint", ckPath], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.equal(JSON.parse(ok.stdout).verdict, "HEALTHY");
    const old = (Date.now() - 7200e3) / 1000;
    fs.utimesSync(ckPath, old, old);
    const st = spawnSync(process.execPath, [CLI, "--checkpoint", ckPath], { encoding: "utf8" });
    assert.equal(st.status, 2, st.stdout);
    assert.equal(JSON.parse(st.stdout).verdict, "STALLED");
    const un = spawnSync(process.execPath, [CLI, "--heartbeat", path.join(dir, "nao-existe.json")], { encoding: "utf8" });
    assert.equal(un.status, 3);
    fs.writeFileSync(hbPath, "{quebrado");
    const bad = spawnSync(process.execPath, [CLI, "--heartbeat", hbPath, "--checkpoint", ckPath], { encoding: "utf8" });
    assert.equal(JSON.parse(bad.stdout).verdict, "UNKNOWN");
    assert.ok(JSON.parse(bad.stdout).reasons.includes("HEARTBEAT_SCHEMA_INVALID"));
  });

  await teste("H15 vocabulario de saida e exatamente o do observador de saude de fonte do produto", () => {
    const src = fs.readFileSync(path.join(L.ROOT, "src", "product", "viewmodels", "sinais.ts"), "utf8");
    for (const estado of new Set(Object.values(H.SOURCE_STATE))) {
      assert.ok(src.includes(`"${estado}"`), `estado ${estado} nao existe no vocabulario canonico`);
    }
  });

  await teste("H16 leitura tolerante a troca (fs injetado): falha passageira vira leitura; ausencia e lixo persistentes viram ausente e invalido; nunca lanca", () => {
    const erro = (code) => Object.assign(new Error(code), { code });
    const REG = (mtimeMs = 1) => ({ mtimeMs, isFile: () => true });
    const FIFO = { mtimeMs: 1, isFile: () => false };
    // Roteiros separados para stat e leitura: a leitura so acontece depois de
    // um stat que diz "arquivo regular".
    const roteiro = (stat, ler = [erro("ENOENT")]) => {
      const n = { stat: 0, ler: 0 };
      const prox = (lista, k) => { const p = lista[Math.min(n[k], lista.length - 1)]; n[k] += 1; if (p instanceof Error) throw p; return p; };
      return { fs: { statSync: () => prox(stat, "stat"), readFileSync: () => prox(ler, "ler") }, pauseMs: 0, chamadas: n };
    };
    let r = roteiro([erro("ENOENT"), erro("ENOENT"), REG(1234)]);
    assert.equal(H.readMtimeMs("ck", r), 1234, "stat que volta na terceira tentativa");
    assert.equal(r.chamadas.stat, 3);
    r = roteiro([erro("ENOENT"), REG()], ['{"schema":"x","v":1}']);
    assert.deepEqual(H.readSignalDoc("hb", r), { schema: "x", v: 1 }, "leitura que volta na segunda tentativa");
    r = roteiro([REG()], [erro("ENOENT"), '{"schema":"x"}']);
    assert.deepEqual(H.readSignalDoc("hb", r), { schema: "x" }, "sumiu entre o stat e a leitura e voltou");
    r = roteiro([erro("ENOENT")]);
    assert.equal(H.readSignalDoc("hb", r), null, "ausente de verdade = sinal ausente");
    assert.equal(r.chamadas.stat, H.READ_ATTEMPTS);
    assert.deepEqual(H.readSignalDoc("hb", roteiro([REG()], ["{quebrado"])), { schema: "UNREADABLE" });
    assert.deepEqual(H.readSignalDoc("hb", roteiro([REG()], [erro("EPERM")])), { schema: "UNREADABLE" }, "presente e sem acesso = invalido, nao ausente");
    assert.deepEqual(H.readSignalDoc("hb", roteiro([erro("EPERM")])), { schema: "UNREADABLE" }, "stat sem acesso = invalido");
    assert.deepEqual(H.readSignalDoc("hb", roteiro([REG()], [erro("ENOENT"), "\uFEFF{\"a\":1}"])), { a: 1 }, "BOM no comeco");
    r = roteiro([FIFO], ['{"nunca":"lido"}']);
    assert.deepEqual(H.readSignalDoc("hb", r), { schema: "UNREADABLE" }, "FIFO/dispositivo no lugar do heartbeat = invalido");
    assert.equal(r.chamadas.ler, 0, "abriu um arquivo que nao e regular (um FIFO prenderia a leitura)");
    assert.equal(H.readMtimeMs("ck", roteiro([FIFO])), null, "checkpoint nao regular nao tem idade");
    assert.equal(H.readMtimeMs("ck", roteiro([erro("EPERM")])), null);
    assert.equal(H.readMtimeMs(null), null);
    assert.equal(H.readSignalDoc(""), null);
  });

  await teste("H17 janela REAL da troca em dois renames (como o NTFS): a leitura antiga cai nela (controle positivo); a nova nunca lanca", async () => {
    const dir = L.tmpDir("tata-health-troca-");
    const hbPath = path.join(dir, "reader-heartbeat-v1.json");
    const ckPath = path.join(dir, "reader-watch-checkpoint-v1.json");
    fs.writeFileSync(hbPath, "{}");
    fs.writeFileSync(ckPath, "{}");
    const w = spawn(process.execPath, [WRITER, "6", "1", ckPath, hbPath], { stdio: "ignore" });
    const medir = (ms, fn) => {
      const m = { leituras: 0, lancou: 0, ausente: 0 };
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        m.leituras += 1;
        try { if (fn() === null) m.ausente += 1; } catch { m.lancou += 1; }
      }
      return m;
    };
    try {
      await L.sleep(400);
      const antes = medir(1500, () => (fs.existsSync(ckPath) ? fs.statSync(ckPath).mtimeMs : null));
      const ck = medir(1500, () => H.readMtimeMs(ckPath));
      const hbDoc = medir(1500, () => H.readSignalDoc(hbPath));
      const cli = spawnSync(process.execPath, [CLI, "--heartbeat", hbPath, "--checkpoint", ckPath], { encoding: "utf8" });
      console.log(`      medido: antes=${JSON.stringify(antes)} novo_ck=${JSON.stringify(ck)} novo_hb=${JSON.stringify(hbDoc)}`);
      assert.ok(antes.lancou + antes.ausente > 0, "controle cego: a janela da troca nao foi atingida");
      assert.equal(ck.lancou, 0, "stat do checkpoint lancou");
      assert.equal(hbDoc.lancou, 0, "leitura do heartbeat lancou");
      const teto = Math.max(2, Math.floor((antes.lancou + antes.ausente) / 100));
      assert.ok(ck.ausente + hbDoc.ausente <= teto, `ausencia espuria demais: ${ck.ausente + hbDoc.ausente} > ${teto}`);
      assert.ok([0, 1, 2, 3].includes(cli.status), `CLI saiu ${cli.status}: ${cli.stderr}`);
      assert.equal(cli.stderr, "", "CLI escreveu no stderr durante a troca");
    } finally {
      w.kill("SIGKILL");
    }
  });

  await teste("H18 FIFO no lugar do heartbeat: o CLI responde na hora com sinal INVALIDO (antes, ficava preso no open para sempre)", () => {
    if (process.platform === "win32") {
      console.log("      (Windows nao tem FIFO no sistema de arquivos: caso coberto pelo H16 com stat injetado)");
      return;
    }
    const dir = L.tmpDir("tata-health-fifo-");
    const hbPath = path.join(dir, "reader-heartbeat-v1.json");
    const mk = spawnSync("mkfifo", [hbPath], { encoding: "utf8" });
    assert.equal(mk.status, 0, `mkfifo: ${mk.stderr}`);
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [CLI, "--heartbeat", hbPath], { encoding: "utf8", timeout: 10000 });
    const ms = Date.now() - t0;
    assert.notEqual(r.signal, "SIGTERM", `CLI preso no FIFO (${ms} ms)`);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout).verdict, "UNKNOWN");
    assert.ok(JSON.parse(r.stdout).reasons.includes("HEARTBEAT_SCHEMA_INVALID"));
    assert.ok(ms < 5000, `demorou ${ms} ms`);
  });

  await teste("H19 consumidor V2 da CAIXA e reconhecido quando RUNNING e supervisor esta saudavel", () => {
    const v2 = { ...consumer("RUNNING"), schema: "deliveryos.live-shadow-consumer-status.v2", blocked_count: 10, ready_count: 0 };
    const r = H.evaluateTataReaderHealthV1({ nowMs: T0, heartbeat: hb(), hostStatus: host(), consumerStatus: v2, checkpointMtimeMs: T0 - 3000 });
    assert.equal(r.verdict, "HEALTHY", JSON.stringify(r.reasons));
    assert.ok(!r.reasons.includes("CONSUMER_STATUS_SCHEMA_INVALID"));
    assert.equal(r.evidence.consumer_state, "RUNNING");
  });
  await teste("H20 schema consumidor desconhecido bloqueia HEALTHY mesmo com heartbeat valido", () => {
    const r = H.evaluateTataReaderHealthV1({
      nowMs: T0, heartbeat: hb(), hostStatus: host(),
      consumerStatus: { ...consumer(), schema: "deliveryos.live-shadow-consumer-status.v999" },
      checkpointMtimeMs: T0 - 3000,
    });
    assert.equal(r.verdict, "DEGRADED");
    assert.ok(r.reasons.includes("CONSUMER_STATUS_SCHEMA_INVALID"));
  });
  await teste("H21 consumidor V2 FAILED nao pode ser saudavel", () => {
    const r = H.evaluateTataReaderHealthV1({
      nowMs: T0, heartbeat: hb(), hostStatus: host(),
      consumerStatus: { ...consumer("FAILED"), schema: "deliveryos.live-shadow-consumer-status.v2" },
      checkpointMtimeMs: T0 - 3000,
    });
    assert.equal(r.verdict, "DEGRADED");
    assert.ok(r.reasons.includes("CONSUMER_FAILED"));
  });
  await teste("H22 consumidor V2 sem estado nao pode virar HEALTHY", () => {
    const r = H.evaluateTataReaderHealthV1({
      nowMs: T0, heartbeat: hb(), hostStatus: host(),
      consumerStatus: { ...consumer(), schema: "deliveryos.live-shadow-consumer-status.v2", state: null },
      checkpointMtimeMs: T0 - 3000,
    });
    assert.equal(r.verdict, "DEGRADED");
    assert.ok(r.reasons.includes("CONSUMER_STATE_INVALID"));
  });

  fim("TATA_READER_HEALTH");
})();

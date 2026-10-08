"use strict";
/**
 * TATA Comanda Reader contra SQL Server REAL (banco sintetico).
 * ============================================================================
 * Mesma injecao de falha nos dois lados:
 *   X1 CONTROLE — o watcher instalado (SHA 4507304C..., copia de harness) em
 *      modo continuo, como o host o roda: um lock de 5 s nos itens de UM
 *      pedido. Esperado: PARADA PERMANENTE e silenciosa — checkpoint parado,
 *      sessao "sleeping", ultimo request parado, processo vivo. E a
 *      assinatura de 05/10/2026. Se o controle nao reproduzir, a suite e RED:
 *      provar a correcao sem reproduzir o defeito seria provar nada.
 *   X2 CORRECAO — o MESMO watcher sob o supervisor de lotes: o lote que pega
 *      o lock falha em voz alta (LOCK_TIMEOUT), o seguinte le de novo,
 *      checkpoint e sessao voltam a andar, saude volta a HEALTHY.
 *   X3 pedido novo durante a supervisao vira exatamente UM evento, mesmo
 *      atravessando fronteiras de lote.
 *
 * Requer: TATA_HARNESS_SQLSERVER (ex. 127.0.0.1,14333), TATA_HARNESS_SA_PASSWORD
 * e PowerShell (TATA_PWSH). Sem eles, PULADO em voz alta.
 * Subir o SQL Server: tools/tata_reader_harness_sqlserver.sh
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");
const H = require("../../runtime/tata-reader/tata_reader_health_v1.cjs");

const { teste, pular, fim } = L.runner("TATA_READER_SQLSERVER_HARNESS");
const HARN = path.join(L.ROOT, "tests", "tata-reader", "harness");
const FIX = path.join(L.ROOT, "tests", "tata-reader", "fixtures");
const SUP = path.join(L.ROOT, "runtime", "tata-reader", "tata_reader_supervisor_v1.ps1");
const SERVER = (process.env.TATA_HARNESS_SQLSERVER || "").trim();
const SA = (process.env.TATA_HARNESS_SA_PASSWORD || "").trim();
const READER_PW = "Reader!Harness" + String(process.pid);
const pwsh = L.findPwsh();

function ps(args, timeout = 120000) {
  const r = L.runPwsh(pwsh, args, { timeout });
  if (r.status !== 0) throw new Error(`pwsh falhou (${r.status}): ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
function sessions() {
  const out = ps(["-File", path.join(HARN, "sql_ops.ps1"), "-Op", "sessions", "-Server", SERVER, "-SaPassword", SA]);
  const v = JSON.parse(out || "[]");
  return Array.isArray(v) ? v : [v];
}
function maxEnd(rows) {
  return rows.map((r) => r.last_request_end).sort().slice(-1)[0] || null;
}
function lockAsync(seconds, order = "0000340030") {
  return L.spawnPwsh(pwsh, ["-File", path.join(HARN, "sql_ops.ps1"), "-Op", "lock", "-Server", SERVER, "-SaPassword", SA, "-Order", order, "-Seconds", String(seconds)]);
}
function waitExit(child) {
  return new Promise((r) => child.on("exit", (code) => r(code)));
}
function mtime(p) {
  return fs.existsSync(p) ? fs.statSync(p).mtimeMs : null;
}
function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

(async () => {
  console.log("\n=== TATA COMANDA READER — SQL SERVER REAL, MESMA FALHA DOS DOIS LADOS ===\n");
  if (!pwsh || !SERVER || !SA) {
    pular(`ambiente incompleto (pwsh=${Boolean(pwsh)}, TATA_HARNESS_SQLSERVER=${Boolean(SERVER)}, TATA_HARNESS_SA_PASSWORD=${Boolean(SA)}) — nenhuma prova com banco foi feita`);
    return fim("TATA_READER_SQLSERVER_HARNESS");
  }
  console.log(`  pwsh: ${pwsh}\n  sqlserver: ${SERVER}\n`);

  const work = L.tmpDir("tata-harness-");
  const watcher = path.join(work, "watcher_v1_installed_256dc42.harness.ps1");
  ps(["-File", path.join(HARN, "sqlserver_fixture.ps1"), "-Server", SERVER, "-SaPassword", SA, "-ReaderPassword", READER_PW]);
  ps(["-File", path.join(HARN, "make_watcher_fixture.ps1"),
    "-Source", path.join(FIX, "watcher_v1_installed_256dc42.ps1"), "-Target", watcher,
    "-Server", SERVER, "-ReaderPassword", READER_PW, "-ServiceStatePath", path.join(work, "service-state.json")]);

  await teste("X1 CONTROLE: watcher instalado em modo continuo + lock de 5 s = parada permanente e silenciosa (assinatura de 05/10)", async () => {
    const st = path.join(work, "x1");
    const ck = path.join(st, "checkpoint.json");
    const w = L.spawnPwsh(pwsh, ["-File", watcher, "-MaxPolls", "0", "-PollSeconds", "1", "-CheckpointPath", ck, "-EventDir", path.join(st, "events")]);
    let stderr = "";
    w.stderr.on("data", (d) => { stderr += d; });
    try {
      assert.ok(await L.waitFor(() => mtime(ck), 30000), "o watcher nao gravou checkpoint");
      await L.sleep(2500);
      const antes = mtime(ck);
      const lock = lockAsync(5);
      await waitExit(lock);
      const ckNaLiberacao = mtime(ck);
      const fimLock = maxEnd(sessions());
      await L.sleep(8000);
      const depois = sessions();
      assert.ok(ckNaLiberacao >= antes, "checkpoint regrediu?");
      assert.equal(mtime(ck), ckNaLiberacao, "o checkpoint voltou a andar: o defeito NAO reproduziu");
      assert.equal(maxEnd(depois), fimLock, "o ultimo request andou depois da liberacao: o defeito NAO reproduziu");
      assert.ok(depois.length >= 1 && depois.every((s) => s.status === "sleeping"), `sessoes: ${JSON.stringify(depois)}`);
      assert.ok(vivo(w.pid), "o processo morreu — 05/10 tinha processo vivo");
      assert.equal(stderr.trim(), "", "o watcher falou alguma coisa — 05/10 foi silencioso");
      const saude = H.evaluateTataReaderHealthV1({
        nowMs: Date.now(), heartbeat: null,
        hostStatus: { schema: "deliveryos.tata-reader-continuous-host-status.v2", state: "RUNNING", updated_at: new Date().toISOString() },
        checkpointMtimeMs: mtime(ck), thresholds: { checkpoint_stale_after_s: 5 },
      });
      assert.equal(saude.verdict, "STALLED", JSON.stringify(saude.reasons));
      console.log(`      checkpoint parado em ${new Date(ckNaLiberacao).toISOString()}; ultimo request ${fimLock}; sessoes ${depois.map((s) => `${s.session_id}:${s.status}`).join(",")}`);
    } finally {
      w.kill("SIGKILL");
    }
  });

  await teste("X2 CORRECAO: o MESMO watcher sob o supervisor sobrevive ao mesmo lock — falha em voz alta, rele, volta a HEALTHY", async () => {
    const st = path.join(work, "x2");
    const ck = path.join(st, "checkpoint.json");
    const cfgPath = path.join(st, "config.json");
    L.writeJson(cfgPath, {
      schema: "deliveryos.tata-reader-supervisor-config.v1",
      watcher_path: watcher,
      watcher_sha256: L.sha256File(watcher),
      heartbeat_path: path.join(st, "reader-heartbeat-v1.json"),
      child_record_path: path.join(st, "reader-supervisor-child-v1.json"),
      lock_path: path.join(st, "reader-supervisor-v1.lock"),
      powershell_exe: pwsh,
      batch_polls: 4,
      min_backoff_seconds: 1,
      max_backoff_seconds: 4,
      heartbeat_every_seconds: 1,
    });
    const hbPath = path.join(st, "reader-heartbeat-v1.json");
    const sup = L.spawnPwsh(pwsh, ["-File", SUP, "-MaxPolls", "0", "-PollSeconds", "1", "-StablePolls", "2", "-TopOrders", "50",
      "-CheckpointPath", ck, "-EventDir", path.join(st, "events"), "-ConfigPath", cfgPath]);
    let supErr = "";
    sup.stderr.on("data", (d) => { supErr += d; });
    const vistos = new Set();
    let falhaLock = null;
    const espia = setInterval(() => {
      try {
        const hb = L.readJson(hbPath);
        if (hb.last_batch) {
          vistos.add(`${hb.last_batch.seq}:${hb.last_batch.outcome}:${hb.last_batch.error_class}`);
          if (hb.last_batch.error_class === "LOCK_TIMEOUT") falhaLock = hb.last_batch;
        }
      } catch { /* escrita atomica em andamento */ }
    }, 150);
    try {
      assert.ok(await L.waitFor(() => { try { return L.readJson(hbPath).last_success_at; } catch { return null; } }, 40000), "nenhum lote completou antes da falha");
      const lock = lockAsync(5);
      await waitExit(lock);
      const liberado = Date.now();
      const fimLock = maxEnd(sessions());
      const voltou = await L.waitFor(() => (mtime(ck) > liberado ? mtime(ck) : null), 20000);
      assert.ok(voltou, "checkpoint nao voltou a andar em 20 s depois da liberacao");
      const recuperou = await L.waitFor(() => {
        const hb = L.readJson(hbPath);
        return hb.consecutive_failures === 0 && Date.parse(hb.last_success_at) > liberado ? hb : null;
      }, 30000);
      assert.ok(recuperou, `nenhum lote OK depois da liberacao; lotes vistos: ${[...vistos].join(" | ")}`);
      assert.ok(falhaLock, `o lote que pegou o lock nao foi classificado LOCK_TIMEOUT; lotes vistos: ${[...vistos].join(" | ")}`);
      assert.equal(falhaLock.outcome, "WATCHER_FAILED");
      assert.equal(falhaLock.sql_error_number, 1222);
      const novoFim = await L.waitFor(() => { const m = maxEnd(sessions()); return m && m > fimLock ? m : null; }, 15000);
      assert.ok(novoFim, "o ultimo request SQL nao andou depois da liberacao");
      const hbFinal = L.readJson(hbPath);
      const saude = H.evaluateTataReaderHealthV1({ nowMs: Date.now(), heartbeat: hbFinal, checkpointMtimeMs: mtime(ck) });
      assert.equal(saude.verdict, "HEALTHY", JSON.stringify(saude.reasons));
      assert.ok(hbFinal.totals.failed >= 1 && hbFinal.totals.ok >= 2, JSON.stringify(hbFinal.totals));
      const raw = fs.readFileSync(hbPath, "utf8");
      for (const proibido of ["0000340030", "Lock request", "Exception"]) assert.equal(raw.includes(proibido), false, `heartbeat carregou ${proibido}`);
      assert.match(supErr, /class=LOCK_TIMEOUT/);
      console.log(`      recuperado ${Math.round((voltou - liberado) / 100) / 10}s apos liberar; request ${fimLock} -> ${novoFim}; lotes ${hbFinal.totals.ok} OK / ${hbFinal.totals.failed} falhos`);
    } finally {
      clearInterval(espia);
      sup.kill("SIGKILL");
      const rec = fs.existsSync(path.join(st, "reader-supervisor-child-v1.json")) ? L.readJson(path.join(st, "reader-supervisor-child-v1.json")) : null;
      if (rec && vivo(rec.pid)) process.kill(rec.pid, "SIGKILL");
    }
  });

  await teste("X3 pedido novo sob supervisao vira exatamente UM evento, atravessando fronteiras de lote", async () => {
    const st = path.join(work, "x3");
    const ck = path.join(st, "checkpoint.json");
    const ev = path.join(st, "events");
    const cfgPath = path.join(st, "config.json");
    L.writeJson(cfgPath, {
      schema: "deliveryos.tata-reader-supervisor-config.v1",
      watcher_path: watcher, watcher_sha256: L.sha256File(watcher),
      heartbeat_path: path.join(st, "hb.json"), child_record_path: path.join(st, "child.json"), lock_path: path.join(st, "sup.lock"),
      powershell_exe: pwsh, batch_polls: 3, min_backoff_seconds: 1, max_backoff_seconds: 2, heartbeat_every_seconds: 1,
    });
    const sup = L.spawnPwsh(pwsh, ["-File", SUP, "-MaxPolls", "0", "-PollSeconds", "1", "-StablePolls", "2", "-TopOrders", "50",
      "-CheckpointPath", ck, "-EventDir", ev, "-ConfigPath", cfgPath]);
    try {
      assert.ok(await L.waitFor(() => { try { return L.readJson(path.join(st, "hb.json")).last_success_at; } catch { return null; } }, 40000));
      const antes = fs.existsSync(ev) ? fs.readdirSync(ev).length : 0;
      assert.equal(antes, 0, "pedidos historicos viraram evento no bootstrap");
      ps(["-File", path.join(HARN, "sql_ops.ps1"), "-Op", "insert", "-Server", SERVER, "-SaPassword", SA, "-Order", "0000349999"]);
      const nome = await L.waitFor(() => (fs.existsSync(ev) ? fs.readdirSync(ev).find((f) => f.startsWith("0000849999_")) : null), 30000);
      assert.ok(nome, "o pedido novo nao virou evento");
      const lotes0 = L.readJson(path.join(st, "hb.json")).totals.batches;
      await L.waitFor(() => L.readJson(path.join(st, "hb.json")).totals.batches >= lotes0 + 2, 30000);
      const arquivos = fs.readdirSync(ev).filter((f) => f.startsWith("0000849999_"));
      assert.equal(arquivos.length, 1, `eventos do pedido: ${arquivos.join(",")}`);
      const evento = L.readJson(path.join(ev, arquivos[0]));
      assert.equal(evento.schema, "deliveryos.tata-reader-stable-order-event.v1");
      assert.equal(evento.effects.database_write, false);
      const cp = L.readJson(ck);
      const entrada = cp.entries.find((e) => e.order_key.endsWith("|0000349999|0000849999"));
      assert.equal(entrada.emitted_hash, evento.snapshot_hash);
    } finally {
      sup.kill("SIGKILL");
      const rec = fs.existsSync(path.join(st, "child.json")) ? L.readJson(path.join(st, "child.json")) : null;
      if (rec && vivo(rec.pid)) process.kill(rec.pid, "SIGKILL");
    }
  });

  fim("TATA_READER_SQLSERVER_HARNESS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

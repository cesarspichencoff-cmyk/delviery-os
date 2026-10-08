"use strict";
/**
 * Cutover do supervisor — logica de decisao (pura) e contrato com o supervisor.
 *
 * O que se prova aqui: cada gate obrigatorio, sozinho, reprova o cutover; os
 * opcionais so reprovam com FAIL (UNKNOWN fica registrado e passa); a
 * auditoria e a compatibilidade de checkpoint bloqueiam o que tem que
 * bloquear; e a configuracao que o cutover escreve e ACEITA pelo supervisor
 * verdadeiro, que roda lotes com ela.
 *
 * O que NAO se prova aqui (e esta dito): restart de servico Windows, ACL,
 * Get-Service/Restart-Service, consulta a sys.dm_exec_sessions como operador —
 * so existem na CAIXA. Isso e CODE_READY ate o ensaio la.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const { teste, pular, fim } = L.runner("TATA_READER_CUTOVER_LOGIC");
const CUT = path.join(L.ROOT, "runtime", "tata-reader", "tata_reader_supervisor_cutover_v1.ps1");
const SUP = path.join(L.ROOT, "runtime", "tata-reader", "tata_reader_supervisor_v1.ps1");
const FAKE = path.join(L.ROOT, "tests", "tata-reader", "fixtures", "fake_watcher.ps1");
const PROBE = path.join(L.ROOT, "tests", "tata-reader", "cutover_logic_probe.ps1");
const pwsh = L.findPwsh();

(async () => {
  console.log("\n=== TATA COMANDA READER — CUTOVER: DECISAO E CONTRATO ===\n");
  if (!pwsh) {
    pular("PowerShell ausente — logica do cutover nao provada");
    return fim("TATA_READER_CUTOVER_LOGIC");
  }
  const root = L.tmpDir("tata-cutover-");
  const lay = { bin: path.join(root, "bin"), state: path.join(root, "state") };
  fs.mkdirSync(lay.bin, { recursive: true });
  fs.mkdirSync(lay.state, { recursive: true });
  fs.copyFileSync(FAKE, path.join(lay.bin, "tata_reader_continuous_watch_candidate_v2.ps1"));
  const r = L.runPwsh(pwsh, ["-File", PROBE, "-CutoverScript", CUT, "-AcceptRoot", root, "-WatcherSha", L.sha256File(FAKE), "-PsExe", pwsh]);
  const out = r.status === 0 ? JSON.parse(r.stdout) : null;

  await teste("C0 carregar o cutover por dot-source nao executa nada (sem servico, sem arquivo, sem saida)", () => {
    assert.equal(r.status, 0, r.stderr);
    assert.ok(out, "sonda sem JSON");
  });

  await teste("C1 retrato todo verde passa; cada gate obrigatorio, sozinho, reprova e se nomeia", () => {
    assert.equal(out.all_ok, true);
    for (const [gate, res] of Object.entries(out.single_failures)) {
      assert.equal(res.pass, false, `${gate} sozinho deveria reprovar`);
      assert.deepEqual(res.failed, [gate], `${gate}: reprovou por ${res.failed}`);
    }
    assert.equal(Object.keys(out.single_failures).length, 14);
  });

  await teste("C2 SHA do supervisor desconhecido nunca passa (nulo == nulo nao e prova)", () => {
    assert.equal(out.unknown_supervisor_sha_blocks, true);
  });

  await teste("C3 auditoria: so INSTALL_ONLY_UNDER_SUPERVISOR e SAFE_* liberam; DO_NOT_INSTALL e ausencia bloqueiam", () => {
    assert.deepEqual(out.audit, { under_supervisor: true, safe: true, do_not: false, null: false });
  });

  await teste("C4 checkpoint: candidato com outro schema de checkpoint e INCOMPATIBLE (migracao de estado e decisao humana)", () => {
    assert.deepEqual(out.checkpoint, { compatible: "COMPATIBLE", incompatible: "INCOMPATIBLE", none_yet: "NO_CHECKPOINT_YET" });
  });

  await teste("C5 layout: o supervisor vai no caminho FIXO do host e o candidato ao lado, com nome proprio", () => {
    const b = (p) => p.split(/[\\/]/).pop();
    assert.equal(b(out.layout.host_fixed_watcher), "tata_reader_continuous_watch_candidate_v1.ps1");
    assert.equal(b(out.layout.candidate_target), "tata_reader_continuous_watch_candidate_v2.ps1");
    assert.equal(b(out.layout.supervisor_config), "tata_reader_supervisor_v1.config.json");
    assert.equal(b(out.layout.checkpoint), "reader-watch-checkpoint-v1.json");
    assert.equal(out.config_windows.watcher_path, out.layout.candidate_target);
    assert.equal(out.config_windows.watcher_sha256, "AB".repeat(32));
    assert.equal(out.config_windows.batch_polls, 60);
  });

  await teste("C6 a config que o cutover escreve e ACEITA pelo supervisor verdadeiro: lotes rodam com ela", () => {
    const cfgPath = path.join(lay.bin, "tata_reader_supervisor_v1.config.json");
    assert.ok(fs.existsSync(cfgPath), "config nao foi escrita");
    const ck = path.join(lay.state, "reader-watch-checkpoint-v1.json");
    L.writeJson(path.join(lay.state, "fake-behavior.json"), { invocations: ["ok"] });
    const sup = L.runPwsh(pwsh, ["-File", SUP, "-MaxPolls", "0", "-PollSeconds", "1", "-StablePolls", "2", "-TopOrders", "50",
      "-CheckpointPath", ck, "-EventDir", path.join(lay.state, "reader-events-v1"), "-ConfigPath", cfgPath, "-MaxBatches", "2"]);
    assert.equal(sup.status, 0, sup.stderr);
    const hb = L.readJson(path.join(lay.state, "reader-heartbeat-v1.json"));
    assert.equal(hb.totals.ok, 2);
    assert.equal(hb.watcher.sha256_verified, true);
    assert.equal(hb.watcher.file_name, "tata_reader_continuous_watch_candidate_v2.ps1");
  });

  await teste("C7 o cutover nunca contem escrita SQL, rede, impressao, nem outro servico", () => {
    const src = fs.readFileSync(CUT, "utf8").replace(/<#[\s\S]*?#>/g, "").replace(/#[^\n]*/g, "");
    assert.equal(/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|GRANT|REVOKE|ALTER|DROP|CREATE)\s+(INTO|TABLE|FROM|ON|LOGIN|USER|DATABASE|PROC|\w+\.)/i.test(src), false, "verbo SQL de escrita");
    assert.equal(/Invoke-WebRequest|Invoke-RestMethod|WebClient|HttpClient|Out-Printer|Printing/i.test(src), false);
    const servicos = [...src.matchAll(/(Restart|Stop|Start)-Service\s+-Name\s+(\$\w+)/g)].map((m) => m[2]);
    assert.ok(servicos.length >= 3 && servicos.every((s) => s === "$ServiceName"), `servicos: ${servicos}`);
  });

  await teste("C8 rollback encerra o lote orfao do supervisor (PID + hora de inicio) e nunca mata processo alheio", async () => {
    const { spawn } = require("node:child_process");
    const raiz = L.tmpDir("tata-cutover-orfao-");
    fs.mkdirSync(path.join(raiz, "state"), { recursive: true });
    const recPath = path.join(raiz, "state", "reader-supervisor-child-v1.json");
    const orfao = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 120000)"], { stdio: "ignore" });
    const alheio = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 120000)"], { stdio: "ignore" });
    const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    try {
      await L.sleep(300);
      const inicio = L.runPwsh(pwsh, ["-Command", `(Get-Process -Id ${orfao.pid}).StartTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", [Globalization.CultureInfo]::InvariantCulture)`]).stdout.trim();
      const chamar = () => L.runPwsh(pwsh, ["-Command", `. '${CUT}'; Stop-SupervisorOrphan (Get-Layout '${raiz}')`]).stdout.trim();
      assert.equal(chamar(), "NONE");
      L.writeJson(recPath, { schema: "deliveryos.tata-reader-supervisor-child.v1", pid: alheio.pid, process_start_utc: "2000-01-01T00:00:00.000Z" });
      assert.equal(chamar(), "PID_REUSED_NOT_TOUCHED");
      assert.ok(vivo(alheio.pid), "matou processo alheio");
      L.writeJson(recPath, { schema: "deliveryos.tata-reader-supervisor-child.v1", pid: orfao.pid, process_start_utc: inicio });
      assert.equal(chamar(), "ORPHAN_STOPPED");
      assert.ok(await L.waitFor(() => !vivo(orfao.pid), 10000), "orfao continua vivo");
    } finally {
      orfao.kill("SIGKILL");
      alheio.kill("SIGKILL");
    }
  });

  fim("TATA_READER_CUTOVER_LOGIC");
})();

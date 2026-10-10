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

  await teste("C1 retrato todo verde passa; cada gate, sozinho, reprova e se nomeia (17 casos, 16 gates)", () => {
    assert.equal(out.all_ok, true);
    const gateDoCaso = { effects_undeclared: "watcher_effects_declared_within_policy" };
    for (const [caso, res] of Object.entries(out.single_failures)) {
      const gate = gateDoCaso[caso] || caso;
      assert.equal(res.pass, false, `${caso} sozinho deveria reprovar`);
      assert.deepEqual(res.failed, [gate], `${caso}: reprovou por ${res.failed}`);
    }
    assert.equal(Object.keys(out.single_failures).length, 17);
  });

  await teste("C2 desconhecido nunca passa: SHA do supervisor nulo == nulo, run_id nulo", () => {
    assert.equal(out.unknown_supervisor_sha_blocks, true);
    assert.equal(out.unknown_run_id_blocks, true);
  });

  await teste("C3 auditoria: so INSTALL_ONLY_UNDER_SUPERVISOR e SAFE_* liberam; DO_NOT_INSTALL e ausencia bloqueiam", () => {
    assert.deepEqual(out.audit, { under_supervisor: true, safe: true, do_not: false, null: false });
  });

  await teste("C4 checkpoint: candidato com outro schema de checkpoint e INCOMPATIBLE (migracao de estado e decisao humana)", () => {
    assert.deepEqual(out.checkpoint, { compatible: "COMPATIBLE", incompatible: "INCOMPATIBLE", none_yet: "NO_CHECKPOINT_YET" });
  });

  await teste("C5 layout: o supervisor vai no caminho FIXO do host e o candidato ao lado, com nome proprio; lote padrao 20", () => {
    const b = (p) => p.split(/[\\/]/).pop();
    assert.equal(b(out.layout.host_fixed_watcher), "tata_reader_continuous_watch_candidate_v1.ps1");
    assert.equal(b(out.layout.candidate_target), "tata_reader_continuous_watch_candidate_v2.ps1");
    assert.equal(b(out.layout.supervisor_config), "tata_reader_supervisor_v1.config.json");
    assert.equal(b(out.layout.checkpoint), "reader-watch-checkpoint-v1.json");
    assert.equal(out.config_windows.watcher_path, out.layout.candidate_target);
    assert.equal(out.config_windows.watcher_sha256, "AB".repeat(32));
    assert.equal(out.config_windows.batch_polls, 20);
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

  await teste("C7 o cutover nunca contem escrita SQL, rede, impressao, outro servico, nem redirecionamento de stderr de comando nativo", () => {
    const src = fs.readFileSync(CUT, "utf8").replace(/<#[\s\S]*?#>/g, "").replace(/#[^\n]*/g, "");
    assert.equal(/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|GRANT|REVOKE|ALTER|DROP|CREATE)\s+(INTO|TABLE|FROM|ON|LOGIN|USER|DATABASE|PROC|\w+\.)/i.test(src), false, "verbo SQL de escrita");
    assert.equal(/Invoke-WebRequest|Invoke-RestMethod|WebClient|HttpClient|Out-Printer|Printing/i.test(src), false);
    const servicos = [...src.matchAll(/(Restart|Stop|Start)-Service\s+-Name\s+(\$\w+)/g)].map((m) => m[2]);
    assert.ok(servicos.length >= 2 && servicos.every((s) => s === "$ServiceName"), `servicos: ${servicos}`);
    assert.equal(/\d>\s*(\$null|&1)/.test(src), false, "redirecionamento de stream: no WinPS 5.1 vira erro terminante");
    assert.equal([...fs.readFileSync(CUT)].some((x) => x > 0x7f), false, "byte nao-ASCII (WinPS 5.1 le UTF-8 sem BOM como ANSI)");
  });

  await teste("C8 caca por linha de comando: so PowerShell que cita o caminho morre; nao-PowerShell citando o caminho e PowerShell sem ele ficam", async () => {
    const { spawn } = require("node:child_process");
    const raiz = L.tmpDir("tata-cutover-orfao-");
    const alvo = path.join(raiz, "bin", "tata_reader_continuous_watch_candidate_v2.ps1");
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, "Start-Sleep -Seconds 120\n");
    const outro = path.join(raiz, "outro.ps1");
    fs.writeFileSync(outro, "Start-Sleep -Seconds 120\n");
    const lote = spawn(pwsh, ["-NoProfile", "-File", alvo], { stdio: "ignore" });
    const editor = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 120000)", alvo], { stdio: "ignore" });
    const alheio = spawn(pwsh, ["-NoProfile", "-File", outro], { stdio: "ignore" });
    const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    try {
      await L.sleep(1500);
      const res = L.runPwsh(pwsh, ["-Command", `. '${CUT}'; Stop-ProcessesByCommandLine '${alvo}' | ConvertTo-Json -Compress`]);
      const j = JSON.parse(res.stdout.trim());
      assert.deepEqual(j, { killed: 1, alive: 0 }, res.stdout + res.stderr);
      assert.ok(await L.waitFor(() => !vivo(lote.pid), 10000), "o lote do candidato continua vivo");
      assert.ok(vivo(editor.pid), "matou processo que nao e PowerShell");
      assert.ok(vivo(alheio.pid), "matou PowerShell que nao cita o caminho");
    } finally {
      for (const c of [lote, editor, alheio]) c.kill("SIGKILL");
    }
  });

  await teste("C9 reinicio durante a observacao: troca de run_id ou de PID do servico e reinicio; antes da primeira observacao nao e", () => {
    assert.deepEqual(out.restart, { same: false, run_changed: true, pid_changed: true, not_started_yet: false });
  });

  await teste("C10 executavel do servico pelo PathName do SCM: entre aspas, sem aspas com espaco, simples, vazio", () => {
    assert.deepEqual(out.exe, {
      quoted: "C:\\ProgramData\\TataComandaReader\\bin\\TataComandaReader.ContinuousHost.exe",
      unquoted_space: "C:\\Program Files\\Tata\\Host.exe",
      plain: "C:\\bin\\host.exe",
      empty: null,
    });
  });

  await teste("C11 codigo de saida: 0 so plano OK e aplicado saudavel; 3 so rollback PROVADO; o resto 2 (nunca 1)", () => {
    assert.deepEqual(out.exit, { plan_ok: 0, plan_blocked: 2, applied: 0, gate_rb: 3, error_rb: 3, manual_rb: 3, unproven: 2, blocked: 2, aborted: 2, empty: 2 });
  });

  await teste("C12 'depois do restart' compara INSTANTES (UTC): em UTC-3, heartbeat e status do host de 90 min ANTES nao passam por novos", () => {
    // O PowerShell 7 converte o texto ISO do JSON em [datetime] Kind=Utc; o
    // Get-Date e Local. Comparar sem normalizar compara relogios de parede
    // diferentes: na CAIXA (UTC-3), um arquivo de ate 3 h ANTES do restart
    // passaria por "depois". No 5.1 o texto vira Local e o erro nao aparece,
    // por isso o teste roda o 7 com o fuso de Sao Paulo, nos dois caminhos.
    const raiz = L.tmpDir("tata-cutover-fuso-");
    const iso = (deltaMs) => new Date(Date.now() + deltaMs).toISOString();
    const escrever = (hbStart, hostAt) => {
      L.writeJson(path.join(raiz, "state", "reader-heartbeat-v1.json"), {
        schema: "deliveryos.tata-reader-heartbeat.v1", supervisor: { run_id: "R", started_at: hbStart, script_sha256: "S" },
        watcher: { expected_sha256: "W", sha256_verified: true }, totals: { ok: 2 }, consecutive_failures: 0,
      });
      L.writeJson(path.join(raiz, "evidence", "continuous-host-status.json"), { schema: "x", state: "RUNNING", updated_at: hostAt });
    };
    const medir = () => {
      const cmd = `. '${CUT}'
function Get-ScmState { "Running" }
function Get-ServiceInfo { return [ordered]@{ process_id = 10 } }
function Invoke-NodeJson { return @{ code = 0; json = $null } }
$s = Get-Snapshot (Get-Layout '${raiz}') (Get-Date) ([long]0) "S" "W" "x" @{ run_id = $null; service_pid = $null } -Light
[ordered]@{ hb = $s.heartbeat_after_restart; host = $s.host_updated_after_restart;
  texto_antes = (Test-InstantAfter '${iso(-90 * 60000)}' (Get-Date)); texto_depois = (Test-InstantAfter '${iso(60000)}' (Get-Date)) } | ConvertTo-Json -Compress`;
      const res = L.runPwsh(pwsh, ["-Command", cmd], { env: { TZ: "America/Sao_Paulo" } });
      assert.equal(res.status, 0, res.stdout + res.stderr);
      return JSON.parse(res.stdout.trim());
    };
    escrever(iso(-90 * 60000), iso(-90 * 60000));
    assert.deepEqual(medir(), { hb: false, host: false, texto_antes: false, texto_depois: true }, "arquivo velho passou por novo");
    escrever(iso(60000), iso(60000));
    const novo = medir();
    assert.equal(novo.hb, true, "controle positivo: heartbeat novo tem que passar");
    assert.equal(novo.host, true, "controle positivo: status novo do host tem que passar");
  });

  await teste("C13 contrato V2/consumidor: sem observacoes e com hash divergente bloqueiam o Plan", () => {
    assert.deepEqual(out.observation_contract, {
      missing: "MISSING_REQUIRED_OBSERVATION_FIELDS",
      hash_drift: "SNAPSHOT_HASH_MIGRATION_REQUIRED",
      static_present: "STATIC_FIELDS_PRESENT_REPLAY_REQUIRED",
      unknown_consumer: "CONSUMER_CONTRACT_UNKNOWN",
    });
  });

  fim("TATA_READER_CUTOVER_LOGIC");
})();

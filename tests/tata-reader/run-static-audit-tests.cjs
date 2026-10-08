"use strict";
/**
 * Auditoria estatica de watcher — prova sobre o codigo INSTALADO (fixture
 * byte-identica, SHA 4507304C...) e mutacoes que cada regra tem que acusar.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const L = require("./lib.cjs");
const A = require("../../runtime/tata-reader/tata_reader_watch_static_audit_v1.cjs");

const { teste, fim } = L.runner("TATA_READER_STATIC_AUDIT");
const FIX = path.join(L.ROOT, "tests", "tata-reader", "fixtures");
const INSTALADO = fs.readFileSync(path.join(FIX, "watcher_v1_installed_256dc42.ps1"), "utf8");
const HEAD = fs.readFileSync(path.join(FIX, "watcher_v1_head_a1808d8.ps1"), "utf8");
const CLI = path.join(L.ROOT, "runtime", "tata-reader", "tata_reader_watch_static_audit_v1.cjs");

function trocarUmaVez(texto, de, para) {
  const n = texto.split(de).length - 1;
  assert.equal(n, 1, `ancora encontrada ${n}x: ${de.slice(0, 60)}`);
  return texto.replace(de, para);
}
const codigos = (r) => r.findings.map((f) => f.code).sort();

(async () => {
  console.log("\n=== TATA COMANDA READER — AUDITORIA ESTATICA DO WATCHER ===\n");

  await teste("A1 o watcher INSTALADO (SHA da evidencia) tem a classe do stall e so pode rodar sob o supervisor", () => {
    assert.equal(L.sha256File(path.join(FIX, "watcher_v1_installed_256dc42.ps1")), "4507304C7A8AA7B19EC303A5692094CB738A561DFDE769ABD234D900447CAA9A");
    for (const [nome, txt] of [["instalado", INSTALADO], ["head", HEAD]]) {
      const r = A.auditWatcherScript(txt);
      assert.equal(r.recommendation, "INSTALL_ONLY_UNDER_SUPERVISOR", nome);
      assert.equal(r.continuous_mode_safe, false);
      assert.equal(r.supervisor_bounded_mode_compatible, true);
      assert.deepEqual(codigos(r), ["CONNECTION_NOT_RESET_AFTER_ERROR", "POLL_ERRORS_SWALLOWED_IN_CONTINUOUS_MODE", "READER_NOT_CLOSED_IN_FINALLY"]);
      assert.ok(r.findings.find((f) => f.code === "READER_NOT_CLOSED_IN_FINALLY").detail.includes("$reader"));
      assert.equal(r.properties.bounded_mode_fails_loud, true);
      assert.equal(r.properties.checkpoint_saved_each_poll, true);
      assert.equal(r.properties.run_result_printed, true);
      assert.equal(r.properties.identity_checked, true);
    }
  });

  await teste("A2 corrigir o leitor (finally) e o catch (sinal duravel + conexao refeita) torna o modo continuo seguro", () => {
    let t = trocarUmaVez(INSTALADO, "      $reader.Close()\n", "");
    t = trocarUmaVez(t, "      $reader=$cmd.ExecuteReader()\n", "      $reader=$cmd.ExecuteReader()\n      try {\n");
    t = trocarUmaVez(t, "      $result.effects.database_read=$true\n", "      } finally { if($null -ne $reader){ $reader.Close() } }\n      $result.effects.database_read=$true\n");
    t = trocarUmaVez(t, "      $result.poll_errors++\n", "      $result.poll_errors++\n      [Console]::Error.WriteLine('POLL_ERROR')\n      $conn.Close(); $conn.Open()\n");
    t = trocarUmaVez(t, "  $rd.Close()\n", "");
    t = trocarUmaVez(t, "  $rd = $id.ExecuteReader()\n", "  $rd = $id.ExecuteReader()\n  try {\n");
    t = trocarUmaVez(t, '  $dbName = [string]$rd["database_name"]\n', '  $dbName = [string]$rd["database_name"]\n  } finally { $rd.Dispose() }\n');
    const r = A.auditWatcherScript(t);
    assert.deepEqual(codigos(r), [], JSON.stringify(r.findings));
    assert.equal(r.recommendation, "SAFE_CONTINUOUS_AND_SUPERVISABLE");
  });

  await teste("A3 sem re-lancar no modo limitado o watcher nao serve ao supervisor: DO_NOT_INSTALL", () => {
    const t = trocarUmaVez(INSTALADO, "if($MaxPolls -gt 0){throw}", "");
    const r = A.auditWatcherScript(t);
    assert.equal(r.properties.bounded_mode_fails_loud, false);
    assert.equal(r.supervisor_bounded_mode_compatible, false);
    assert.equal(r.recommendation, "DO_NOT_INSTALL");
  });

  await teste("A4 verbo SQL de escrita na consulta: FORBIDDEN_SQL_VERB, DO_NOT_INSTALL", () => {
    const t = trocarUmaVez(INSTALADO, "SET LOCK_TIMEOUT 2000;\n", "SET LOCK_TIMEOUT 2000;\nUPDATE TEKNISA.COMANDAVEN SET IDSTCOMANDA='X';\n");
    const r = A.auditWatcherScript(t);
    assert.ok(codigos(r).includes("FORBIDDEN_SQL_VERB"));
    assert.deepEqual(r.findings.find((f) => f.code === "FORBIDDEN_SQL_VERB").detail, ["UPDATE"]);
    assert.equal(r.recommendation, "DO_NOT_INSTALL");
  });

  await teste("A5 rede e impressao sao superficies proibidas", () => {
    const net = A.auditWatcherScript(INSTALADO + "\nInvoke-WebRequest -Uri https://exemplo.invalid -Method Post\n");
    assert.ok(codigos(net).includes("FORBIDDEN_NETWORK_SURFACE"));
    assert.equal(net.recommendation, "DO_NOT_INSTALL");
    const prn = A.auditWatcherScript(INSTALADO + "\n'x' | Out-Printer\n");
    assert.ok(codigos(prn).includes("FORBIDDEN_PRINT_SURFACE"));
  });

  await teste("A6 comentario nao e codigo: verbo/rede citados em comentario NAO acusam", () => {
    const t = INSTALADO + "\n# nunca usar UPDATE nem Invoke-WebRequest aqui\n<# Out-Printer tambem nao #>\n";
    const r = A.auditWatcherScript(t);
    assert.equal(r.recommendation, "INSTALL_ONLY_UNDER_SUPERVISOR");
    assert.ok(!codigos(r).some((c) => c.startsWith("FORBIDDEN")));
  });

  await teste("A7 sem conferencia de identidade (servico + login SQL): proibido", () => {
    const t = trocarUmaVez(INSTALADO, "[Security.Principal.WindowsIdentity]::GetCurrent().Name", '"qualquer"');
    const r = A.auditWatcherScript(t);
    assert.ok(codigos(r).includes("IDENTITY_NOT_CHECKED"));
    assert.equal(r.recommendation, "DO_NOT_INSTALL");
  });

  await teste("A8 checkpoint fora do laço (sem sinal de progresso por poll) nao serve ao supervisor", () => {
    const t = trocarUmaVez(INSTALADO, "      Save-Checkpoint $checkpoint\n", "");
    const r = A.auditWatcherScript(t);
    assert.equal(r.properties.checkpoint_saved_each_poll, false);
    assert.equal(r.recommendation, "DO_NOT_INSTALL");
  });

  await teste("A9 o proprio supervisor nao tem SQL, rede nem impressao", () => {
    const sup = fs.readFileSync(path.join(L.ROOT, "runtime", "tata-reader", "tata_reader_supervisor_v1.ps1"), "utf8");
    const code = A.stripComments(sup);
    assert.equal(/SqlConnection|SqlCommand|ExecuteReader/i.test(code), false, "supervisor abre SQL");
    assert.equal(/Invoke-WebRequest|Invoke-RestMethod|WebClient|HttpClient|TcpClient/i.test(code), false, "supervisor faz rede");
    assert.equal(/Out-Printer|Printing|winspool/i.test(code), false, "supervisor imprime");
  });

  await teste("A10 CLI: 0 para instalavel sob supervisor, 2 para proibido; SHA do arquivo no relatorio", () => {
    const ok = spawnSync(process.execPath, [CLI, path.join(FIX, "watcher_v1_installed_256dc42.ps1")], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    const j = JSON.parse(ok.stdout);
    assert.equal(j.file_sha256, "4507304C7A8AA7B19EC303A5692094CB738A561DFDE769ABD234D900447CAA9A");
    assert.equal(j.recommendation, "INSTALL_ONLY_UNDER_SUPERVISOR");
    const dir = L.tmpDir("tata-audit-cli-");
    const bad = path.join(dir, "w.ps1");
    fs.writeFileSync(bad, INSTALADO.replace("SET LOCK_TIMEOUT 2000;\n", "SET LOCK_TIMEOUT 2000;\nDELETE FROM TEKNISA.VENDA;\n"));
    const r = spawnSync(process.execPath, [CLI, bad], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.equal(JSON.parse(r.stdout).recommendation, "DO_NOT_INSTALL");
  });

  fim("TATA_READER_STATIC_AUDIT");
})();

/**
 * /api/fontes — saúde REAL da fonte TATÁ Comanda na superfície de leitura.
 *
 * Prova: não configurada é `indisponivel` (nunca demonstração no lugar);
 * configurada usa o MESMO avaliador do cutover; a assinatura de 05/10 sai
 * `stale`; campos estranhos de um heartbeat nunca atravessam para a resposta;
 * e a rota HTTP real responde com e sem a raiz configurada.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { lerSaudeDaFonteTata, type AvaliadorDeSaude } from "./leitura/saude-fonte-tata";

const req = createRequire(join(process.cwd(), "package.json"));
const { evaluateTataReaderHealthV1 } = req(join(process.cwd(), "runtime", "tata-reader", "tata_reader_health_v1.cjs")) as {
  evaluateTataReaderHealthV1: AvaliadorDeSaude;
};

let passou = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passou += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}\n      ${e instanceof Error ? e.message.split("\n").join("\n      ") : String(e)}`);
  }
}

function raizCom(arquivos: { heartbeat?: unknown; host?: unknown; consumer?: unknown; checkpointIdadeS?: number | null }): string {
  const r = mkdtempSync(join(tmpdir(), "fonte-tata-"));
  mkdirSync(join(r, "state"), { recursive: true });
  mkdirSync(join(r, "evidence"), { recursive: true });
  if (arquivos.heartbeat !== undefined) writeFileSync(join(r, "state", "reader-heartbeat-v1.json"), JSON.stringify(arquivos.heartbeat));
  if (arquivos.host !== undefined) writeFileSync(join(r, "evidence", "continuous-host-status.json"), JSON.stringify(arquivos.host));
  if (arquivos.consumer !== undefined) writeFileSync(join(r, "evidence", "shadow-consumer-status.json"), JSON.stringify(arquivos.consumer));
  if (arquivos.checkpointIdadeS !== undefined && arquivos.checkpointIdadeS !== null) {
    const ck = join(r, "state", "reader-watch-checkpoint-v1.json");
    writeFileSync(ck, "{}");
    const t = (Date.now() - arquivos.checkpointIdadeS * 1000) / 1000;
    utimesSync(ck, t, t);
  }
  return r;
}

function heartbeatSaudavel(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const agora = Date.now();
  return {
    schema: "deliveryos.tata-reader-heartbeat.v1",
    supervisor: { version: "tata-reader-supervisor@1", pid: 1, run_id: "r", started_at: new Date(agora - 3600e3).toISOString() },
    watcher: { file_name: "w.ps1", expected_sha256: "A".repeat(64), sha256_verified: true },
    state: "RUNNING",
    seq: 10,
    written_at: new Date(agora - 2000).toISOString(),
    cadence: { poll_seconds: 3, batch_polls: 60, expected_batch_seconds: 180, progress_stall_seconds: 39, heartbeat_every_seconds: 5, max_backoff_seconds: 60 },
    last_batch: { seq: 3, outcome: "OK", error_class: null },
    last_success_at: new Date(agora - 30e3).toISOString(),
    consecutive_failures: 0,
    totals: { batches: 3, ok: 3, failed: 0 },
    ...extra,
  };
}

const HOST_RUNNING = { schema: "deliveryos.tata-reader-continuous-host-status.v2", state: "RUNNING", updated_at: new Date().toISOString() };

async function main(): Promise<void> {
  console.log("\n=== /api/fontes — SAUDE REAL DA FONTE TATA COMANDA ===\n");

  await teste("F1 sem raiz configurada: indisponivel, NAO_CONFIGURADA, nunca ao vivo", () => {
    const s = lerSaudeDaFonteTata(null, Date.now(), evaluateTataReaderHealthV1);
    assert.equal(s.configurada, false);
    assert.equal(s.estado, "indisponivel");
    assert.equal(s.veredito, "NAO_CONFIGURADA");
    assert.equal(s.ao_vivo, false);
    assert.deepEqual([...s.motivos], ["FONTE_NAO_CONFIGURADA"]);
  });

  await teste("F2 supervisor saudavel: saudavel, ao vivo, ultimo lote OK", () => {
    const r = raizCom({ heartbeat: heartbeatSaudavel(), host: HOST_RUNNING, checkpointIdadeS: 2 });
    const s = lerSaudeDaFonteTata(r, Date.now(), evaluateTataReaderHealthV1);
    assert.equal(s.configurada, true);
    assert.equal(s.estado, "saudavel", JSON.stringify(s.motivos));
    assert.equal(s.veredito, "HEALTHY");
    assert.equal(s.ao_vivo, true);
    assert.deepEqual(s.ultimo_lote, { desfecho: "OK", classe_de_erro: null });
  });

  await teste("F3 assinatura de 05/10 (host e consumidor RUNNING, checkpoint parado, sem heartbeat): stale, nao ao vivo", () => {
    const r = raizCom({ host: HOST_RUNNING, consumer: { schema: "deliveryos.live-shadow-consumer-status.v1", state: "RUNNING" }, checkpointIdadeS: 7200 });
    const s = lerSaudeDaFonteTata(r, Date.now(), evaluateTataReaderHealthV1);
    assert.equal(s.estado, "stale");
    assert.equal(s.veredito, "STALLED");
    assert.equal(s.ao_vivo, false);
    assert.ok(s.motivos.includes("CHECKPOINT_STALE") && s.motivos.includes("HEARTBEAT_MISSING"));
    assert.equal(s.ultimo_lote, null);
  });

  await teste("F4 campo estranho no heartbeat (texto com pedido/nome) nunca atravessa para a resposta", () => {
    const r = raizCom({ heartbeat: heartbeatSaudavel({ nota: "pedido 0000348932 cliente Fulano", last_batch: { outcome: "OK", error_class: null, bruto: "Fulano 11 9999-0000" } }), checkpointIdadeS: 1 });
    const s = lerSaudeDaFonteTata(r, Date.now(), evaluateTataReaderHealthV1);
    const texto = JSON.stringify(s);
    for (const p of ["0000348932", "Fulano", "9999"]) assert.equal(texto.includes(p), false, `vazou ${p}`);
  });

  await teste("F5 arquivo ilegivel e sinal INVALIDO (UNKNOWN), nao ausencia nem saude", () => {
    const r = raizCom({ checkpointIdadeS: 1 });
    writeFileSync(join(r, "state", "reader-heartbeat-v1.json"), "{corrompido");
    const s = lerSaudeDaFonteTata(r, Date.now(), evaluateTataReaderHealthV1);
    assert.equal(s.veredito, "UNKNOWN");
    assert.ok(s.motivos.includes("HEARTBEAT_SCHEMA_INVALID"));
  });

  await teste("F6 HTTP real: /api/fontes com e sem raiz configurada; historico de 05/10 segue nao-ao-vivo", () => {
    const r = raizCom({ heartbeat: heartbeatSaudavel(), host: HOST_RUNNING, checkpointIdadeS: 2 });
    const codigo = [
      'const { criarServidor } = require("./tools/product_system_server");',
      "(async () => {",
      '  const s = await criarServidor(); await new Promise((ok) => s.listen(0, "127.0.0.1", ok));',
      '  const base = "http://127.0.0.1:" + s.address().port;',
      '  const f = await (await fetch(base + "/api/fontes")).json();',
      '  const post = await fetch(base + "/api/fontes", { method: "POST" });',
      "  console.log(JSON.stringify({ f, post: post.status })); s.close(); process.exit(0);",
      "})();",
    ].join("\n");
    const rodar = (raiz: string) => {
      const x = spawnSync("npx", ["tsx", "-e", codigo], {
        cwd: process.cwd(), encoding: "utf8", timeout: 90000,
        env: { ...process.env, TATA_READER_INSTALL_ROOT: raiz, DELIVERYOS_DATABASE_URL: "", CONFERENCE_BRAIN_DATA_DIR: "" },
      });
      assert.equal(x.status, 0, x.stderr);
      return JSON.parse((x.stdout || "").trim().split("\n").pop() || "{}");
    };
    const com = rodar(r);
    assert.equal(com.f.modulo, "fontes");
    assert.equal(com.f.fontes[0].estado, "saudavel");
    assert.equal(com.f.fontes[0].ao_vivo, true);
    assert.equal(com.f.historico_tata_comanda.ao_vivo, false);
    assert.equal(com.f.historico_tata_comanda.data_operacional, "2026-10-05");
    assert.equal(com.post, 405);
    const sem = rodar("");
    assert.equal(sem.f.fontes[0].veredito, "NAO_CONFIGURADA");
    assert.equal(sem.f.fontes[0].estado, "indisponivel");
  });

  console.log(`\nSAUDE_FONTES: ${passou}/${passou + falhas.length} PASS`);
  if (falhas.length) {
    console.log("SAUDE_FONTES_RED");
    process.exit(1);
  }
  console.log("SAUDE_FONTES_GREEN");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

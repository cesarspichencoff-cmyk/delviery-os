#!/usr/bin/env node
"use strict";
/**
 * Mede o custo de I/O por poll de um laco consumidor sombra do TATA Reader.
 *
 * Por que existe: o laco `live_shadow_consumer_loop_v1.cjs` (outra linhagem,
 * branch tmp/paired-comanda-nfce-20261007) grava o arquivo de status UMA VEZ
 * POR ARQUIVO DE EVENTO a cada poll, mesmo sem evento novo. Medido em
 * 2026-10-07: com 2000 eventos ja processados e zero novos, cada poll faz
 * 2000 escritas + 2000 renomeacoes; no intervalo de producao (2 s) isso e
 * ~1000 escritas/s num caixa (PDV), crescendo sem limite porque nada poda os
 * eventos — e o status "fresco" deixa de significar dado fluindo.
 *
 * Uso (em qualquer sistema; nao toca a CAIXA):
 *   node tools/tata_reader_consumer_io_bench.cjs <loop.cjs> <report_source_envelope_v1.cjs> [N=2000] [segundos=6]
 * Saida: JSON com escritas/renomeacoes por poll. Codigo 0 se mediu; 2 se o
 * laco reescreve status mais de uma vez por poll sem trabalho novo.
 *
 * O laco roda numa raiz TEMPORARIA que imita C:\ProgramData\TataComandaReader
 * (o laco tem o caminho fixo no codigo); N eventos ja processados (decisao e
 * envelope presentes), de modo que nenhum consumidor filho e iniciado.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const [loop, envelope, nArg, sArg] = process.argv.slice(2);
if (!loop || !envelope) {
  console.error("uso: tata_reader_consumer_io_bench.cjs <loop.cjs> <report_source_envelope_v1.cjs> [N] [segundos]");
  process.exit(64);
}
const N = Number(nArg || 2000);
const SEG = Number(sArg || 6);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "tata-consumer-bench-"));
const root = path.join(work, "C:\\ProgramData\\TataComandaReader");
for (const d of ["shadow", "state/reader-events-v1", "state/reader-shadow-decisions-v1", "state/reader-report-source-envelopes-v1", "evidence"]) {
  fs.mkdirSync(path.join(root, d), { recursive: true });
}
fs.copyFileSync(envelope, path.join(root, "shadow", "report_source_envelope_v1.cjs"));
for (let i = 0; i < N; i += 1) {
  const n = `${String(i).padStart(10, "0")}_${"A".repeat(64)}.json`;
  fs.writeFileSync(path.join(root, "state", "reader-events-v1", n), "{}");
  fs.writeFileSync(path.join(root, "state", "reader-shadow-decisions-v1", n.replace(/\.json$/, ".decision.json")), "{}");
  fs.writeFileSync(path.join(root, "state", "reader-report-source-envelopes-v1", n.replace(/\.json$/, ".report-source.json")), "{}");
}
const preload = path.join(work, "preload.cjs");
fs.writeFileSync(preload, `
const fs = require("node:fs"); const path = require("node:path"); const Module = require("node:module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (typeof req === "string" && req.startsWith("C:\\\\ProgramData")) req = path.join(process.cwd(), req);
  return orig.call(this, req, ...rest);
};
let renames = 0, writes = 0, polls = 0;
const r = fs.renameSync, w = fs.writeFileSync, d = fs.readdirSync;
fs.renameSync = function (...a) { renames++; return r.apply(this, a); };
fs.writeFileSync = function (...a) { writes++; return w.apply(this, a); };
fs.readdirSync = function (...a) {
  if (polls > 0) fs.writeSync(2, "POLL " + polls + " " + renames + " " + writes + "\\n");
  polls++; renames = 0; writes = 0;
  return d.apply(this, a);
};
`);
const res = spawnSync(process.execPath, ["-r", preload, path.resolve(loop)], {
  cwd: work, encoding: "utf8", timeout: SEG * 1000, env: { ...process.env, TATA_SHADOW_POLL_MS: "500" },
});
const polls = [...String(res.stderr || "").matchAll(/^POLL (\d+) (\d+) (\d+)$/gm)].map((m) => ({ poll: +m[1], renames: +m[2], writes: +m[3] }));
fs.rmSync(work, { recursive: true, force: true });
const pior = polls.reduce((a, p) => Math.max(a, p.renames), 0);
const out = {
  schema: "deliveryos.tata-reader-consumer-io-bench.v1",
  loop_file: path.basename(loop),
  processed_events_seeded: N,
  new_events: 0,
  polls_measured: polls.length,
  per_poll: polls,
  worst_renames_per_poll: pior,
  production_poll_ms: 2000,
  projected_status_writes_per_second_at_production_poll: Math.round(pior / 2),
  verdict: polls.length === 0 ? "NOT_MEASURED" : pior > 1 ? "STATUS_WRITE_AMPLIFICATION" : "OK_AT_MOST_ONE_STATUS_WRITE_PER_POLL",
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.verdict === "STATUS_WRITE_AMPLIFICATION" ? 2 : out.verdict === "NOT_MEASURED" ? 3 : 0);

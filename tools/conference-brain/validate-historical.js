/* ============================================================================
 * Validação da fundação contra os dados históricos REAIS.
 * ----------------------------------------------------------------------------
 * Não recalibra regra nenhuma. Só executa a fundação sobre os arquivos que já
 * existem no projeto e imprime contagens conferíveis — inclusive as que não
 * batem com o esperado, que é justamente o que precisa ser registrado.
 *
 * Uso: node tools/conference-brain/validate-historical.js [--json]
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");

const { createIngestion } = require("../../src/conference-brain/ingestion/pipeline");
const { createHistoricalHtmlAdapter } =
  require("../../src/conference-brain/ingestion/adapters/historical-html");
const { buildSnapshots, computeRhythm } = require("../../src/conference-brain/snapshots/engine");
const { evaluateShadowState, baseStateFromLoad } = require("../../src/conference-brain/shadow/conference-state");
const { orderHints, buildCatalogIndex } = require("../../src/conference-brain/composition/hints");
const { CONFERENCE_STATES } = require("../../src/conference-brain/contracts/states");

const ROOT = path.resolve(__dirname, "../..");
const RAW = path.resolve(ROOT, "../delviery-os/data/raw/incoming");
const FILES = [
  path.join(RAW, "ifood_2026-06-20_a_2026-06-30/relatorio_pedidos_com_itens_jun20-30.html"),
  path.join(RAW, "ifood_2026-07-01/relatorio_pedidos_01-07.html")
];

const out = {};
const say = (...a) => console.log(...a);
const h = (t) => say("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72));

/* --- 1. Ingestão real ------------------------------------------------------ */
h("1. INGESTAO DOS ARQUIVOS HISTORICOS REAIS");
const missing = FILES.filter((f) => !fs.existsSync(f));
if (missing.length) {
  say("ARQUIVOS AUSENTES:");
  missing.forEach((f) => say("  " + f));
  process.exit(2);
}
for (const f of FILES) {
  const st = fs.statSync(f);
  say(`  ${path.basename(f)}  ${(st.size / 1024 / 1024).toFixed(2)} MB`);
}

const adapter = createHistoricalHtmlAdapter(FILES, { channel: "iFood" });
const ing = createIngestion(adapter, { storeOptions: { memoryOnly: true }, keepRaw: false });
const res = ing.run();

const R = {
  observados: res.run.observed_count,
  normalizados: res.run.normalized_count,
  duplicados: res.run.duplicate_count,
  rejeitados: res.run.rejected_count,
  unicos: res.store.count("orders"),
  linhas_de_item: res.store.count("order_items"),
  eventos: res.store.count("order_status_events"),
  status: res.run.status,
  erro: res.run.error
};
Object.assign(out, R);
out.saude = res.health;

say(`\n  status da execucao ${R.status}${R.erro ? " (" + R.erro + ")" : ""}`);
say(`  observados         ${R.observados}`);
say(`  normalizados       ${R.normalizados}`);
say(`  duplicados         ${R.duplicados}`);
say(`  rejeitados         ${R.rejeitados}`);
say(`  PEDIDOS UNICOS     ${R.unicos}`);
say(`  linhas de item     ${R.linhas_de_item}`);
say(`  eventos de status  ${R.eventos}`);
say(`  saude da fonte     ${res.health.source_state}  confianca=${res.health.confidence}`);
say(`  campos ausentes    ${res.health.missing_fields.join(", ") || "(nenhum)"}`);
say(`  anomalias          ${res.health.anomalies}  (divergentes: ${res.health.divergent_duplicates})`);

/* --- 2. Divergência de linhas de item: contagem declarada x parseada ------- */
h("2. LINHAS DE ITEM — DECLARADO PELA FONTE x PARSEADO");
// Conta sobre o que o ADAPTADOR realmente observou (as duas estrategias),
// nao so sobre a estrategia do array embutido.
const brutas = adapter.observe();
let declaradoDist = 0, declaradoUn = 0, semNitens = 0, linhasBrutas = 0;
const porArquivo = new Map();
for (const r of brutas) {
  const f = path.basename(r.__file || "?");
  if (!porArquivo.has(f)) porArquivo.set(f, { rows: 0, dist: 0, un: 0, linhas: 0, sem: 0 });
  const p = porArquivo.get(f);
  p.rows++;
  const m = String(r.nitens || "").match(/(\d+)\s*dist\..*?(\d+)\s*un\./);
  if (m) { p.dist += Number(m[1]); p.un += Number(m[2]); } else { p.sem++; semNitens++; }
  p.linhas += String(r.itens_html || "").split("\n").filter((x) => x.trim()).length;
}
for (const [f, p] of porArquivo) {
  declaradoDist += p.dist; declaradoUn += p.un; linhasBrutas += p.linhas;
  say(`  ${f}
    linhas=${p.rows}  dist.declarado=${p.dist}  un.declarado=${p.un}  linhas_html=${p.linhas}  sem_nitens=${p.sem}`);
}
say(`
  TOTAL dist. declarado pela fonte (com duplicados)  ${declaradoDist}`);
say(`  TOTAL un. declarado pela fonte (com duplicados)    ${declaradoUn}`);
say(`  TOTAL linhas no itens_html (com duplicados)        ${linhasBrutas}`);
say(`  linhas sem campo "nitens"                          ${semNitens}`);
say(`  TOTAL linhas persistidas (apos dedup)              ${R.linhas_de_item}`);
say(`  diferenca bruto -> persistido                      ${linhasBrutas - R.linhas_de_item}`);
out.declarado_distinto_bruto = declaradoDist;
out.declarado_unidades_bruto = declaradoUn;
out.linhas_html_bruto = linhasBrutas;
out.linhas_sem_nitens = semNitens;

/* --- 3. Amostra auditável -------------------------------------------------- */
h("3. AMOSTRA AUDITAVEL (3 pedidos)");
const orders = res.store.all("orders");
const items = res.store.all("order_items");
const byOrder = new Map();
for (const it of items) {
  if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
  byOrder.get(it.order_id).push(it);
}
for (const o of orders.slice(0, 3)) {
  const li = byOrder.get(o.order_id) || [];
  say(`\n  ${o.order_id}  ${o.received_at}  status=${o.status}  total=${o.total_value}`);
  say(`    campos ausentes: ${(o.missing_fields || []).join(", ") || "(nenhum)"}`);
  li.slice(0, 4).forEach((x) => say(`      ${x.quantity}x ${x.raw_name}${x.observation ? "  // " + x.observation : ""}`));
  if (li.length > 4) say(`      ... +${li.length - 4} linhas`);
}

/* --- 4. Snapshots sobre a fonte real -------------------------------------- */
h("4. SNAPSHOTS (janela de 5 min) SOBRE A FONTE REAL");
const snaps = buildSnapshots(orders, { windowMinutes: 5 });
say(`  janelas geradas        ${snaps.length}`);
const comAtivo = snaps.filter((s) => s.active_orders != null).length;
say(`  janelas com ativos     ${comAtivo}`);
say(`  saude da fonte         ${snaps.length ? snaps[0].source_state : "-"}`);
say(`  nota                   ${snaps.length ? snaps[0].notes || "(nenhuma)" : "-"}`);
const comMovimento = snaps.filter((s) => s.received_in_window > 0).length;
say(`  janelas com chegada    ${comMovimento}`);
const pico = snaps.reduce((a, s) => Math.max(a, s.received_in_window), 0);
say(`  pico de chegadas/5min  ${pico}`);
out.janelas = snaps.length;
out.janelas_com_chegada = comMovimento;
out.janelas_com_ativos = comAtivo;

/* --- 5. Estado sombra sobre a fonte real ---------------------------------- */
h("5. ESTADO SOMBRA SOBRE A FONTE REAL");
const distReal = {};
let modoNaoSombra = 0;
snaps.forEach((s, i) => {
  const st = evaluateShadowState({ snapshot: s, rhythm: computeRhythm(snaps, i) });
  distReal[st.suggested_state] = (distReal[st.suggested_state] || 0) + 1;
  if (st.mode !== "shadow") modoNaoSombra++;
});
Object.entries(distReal).forEach(([k, v]) =>
  say(`  ${k.padEnd(22)} ${String(v).padStart(5)}  (${((v / snaps.length) * 100).toFixed(1)}%)`));
say(`\n  janelas fora do modo sombra: ${modoNaoSombra}  (precisa ser 0)`);
say("  LEITURA: a fonte historica nao carimba PRONTO. A fundacao se recusa a");
say("  afirmar carga e devolve leitura_parcial — em vez de fingir 'calmo'.");
out.distribuicao_fonte_real = distReal;
out.modo_nao_sombra = modoNaoSombra;

/* --- 6. Faixas e atenção abaixo de 50 (fonte sintetica controlada) -------- */
h("6. FAIXAS 30/50/70 E ATENCAO ABAIXO DE 50");
[10, 29, 30, 49, 50, 69, 70, 95].forEach((n) =>
  say(`  ${String(n).padStart(3)} ativos -> ${baseStateFromLoad(n)}`));

const snapBase = {
  snapshot_at: "2026-06-20T20:00:00.000Z", window_minutes: 5,
  active_orders: 34, convergence: 9, avg_ready_minutes: 22,
  received_in_window: 11, concluded_in_window: 4, queue_delta: 7,
  source_state: "disponivel", confidence: "alta"
};
const semMod = evaluateShadowState({ snapshot: Object.assign({}, snapBase, { convergence: 1 }) });
const comMod = evaluateShadowState({
  snapshot: snapBase,
  rhythm: { inflow: 11, outflow: 4, inflow_over_outflow: true, growing_windows: 3,
            avg_ready_minutes: 22, baseline_ready_minutes: 16, ready_growth_ratio: 1.38 }
});
say(`\n  34 ativos, sem convergencia    -> ${semMod.suggested_state}`);
say(`  34 ativos, com convergencia+ritmo -> ${comMod.suggested_state}`);
say(`    base declarada: ${comMod.base_state}`);
say(`    modificadores : ${comMod.modifiers.join(", ")}`);
comMod.reasons.forEach((r) => say(`      - ${r.code}: ${r.message}`));
out.atencao_abaixo_de_50 = comMod.suggested_state === CONFERENCE_STATES.ATTENTION;

/* --- 7. Composição não altera estado global ------------------------------- */
h("7. COMPOSICAO — CONTEXTO, NUNCA ESTADO GLOBAL");
let seed = [];
for (const p of [path.join(ROOT, "data/cardapio_knowledge_seed.json"),
                 path.resolve(ROOT, "../delviery-os/data/cardapio_knowledge_seed.json")]) {
  if (fs.existsSync(p)) {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    seed = Array.isArray(j) ? j : (j.itens || j.items || []);
    say(`  catalogo: ${path.relative(ROOT, p)}  (${seed.length} itens)`);
    break;
  }
}
if (!seed.length) say("  catalogo: NAO LOCALIZADO — sinais dependentes de praca ficam indisponiveis");
const idx = buildCatalogIndex(seed);

const contagem = {};
let comHint = 0, alteraGlobal = 0, casados = 0, naoCasados = 0;
for (const o of orders) {
  const r = orderHints(o, byOrder.get(o.order_id) || [], idx);
  if (r.affects_global_state) alteraGlobal++;
  if (r.hints.length) comHint++;
  casados += (r.facts.distinct_items || 0) - r.facts.unmatched_items;
  naoCasados += r.facts.unmatched_items;
  for (const hint of r.hints) contagem[hint.code] = (contagem[hint.code] || 0) + 1;
}
say(`\n  pedidos com pelo menos um sinal: ${comHint} de ${orders.length}`);
Object.entries(contagem).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => say(`    ${k.padEnd(28)} ${String(v).padStart(6)}`));
say(`\n  itens casados no catalogo:     ${casados}`);
say(`  itens sem correspondencia:     ${naoCasados}`);
say(`  pedidos que alteram estado global: ${alteraGlobal}  (precisa ser 0)`);
out.composicao_altera_global = alteraGlobal;
out.sinais = contagem;

/* --- 8. Veredito ---------------------------------------------------------- */
h("8. VEREDITO DA VALIDACAO");
const checks = [
  ["pedidos unicos apos dedup", R.unicos === 3429, `${R.unicos} (esperado 3429)`],
  ["duplicados detectados", R.duplicados > 0, String(R.duplicados)],
  ["ingestao concluida sem excecao", R.status === "concluido", R.status],
  ["nenhum registro rejeitado", R.rejeitados === 0, String(R.rejeitados)],
  ["fonte reportada como parcial", res.health.source_state === "parcial", res.health.source_state],
  ["nenhuma janela fora do modo sombra", modoNaoSombra === 0, String(modoNaoSombra)],
  ["fonte sem PRONTO nao afirma carga", comAtivo === 0, `${comAtivo} janelas com ativos`],
  ["atencao possivel abaixo de 50", out.atencao_abaixo_de_50, comMod.suggested_state],
  ["composicao nao altera estado global", alteraGlobal === 0, String(alteraGlobal)]
];
let falhou = 0;
checks.forEach(([nome, ok, det]) => {
  if (!ok) falhou++;
  say(`  ${ok ? "OK  " : "FALHA"}  ${nome.padEnd(38)} ${det}`);
});
say(`\n  ${falhou === 0 ? "VALIDACAO CONSISTENTE" : `VALIDACAO COM ${falhou} DIVERGENCIA(S)`}`);

if (process.argv.includes("--json")) {
  const dest = path.join(ROOT, "docs/conference-brain/validation-run.json");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  say(`\n  json: ${path.relative(ROOT, dest)}`);
}
process.exit(falhou === 0 ? 0 : 1);

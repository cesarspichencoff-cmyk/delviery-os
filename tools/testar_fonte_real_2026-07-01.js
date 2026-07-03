/* ============================================================================
 * TESTE ISOLADO — Fonte real (01/07/2026) × fonte sintética, nível de COMPOSIÇÃO
 * ----------------------------------------------------------------------------
 * Exploratório. NÃO toca em tools/autoteste_8pracas.js, no motor, no baseline,
 * nem no seed do cardápio. Só compara o que MOTOR.resolver() produz para os
 * mesmos 250 IDs de pedido, uma vez com itens reais (extraídos do HTML de
 * 01/07/2026) e outra com a síntese de sempre (makeFonteSintetica).
 *
 * Limitação assumida (ver docs/Relatorio_Fonte_Real_Itens_2026-07-01.md): este
 * dia NÃO tem carimbos de pronto/saiu/entregue (Motor A) — só o horário do
 * pedido. Por isso este teste compara COMPOSIÇÃO (praça, sacola, fechável),
 * não FOCO (que depende de MOTOR.step simulando o relógio do dia). Comparar
 * foco exigiria inventar timing, o que violaria a honestidade estrutural do
 * projeto — não fizemos isso.
 * ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..");
const MOTOR = require(path.join(REPO, "src/perfil-delivery/motor.js"));
const SEED = require(path.join(REPO, "data/cardapio_knowledge_seed.json")).itens;

const JSONL = path.join(REPO, "data/generated/itens_pedido_reais_2026-07-01.jsonl");
if (!fs.existsSync(JSONL)) {
  console.log(`ERRO: rode antes  node tools/parse_relatorio_pedidos_html.js  (esperava ${JSONL})`);
  process.exit(1);
}

MOTOR.setNomes(Object.fromEntries(SEED.map((i) => [i.id, i.nome])));

// ---------- fonte REAL (a partir do jsonl exploratório) ----------
const linhas = fs.readFileSync(JSONL, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const rows = linhas.map((l) => ({
  pedido_id: l.pedido_id, item_nome: l.item_nome, quantidade: l.quantidade,
  observacao: l.observacao, horario: l.horario,
}));
const FONTE_REAL = MOTOR.makeFonteItensFromRows(rows, SEED);

// ---------- fonte SINTÉTICA (mesma função usada no backtest oficial), mesmos IDs ----------
const ids = FONTE_REAL.ids;
const FONTE_SINT = MOTOR.makeFonteSintetica(SEED);

// ---------- comparação por pedido ----------
function resumo(fonte, ids) {
  const porPraca = {}; MOTOR.PRACAS.forEach((p) => (porPraca[p] = 0));
  let pracaUnica = 0, segundaSacola = 0, contemBebida = 0, contemKit = 0, contemSobremesa = 0,
    riscoAlto = 0, soQuentes = 0, semPracaProducao = 0;
  const distribBenches = {};
  for (const id of ids) {
    const I = MOTOR.resolver(fonte(id));
    I.benches.forEach((p) => (porPraca[p] = (porPraca[p] || 0) + 1));
    if (I.pracaUnica) pracaUnica++;
    if (I.segundaSacola) segundaSacola++;
    if (I.contemBebida) contemBebida++;
    if (I.contemKit) contemKit++;
    if (I.contemSobremesa) contemSobremesa++;
    if (I.riscoConfAlto) riscoAlto++;
    if (I.soQuentes) soQuentes++;
    if (I.nBenches === 0) semPracaProducao++;
    distribBenches[I.nBenches] = (distribBenches[I.nBenches] || 0) + 1;
  }
  return { porPraca, pracaUnica, segundaSacola, contemBebida, contemKit, contemSobremesa, riscoAlto, soQuentes, semPracaProducao, distribBenches };
}

const R = resumo(FONTE_REAL, ids);
const S = resumo(FONTE_SINT, ids);
const n = ids.length;
const pct = (x) => ((100 * x) / n).toFixed(1) + "%";

console.log(`=== TESTE ISOLADO — composição real × sintética (01/07/2026, ${n} pedidos) ===\n`);
console.log("Casamento da fonte real contra o seed:");
console.log(`  linhas: ${FONTE_REAL.stats.linhas} | casados: ${FONTE_REAL.stats.casados} | não-casados: ${FONTE_REAL.stats.naoCasados} (${((100 * FONTE_REAL.stats.naoCasados) / FONTE_REAL.stats.linhas).toFixed(1)}%)`);
if (FONTE_REAL.stats.naoCasados > 0) {
  console.log("  itens que não casaram:", JSON.stringify(FONTE_REAL.unmatched));
}

console.log("\nPor praça — nº de pedidos que tocam a praça (real vs sintética):");
for (const p of MOTOR.PRACAS) {
  console.log(`  ${MOTOR.DISPLAY[p].padEnd(20)} real ${String(R.porPraca[p] || 0).padStart(3)} (${pct(R.porPraca[p] || 0)})   sintética ${String(S.porPraca[p] || 0).padStart(3)} (${pct(S.porPraca[p] || 0)})`);
}

console.log("\nSinais agregados (real vs sintética):");
const linha = (label, r, s) => console.log(`  ${label.padEnd(28)} real ${String(r).padStart(3)} (${pct(r)})   sintética ${String(s).padStart(3)} (${pct(s)})`);
linha("praça única (fechável)", R.pracaUnica, S.pracaUnica);
linha("2ª sacola", R.segundaSacola, S.segundaSacola);
linha("contém bebida", R.contemBebida, S.contemBebida);
linha("contém kit", R.contemKit, S.contemKit);
linha("contém sobremesa", R.contemSobremesa, S.contemSobremesa);
linha("risco de conferência alto", R.riscoAlto, S.riscoAlto);
linha("só quentes", R.soQuentes, S.soQuentes);
linha("sem praça de produção", R.semPracaProducao, S.semPracaProducao);

console.log("\nDistribuição de nº de bancadas de produção por pedido:");
console.log("  real:     ", JSON.stringify(R.distribBenches));
console.log("  sintética:", JSON.stringify(S.distribBenches));

// exemplos lado a lado (5 pedidos)
console.log("\nExemplos lado a lado (5 primeiros pedidos):");
for (const id of ids.slice(0, 5)) {
  const Ir = MOTOR.resolver(FONTE_REAL(id));
  const Is = MOTOR.resolver(FONTE_SINT(id));
  console.log(`  #${id.slice(0, 8)}  REAL: [${Ir.itens.map((x) => x.nome).join(" · ")}] → praças ${JSON.stringify(Ir.benches)}, pracaUnica=${Ir.pracaUnica}, 2sacolas=${Ir.segundaSacola}`);
  console.log(`  #${id.slice(0, 8)}  SINT: [${Is.itens.map((x) => x.nome).join(" · ")}] → praças ${JSON.stringify(Is.benches)}, pracaUnica=${Is.pracaUnica}, 2sacolas=${Is.segundaSacola}`);
}

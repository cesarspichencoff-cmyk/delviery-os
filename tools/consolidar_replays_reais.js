/* ============================================================================
 * CONSOLIDAÇÃO — 12 janelas reais (01/07 + 11 dias de 20-30/06)
 * ----------------------------------------------------------------------------
 * Lê os resumos já gerados pelos replays isolados (data/generated/*.json) e
 * produz a tabela consolidada + estatística. Não roda nada de novo, não toca
 * motor/seed/baseline. Saída: console + data/generated/consolidado_12_janelas.json
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "data", "generated");

function ler(arq, label) {
  const o = JSON.parse(fs.readFileSync(path.join(OUT, arq), "utf8"));
  const c = o.cmp;
  const pedidos = c.pedidos != null ? c.pedidos : c.janela.pedidos;
  const cobertura = c.cobertura != null ? c.cobertura : "100.0%"; // 01/07: portão V1 já documentado (100% no relatório anterior)
  const R = c.real, S = c.sintetico;
  const pctAlta = X => { const t = Object.values(X.porConf).reduce((a, b) => a + b, 0) || 1; return Math.round(100 * (X.porConf.alta || 0) / t); };
  return {
    label,
    pedidos,
    cobertura,
    calmoR: R.modosOper.calmo, calmoS: S.modosOper.calmo,
    ambienteR: R.modosOper.ambiente, ambienteS: S.modosOper.ambiente,
    focoR: R.modosOper.foco, focoS: S.modosOper.foco,
    focosR: R.focos, focosS: S.focos,
    recsR: R.recs, recsS: S.recs,
    confR: pctAlta(R), confS: pctAlta(S),
    pracaUnicaR: R.compo.pracaUnica, pracaUnicaS: S.compo.pracaUnica,
    sacola2R: R.compo.sacola2, sacola2S: S.compo.sacola2,
    kitR: R.compo.kit, kitS: S.compo.kit,
    fechamentoR: (R.porKind.fechamento || 0), fechamentoS: (S.porKind.fechamento || 0),
    pracaFocoR: (R.porKind.praca || 0), pracaFocoS: (S.porKind.praca || 0),
    confFocoR: (R.porKind.conferencia || 0), confFocoS: (S.porKind.conferencia || 0),
  };
}

const janelas = [
  ler("replay_janela_real_2026-07-01_resumo.json", "01/07 (janela 24h)"),
  ...["20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"].map(d => ler("replay_2026-06-" + d + "_resumo.json", d + "/06")),
];

const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
console.log("| Janela | Pedidos | Cobertura | Praça única R/S | 2ªsacola R/S | Foco R/S(min) | Conf.alta R/S | Ação mudou? |");
console.log("|---|---:|---:|---|---|---|---|---|");
for (const j of janelas) {
  const pR = pct(j.pracaUnicaR, j.pedidos), pS = pct(j.pracaUnicaS, j.pedidos);
  const sR = pct(j.sacola2R, j.pedidos), sS = pct(j.sacola2S, j.pedidos);
  const mudou = (j.fechamentoS > j.fechamentoR) || (j.pracaFocoR > j.pracaFocoS * 1.3) ? "sim" : "parcial";
  console.log(`| ${j.label} | ${j.pedidos} | ${j.cobertura} | ${pR}% / ${pS}% | ${sR}% / ${sS}% | ${j.focoR} / ${j.focoS} | ${j.confR}% / ${j.confS}% | ${mudou} |`);
}

function stats(arr) { const n = arr.length, s = [...arr].sort((a, b) => a - b); return { media: (arr.reduce((a, b) => a + b, 0) / n).toFixed(1), min: s[0], max: s[n - 1] }; }
const pctArr = (num, den) => janelas.map(j => pct(j[num], j[den]));
console.log("\n=== ESTATÍSTICA (12 janelas) ===");
console.log("praça única REAL (%):", JSON.stringify(stats(pctArr("pracaUnicaR", "pedidos"))));
console.log("praça única SINT (%):", JSON.stringify(stats(pctArr("pracaUnicaS", "pedidos"))));
console.log("2ª sacola REAL (%):  ", JSON.stringify(stats(pctArr("sacola2R", "pedidos"))));
console.log("2ª sacola SINT (%):  ", JSON.stringify(stats(pctArr("sacola2S", "pedidos"))));
console.log("confiança alta REAL (%):", JSON.stringify(stats(janelas.map(j => j.confR))));
console.log("confiança alta SINT (%):", JSON.stringify(stats(janelas.map(j => j.confS))));
const excessoFoco = janelas.map(j => j.focoR - j.focoS);
console.log("excesso de foco REAL-SINT (min):", JSON.stringify(stats(excessoFoco)), "| dias com foco REAL menor que SINT:", excessoFoco.filter(x => x < 0).length);
console.log("fechamentos fantasma (só sintético):", janelas.map(j => j.fechamentoS - j.fechamentoR > 0 ? j.label : null).filter(Boolean).join(", "));
console.log("dias onde REAL teve MENOS foco que SINT (síntese 'menos perigosa'):", janelas.filter(j => j.focoR < j.focoS).map(j => j.label).join(", ") || "nenhum");

fs.writeFileSync(path.join(OUT, "consolidado_12_janelas.json"), JSON.stringify({ gerado_em: new Date().toISOString(), janelas }, null, 2));
console.log("\nsalvo: data/generated/consolidado_12_janelas.json (fora do Git)");

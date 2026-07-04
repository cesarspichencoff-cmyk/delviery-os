/* ============================================================================
 * ANÁLISE EXPLORATÓRIA — composição real 20-30/06 (Partes 5, 6 e 7 da missão)
 * ----------------------------------------------------------------------------
 * (5) casamento dos itens contra o seed (matchSeed do motor, read-only)
 * (6) análise operacional de composição/praça/risco dos 11 dias (sem timing)
 * (7) matriz composição × timing por dia (relatório mensal 27/05-25/06 +
 *     logística 26/06-01/07) → quais dias suportam replay completo
 * Nada é integrado; motor/seed read-only; saída = console + 1 json de resumo
 * em data/generated/ (fora do Git).
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const XLSX = require(path.join(__dirname, "..", "node_modules", "xlsx"));
const REPO = path.join(__dirname, "..");
const MOTOR = require(path.join(REPO, "src/perfil-delivery/motor.js"));
const SEED = require(path.join(REPO, "data/cardapio_knowledge_seed.json")).itens;

const JSONL = path.join(REPO, "data/generated/itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl");
const linhas = fs.readFileSync(JSONL, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/* ================= (5) CASAMENTO COM O SEED ================= */
console.log("================ (5) CASAMENTO COM O SEED ================");
const nomesUnicos = new Map(); // nomeCru → contagem
for (const l of linhas) nomesUnicos.set(l.item_nome, (nomesUnicos.get(l.item_nome) || 0) + 1);
let exato = 0, aprox = 0, nao = 0; const naoCasados = [], aproxLista = [];
for (const [nome, cnt] of nomesUnicos) {
  const n = norm(nome);
  const hitExato = SEED.find(i => i.nome_normalizado === n);
  if (hitExato) { exato++; continue; }
  const hit = MOTOR.matchSeed(nome, SEED);
  if (hit) { aprox++; aproxLista.push({ nome, cnt, casou_com: hit.nome }); }
  else { nao++; naoCasados.push({ nome, cnt }); }
}
console.log("itens únicos no HTML:", nomesUnicos.size, "| casam exato:", exato, "| por normalização/aprox:", aprox, "| NÃO casam:", nao);
if (aproxLista.length) { console.log("\ncasados por aproximação (validar):"); aproxLista.sort((a, b) => b.cnt - a.cnt).forEach(x => console.log("  '" + x.nome + "' (" + x.cnt + "×) → '" + x.casou_com + "'")); }
if (naoCasados.length) { console.log("\nNÃO casados:"); naoCasados.sort((a, b) => b.cnt - a.cnt).forEach(x => console.log("  '" + x.nome + "' (" + x.cnt + "×)")); }

/* ---------- observações: classes de risco ---------- */
console.log("\n--- observações (755 em 541 pedidos) — classes ---");
const obsAll = linhas.filter(l => l.observacao).map(l => ({ obs: l.observacao, ped: l.pedido_id, item: l.item_nome }));
const classes = {
  alergia: /alergi|alérgic|alergic/i,
  sem_ingrediente: /\bsem\b|\btirar\b|\bretirar\b|não (vai|quero|coloc|mand)/i,
  troca: /troca|substitu|no lugar|em vez|ao inv/i,
  molho_a_parte: /à parte|a parte|separado|separar/i,
  ponto_preparo: /bem passad|mal passad|crocante|frit|grelhad|quente|gelad/i,
  talher_kit: /hashi|talher|shoyu|wasabi|gengibre|kit/i,
};
const cntClasse = {}; const exemplos = {};
for (const o of obsAll) for (const [k, re] of Object.entries(classes)) {
  if (re.test(o.obs)) { cntClasse[k] = (cntClasse[k] || 0) + 1; (exemplos[k] = exemplos[k] || []).length < 2 && exemplos[k].push(o.obs.slice(0, 70)); }
}
for (const k of Object.keys(classes)) console.log("  " + k + ":", cntClasse[k] || 0, (exemplos[k] || []).map(e => ' · "' + e + '"').join(""));

/* ================= (6) ANÁLISE OPERACIONAL (composição, sem timing) ================= */
console.log("\n================ (6) COMPOSIÇÃO DOS 11 DIAS ================");
// por pedido: resolver via motor (read-only)
MOTOR.setNomes(Object.fromEntries(SEED.map(i => [i.id, i.nome])));
const rowsFonte = linhas.map(l => ({ pedido_id: l.pedido_id, item_nome: l.item_nome, quantidade: l.quantidade || 1, observacao: l.observacao }));
const FONTE = MOTOR.makeFonteItensFromRows(rowsFonte, SEED);
console.log("fonte real:", JSON.stringify(FONTE.stats), "| não-casados:", Object.keys(FONTE.unmatched).length, JSON.stringify(FONTE.unmatched));

const pedidos = new Map(); // uuid → {dt, dia, hora, status, valor, I}
for (const l of linhas) {
  if (pedidos.has(l.pedido_id)) continue;
  const m = l.data_hora.match(/^(\d{2})\/06\/2026 (\d{2}):(\d{2})/);
  pedidos.set(l.pedido_id, { dia: +m[1], hora: +m[2], status: l.status, valor: l.valor_total, I: MOTOR.resolver(FONTE(l.pedido_id)) });
}
const vivos = [...pedidos.values()];
const n = vivos.length;
const c = f => vivos.filter(f).length;
console.log("pedidos:", n);
console.log("praça única:", c(p => p.I.pracaUnica), "(" + (100 * c(p => p.I.pracaUnica) / n).toFixed(1) + "%) | multi-praça:", c(p => p.I.nBenches > 1), "(" + (100 * c(p => p.I.nBenches > 1) / n).toFixed(1) + "%)");
console.log("2ª sacola:", c(p => p.I.segundaSacola), "(" + (100 * c(p => p.I.segundaSacola) / n).toFixed(1) + "%) | kit:", c(p => p.I.contemKit), "| bebida:", c(p => p.I.contemBebida), "(" + (100 * c(p => p.I.contemBebida) / n).toFixed(1) + "%) | sobremesa:", c(p => p.I.contemSobremesa), "(" + (100 * c(p => p.I.contemSobremesa) / n).toFixed(1) + "%)");
console.log("grandes (≥8 un):", c(p => p.I.nItens >= 8), "| com observação:", c(p => p.I.temObservacao), "| risco conf. alto:", c(p => p.I.riscoConfAlto), "(" + (100 * c(p => p.I.riscoConfAlto) / n).toFixed(1) + "%)");

// carga por praça (nº de pedidos que tocam)
const benches = {}; vivos.forEach(p => p.I.benches.forEach(b => benches[b] = (benches[b] || 0) + 1));
console.log("\ncarga por praça (pedidos que tocam):", Object.entries(benches).sort((a, b) => b[1] - a[1]).map(([k, v]) => MOTOR.DISPLAY[k] + " " + v + " (" + (100 * v / n).toFixed(0) + "%)").join(" · "));

// almoço × jantar · semana × fds · por dia
const turno = h => (h < 15 ? "almoco" : (h < 17 ? "tarde" : "jantar"));
const diaSemana = d => ["sab", "dom", "seg", "ter", "qua", "qui", "sex"][(d - 20) % 7]; // 20/06/2026 = sábado
const porDia = {}, porTurno = { almoco: 0, tarde: 0, jantar: 0 };
vivos.forEach(p => { porDia[p.dia] = (porDia[p.dia] || 0) + 1; porTurno[turno(p.hora)]++; });
console.log("turnos:", JSON.stringify(porTurno));
console.log("por dia:", Object.entries(porDia).sort((a, b) => a[0] - b[0]).map(([d, v]) => d + "/06(" + diaSemana(+d) + ")=" + v).join(" · "));
const fds = c(p => ["sab", "dom"].includes(diaSemana(p.dia))), sem = n - fds;
console.log("fim de semana:", fds, "| dia de semana:", sem);

// desfecho × composição
const canc = vivos.filter(p => p.status === "CANCELLED"), decl = vivos.filter(p => p.status === "DECLINED");
const pc = (arr, f) => arr.length ? (100 * arr.filter(f).length / arr.length).toFixed(0) + "%" : "—";
console.log("\ncancelados (" + canc.length + "): 2ªsacola " + pc(canc, p => p.I.segundaSacola) + " · combinado " + pc(canc, p => p.I.ancora) + " · valor médio R$" + (canc.reduce((a, p) => a + (p.valor || 0), 0) / Math.max(1, canc.length)).toFixed(0));
console.log("recusados (" + decl.length + "): 2ªsacola " + pc(decl, p => p.I.segundaSacola) + " · combinado " + pc(decl, p => p.I.ancora) + " · valor médio R$" + (decl.reduce((a, p) => a + (p.valor || 0), 0) / Math.max(1, decl.length)).toFixed(0));
console.log("concluídos: valor médio R$" + (vivos.filter(p => p.status === "CONCLUDED").reduce((a, p) => a + (p.valor || 0), 0) / c(p => p.status === "CONCLUDED")).toFixed(0));

/* ================= (7) MATRIZ COMPOSIÇÃO × TIMING POR DIA ================= */
console.log("\n================ (7) MATRIZ COMPOSIÇÃO × TIMING ================");
// timing 20-25/06: relatório mensal (data/raw/relatorio_pedidos_ifood.xlsx, 27/05-25/06)
// timing 26-30/06: logística (data/raw/incoming/ifood_2026-07-01/relatorio_logistica_...)
const uuidTiming = new Map(); // uuid → fonte
try {
  const wbM = XLSX.readFile(path.join(REPO, "data/raw/relatorio_pedidos_ifood.xlsx"), { cellDates: false });
  const rowsM = XLSX.utils.sheet_to_json(wbM.Sheets["Página 1"] || wbM.Sheets[wbM.SheetNames[0]], { defval: null });
  for (const r of rowsM) { const u = String(r["ID COMPLETO DO PEDIDO"] || "").trim(); if (u) uuidTiming.set(u, "relatorio_mensal"); }
} catch (e) { console.log("aviso: relatório mensal não lido:", e.message); }
const wbL = XLSX.readFile(path.join(REPO, "data/raw/incoming/ifood_2026-07-01/relatorio_logistica_2026-06-26_2026-07-02.xlsx"), { cellDates: false });
for (const r of XLSX.utils.sheet_to_json(wbL.Sheets[wbL.SheetNames[0]], { defval: null })) {
  const u = String(r["ID COMPLETO DO PEDIDO"] || "").trim(); if (u && !uuidTiming.has(u)) uuidTiming.set(u, "logistica");
}
console.log("universo de timing por uuid:", uuidTiming.size, "pedidos (mensal 27/05-25/06 + logística 26/06-01/07)");
console.log("\nDia | comp.real | c/ timing | cobertura | fonte timing | replay completo?");
const matriz = [];
for (let d = 20; d <= 30; d++) {
  const doDia = vivos.length ? [...pedidos.entries()].filter(([, p]) => p.dia === d) : [];
  const total = doDia.length;
  const vivosDia = doDia.filter(([, p]) => p.status !== "DECLINED");
  const comTiming = vivosDia.filter(([u]) => uuidTiming.has(u)).length;
  const fontes = new Set(vivosDia.filter(([u]) => uuidTiming.has(u)).map(([u]) => uuidTiming.get(u)));
  const cob = vivosDia.length ? comTiming / vivosDia.length : 0;
  const ok = cob >= 0.95;
  matriz.push({ dia: d + "/06", diaSem: diaSemana(d), pedidos: total, vivos: vivosDia.length, comTiming, cobertura: (100 * cob).toFixed(1) + "%", fontes: [...fontes].join("+") || "—", replay: ok });
  console.log(String(d).padStart(2) + "/06(" + diaSemana(d) + ") | " + String(total).padStart(4) + " | " + String(comTiming).padStart(4) + "/" + String(vivosDia.length).padStart(4) + " | " + (100 * cob).toFixed(1) + "% | " + ([...fontes].join("+") || "—") + " | " + (ok ? "SIM" : "NÃO"));
}
fs.writeFileSync(path.join(REPO, "data/generated/analise_jun20-30_resumo.json"), JSON.stringify({ gerado_em: new Date().toISOString(), matchSeed: { unicos: nomesUnicos.size, exato, aprox, nao, naoCasados, aproxLista }, obs: { total: obsAll.length, classes: cntClasse }, matriz }, null, 2));
console.log("\nresumo salvo em data/generated/analise_jun20-30_resumo.json (fora do Git)");

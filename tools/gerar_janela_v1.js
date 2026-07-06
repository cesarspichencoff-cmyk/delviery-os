/* ============================================================================
 * GERADOR DE DADOS PARA A INTERFACE V1 — NÃO É PRODUÇÃO, NÃO É CÉREBRO.
 * ----------------------------------------------------------------------------
 * Prepara a janela REAL de 01/07/2026 (timing real + itens reais por pedido)
 * em um único JSON que o navegador consegue carregar, porque o browser não lê
 * o XLSX de logística nem os JSONL brutos. Espelha a MESMA construção de
 * janela já validada em tools/auditar_divergencia_motor_decisao.js
 * (construirJanela0701 — espelho que reproduziu o score real em 100% dos
 * casos). Nenhuma regra nova, nenhum score, nenhuma decisão: só dados.
 *
 * Saída: data/generated/v1_janela_real.json            (janela 01/07, padrão)
 *        data/generated/v1_janela_real_2026-06-DD.json (dia de junho, ex.: 23)
 * Uso:   node tools/gerar_janela_v1.js        → janela 01/07
 *        node tools/gerar_janela_v1.js 23     → janela 23/06 (tem foco puro real + observação)
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..");
const XLSX = require(path.join(REPO, "node_modules", "xlsx"));
const MOTOR = require(path.join(REPO, "src/perfil-delivery/motor.js"));
const SEED = require(path.join(REPO, "data/cardapio_knowledge_seed.json")).itens;
const OUT = path.join(REPO, "data/generated");
const num = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
const minCont = dtStr => { const m = String(dtStr || "").match(/^2026-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); if (!m) return null; const dia = (m[1] === "06") ? (+m[2] - 30) : (+m[2]); return dia * 1440 + (+m[3]) * 60 + (+m[4]); };

const DIA_JUN = process.argv[2] ? parseInt(process.argv[2], 10) : null;
if (DIA_JUN != null && !(DIA_JUN >= 20 && DIA_JUN <= 30)) { console.log("dia inválido — use 20..30 (junho) ou nenhum argumento (01/07)"); process.exit(1); }

/* ---------- janela de um dia de junho (20-30/06) — mesma construção do auditar ---------- */
function gerarDiaJunho(dia) {
  const linhas = fs.readFileSync(path.join(OUT, "itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl"), "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
  const doDia = linhas.filter(l => l.data_hora.startsWith(String(dia).padStart(2, "0") + "/06/2026"));
  const htmlPed = new Map();
  for (const l of doDia) { if (!htmlPed.has(l.pedido_id)) htmlPed.set(l.pedido_id, { status: l.status, itens: [] }); htmlPed.get(l.pedido_id).itens.push(l); }
  let rowsT, colDt;
  if (dia <= 25) {
    const wb = XLSX.readFile(path.join(REPO, "data/raw/relatorio_pedidos_ifood.xlsx"), { cellDates: false });
    rowsT = XLSX.utils.sheet_to_json(wb.Sheets["Página 1"] || wb.Sheets[wb.SheetNames[0]], { defval: null });
    colDt = r => { const m = String(r["DATA E HORA DO PEDIDO"] || "").match(/^(\d{2})\/(\d{2})\/2026[ T](\d{2}):(\d{2})/); return m && m[2] === "06" && +m[1] === dia ? (+m[3]) * 60 + (+m[4]) : null; };
  } else {
    const wb = XLSX.readFile(path.join(REPO, "data/raw/incoming/ifood_2026-07-01/relatorio_logistica_2026-06-26_2026-07-02.xlsx"), { cellDates: false });
    rowsT = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    colDt = r => { const m = String(r["DATA E HORA DO PEDIDO"] || "").match(/^2026-06-(\d{2})[ T](\d{2}):(\d{2})/); return m && +m[1] === dia ? (+m[2]) * 60 + (+m[3]) : null; };
  }
  const timingByUuid = new Map();
  for (const r of rowsT) { const t = colDt(r); if (t == null) continue; timingByUuid.set(String(r["ID COMPLETO DO PEDIDO"] || "").trim(), r); }
  const vivos = [...htmlPed.entries()].filter(([, p]) => p.status !== "DECLINED");
  const casadosJ = vivos.filter(([u]) => timingByUuid.has(u));
  const NIGHT = []; const rows = [];
  for (const [uuid, info] of casadosJ) {
    const r = timingByUuid.get(uuid); const t = colDt(r);
    const cancelado = /cancel/i.test(String(r["STATUS FINAL DO PEDIDO"] || "")) || info.status === "CANCELLED";
    const tpr = num(r["TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)"]), tent = num(r["TEMPO DA ENTREGA REALIZADA (MIN)"]), tcam = num(r["TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)"]), tesp = num(r["TEMPO DO ENTREGADOR ESPERANDO NO CLIENTE (MIN)"]) || 0;
    const id = uuid.slice(0, 8);
    NIGHT.push({ id, r: t, p: !cancelado && tpr != null ? Math.round(t + tpr) : null, s: !cancelado && tent != null && tcam != null ? Math.round(t + (tent - tcam - tesp)) : null, e: !cancelado && tent != null ? Math.round(t + tent) : null, c: cancelado ? t : null });
    for (const it of info.itens) rows.push({ pedido_id: id, item_nome: it.item_nome, quantidade: it.quantidade || 1, observacao: it.observacao || null });
  }
  if (!NIGHT.length) { console.log("sem janela para " + dia + "/06"); process.exit(1); }
  const FONTE = MOTOR.makeFonteItensFromRows(rows, SEED);
  const T0 = Math.min(...NIGHT.map(o => o.r)) - 5, T1 = Math.max(...NIGHT.map(o => Math.max(o.e || 0, o.s || 0, o.p || 0, o.c || 0, o.r))) + 15;
  const tag = "2026-06-" + String(dia).padStart(2, "0");
  const saida = {
    meta: { janela: tag, gerado_em: new Date().toISOString(), fonte: "real", descricao: "timing real + itens reais por pedido (" + dia + "/06)", diaBase: tag, pedidos: NIGHT.length, linhasItens: rows.length, casamentoSeed: FONTE.stats, geradoPor: "tools/gerar_janela_v1.js" },
    T0, T1, NIGHT, rows
  };
  fs.writeFileSync(path.join(OUT, "v1_janela_real_" + tag + ".json"), JSON.stringify(saida));
  console.log("janela " + dia + "/06: " + NIGHT.length + " pedidos casados · " + rows.length + " linhas de itens");
  console.log("casamento com o seed: " + FONTE.stats.casados + "/" + FONTE.stats.linhas + " (" + Math.round(100 * FONTE.stats.casados / Math.max(1, FONTE.stats.linhas)) + "%)");
  console.log("salvo: data/generated/v1_janela_real_" + tag + ".json (fora do Git)");
}
if (DIA_JUN != null) { gerarDiaJunho(DIA_JUN); process.exit(0); }

// itens reais por pedido (parse já validado do lote 01/07)
const itensRows = fs.readFileSync(path.join(OUT, "itens_pedido_reais_2026-07-01.jsonl"), "utf8")
  .split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
const htmlPed = new Map();
for (const o of itensRows) { if (!htmlPed.has(o.pedido_id)) htmlPed.set(o.pedido_id, { status: o.status, itens: [] }); htmlPed.get(o.pedido_id).itens.push(o); }

// timing real (relatório de logística)
const wbL = XLSX.readFile(path.join(REPO, "data/raw/incoming/ifood_2026-07-01/relatorio_logistica_2026-06-26_2026-07-02.xlsx"), { cellDates: false });
const logByUuid = new Map(XLSX.utils.sheet_to_json(wbL.Sheets[wbL.SheetNames[0]], { defval: null }).map(r => [String(r["ID COMPLETO DO PEDIDO"] || "").trim(), r]));

const casados = [];
for (const [uuid, info] of htmlPed) { const r = logByUuid.get(uuid); if (!r) continue; const t = minCont(r["DATA E HORA DO PEDIDO"]); if (t == null) continue; casados.push({ uuid, t, r, info }); }
casados.sort((a, b) => a.t - b.t);
const idCurtoUnico = !casados.some((x, i) => casados.findIndex(y => y.r["ID CURTO DO PEDIDO"] === x.r["ID CURTO DO PEDIDO"]) !== i);

const NIGHT = []; const uuid2id = new Map(); const rows = [];
for (const x of casados) {
  const r = x.r; const cancelado = /cancel/i.test(String(r["STATUS FINAL DO PEDIDO"] || ""));
  const tpr = num(r["TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)"]), tent = num(r["TEMPO DA ENTREGA REALIZADA (MIN)"]), tcam = num(r["TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)"]), tesp = num(r["TEMPO DO ENTREGADOR ESPERANDO NO CLIENTE (MIN)"]) || 0;
  const id = idCurtoUnico ? String(r["ID CURTO DO PEDIDO"]).trim() : x.uuid.slice(0, 8);
  uuid2id.set(x.uuid, id);
  NIGHT.push({ id, r: x.t, p: !cancelado && tpr != null ? Math.round(x.t + tpr) : null, s: !cancelado && tent != null && tcam != null ? Math.round(x.t + (tent - tcam - tesp)) : null, e: !cancelado && tent != null ? Math.round(x.t + tent) : null, c: cancelado ? x.t : null });
}
for (const x of casados) for (const it of x.info.itens) rows.push({ pedido_id: uuid2id.get(x.uuid), item_nome: it.item_nome, quantidade: it.quantidade || 1, observacao: it.observacao || null });

// validação da composição real contra o seed (mesmo caminho do motor, só p/ estatística)
const FONTE = MOTOR.makeFonteItensFromRows(rows, SEED);
const T0 = Math.min(...NIGHT.map(o => o.r)) - 5;
const T1 = Math.max(...NIGHT.map(o => Math.max(o.e || 0, o.s || 0, o.p || 0, o.c || 0, o.r))) + 90;

const saida = {
  meta: {
    janela: "2026-07-01 (24h reais)", gerado_em: new Date().toISOString(),
    fonte: "real", descricao: "timing real (iFood logística) + itens reais por pedido (lote 01/07)",
    idCurtoUnico, pedidos: NIGHT.length, linhasItens: rows.length,
    casamentoSeed: FONTE.stats, geradoPor: "tools/gerar_janela_v1.js"
  },
  T0, T1, NIGHT, rows
};
fs.writeFileSync(path.join(OUT, "v1_janela_real.json"), JSON.stringify(saida));
console.log("janela 01/07: " + NIGHT.length + " pedidos casados · " + rows.length + " linhas de itens");
console.log("casamento com o seed: " + FONTE.stats.casados + "/" + FONTE.stats.linhas + " itens casados (" + Math.round(100 * FONTE.stats.casados / Math.max(1, FONTE.stats.linhas)) + "%)");
console.log("ID curto único na janela: " + idCurtoUnico);
console.log("T0=" + T0 + " T1=" + T1);
console.log("salvo: data/generated/v1_janela_real.json (fora do Git)");

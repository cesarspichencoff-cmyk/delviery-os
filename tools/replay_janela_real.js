/* ============================================================================
 * REPLAY ISOLADO GENÉRICO — dia-calendário com composição real (20-30/06/2026)
 * ----------------------------------------------------------------------------
 * Generalização do replay_janela_real_2026-07-01.js para os dias cobertos pela
 * fonte real jun20-30 (composição) + timing por UUID de duas fontes:
 *   20-25/06 → data/raw/relatorio_pedidos_ifood.xlsx  (relatório mensal 56 col)
 *   26-30/06 → data/raw/incoming/ifood_2026-07-01/relatorio_logistica_...xlsx
 *
 * USO:  node tools/replay_janela_real.js --dia 2026-06-20
 *
 * MESMAS REGRAS DO PRIMEIRO REPLAY: motor/decisão/seed read-only; baseline e
 * backtest oficial intocados; DECLINED fora (nunca entrou em produção);
 * campo ausente = não observado; saídas só em data/generated/ (fora do Git).
 * Portão de cobertura embutido: aborta se composição×timing < 95%.
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const XLSX = require(path.join(__dirname, "..", "node_modules", "xlsx"));
const REPO = path.join(__dirname, "..");
const MOTOR = require(path.join(REPO, "src/perfil-delivery/motor.js"));
const DECISAO = require(path.join(REPO, "src/perfil-delivery/decisao.js"));
const SEED = require(path.join(REPO, "data/cardapio_knowledge_seed.json")).itens;

const argDia = process.argv[process.argv.indexOf("--dia") + 1];
const mDia = String(argDia || "").match(/^2026-06-(2[0-9]|30)$/);
if (!mDia) { console.log("uso: node tools/replay_janela_real.js --dia 2026-06-2X  (20..30/06/2026)"); process.exit(1); }
const DIA = +mDia[1]; // 20..30
const TAG = "2026-06-" + String(DIA).padStart(2, "0");
const num = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };

/* ---------- composição (jsonl jun20-30) ---------- */
const JSONL = path.join(REPO, "data/generated/itens_pedido_reais_2026-06-20_a_2026-06-30.jsonl");
if (!fs.existsSync(JSONL)) { console.log("ERRO: rode antes tools/parse_relatorio_pedidos_com_itens_html.js"); process.exit(1); }
const linhas = fs.readFileSync(JSONL, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
const doDia = linhas.filter(l => l.data_hora.startsWith(String(DIA).padStart(2, "0") + "/06/2026"));
const htmlPed = new Map();
for (const l of doDia) {
  if (!htmlPed.has(l.pedido_id)) htmlPed.set(l.pedido_id, { status: l.status, itens: [] });
  htmlPed.get(l.pedido_id).itens.push(l);
}

/* ---------- timing por UUID (fonte conforme o dia) ---------- */
let rowsT, fonteTiming, colDt;
if (DIA <= 25) {
  fonteTiming = "relatorio_mensal";
  const wb = XLSX.readFile(path.join(REPO, "data/raw/relatorio_pedidos_ifood.xlsx"), { cellDates: false });
  rowsT = XLSX.utils.sheet_to_json(wb.Sheets["Página 1"] || wb.Sheets[wb.SheetNames[0]], { defval: null });
  colDt = r => { const m = String(r["DATA E HORA DO PEDIDO"] || "").match(/^(\d{2})\/(\d{2})\/2026[ T](\d{2}):(\d{2})/); return m && m[2] === "06" && +m[1] === DIA ? (+m[3]) * 60 + (+m[4]) : null; };
} else {
  fonteTiming = "logistica";
  const wb = XLSX.readFile(path.join(REPO, "data/raw/incoming/ifood_2026-07-01/relatorio_logistica_2026-06-26_2026-07-02.xlsx"), { cellDates: false });
  rowsT = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  colDt = r => { const m = String(r["DATA E HORA DO PEDIDO"] || "").match(/^2026-06-(\d{2})[ T](\d{2}):(\d{2})/); return m && +m[1] === DIA ? (+m[2]) * 60 + (+m[3]) : null; };
}
const timingByUuid = new Map();
for (const r of rowsT) { const t = colDt(r); if (t == null) continue; timingByUuid.set(String(r["ID COMPLETO DO PEDIDO"] || "").trim(), { t, r }); }

/* ---------- portão de cobertura (mesmo critério do 1º replay) ---------- */
const vivosHtml = [...htmlPed.entries()].filter(([, p]) => p.status !== "DECLINED");
const casados = vivosHtml.filter(([u]) => timingByUuid.has(u));
const cob = casados.length / Math.max(1, vivosHtml.length);
console.log("=== " + TAG + " · portão de cobertura ===");
console.log("HTML:", htmlPed.size, "pedidos (vivos: " + vivosHtml.length + ", DECLINED fora: " + (htmlPed.size - vivosHtml.length) + ")");
console.log("timing (" + fonteTiming + "):", timingByUuid.size, "pedidos no dia | composição×timing:", casados.length + "/" + vivosHtml.length, "(" + (100 * cob).toFixed(1) + "%)");
if (cob < 0.95) { console.log("ABORTADO: cobertura < 95%."); process.exit(1); }

/* ---------- NIGHT (eixo: minutos do dia; drenagem atravessa a meia-noite) ---------- */
const NIGHT = []; let cancelN = 0;
for (const [uuid, info] of casados.map(([u]) => [u, htmlPed.get(u)])) {
  const { t, r } = timingByUuid.get(uuid);
  const cancelado = /cancel/i.test(String(r["STATUS FINAL DO PEDIDO"] || "")) || info.status === "CANCELLED";
  if (cancelado) cancelN++;
  const tpr = num(r["TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)"]);
  const tent = num(r["TEMPO DA ENTREGA REALIZADA (MIN)"]);
  const tcam = num(r["TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)"]);
  const tesp = num(r["TEMPO DO ENTREGADOR ESPERANDO NO CLIENTE (MIN)"]) || 0;
  NIGHT.push({ id: uuid.slice(0, 8), uuid, r: t,
    p: !cancelado && tpr != null ? Math.round(t + tpr) : null,
    s: !cancelado && tent != null && tcam != null ? Math.round(t + (tent - tcam - tesp)) : null,
    e: !cancelado && tent != null ? Math.round(t + tent) : null,
    c: cancelado ? t : null });
}
console.log("pedidos vivos no replay:", NIGHT.length, "(cancelados: " + cancelN + ")");

/* ---------- fontes de composição ---------- */
MOTOR.setNomes(Object.fromEntries(SEED.map(i => [i.id, i.nome])));
const rowsReal = [];
for (const o of NIGHT) for (const it of htmlPed.get(o.uuid).itens)
  rowsReal.push({ pedido_id: o.id, item_nome: it.item_nome, quantidade: it.quantidade || 1, observacao: it.observacao });
const FONTE_REAL = MOTOR.makeFonteItensFromRows(rowsReal, SEED);
const FONTE_SINT = MOTOR.makeFonteSintetica(SEED);

/* ---------- rodar (mesma mecânica do 1º replay) ---------- */
function rodar(fonte, ehReal) {
  const INFO = {}; for (const o of NIGHT) INFO[o.id] = MOTOR.resolver(fonte(o.id));
  const sess = MOTOR.novaSessao();
  const focos = [], recs = [], sitsTiming = []; const modosOper = { calmo: 0, ambiente: 0, foco: 0 }; const surge = {}; let prevKey = null;
  const T0 = Math.min(...NIGHT.map(o => o.r)) - 5;
  const T1 = Math.max(...NIGHT.map(o => Math.max(o.e || 0, o.s || 0, o.p || 0, o.c || 0, o.r))) + 15;
  for (let t = T0; t <= T1; t++) {
    const R = MOTOR.step(t, NIGHT, INFO, sess);
    if (R.emand > 0) modosOper[R.mode]++;
    for (const s of R.sits) {
      if (s.kind === "praca") surge[s.praca] = (surge[s.praca] || 0) + 1;
      if (s.kind === "saida" || s.kind === "order") sitsTiming.push(t + "|" + s.key); // sinais de timing DETECTADOS (independem do slot de atenção)
    }
    const k = sess.active ? sess.active.key : null;
    if (k && k !== prevKey) {
      const st = sess.active.sit;
      focos.push({ t, kind: st.kind, key: k, sev: st.sev, id: st.id || null, praca: st.praca || null });
      const rec = DECISAO.decidir(R, INFO, { fonteReal: ehReal });
      if (rec) recs.push({ t, tipo: rec.tipo, acao: rec.acao, porque: rec.porque, primeiro: rec.primeiro, confianca: rec.confianca });
    }
    prevKey = k;
  }
  const compo = { pracaUnica: 0, sacola2: 0, kit: 0 };
  for (const o of NIGHT) { const I = INFO[o.id]; if (I.pracaUnica) compo.pracaUnica++; if (I.segundaSacola) compo.sacola2++; if (I.contemKit) compo.kit++; }
  return { focos, recs, modosOper, surge, compo, sitsTiming: sitsTiming.join("\n") };
}
const REAL = rodar(id => FONTE_REAL(id), true);
const SINT = rodar(FONTE_SINT, false);

/* ---------- comparação + saída ---------- */
const porKind = R => { const o = {}; R.focos.forEach(f => o[f.kind] = (o[f.kind] || 0) + 1); return o; };
const porConf = R => { const o = {}; R.recs.forEach(r => o[r.confianca] = (o[r.confianca] || 0) + 1); return o; };
const porTipo = R => { const o = {}; R.recs.forEach(r => o[r.tipo] = (o[r.tipo] || 0) + 1); return o; };
const keysComp = R => new Set(R.focos.filter(f => ["praca", "fechamento", "conferencia"].includes(f.kind)).map(f => f.key));
const focosTim = R => new Set(R.focos.filter(f => f.kind === "saida" || f.kind === "order").map(f => f.key));
const kR = keysComp(REAL), kS = keysComp(SINT);
const fTR = focosTim(REAL), fTS = focosTim(SINT);
const cmp = {
  dia: TAG, fonteTiming, pedidos: NIGHT.length, cobertura: (100 * cob).toFixed(1) + "%",
  real: { modosOper: REAL.modosOper, focos: REAL.focos.length, porKind: porKind(REAL), recs: REAL.recs.length, porTipo: porTipo(REAL), porConf: porConf(REAL), compo: REAL.compo, surge: REAL.surge },
  sintetico: { modosOper: SINT.modosOper, focos: SINT.focos.length, porKind: porKind(SINT), recs: SINT.recs.length, porTipo: porTipo(SINT), porConf: porConf(SINT), compo: SINT.compo, surge: SINT.surge },
  focosComposicao: { soReal: [...kR].filter(k => !kS.has(k)).length, soSintetico: [...kS].filter(k => !kR.has(k)).length },
  // sanity CORRETO: os SINAIS de timing detectados devem ser idênticos (timing compartilhado).
  // Onsets de foco de timing podem divergir legitimamente: o slot único de atenção é disputado
  // pelos focos de composição — isso é competição por atenção, não bug (verificado em 20/06).
  sanitySitsTimingIguais: REAL.sitsTiming === SINT.sitsTiming,
  competicaoAtencao: { focosTimingSoReal: [...fTR].filter(k => !fTS.has(k)).length, focosTimingSoSint: [...fTS].filter(k => !fTR.has(k)).length },
};
fs.writeFileSync(path.join(REPO, "data/generated/replay_" + TAG + "_resumo.json"), JSON.stringify({ _prov: { gerado_em: new Date().toISOString(), script: "tools/replay_janela_real.js", isolado: true }, cmp, recsReal: REAL.recs, recsSint: SINT.recs }, null, 2));

const D = MOTOR.DISPLAY;
console.log("\n--- modos operacionais (min) real vs sint ---");
for (const m of ["calmo", "ambiente", "foco"]) console.log("  " + m + ": " + REAL.modosOper[m] + " vs " + SINT.modosOper[m]);
console.log("--- focos: real " + REAL.focos.length + " " + JSON.stringify(porKind(REAL)) + " | sint " + SINT.focos.length + " " + JSON.stringify(porKind(SINT)));
console.log("--- recs: real " + REAL.recs.length + " " + JSON.stringify(porConf(REAL)) + " | sint " + SINT.recs.length + " " + JSON.stringify(porConf(SINT)));
console.log("--- composição: pracaUnica " + REAL.compo.pracaUnica + " vs " + SINT.compo.pracaUnica + " · 2ªsacola " + REAL.compo.sacola2 + " vs " + SINT.compo.sacola2);
console.log("--- sobrecarga (min): " + MOTOR.PRODUCAO.map(p => D[p] + " " + (REAL.surge[p] || 0) + "/" + (SINT.surge[p] || 0)).join(" · "));
console.log("--- focos composição só-real " + cmp.focosComposicao.soReal + " · só-sint " + cmp.focosComposicao.soSintetico + " · sanity sits-timing: " + (cmp.sanitySitsTimingIguais ? "OK" : "FALHOU — investigar") + " · competição por atenção (focos timing divergentes): R" + cmp.competicaoAtencao.focosTimingSoReal + "/S" + cmp.competicaoAtencao.focosTimingSoSint);
console.log("\nresumo: data/generated/replay_" + TAG + "_resumo.json (fora do Git)");

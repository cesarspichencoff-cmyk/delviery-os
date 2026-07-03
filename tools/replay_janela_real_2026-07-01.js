/* ============================================================================
 * REPLAY ISOLADO — janela real ~24h (30/06 ~21h → 01/07 ~21h)
 * ----------------------------------------------------------------------------
 * Experimento aprovado: o que o DeliveryOS enxergaria se recebesse composição
 * real + timing real + desfecho real na mesma janela operacional?
 *
 * ISOLAMENTO: motor/decisão/seed importados READ-ONLY. Não toca backtest
 * oficial, baseline, seed, visual. Saídas SÓ em data/generated/ (gitignorado).
 *
 * USO:
 *   node tools/replay_janela_real_2026-07-01.js --v1   → só o portão V1 (cobertura)
 *   node tools/replay_janela_real_2026-07-01.js        → V1 (aborta se falhar) + replay real×sintético
 *
 * EIXO DE TEMPO: minutos contínuos desde 30/06/2026 00:00 (a janela cruza a
 * meia-noite; o MOTOR.step só faz aritmética relativa, então funciona sem
 * nenhuma alteração no motor).
 *
 * RECONSTRUÇÃO DE INSTANTES (método já oficial do Motor A — nunca inventa):
 *   r = minuto do pedido (logística, com segundos truncados p/ minuto)
 *   p = r + TEMPO BOTÃO PRONTO   ·   e = r + TEMPO ENTREGA REALIZADA
 *   s = r + (entrega − a caminho do cliente − esperando no cliente)
 *   cancelado: c = r (o relatório não traz hora do cancelamento — conservador, rotulado)
 *   DECLINED (recusados): não entram como pedido vivo (nunca entraram em produção).
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const XLSX = require(path.join(__dirname, "..", "node_modules", "xlsx"));
const REPO = path.join(__dirname, "..");
const MOTOR = require(path.join(REPO, "src/perfil-delivery/motor.js"));
const DECISAO = require(path.join(REPO, "src/perfil-delivery/decisao.js"));
const SEED = require(path.join(REPO, "data/cardapio_knowledge_seed.json")).itens;

const LOTE = path.join(REPO, "data/raw/incoming/ifood_2026-07-01");
const OUT = path.join(REPO, "data/generated");
const ITENS_JSONL = path.join(OUT, "itens_pedido_reais_2026-07-01.jsonl");
const SO_V1 = process.argv.includes("--v1");

// ---------- helpers ----------
const num = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + "%" : "—";
// "2026-06-30 21:02:33" → minutos contínuos desde 30/06 00:00 (30/06=dia 0, 01/07=dia 1)
function minCont(dtStr) {
  const m = String(dtStr || "").match(/^2026-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const dia = (m[1] === "06") ? (+m[2] - 30) : (+m[2] - 1 + 1); // 30/06→0 · 01/07→1
  return dia * 1440 + (+m[3]) * 60 + (+m[4]);
}
const hhmm = t => { const d = Math.floor(t / 1440); const h = Math.floor((t % 1440) / 60), mi = t % 60; return (d === 0 ? "30/06 " : "01/07 ") + String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0"); };

// ---------- carregar fontes ----------
if (!fs.existsSync(ITENS_JSONL)) { console.log("ERRO: rode antes tools/parse_relatorio_pedidos_html.js (gera " + ITENS_JSONL + ")"); process.exit(1); }
const itensRows = fs.readFileSync(ITENS_JSONL, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
const htmlPed = new Map(); // uuid → {status, horario, itens:[]}
for (const o of itensRows) {
  if (!htmlPed.has(o.pedido_id)) htmlPed.set(o.pedido_id, { status: o.status, horario: o.horario, itens: [] });
  htmlPed.get(o.pedido_id).itens.push(o);
}
const wbL = XLSX.readFile(path.join(LOTE, "relatorio_logistica_2026-06-26_2026-07-02.xlsx"), { cellDates: false });
const logRows = XLSX.utils.sheet_to_json(wbL.Sheets[wbL.SheetNames[0]], { defval: null });
const logByUuid = new Map(logRows.map(r => [String(r["ID COMPLETO DO PEDIDO"] || "").trim(), r]));

const canc = XLSX.utils.sheet_to_json(XLSX.readFile(path.join(LOTE, "relatorio_cancelamento.xlsx"), { cellDates: false }).Sheets["Relatório de cancelamentos"], { defval: null });
const neg = XLSX.utils.sheet_to_json(XLSX.readFile(path.join(LOTE, "relatorio_negociacoes.xlsx"), { cellDates: false }).Sheets["Relatório de negociações"], { defval: null });

/* ============================== PORTÃO V1 ============================== */
console.log("================ PORTÃO V1 — cobertura da janela ================");
// casar HTML×logística por uuid; janela = [min,max] minuto do pedido dos casados
const casados = []; let semLog = 0; const semLogStatus = {};
for (const [uuid, info] of htmlPed) {
  const r = logByUuid.get(uuid);
  if (!r) { semLog++; semLogStatus[info.status] = (semLogStatus[info.status] || 0) + 1; continue; }
  const t = minCont(r["DATA E HORA DO PEDIDO"]);
  if (t == null) { semLog++; continue; }
  casados.push({ uuid, t, r, info });
}
casados.sort((a, b) => a.t - b.t);
const tIni = casados[0].t, tFim = casados[casados.length - 1].t;
console.log("1. janela detectada:", hhmm(tIni), "→", hhmm(tFim), "(" + ((tFim - tIni) / 60).toFixed(1) + "h)");
console.log("2. primeiro pedido:", hhmm(tIni), "uuid", casados[0].uuid.slice(0, 8));
console.log("3. último pedido:  ", hhmm(tFim), "uuid", casados[casados.length - 1].uuid.slice(0, 8));
console.log("4. pedidos no HTML:", htmlPed.size);
console.log("5. casam com logística por UUID:", casados.length, "(" + pct(casados.length, htmlPed.size) + ") · sem logística:", semLog, JSON.stringify(semLogStatus));

// logística DENTRO da janela (todos os status — recusados não existem na logística)
const logNaJanela = [];
for (const r of logRows) {
  const t = minCont(r["DATA E HORA DO PEDIDO"]);
  if (t != null && t >= tIni && t <= tFim) logNaJanela.push({ t, r, uuid: String(r["ID COMPLETO DO PEDIDO"] || "").trim() });
}
const noHtml = logNaJanela.filter(x => htmlPed.has(x.uuid));
const faltantes = logNaJanela.filter(x => !htmlPed.has(x.uuid));
console.log("6. pedidos da logística dentro da janela:", logNaJanela.length);
console.log("7. desses, presentes no HTML:", noHtml.length);
console.log("8. cobertura:", pct(noHtml.length, logNaJanela.length));
console.log("9. faltantes:", faltantes.length);
if (faltantes.length) {
  const porStatus = {}, porHora = {};
  faltantes.forEach(x => { porStatus[x.r["STATUS FINAL DO PEDIDO"]] = (porStatus[x.r["STATUS FINAL DO PEDIDO"]] || 0) + 1; porHora[hhmm(x.t).slice(0, 9)] = (porHora[hhmm(x.t).slice(0, 9)] || 0) + 1; });
  console.log("10. faltantes por status:", JSON.stringify(porStatus), "| por dia/hora:", JSON.stringify(porHora));
  faltantes.slice(0, 6).forEach(x => console.log("    ex:", hhmm(x.t), x.r["STATUS FINAL DO PEDIDO"], x.uuid.slice(0, 8)));
}
const cobertura = noHtml.length / Math.max(1, logNaJanela.length);
const V1_OK = cobertura >= 0.95;
console.log("11. veredito V1:", V1_OK ? "COBERTURA ALTA — janela confiável para replay" : "COBERTURA INSUFICIENTE — NÃO SIMULAR (decisão humana)");

// joins de desfecho na janela (id_curto → logística → uuid, por dia)
const curtoParaUuid = new Map(); const curtoColide = new Set();
for (const x of logNaJanela) { const c = String(x.r["ID CURTO DO PEDIDO"] || "").trim(); if (curtoParaUuid.has(c)) curtoColide.add(c); curtoParaUuid.set(c, x.uuid); }
function joinCurto(rows, colId, colDt, fmtISO) {
  let dentro = 0, ok = 0, amb = 0; const casadosJ = [];
  for (const r of rows) {
    const dt = String(r[colDt] || "");
    const t = fmtISO ? minCont(dt) : (m => m ? ((m[3] === "06" ? +m[2] - 30 : +m[2]) * 1440 + +m[4] * 60 + +m[5]) : null)(dt.match(/^(?:(\d{2})\/(\d{2})\/2026)[ T](\d{2}):(\d{2})/) ? [null, ...dt.match(/^(\d{2})\/(\d{2})\/2026[ T](\d{2}):(\d{2})/).slice(1)] : null);
    if (t == null || t < tIni || t > tFim) continue;
    dentro++;
    const c = String(r[colId] || "").trim();
    if (curtoColide.has(c)) { amb++; continue; }
    if (curtoParaUuid.has(c)) { ok++; casadosJ.push({ uuid: curtoParaUuid.get(c), r }); }
  }
  return { dentro, ok, amb, casados: casadosJ };
}
// datas: cancelamento usa ISO "2026-07-01 19:34:28"; negociação usa "01/07/2026 20:37"
const jC = joinCurto(canc, "Id do pedido", "Data e hora do pedido", true);
function minContBR(dt) { const m = String(dt || "").match(/^(\d{2})\/(\d{2})\/2026[ T](\d{2}):(\d{2})/); if (!m) return null; const dia = (m[2] === "06") ? (+m[1] - 30) : (+m[1]); return dia * 1440 + (+m[3]) * 60 + (+m[4]); }
let jN = { dentro: 0, ok: 0, amb: 0, casados: [] };
for (const r of neg) { const t = minContBR(r["Data e hora do pedido"]); if (t == null || t < tIni || t > tFim) continue; jN.dentro++; const c = String(r["Id do pedido"] || "").trim(); if (curtoColide.has(c)) { jN.amb++; continue; } if (curtoParaUuid.has(c)) { jN.ok++; jN.casados.push({ uuid: curtoParaUuid.get(c), r }); } }
console.log("\njoins de desfecho na janela — cancelamentos:", jC.ok + "/" + jC.dentro, "(ambíguos:", jC.amb + ")", "· negociações:", jN.ok + "/" + jN.dentro, "(ambíguos:", jN.amb + ")");
console.log("colisões de ID curto dentro da janela:", curtoColide.size);

if (SO_V1) process.exit(0);
if (!V1_OK) { console.log("\nABORTADO pelo portão V1."); process.exit(1); }

/* ============================== REPLAY ============================== */
console.log("\n================ REPLAY — real × sintético ================");
// NIGHT: só pedidos vivos (casados HTML×logística; DECLINED nunca chega aqui pois não está na logística)
const idCurtoUnico = !casados.some((x, i) => casados.findIndex(y => y.r["ID CURTO DO PEDIDO"] === x.r["ID CURTO DO PEDIDO"]) !== i);
const NIGHT = []; const uuid2id = new Map();
for (const x of casados) {
  const r = x.r;
  const cancelado = /cancel/i.test(String(r["STATUS FINAL DO PEDIDO"] || ""));
  const tpr = num(r["TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)"]);
  const tent = num(r["TEMPO DA ENTREGA REALIZADA (MIN)"]);
  const tcam = num(r["TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)"]);
  const tesp = num(r["TEMPO DO ENTREGADOR ESPERANDO NO CLIENTE (MIN)"]) || 0;
  const id = idCurtoUnico ? String(r["ID CURTO DO PEDIDO"]).trim() : x.uuid.slice(0, 8);
  uuid2id.set(x.uuid, id);
  NIGHT.push({ id, uuid: x.uuid, r: x.t,
    p: !cancelado && tpr != null ? Math.round(x.t + tpr) : null,
    s: !cancelado && tent != null && tcam != null ? Math.round(x.t + (tent - tcam - tesp)) : null,
    e: !cancelado && tent != null ? Math.round(x.t + tent) : null,
    c: cancelado ? x.t : null });
}
console.log("pedidos vivos no replay:", NIGHT.length, "| id de exibição:", idCurtoUnico ? "ID curto (único na janela)" : "uuid[0:8] (havia colisão)");

// FONTES de composição — real (jsonl→rows) e sintética (mesmos IDs)
MOTOR.setNomes(Object.fromEntries(SEED.map(i => [i.id, i.nome])));
const rowsReal = [];
for (const x of casados) for (const it of x.info.itens) rowsReal.push({ pedido_id: uuid2id.get(x.uuid), item_nome: it.item_nome, quantidade: it.quantidade, observacao: it.observacao });
const FONTE_REAL = MOTOR.makeFonteItensFromRows(rowsReal, SEED);
const FONTE_SINT = MOTOR.makeFonteSintetica(SEED);
console.log("fonte real:", JSON.stringify(FONTE_REAL.stats), "| não-casados:", Object.keys(FONTE_REAL.unmatched).length);

function rodar(nome, fonte, ehReal) {
  const INFO = {}; for (const o of NIGHT) INFO[o.id] = MOTOR.resolver(fonte(o.id));
  const sess = MOTOR.novaSessao();
  const focos = [], recs = []; const modos = { calmo: 0, ambiente: 0, foco: 0 }; const modosOper = { calmo: 0, ambiente: 0, foco: 0 };
  const surge = {}; let prevKey = null;
  const T0 = tIni - 5, T1 = tFim + 90; // +90min de drenagem (entregas em curso); comparação é justa: mesmo range p/ ambos
  for (let t = T0; t <= T1; t++) {
    const R = MOTOR.step(t, NIGHT, INFO, sess);
    modos[R.mode]++;
    if (R.emand > 0) modosOper[R.mode]++;               // só minutos com pedido vivo (exclui madrugada morta)
    for (const s of R.sits) if (s.kind === "praca") surge[s.praca] = (surge[s.praca] || 0) + 1;
    const k = sess.active ? sess.active.key : null;
    if (k && k !== prevKey) {
      const st = sess.active.sit;
      focos.push({ t, hhmm: hhmm(t), kind: st.kind, key: k, sev: st.sev, id: st.id || null, praca: st.praca || null });
      const rec = DECISAO.decidir(R, INFO, { fonteReal: ehReal });
      if (rec) recs.push({ t, hhmm: hhmm(t), tipo: rec.tipo, acao: rec.acao, porque: rec.porque, primeiro: rec.primeiro, impacto: rec.impacto, confianca: rec.confianca, dependeComposicao: rec.dependeComposicao });
    }
    prevKey = k;
  }
  // agregados de composição (por pedido)
  const compo = { pracaUnica: 0, sacola2: 0, kit: 0, bebida: 0, sobremesa: 0, confAlta: 0, benches: {} };
  for (const o of NIGHT) { const I = INFO[o.id]; if (!I) continue;
    if (I.pracaUnica) compo.pracaUnica++; if (I.segundaSacola) compo.sacola2++; if (I.contemKit) compo.kit++;
    if (I.contemBebida) compo.bebida++; if (I.contemSobremesa) compo.sobremesa++; if (I.riscoConfAlto) compo.confAlta++;
    I.benches.forEach(p => compo.benches[p] = (compo.benches[p] || 0) + 1); }
  return { nome, INFO, focos, recs, modos, modosOper, surge, compo };
}
const REAL = rodar("real", id => FONTE_REAL(id), true);
const SINT = rodar("sintetico", FONTE_SINT, false);

// ---------- comparação ----------
function resumo(R) {
  const porKind = {}; R.focos.forEach(f => porKind[f.kind] = (porKind[f.kind] || 0) + 1);
  const porTipo = {}, porConf = {}; R.recs.forEach(r => { porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1; porConf[r.confianca] = (porConf[r.confianca] || 0) + 1; });
  return { focos: R.focos.length, porKind, recs: R.recs.length, porTipo, porConf, modos: R.modos, modosOper: R.modosOper, surge: R.surge, compo: R.compo };
}
const cmp = { janela: { ini: hhmm(tIni), fim: hhmm(tFim), pedidos: NIGHT.length }, real: resumo(REAL), sintetico: resumo(SINT) };
// pedidos que o sistema mandaria olhar (primeiro olhar) — diferença
const olharReal = new Set(REAL.recs.map(r => r.primeiro)); const olharSint = new Set(SINT.recs.map(r => r.primeiro));
cmp.olhar = { soReal: [...olharReal].filter(x => !olharSint.has(x)), soSintetico: [...olharSint].filter(x => !olharReal.has(x)) };
// focos de composição: chaves só de um lado (falsos focos da síntese / focos que a síntese perderia)
const keysComp = R => new Set(R.focos.filter(f => ["praca", "fechamento", "conferencia"].includes(f.kind)).map(f => f.key));
const kR = keysComp(REAL), kS = keysComp(SINT);
cmp.focosComposicao = { soReal: [...kR].filter(k => !kS.has(k)), soSintetico: [...kS].filter(k => !kR.has(k)) };
// timing-only devem coincidir (sanity)
const keysTiming = R => new Set(R.focos.filter(f => f.kind === "saida" || (f.kind === "order" && f.key.startsWith("od:"))).map(f => f.key));
cmp.sanityTimingIgual = JSON.stringify([...keysTiming(REAL)].sort()) === JSON.stringify([...keysTiming(SINT)].sort());

fs.writeFileSync(path.join(OUT, "replay_janela_real_2026-07-01_resumo.json"), JSON.stringify({ _prov: { gerado_em: new Date().toISOString(), script: "tools/replay_janela_real_2026-07-01.js", isolado: true, motor_intocado: true }, cmp, joins: { cancelamentos: jC.ok + "/" + jC.dentro, negociacoes: jN.ok + "/" + jN.dentro }, cobertura_v1: pct(noHtml.length, logNaJanela.length) }, null, 2));
fs.writeFileSync(path.join(OUT, "replay_janela_real_2026-07-01_focos_real.jsonl"), REAL.focos.map(f => JSON.stringify(f)).join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "replay_janela_real_2026-07-01_focos_sintetico.jsonl"), SINT.focos.map(f => JSON.stringify(f)).join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "replay_janela_real_2026-07-01_recs_real.jsonl"), REAL.recs.map(f => JSON.stringify(f)).join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "replay_janela_real_2026-07-01_recs_sintetico.jsonl"), SINT.recs.map(f => JSON.stringify(f)).join("\n") + "\n");

// ---------- console ----------
const D = MOTOR.DISPLAY;
console.log("\n--- distribuição (só minutos com pedido vivo) ---");
for (const m of ["calmo", "ambiente", "foco"]) console.log("  " + m + ": real " + REAL.modosOper[m] + "min · sint " + SINT.modosOper[m] + "min");
console.log("--- focos (onsets) ---");
console.log("  real:", cmp.real.focos, JSON.stringify(cmp.real.porKind), "| sint:", cmp.sintetico.focos, JSON.stringify(cmp.sintetico.porKind));
console.log("--- recomendações ---");
console.log("  real:", cmp.real.recs, JSON.stringify(cmp.real.porTipo), JSON.stringify(cmp.real.porConf));
console.log("  sint:", cmp.sintetico.recs, JSON.stringify(cmp.sintetico.porTipo), JSON.stringify(cmp.sintetico.porConf));
console.log("--- composição por pedido (real vs sint) ---");
for (const k of ["pracaUnica", "sacola2", "kit", "bebida", "sobremesa", "confAlta"]) console.log("  " + k + ": " + cmp.real.compo[k] + " vs " + cmp.sintetico.compo[k]);
console.log("--- minutos de sobrecarga por praça ---");
for (const p of MOTOR.PRODUCAO) console.log("  " + D[p] + ": real " + (REAL.surge[p] || 0) + " · sint " + (SINT.surge[p] || 0));
console.log("--- divergência de atenção ---");
console.log("  focos de composição só no REAL:", cmp.focosComposicao.soReal.length, "| só no SINTÉTICO:", cmp.focosComposicao.soSintetico.length);
console.log("  'primeiro olhar' só no REAL:", cmp.olhar.soReal.slice(0, 8).join(" · ") || "—");
console.log("  'primeiro olhar' só no SINT:", cmp.olhar.soSintetico.slice(0, 8).join(" · ") || "—");
console.log("  sanity (focos de timing idênticos nos dois):", cmp.sanityTimingIgual ? "OK" : "FALHOU — investigar");
console.log("\nexemplos de recomendação REAL:");
REAL.recs.slice(0, 4).forEach(r => console.log("  [" + r.hhmm + "] " + r.acao + " — " + r.porque + " → " + r.primeiro + " (conf " + r.confianca + ")"));
console.log("\nOK — replay isolado concluído. Motor, seed, baseline e backtest oficial intocados.");

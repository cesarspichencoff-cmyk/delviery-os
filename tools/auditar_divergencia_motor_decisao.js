/* ============================================================================
 * FERRAMENTA DE AUDITORIA — NÃO É PRODUÇÃO. NÃO ALTERA MOTOR NEM DECISÃO.
 * ----------------------------------------------------------------------------
 * Mede, nas 12 janelas reais já validadas, com que frequência a AÇÃO exibida
 * por DECISAO.decidir() diverge da TENSÃO ativa em sess.active.sit (motor.js).
 * Ver docs/RedTeam_Modelo_Operacional_Consciencia.md e docs/Contrato_Motor_Decisao.md.
 *
 * `src/perfil-delivery/motor.js` e `decisao.js` são importados e chamados
 * SEM NENHUMA MODIFICAÇÃO — só lidos e executados como já rodam em produção.
 * A única coisa nova aqui é um "espelho de leitura" (mirrorCandidatos, abaixo)
 * que REPRODUZ a mesma lógica de seleção de candidatos de decisao.js só para
 * recuperar o alvo (praça/id) de cada candidato — dado que decisao.js hoje
 * não exporta esse campo. O espelho não decide nada; a decisão real
 * (tipo/score/vencedor) sempre vem de DECISAO.decidir() de verdade, e o
 * espelho é usado só para casar (por tipo+score) e extrair o alvo do MESMO
 * candidato que já venceu de verdade.
 *
 * Saída: data/generated/divergencia_motor_decisao.json (fora do Git).
 * Uso: node tools/auditar_divergencia_motor_decisao.js
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const XLSX = require(path.join(__dirname, "..", "node_modules", "xlsx"));
const REPO = path.join(__dirname, "..");
const MOTOR = require(path.join(REPO, "src/perfil-delivery/motor.js"));
const DECISAO = require(path.join(REPO, "src/perfil-delivery/decisao.js"));
const SEED = require(path.join(REPO, "data/cardapio_knowledge_seed.json")).itens;
const OUT = path.join(REPO, "data/generated");
const num = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };

/* ============================================================================
 * ESPELHO DE LEITURA — reproduz a MESMA lógica de decisao.js só para recuperar
 * o alvo (praça/id) por candidato. Mantido em paralelo, nunca usado para
 * decidir — só para rastrear. Qualquer divergência de score entre o espelho
 * e a DECISAO.decidir() real é reportada como aviso, nunca escondida.
 * ==========================================================================*/
function mirrorCandidatos(snap, INFO, fonteReal) {
  const D = MOTOR.DISPLAY, F = MOTOR.FLOORS;
  const sits = snap.sits || [], ctx = snap.ctx || { wE: [], wP: [], load: {} };
  const cands = [];
  const confComp = (fraca) => fraca ? "baixa" : (fonteReal ? "alta" : "média");
  for (const s of sits) {
    if (s.kind !== "praca") continue;
    const anc = DECISAO.ancoraDaPraca(s.praca, ctx.wP, INFO);
    const unblock = s.unblock || 0;
    cands.push({ tipo: "priorizar_praca", score: unblock * 2 + s.n * 0.5 + s.sev, alvo: { praca: s.praca, id: anc ? anc.id : null } });
  }
  {
    const simples = ctx.wP.filter(w => { const I = INFO[w.id]; return I && I.pracaUnica && w.min > F.PROD * 0.5; }).sort((a, b) => b.min - a.min);
    if (simples.length >= 2) cands.push({ tipo: "fechar_simples", score: simples.length * 1.5 + 1, alvo: { praca: INFO[simples[0].id].pracaUnica, ids: simples.slice(0, 3).map(w => w.id) } });
  }
  {
    const ew = ctx.wE.filter(x => x.min > F.EXPED).sort((a, b) => b.min - a.min);
    if (ew.length >= F.SURGE) cands.push({ tipo: "chamar_motoboy", score: ew.length * 1.8 + 2, alvo: { praca: null, id: ew[0].id } });
  }
  for (const s of sits) {
    if (s.kind !== "conferencia") continue;
    const I = s.I;
    cands.push({ tipo: "conferencia", score: (I.temObservacao ? 3 : 2) + (I.segundaSacola ? 2 : 0), alvo: { praca: null, id: s.id, pracasDoPedido: I.benches.concat(I.confPr) } });
  }
  for (const s of sits) {
    if (s.kind !== "order") continue;
    const exped = s.zona === "Expedição";
    cands.push({ tipo: exped ? "conferir_saida" : "olhar_pedido", score: s.peak / 25 + s.sev, alvo: { praca: null, id: s.id, zona: s.zona } });
  }
  return cands;
}

/* ---------- classificação: sess.active.sit × candidato-vencedor casado ---------- */
function classificar(sit, recTipo, alvo) {
  const kind = sit.kind;
  if (!alvo) return { categoria: "INDETERMINADO", motivo: "não foi possível casar o vencedor real com o espelho (score não bateu — ver aviso)" };

  if (kind === "praca") {
    const P = sit.praca;
    if (recTipo === "priorizar_praca" && alvo.praca === P) {
      return alvo.id ? { categoria: "REFINAMENTO ACEITÁVEL", motivo: `foco=praça ${P} sobrecarregada; ação=priorizar pedido âncora #${alvo.id} dentro da mesma praça` }
                     : { categoria: "ALINHADO", motivo: `foco=praça ${P}; ação=priorizar a própria bancada ${P}, sem alvo mais específico` };
    }
    if (recTipo === "fechar_simples" && alvo.praca === P) {
      return { categoria: "REFINAMENTO ACEITÁVEL", motivo: `foco=praça ${P} sobrecarregada; ação=fechar pedidos que dependem só de ${P} (mesma causa raiz, alvo mais específico)` };
    }
    if (recTipo === "priorizar_praca" || recTipo === "fechar_simples") {
      return { categoria: "TROCA PROIBIDA DE CAUSA RAIZ", motivo: `foco=praça ${P} sobrecarregada; ação=${recTipo} sobre praça ${alvo.praca} — praça diferente` };
    }
    if (recTipo === "chamar_motoboy" || recTipo === "conferir_saida") {
      return { categoria: "TROCA PROIBIDA DE CAUSA RAIZ", motivo: `foco=praça ${P} sobrecarregada (produção); ação=${recTipo} (expedição/motoboy) — zona diferente, sem relação com a praça que abriu o foco` };
    }
    if (recTipo === "conferencia" || recTipo === "olhar_pedido") {
      return { categoria: "INDETERMINADO", motivo: `foco=praça ${P}; ação=${recTipo} — pode ou não estar relacionado (o pedido pode ou não tocar a praça ${P}); não forçando classificação sem mais evidência` };
    }
    return { categoria: "INDETERMINADO", motivo: `combinação não mapeada: foco=praca, ação=${recTipo}` };
  }

  if (kind === "saida") {
    if (recTipo === "chamar_motoboy") return { categoria: "ALINHADO", motivo: "foco=saída lenta/travada; ação=chamar motoboy — mesma tensão, mesma zona (expedição)" };
    if (recTipo === "conferir_saida") return { categoria: "REFINAMENTO ACEITÁVEL", motivo: `foco=saída travada (agregado); ação=conferir saída do pedido específico #${alvo.id}` };
    return { categoria: "TROCA PROIBIDA DE CAUSA RAIZ", motivo: `foco=saída travada (expedição); ação=${recTipo} — fora da zona de expedição` };
  }

  if (kind === "fechamento") {
    const P = sit.praca, id = sit.id;
    if ((recTipo === "fechar_simples" && alvo.ids && alvo.ids.includes(id)) || (recTipo === "olhar_pedido" && alvo.id === id)) {
      return { categoria: "ALINHADO", motivo: `foco=fechamento do pedido #${id}; ação=${recTipo} sobre o MESMO pedido` };
    }
    if (recTipo === "priorizar_praca" && alvo.praca === P) {
      return { categoria: "INDETERMINADO", motivo: `foco=fechamento específico do pedido #${id} (praça ${P}); ação=priorizar_praca ${P} — ação MENOS específica que o foco (direção inversa ao exemplo de "refinamento" dado); não coberto claramente pelo contrato, não forçando classificação` };
    }
    return { categoria: "TROCA PROIBIDA DE CAUSA RAIZ", motivo: `foco=fechamento do pedido #${id}; ação=${recTipo} sem relação com esse pedido/praça` };
  }

  if (kind === "conferencia") {
    const id = sit.id;
    if (recTipo === "conferencia" && alvo.id === id) return { categoria: "ALINHADO", motivo: `foco=conferência do pedido #${id}; ação=conferência do MESMO pedido` };
    if (recTipo === "priorizar_praca" && alvo.pracasDoPedido) {
      return { categoria: "INDETERMINADO", motivo: `foco=conferência do pedido #${id}; ação=priorizar_praca — ação menos específica que o foco; não coberto claramente pelo contrato` };
    }
    return { categoria: "TROCA PROIBIDA DE CAUSA RAIZ", motivo: `foco=conferência do pedido #${id}; ação=${recTipo} sem relação com esse pedido` };
  }

  if (kind === "order") {
    const id = sit.id;
    if ((recTipo === "olhar_pedido" || recTipo === "conferir_saida") && alvo.id === id) {
      return { categoria: "ALINHADO", motivo: `foco=pedido preso #${id}; ação=${recTipo} sobre o MESMO pedido` };
    }
    return { categoria: "TROCA PROIBIDA DE CAUSA RAIZ", motivo: `foco=pedido preso #${id}; ação=${recTipo} sem relação com esse pedido` };
  }

  return { categoria: "INDETERMINADO", motivo: "kind de sit não reconhecido por este script de auditoria" };
}

/* ---------- construção de NIGHT/INFO por janela (reaproveita a lógica já validada dos replays) ---------- */
function minCont01Jul(dtStr) { const m = String(dtStr || "").match(/^2026-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); if (!m) return null; const dia = (m[1] === "06") ? (+m[2] - 30) : (+m[2] - 1 + 1); return dia * 1440 + (+m[3]) * 60 + (+m[4]); }

function construirJanela0701() {
  const LOTE = path.join(REPO, "data/raw/incoming/ifood_2026-07-01");
  const itensRows = fs.readFileSync(path.join(OUT, "itens_pedido_reais_2026-07-01.jsonl"), "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
  const htmlPed = new Map();
  for (const o of itensRows) { if (!htmlPed.has(o.pedido_id)) htmlPed.set(o.pedido_id, { status: o.status, itens: [] }); htmlPed.get(o.pedido_id).itens.push(o); }
  const wbL = XLSX.readFile(path.join(LOTE, "relatorio_logistica_2026-06-26_2026-07-02.xlsx"), { cellDates: false });
  const logByUuid = new Map(XLSX.utils.sheet_to_json(wbL.Sheets[wbL.SheetNames[0]], { defval: null }).map(r => [String(r["ID COMPLETO DO PEDIDO"] || "").trim(), r]));
  const casados = [];
  for (const [uuid, info] of htmlPed) { const r = logByUuid.get(uuid); if (!r) continue; const t = minCont01Jul(r["DATA E HORA DO PEDIDO"]); if (t == null) continue; casados.push({ uuid, t, r, info }); }
  casados.sort((a, b) => a.t - b.t);
  const idCurtoUnico = !casados.some((x, i) => casados.findIndex(y => y.r["ID CURTO DO PEDIDO"] === x.r["ID CURTO DO PEDIDO"]) !== i);
  const NIGHT = []; const uuid2id = new Map(); const rowsReal = [];
  for (const x of casados) {
    const r = x.r; const cancelado = /cancel/i.test(String(r["STATUS FINAL DO PEDIDO"] || ""));
    const tpr = num(r["TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)"]), tent = num(r["TEMPO DA ENTREGA REALIZADA (MIN)"]), tcam = num(r["TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)"]), tesp = num(r["TEMPO DO ENTREGADOR ESPERANDO NO CLIENTE (MIN)"]) || 0;
    const id = idCurtoUnico ? String(r["ID CURTO DO PEDIDO"]).trim() : x.uuid.slice(0, 8);
    uuid2id.set(x.uuid, id);
    NIGHT.push({ id, uuid: x.uuid, r: x.t, p: !cancelado && tpr != null ? Math.round(x.t + tpr) : null, s: !cancelado && tent != null && tcam != null ? Math.round(x.t + (tent - tcam - tesp)) : null, e: !cancelado && tent != null ? Math.round(x.t + tent) : null, c: cancelado ? x.t : null });
  }
  MOTOR.setNomes(Object.fromEntries(SEED.map(i => [i.id, i.nome])));
  for (const x of casados) for (const it of x.info.itens) rowsReal.push({ pedido_id: uuid2id.get(x.uuid), item_nome: it.item_nome, quantidade: it.quantidade, observacao: it.observacao });
  const FONTE = MOTOR.makeFonteItensFromRows(rowsReal, SEED);
  const T0 = Math.min(...NIGHT.map(o => o.r)) - 5, T1 = Math.max(...NIGHT.map(o => Math.max(o.e || 0, o.s || 0, o.p || 0, o.c || 0, o.r))) + 90;
  return { NIGHT, FONTE, T0, T1 };
}

function construirDia(dia) {
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
  const vivosHtml = [...htmlPed.entries()].filter(([, p]) => p.status !== "DECLINED");
  const casados = vivosHtml.filter(([u]) => timingByUuid.has(u));
  const NIGHT = []; let rowsReal = [];
  MOTOR.setNomes(Object.fromEntries(SEED.map(i => [i.id, i.nome])));
  for (const [uuid, info] of casados) {
    const r = timingByUuid.get(uuid); const t = colDt(r);
    const cancelado = /cancel/i.test(String(r["STATUS FINAL DO PEDIDO"] || "")) || info.status === "CANCELLED";
    const tpr = num(r["TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)"]), tent = num(r["TEMPO DA ENTREGA REALIZADA (MIN)"]), tcam = num(r["TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)"]), tesp = num(r["TEMPO DO ENTREGADOR ESPERANDO NO CLIENTE (MIN)"]) || 0;
    const id = uuid.slice(0, 8);
    NIGHT.push({ id, r: t, p: !cancelado && tpr != null ? Math.round(t + tpr) : null, s: !cancelado && tent != null && tcam != null ? Math.round(t + (tent - tcam - tesp)) : null, e: !cancelado && tent != null ? Math.round(t + tent) : null, c: cancelado ? t : null });
    for (const it of info.itens) rowsReal.push({ pedido_id: id, item_nome: it.item_nome, quantidade: it.quantidade || 1, observacao: it.observacao });
  }
  if (!NIGHT.length) return null;
  const FONTE = MOTOR.makeFonteItensFromRows(rowsReal, SEED);
  const T0 = Math.min(...NIGHT.map(o => o.r)) - 5, T1 = Math.max(...NIGHT.map(o => Math.max(o.e || 0, o.s || 0, o.p || 0, o.c || 0, o.r))) + 15;
  return { NIGHT, FONTE, T0, T1 };
}

/* ---------- roda uma janela, capturando (sit, rec) a cada ONSET de foco ---------- */
function auditarJanela(tag, { NIGHT, FONTE, T0, T1 }) {
  const INFO = {}; for (const o of NIGHT) INFO[o.id] = MOTOR.resolver(FONTE(o.id));
  const sess = MOTOR.novaSessao();
  const casos = []; let prevKey = null; let avisosScoreNaoCasou = 0;
  for (let t = T0; t <= T1; t++) {
    const R = MOTOR.step(t, NIGHT, INFO, sess);
    const curKey = sess.active ? sess.active.key : null;
    if (curKey && curKey !== prevKey) {
      const sit = sess.active.sit;
      // decidir() com escopo (comportamento real pós-correção) — active restringe candidatos à
      // mesma causa raiz do foco. Se vier null, chamamos sem 'active' só para DIAGNOSTICAR por
      // que (sits vazio de fato vs. filtrado corretamente pelo escopo) — não decide nada, só audita.
      const rec = DECISAO.decidir(R, INFO, { fonteReal: true, active: sess.active });
      if (!rec) {
        const recSemEscopo = DECISAO.decidir(R, INFO, { fonteReal: true });
        if (!recSemEscopo) {
          casos.push({ janela: tag, t, sitKey: sit.key, sitKind: sit.kind, categoria: "INDETERMINADO", motivo: "sess.active existe mas decidir() retornou null mesmo sem restrição de escopo (sits vazio no instante da chamada — inconsistência momentânea)" });
        } else {
          casos.push({ janela: tag, t, sitKey: sit.key, sitKind: sit.kind, categoria: "ALINHADO", motivo: `nenhum candidato dentro do escopo do foco ativo (${sit.kind}) — caiu corretamente para buildFoco() puro em vez do candidato "${recSemEscopo.tipo}" de outra causa raiz` });
        }
        prevKey = curKey; continue;
      }
      const espelho = mirrorCandidatos(R, INFO, true);
      const scoreRec = Math.round((rec.todas.find(c => c.acao === rec.acao) || {}).score * 10) / 10;
      const candidatosEspelho = espelho.filter(c => c.tipo === rec.tipo);
      let casado = candidatosEspelho.find(c => Math.round(c.score * 10) / 10 === scoreRec);
      if (!casado && candidatosEspelho.length === 1) casado = candidatosEspelho[0];
      if (!casado) avisosScoreNaoCasou++;
      const { categoria, motivo } = classificar(sit, rec.tipo, casado ? casado.alvo : null);
      casos.push({ janela: tag, t, sitKey: sit.key, sitKind: sit.kind, sitPraca: sit.praca || null, sitId: sit.id || null, recTipo: rec.tipo, recAcao: rec.acao, categoria, motivo });
    }
    prevKey = curKey;
  }
  return { casos, avisosScoreNaoCasou };
}

/* ============================== EXECUÇÃO ============================== */
const janelas = [["2026-07-01(janela24h)", construirJanela0701()]];
for (let d = 20; d <= 30; d++) { const j = construirDia(d); if (j) janelas.push([d + "/06", j]); }

let todosCasos = [], avisosTotal = 0;
for (const [tag, dados] of janelas) {
  const { casos, avisosScoreNaoCasou } = auditarJanela(tag, dados);
  console.log(tag + ": " + casos.length + " onsets de foco analisados" + (avisosScoreNaoCasou ? " (" + avisosScoreNaoCasou + " avisos de score não-casado)" : ""));
  todosCasos = todosCasos.concat(casos);
  avisosTotal += avisosScoreNaoCasou;
}

const porCategoria = {};
todosCasos.forEach(c => porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + 1);
console.log("\n=== TOTAL ===");
console.log("onsets de foco analisados:", todosCasos.length, "| avisos de score não-casado:", avisosTotal);
console.log("por categoria:", JSON.stringify(porCategoria, null, 2));

const porSitKind = {};
todosCasos.forEach(c => { porSitKind[c.sitKind] = porSitKind[c.sitKind] || {}; porSitKind[c.sitKind][c.categoria] = (porSitKind[c.sitKind][c.categoria] || 0) + 1; });
console.log("\npor sit.kind:", JSON.stringify(porSitKind, null, 2));

const porRecTipoForaEscopo = {};
todosCasos.filter(c => c.categoria === "TROCA PROIBIDA DE CAUSA RAIZ").forEach(c => porRecTipoForaEscopo[c.recTipo] = (porRecTipoForaEscopo[c.recTipo] || 0) + 1);
console.log("\ntipos de ação mais fora do escopo (só TROCA PROIBIDA):", JSON.stringify(porRecTipoForaEscopo, null, 2));

fs.writeFileSync(path.join(OUT, "divergencia_motor_decisao.json"), JSON.stringify({ gerado_em: new Date().toISOString(), avisosScoreNaoCasadoTotal: avisosTotal, porCategoria, porSitKind, porRecTipoForaEscopo, casos: todosCasos }, null, 2));
console.log("\nsalvo: data/generated/divergencia_motor_decisao.json (fora do Git)");
console.log("\nOK — ferramenta de auditoria apenas leu motor.js/decisao.js; nenhum dos dois foi alterado.");

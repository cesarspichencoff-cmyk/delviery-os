/* ============================================================================
 * PARSER EXPLORATÓRIO — lote data/raw/incoming/ifood_2026-07-01/ (2ª remessa)
 * ----------------------------------------------------------------------------
 * NÃO integra nada ao motor. Gera .jsonl exploratórios em data/generated/
 * (gitignorado), com proveniência completa por linha, para responder à
 * pergunta da fase: "dá para simular a noite de 01/07 por completo?"
 * Ver docs/Relatorio_Completude_Simulacao_2026-07-01.md.
 *
 * Saídas (todas fora do Git):
 *   timing_logistica_2026-06-26_2026-07-02.jsonl   (1 linha/pedido, durações oficiais)
 *   cancelamentos_2026-06-26_2026-07-02.jsonl      (com itens nomeados; só ID curto)
 *   negociacoes_2026-06-26_2026-07-02.jsonl        (só ID curto)
 *   avaliacoes_diario_2026-04-03_2026-07-02.jsonl  (série diária; SEM id de pedido)
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require(path.join(__dirname, "..", "node_modules", "xlsx"));

const REPO = path.join(__dirname, "..");
const LOTE = path.join(REPO, "data", "raw", "incoming", "ifood_2026-07-01");
const OUT = path.join(REPO, "data", "generated");
const md5 = f => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
const agora = new Date().toISOString();

function prov(arquivo, metodo) {
  return { origem: "ifood_export_oficial", arquivo_origem: path.basename(arquivo),
           hash_origem_md5: md5(arquivo), metodo_extracao: metodo, gerado_em: agora };
}
function writeJsonl(nome, linhas) {
  const p = path.join(OUT, nome);
  fs.writeFileSync(p, linhas.map(l => JSON.stringify(l)).join("\n") + "\n", "utf8");
  console.log("  →", nome, "(" + linhas.length + " linhas)");
  return p;
}
const num = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
const sheet = (f, aba) => { const wb = XLSX.readFile(f, { cellDates: false }); return XLSX.utils.sheet_to_json(wb.Sheets[aba || wb.SheetNames[0]], { defval: null }); };

/* ---------- 1) LOGÍSTICA: timing por pedido (a peça que faltava) ---------- */
const fLog = path.join(LOTE, "relatorio_logistica_2026-06-26_2026-07-02.xlsx");
{
  const P = prov(fLog, "sheet_to_json colunas oficiais; durações em MIN a partir de DATA E HORA DO PEDIDO; campos ausentes = null (nunca inventados)");
  const rows = sheet(fLog);
  const out = rows.map(r => ({
    id_completo: String(r["ID COMPLETO DO PEDIDO"] || "").trim() || null,
    id_curto: String(r["ID CURTO DO PEDIDO"] || "").trim() || null,
    data_hora_pedido: r["DATA E HORA DO PEDIDO"] || null,
    turno: r["TURNO"] || null,
    status_final: r["STATUS FINAL DO PEDIDO"] || null,
    motivo_cancelamento: r["MOTIVO DO CANCELAMENTO"] || null,
    tempo_preparo_min: num(r["TEMPO DE PREPARO DO PEDIDO (MIN)"]),
    tempo_alocacao_entregador_min: num(r["TEMPO DE ALOCAÇÃO DO ENTREGADOR (MIN)"]),
    tempo_botao_pronto_min: num(r["TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)"]),
    tempo_entregador_a_caminho_loja_min: num(r["TEMPO DO ENTREGADOR À CAMINHO DA LOJA (MIN)"]),
    tempo_esperando_na_loja_min: num(r["TEMPO GLOBAL DO ENTREGADOR ESPERANDO NA LOJA (MIN)"]),
    tempo_entregador_a_caminho_cliente_min: num(r["TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)"]),
    tempo_esperando_no_cliente_min: num(r["TEMPO DO ENTREGADOR ESPERANDO NO CLIENTE (MIN)"]),
    tempo_prometido_min: num(r["TEMPO PROMETIDO DE ENTREGA (MIN)"]),
    tempo_entrega_realizada_min: num(r["TEMPO DA ENTREGA REALIZADA (MIN)"]),
    atraso_min: num(r["TEMPO DE ATRASO EM RELAÇÃO AO TEMPO PROMETIDO DE ENTREGA (MIN)"]),
    distancia_km: num(r["DISTÂNCIA PERCORRIDA ATÉ O CLIENTE (KM)"]),
    confianca: "alta",
    campos_ausentes_sao: "null (duração não medida pelo iFood; nunca inventada)",
    _prov: P,
  }));
  writeJsonl("timing_logistica_2026-06-26_2026-07-02.jsonl", out);
}

/* ---------- 2) CANCELAMENTOS: desfecho + itens nomeados (só ID curto) ---------- */
const fCanc = path.join(LOTE, "relatorio_cancelamento.xlsx");
{
  const P = prov(fCanc, "sheet_to_json; 'Itens cancelados' mantido cru e também separado por ';' ou '[a, b]'; join com pedido só é possível via id_curto+dia (ambiguidade conhecida ~1,4%)");
  const rows = sheet(fCanc);
  const splitItens = s => { if (!s) return []; s = String(s).trim(); if (s.startsWith("[")) s = s.slice(1, -1); return s.split(/;|,(?=(?:[^\]]*$))/).map(x => x.trim()).filter(Boolean); };
  const out = rows.map(r => ({
    id_curto: String(r["Id do pedido"] || "").trim() || null,
    id_completo: null,
    aviso_join: "só id_curto — casar com timing/composição exige id_curto+dia via logística",
    data_hora_pedido: r["Data e hora do pedido"] || null,
    turno: r["Turno"] || null,
    status: r["Status do pedido"] || null,
    motivo: r["Motivo do cancelamento"] || null,
    origem_cancelamento: r["Origem do cancelamento"] || null,
    valor_pedido: r["Valor do pedido (R$)"] || null,
    valor_cancelamento: r["Valor total do cancelamento com entrega (R$)"] || null,
    itens_cancelados_cru: r["Itens cancelados"] || null,
    itens_cancelados: splitItens(r["Itens cancelados"]),
    contestavel: r["Cancelamento é contestável?"] || null,
    confianca: "alta",
    _prov: P,
  }));
  writeJsonl("cancelamentos_2026-06-26_2026-07-02.jsonl", out);
}

/* ---------- 3) NEGOCIAÇÕES (só ID curto; 2 colunas novas de arbitragem) ---------- */
const fNeg = path.join(LOTE, "relatorio_negociacoes.xlsx");
{
  const P = prov(fNeg, "sheet_to_json; formato tem 2 colunas a mais que o export histórico (Houve arbitragem, Resultado da arbitragem)");
  const rows = sheet(fNeg);
  const out = rows.map(r => ({
    id_curto: String(r["Id do pedido"] || "").trim() || null,
    id_completo: null,
    aviso_join: "só id_curto — casar exige id_curto+dia",
    data_hora_pedido: r["Data e hora do pedido"] || null,
    turno: r["Turno"] || null,
    status: r["Status do pedido"] || null,
    momento: r["Momento da solicitação"] || null,
    motivo: r["Motivo da solicitação"] || null,
    quem_iniciou: r["Quem iniciou a negociação"] || null,
    resposta_loja: r["Resposta da loja"] || null,
    resposta_cliente: r["Resposta do cliente"] || null,
    valor_cupom: r["Valor do cupom (R$)"] || null,
    valor_reembolso: r["Valor do reembolso (R$)"] || null,
    cancelamento_evitado: r["Cancelamento evitado"] || null,
    houve_arbitragem: r["Houve arbitragem"] || null,
    resultado_arbitragem: r["Resultado da arbitragem"] || null,
    confianca: "alta",
    _prov: P,
  }));
  writeJsonl("negociacoes_2026-06-26_2026-07-02.jsonl", out);
}

/* ---------- 4) AVALIAÇÕES: série diária (SEM id de pedido — nível-dia apenas) ---------- */
const fAva = path.join(LOTE, "avaliacoes_tata_sushi_53069.xlsx");
{
  const P = prov(fAva, "aba 'Diário' via sheet_to_json; SEM id de pedido em nenhuma aba — uso permitido: tendência diária; uso PROIBIDO: afirmar desfecho de pedido específico");
  const rows = sheet(fAva, "Diário");
  const out = rows.map(r => ({
    data: r["data"] || null,
    qtd_avaliacoes_dia: num(r["qtd_avaliacoes_dia"]),
    nota_media_dia: num(r["nota_media_dia"]),
    promotores: num(r["promotores"]),
    detratores: num(r["detratores"]),
    neutros: num(r["neutros"]),
    nps_dia: num(r["nps_dia"]),
    pedidos_atrasados_avaliados: num(r["pedidos_atrasados_avaliados"]),
    granularidade: "DIA — não é avaliação por pedido",
    confianca: "alta",
    _prov: P,
  })).filter(o => o.data);
  writeJsonl("avaliacoes_diario_2026-04-03_2026-07-02.jsonl", out);
}

/* ---------- 5) MEDIÇÃO: joins possíveis para 01/07 (imprime, não grava) ---------- */
{
  const logRows = sheet(fLog);
  const log0107 = logRows.filter(r => String(r["DATA E HORA DO PEDIDO"] || "").startsWith("2026-07-01"));
  const curtoLog = new Map(log0107.map(r => [String(r["ID CURTO DO PEDIDO"] || "").trim(), String(r["ID COMPLETO DO PEDIDO"] || "").trim()]));
  const canc = sheet(fCanc).filter(r => String(r["Data e hora do pedido"] || "").startsWith("2026-07-01"));
  const neg = sheet(fNeg).filter(r => String(r["Data e hora do pedido"] || "").includes("01/07/2026"));
  const cancMatch = canc.filter(r => curtoLog.has(String(r["Id do pedido"] || "").trim())).length;
  const negMatch = neg.filter(r => curtoLog.has(String(r["Id do pedido"] || "").trim())).length;
  console.log("\n=== joins medidos para o dia-calendário 01/07 ===");
  console.log("cancelamentos de 01/07:", canc.length, "| casam com logística por id_curto:", cancMatch);
  console.log("negociações de 01/07:", neg.length, "| casam com logística por id_curto:", negMatch);
}
console.log("\nOK — nada tocou o motor, o backtest oficial ou o seed.");

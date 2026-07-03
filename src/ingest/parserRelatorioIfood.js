/* ============================================================================
 * DeliveryOS · Parser compartilhado do Relatório de Pedidos iFood (linha → registro de backtest)
 * ----------------------------------------------------------------------------
 * Extraído da Fase de Continuidade e Portabilidade (jul/2026) — antes, esta lógica
 * (nomes de coluna, parse de data/hora, reconstrução do "saiu para entrega") estava
 * DUPLICADA, escrita de forma independente, dentro de `tools/autoteste_8pracas.js`.
 * Achado e documentado em `docs/Auditoria_Nivel2_Validacao_Base.md` §3.3.
 *
 * Este módulo é a ÚNICA implementação da conversão "linha do relatório → registro
 * de backtest (minuto-do-dia)". `tools/autoteste_8pracas.js` importa daqui.
 *
 * Nota de arquitetura (não resolvida nesta fase, de propósito — ver decisão abaixo):
 * existe uma SEGUNDA implementação, em TypeScript, com propósito diferente:
 * `src/ingest/ifoodRelatorio.ts` (Camada 0) converte a mesma linha em TIMESTAMPS
 * ISO absolutos e gera Transições append-only/replay-safe para `data/ifood_real.jsonl`.
 * Aqui o formato de saída é minuto-do-dia (0..1439) para simulação por dia dentro do
 * motor de 8 praças — um formato mais simples, propositalmente sem passar pela Camada 0.
 * Unificar as duas (fazer o backtest consumir `data/ifood_real.jsonl` em vez do xlsx
 * bruto) é uma mudança maior, com risco próprio (reconciliar ID curto × ID completo,
 * e validar o round-trip de fuso horário) — avaliada e adiada de propósito nesta fase;
 * ver `docs/Auditoria_Nivel2_Validacao_Base.md` §3.3 e o registro da decisão em
 * `docs/Procedimento_Continuidade.md`. O que ESTA extração já resolve: a fórmula de
 * "saiu para entrega" e os nomes de coluna deixam de existir em dois lugares.
 * ==========================================================================*/
"use strict";

/** Nomes EXATOS das colunas do relatório usadas pelo backtest (fácil de ajustar aqui). */
const COL = {
  idCurto: "ID CURTO DO PEDIDO",
  dataHora: "DATA E HORA DO PEDIDO",
  status: "STATUS FINAL DO PEDIDO",
  tPronto: "TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN)",
  tEntrega: "TEMPO DA ENTREGA REALIZADA (MIN)",
  tCaminhoCliente: "TEMPO DO ENTREGADOR À CAMINHO DO CLIENTE (MIN)",
  tEsperandoCliente: "TEMPO DO ENTREGADOR ESPERANDO NO CLIENTE (MIN)",
  dataCancel: "DATA DO CANCELAMENTO",
  atraso: "TEMPO DE ATRASO EM RELAÇÃO AO TEMPO PROMETIDO DE ENTREGA (MIN)",
  problemaPos: "CLIENTE INFORMOU PROBLEMA EM PEDIDO APÓS A ENTREGA",
};

function num(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}

/** "31/05/2026 22:59:38" → { dia:"31/05/2026", mod: minutos desde 00:00 }. null se vazio/inválido. */
function parseDataHoraMinutos(v) {
  if (v == null) return null;
  const m = String(v).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/);
  return m ? { dia: `${m[1]}/${m[2]}/${m[3]}`, mod: (+m[4]) * 60 + (+m[5]) } : null;
}

const ehCancelado = (status) => /cancel/i.test(String(status || ""));

/**
 * Linha do relatório → registro de backtest (minuto-do-dia). null se faltar
 * data/hora ou ID curto (linha inaproveitável). Mesma regra de sempre: duração
 * ausente => sem carimbo, nunca inventa.
 */
function linhaParaRegistro(r) {
  const rec = parseDataHoraMinutos(r[COL.dataHora]);
  if (!rec) return null;
  const id = String(r[COL.idCurto] || "").trim();
  if (!id) return null;

  const canc = ehCancelado(r[COL.status]);
  const tpr = num(r[COL.tPronto]);
  const tent = num(r[COL.tEntrega]);
  const tcam = num(r[COL.tCaminhoCliente]);
  const tesp = num(r[COL.tEsperandoCliente]) || 0;

  return {
    id, dia: rec.dia, r: rec.mod,
    p: !canc && tpr != null ? Math.round(rec.mod + tpr) : null,
    // "saiu para entrega" ≈ entregue − (à caminho do cliente) − (esperando no cliente)
    s: !canc && tent != null && tcam != null ? Math.round(rec.mod + (tent - tcam - tesp)) : null,
    e: !canc && tent != null ? Math.round(rec.mod + tent) : null,
    c: canc ? ((parseDataHoraMinutos(r[COL.dataCancel]) || {}).mod ?? rec.mod) : null,
    atraso: num(r[COL.atraso]) || 0,
    problema: /sim/i.test(String(r[COL.problemaPos] || "")),
    cancel: canc,
  };
}

module.exports = { COL, num, parseDataHoraMinutos, ehCancelado, linhaParaRegistro };

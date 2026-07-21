/* ============================================================================
 * Normalização de status da tela ao vivo (Sprint 2, Fase 5-6).
 * ----------------------------------------------------------------------------
 * Puro, sem I/O. Regra inegociável: o horário do EVENTO nunca é inventado a
 * partir do horário da OBSERVAÇÃO. Se a tela mostra "Pronto às 20:14", o
 * evento é 20:14 com confiança alta. Se só percebemos a mudança entre dois
 * ciclos, o evento fica com horário desconhecido e o intervalo observado é
 * declarado — nunca colapsado num instante fictício.
 * ==========================================================================*/
"use strict";

const { LIVE_ORDER_STATUS, LIVE_ORDER_STATUS_LIST, LIVE_TO_SPRINT1_STATUS } =
  require("../contracts/live-states");
const { CONFIDENCE } = require("../contracts/states");

/**
 * Texto bruto da tela -> status canônico ao vivo. Desconhecido é declarado,
 * nunca forçado para o vizinho mais parecido — um rótulo novo da plataforma
 * deve aparecer como `unknown` até alguém classificar, não silenciosamente
 * virar `preparing`.
 */
const RAW_TEXT_MAP = Object.freeze([
  [/^(novo|received|recebido|new|placed)$/i, LIVE_ORDER_STATUS.RECEIVED],
  [/^(aceito|accepted|confirmado|confirmed)$/i, LIVE_ORDER_STATUS.ACCEPTED],
  [/^(em preparo|preparando|preparing|in.?progress)$/i, LIVE_ORDER_STATUS.PREPARING],
  [/^(pronto|ready|concluded_prep)$/i, LIVE_ORDER_STATUS.READY],
  [/^(aguardando retirada|awaiting.?pickup|aguarda retirada)$/i, LIVE_ORDER_STATUS.AWAITING_PICKUP],
  [/^(retirado|picked.?up|coletado)$/i, LIVE_ORDER_STATUS.PICKED_UP],
  [/^(saiu para entrega|departed|a caminho|dispatched)$/i, LIVE_ORDER_STATUS.DEPARTED],
  [/^(entregue|concluido|concluded|completed|finalizado)$/i, LIVE_ORDER_STATUS.COMPLETED],
  [/^(cancelado|cancelled|canceled|declined|recusado)$/i, LIVE_ORDER_STATUS.CANCELLED]
]);

/** Texto bruto -> status canônico. Sem correspondência = `unknown`, nunca um palpite. */
function normalizeLiveStatus(rawText) {
  const s = String(rawText || "").trim();
  for (const [re, canon] of RAW_TEXT_MAP) {
    if (re.test(s)) return canon;
  }
  return LIVE_ORDER_STATUS.UNKNOWN;
}

/** Projeta o status ao vivo no vocabulário do Sprint 1 (com perda; ver contracts/live-states.js). */
function toSprint1Status(liveStatus) {
  return LIVE_TO_SPRINT1_STATUS[liveStatus] || "desconhecido";
}

/**
 * Constrói o evento de mudança de status entre duas observações do MESMO pedido.
 * Três casos, cada um com confiança própria — nunca promovido:
 *
 *   1. a tela já mostra o horário do evento ("Pronto às 20:14")
 *        -> event_time = 20:14, confidence = alta
 *   2. a tela não mostra horário, mas o status mudou entre dois ciclos
 *        -> event_time = null, observed_interval = [t_anterior, t_atual], confidence = media|baixa
 *   3. primeira observação do pedido já nesse status (sem "antes" para comparar)
 *        -> event_time = null, observed_interval = null, confidence = baixa
 *
 * @param {object} prev  observação anterior do pedido (ou null, se é a primeira)
 * @param {object} curr  observação atual {raw_status, screen_event_time, observed_at}
 */
function buildStatusEvent(prev, curr) {
  if (!curr) throw new Error("observacao_atual_obrigatoria");
  const status = normalizeLiveStatus(curr.raw_status);
  const changed = !prev || normalizeLiveStatus(prev.raw_status) !== status;

  const base = {
    status, raw_status: curr.raw_status, observed_at: curr.observed_at, changed
  };

  // Caso 1: a própria tela carimba o horário do evento.
  if (curr.screen_event_time) {
    return Object.assign(base, {
      event_time: curr.screen_event_time,
      event_time_source: "tela",
      observed_interval: null,
      confidence: CONFIDENCE.HIGH
    });
  }

  // Caso 3: sem observação anterior — não há intervalo para declarar.
  if (!prev) {
    return Object.assign(base, {
      event_time: null,
      event_time_source: "desconhecido",
      observed_interval: null,
      confidence: CONFIDENCE.LOW
    });
  }

  // Caso 2: mudança detectada entre ciclos, sem horário próprio na tela.
  if (changed) {
    return Object.assign(base, {
      event_time: null,
      event_time_source: "desconhecido",
      observed_interval: [prev.observed_at, curr.observed_at],
      // intervalo curto (um ciclo) inspira mais confiança que um intervalo longo
      // (ex.: depois de o coletor voltar de uma falha).
      confidence: prev.observed_at ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW
    });
  }

  return Object.assign(base, {
    event_time: null, event_time_source: "sem_mudanca", observed_interval: null, confidence: CONFIDENCE.HIGH
  });
}

module.exports = {
  LIVE_ORDER_STATUS, LIVE_ORDER_STATUS_LIST,
  normalizeLiveStatus, toSprint1Status, buildStatusEvent
};

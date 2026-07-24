/* ============================================================================
 * IfoodOrderSnapshot — estado RECONCILIADO de um pedido, projeção sobre o
 * histórico completo de envelopes já recebidos (nunca um estado mutável que
 * perde leitura anterior — mesmo princípio do conference-brain, reimplementado
 * de forma independente aqui).
 * ==========================================================================*/
"use strict";

const { EVENT_TYPES } = require("./event-types");

/**
 * Estado de produção derivado do último evento de progressão conhecido.
 * `CONFLICT` (mesma disciplina do Sprint 2.4 do conference-brain,
 * reimplementada aqui de forma independente): dois eventos de progressão
 * contraditórios no MESMO instante, sem metadado causal para desempatar,
 * nunca escolhem um lado arbitrariamente — viram conflito explícito.
 */
const ORDER_STATUS = Object.freeze({
  UNKNOWN: "unknown",
  PLACED: "placed",
  CONFIRMED: "confirmed",
  IN_PREPARATION: "in_preparation",
  READY_FOR_PICKUP: "ready_for_pickup",
  DISPATCHED: "dispatched",
  CONCLUDED: "concluded",
  CANCELLED: "cancelled",
  CONFLICT: "conflict"
});

const EVENT_TO_STATUS = Object.freeze({
  [EVENT_TYPES.ORDER_PLACED]: ORDER_STATUS.PLACED,
  [EVENT_TYPES.ORDER_CONFIRMED]: ORDER_STATUS.CONFIRMED,
  [EVENT_TYPES.ORDER_IN_PREPARATION]: ORDER_STATUS.IN_PREPARATION,
  [EVENT_TYPES.ORDER_READY_FOR_PICKUP]: ORDER_STATUS.READY_FOR_PICKUP,
  [EVENT_TYPES.ORDER_DISPATCHED]: ORDER_STATUS.DISPATCHED,
  [EVENT_TYPES.ORDER_CONCLUDED]: ORDER_STATUS.CONCLUDED,
  [EVENT_TYPES.ORDER_CANCELLED]: ORDER_STATUS.CANCELLED
});

/**
 * Constrói o snapshot vazio inicial de um pedido — nunca "adivinha" um
 * status; um pedido sem nenhum evento de progressão reconciliado fica
 * `unknown`, ponto. Formato já compatível com `contracts/schemas.js#ifood_order_snapshots`
 * (campos no nível raiz, não aninhados) — quem reconcilia pode persistir
 * o resultado diretamente, sem etapa de tradução.
 */
function emptyOrderSnapshot(orderId, opts) {
  const o = opts || {};
  return {
    order_id: orderId,
    external_order_id: o.externalOrderId || null,
    merchant_id: o.merchantId || null,
    order_status: ORDER_STATUS.UNKNOWN,
    order_status_history: [],
    last_event_id: null,
    last_reconciled_at: null,
    delivery: null,
    courier: null,
    packaging: null,
    schedule: null,
    provenance: []
  };
}

module.exports = { ORDER_STATUS, EVENT_TO_STATUS, emptyOrderSnapshot };

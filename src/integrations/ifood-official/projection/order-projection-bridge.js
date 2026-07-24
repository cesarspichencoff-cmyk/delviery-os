/* ============================================================================
 * IfoodOrderProjection -> MultidimensionalOrderObservation — PONTE FUTURA,
 * HIPÓTESE DE IMPLEMENTAÇÃO.
 * ----------------------------------------------------------------------------
 * NUNCA importado por `conference-brain/*` nesta missão, NUNCA ligado ao
 * observador de produção. Existe só como contrato + testes sintéticos,
 * documentando quais campos de um `IfoodOrderSnapshot` (API oficial)
 * PODERIAM alimentar as nove dimensões do modelo multidimensional já
 * aprovado (`docs/conference-brain/MULTIDIMENSIONAL_ORDER_STATE_V1.md`),
 * caso uma integração futura decida usar API em vez de (ou junto com) o
 * observador de tela. Ver `docs/integrations/ifood/IFOOD_HOMOLOGATION_NEXT_STEPS.md`.
 * ==========================================================================*/
"use strict";

const { ORDER_STATUS } = require("../contracts/order-snapshot");

/** Hipótese de mapeamento order_status (API) -> order_state (modelo multidimensional). */
const ORDER_STATUS_TO_ORDER_STATE_HINT = Object.freeze({
  [ORDER_STATUS.UNKNOWN]: "unknown",
  [ORDER_STATUS.PLACED]: "received",
  [ORDER_STATUS.CONFIRMED]: "accepted",
  [ORDER_STATUS.IN_PREPARATION]: "preparing",
  [ORDER_STATUS.READY_FOR_PICKUP]: "ready",
  [ORDER_STATUS.DISPATCHED]: "ready", // API nao distingue "pronto" de "despachado" no order_state -- despacho vira dispatch_state, nao order_state
  [ORDER_STATUS.CONCLUDED]: "finalized",
  [ORDER_STATUS.CANCELLED]: "cancelled",
  [ORDER_STATUS.CONFLICT]: "unknown" // conflito nunca vira um palpite de estado -- fica unknown
});

const TERMINAL_ORDER_STATUS = new Set([ORDER_STATUS.CONCLUDED, ORDER_STATUS.CANCELLED]);

/**
 * @param {object} snapshot  um `IfoodOrderSnapshot` (reconciliation/reconciler.js)
 * @returns {object} sugestão de campos por dimensão -- nunca aplicada
 *   automaticamente a nada; um humano decide se/quando ligar isto a um
 *   observador real.
 */
function projectToMultidimensionalHint(snapshot) {
  const s = snapshot || {};
  const orderStatus = s.order_status || ORDER_STATUS.UNKNOWN;
  return {
    order_state_hint: ORDER_STATUS_TO_ORDER_STATE_HINT[orderStatus] || "unknown",
    // A API não expõe conceito de "botão disponível na tela" -- isso é
    // estrutural da INTERFACE do Gestor, não do modelo de dados da API.
    // Nunca inventado aqui; fica null até uma fonte real justificar algo.
    readiness_state_hint: null,
    courier_state_hint: s.courier ? (s.courier.status || "unknown") : "not_applicable",
    dispatch_state_hint: s.delivery ? (s.delivery.dispatch_type || "unknown") : "unknown",
    completion_state_hint: TERMINAL_ORDER_STATUS.has(orderStatus)
      ? (orderStatus === ORDER_STATUS.CANCELLED ? "cancelled" : "completed")
      : (orderStatus === ORDER_STATUS.UNKNOWN ? "unknown" : "active"),
    fulfillment_mode_hint: s.delivery ? (s.delivery.dispatch_type || "unknown") : "unknown",
    schedule_hint: s.schedule || null,
    // Agrupamento (mesmo entregador, mesmo horário) não tem campo
    // documentado conhecido na API oficial -- hipótese em aberto, nunca
    // um palpite.
    grouping_hint: null,
    indicators_hint: []
  };
}

module.exports = { ORDER_STATUS_TO_ORDER_STATE_HINT, projectToMultidimensionalHint };

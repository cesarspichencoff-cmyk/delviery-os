/* ============================================================================
 * Mapeamento payload externo -> entrada do envelope — HIPÓTESE DE
 * IMPLEMENTAÇÃO, nunca verificada contra uma resposta real da API.
 * ----------------------------------------------------------------------------
 * Único lugar onde um `code` bruto do provedor vira um `EVENT_TYPES`
 * interno. Código desconhecido NUNCA é forçado para o mais parecido — vira
 * `EVENT_TYPES.UNKNOWN`, declarado, nunca um palpite (mesmo princípio de
 * `status-map.js` do conference-brain).
 * ==========================================================================*/
"use strict";

const { EVENT_TYPES } = require("../contracts/event-types");

/** code bruto hipotético -> EVENT_TYPES interno. */
const CODE_MAP = Object.freeze({
  PLACED: EVENT_TYPES.ORDER_PLACED,
  CONFIRMED: EVENT_TYPES.ORDER_CONFIRMED,
  PREPARATION_STARTED: EVENT_TYPES.ORDER_IN_PREPARATION,
  READY_TO_PICKUP: EVENT_TYPES.ORDER_READY_FOR_PICKUP,
  DISPATCHED: EVENT_TYPES.ORDER_DISPATCHED,
  CONCLUDED: EVENT_TYPES.ORDER_CONCLUDED,
  CANCELLED: EVENT_TYPES.ORDER_CANCELLED,
  CANCELLATION_REQUESTED: EVENT_TYPES.CANCELLATION_REQUESTED,
  DISPUTE_OPENED: EVENT_TYPES.DISPUTE_OPENED,
  DISPUTE_RESOLVED: EVENT_TYPES.DISPUTE_RESOLVED,
  COURIER_ASSIGNED: EVENT_TYPES.COURIER_ASSIGNED,
  COURIER_ARRIVED_AT_MERCHANT: EVENT_TYPES.COURIER_ARRIVED_AT_MERCHANT,
  COURIER_PICKED_UP: EVENT_TYPES.COURIER_PICKED_UP,
  COURIER_ARRIVED_AT_DESTINATION: EVENT_TYPES.COURIER_ARRIVED_AT_DESTINATION,
  COURIER_DELIVERED: EVENT_TYPES.COURIER_DELIVERED,
  SCHEDULED_ORDER_CONFIRMED: EVENT_TYPES.SCHEDULED_ORDER_CONFIRMED,
  MERCHANT_STATUS_CHANGED: EVENT_TYPES.MERCHANT_STATUS_CHANGED
});

/**
 * @param {object} raw   payload bruto hipotético de um evento (webhook OU
 *   polling — mesma forma de entrada para as duas fontes, por desenho):
 *   { id, code, orderId, merchantId, createdAt, schemaVersion }
 * @param {"webhook"|"polling"} source
 * @returns {object} entrada pronta para `contracts/envelope.js#buildEventEnvelope`
 */
function mapExternalEventPayload(raw, source) {
  const r = raw || {};
  return {
    externalEventId: r.id != null ? String(r.id) : null,
    eventType: CODE_MAP[r.code] || EVENT_TYPES.UNKNOWN,
    externalCode: r.code || null,
    merchantId: r.merchantId != null ? String(r.merchantId) : null,
    orderId: r.orderId != null ? String(r.orderId) : null,
    occurredAt: r.createdAt || null,
    receivedAt: new Date().toISOString(),
    source,
    schemaVersion: r.schemaVersion || "v0",
    rawPayload: r
  };
}

module.exports = { CODE_MAP, mapExternalEventPayload };

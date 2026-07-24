/* ============================================================================
 * IfoodNegotiationAction — contrato de forma para ações de negociação
 * estruturada (cancelamento, prazo, item faltante, proposta alternativa,
 * reembolso estruturado, disputa). Regra inegociável da missão: toda ação
 * NASCE `prepared` e só avança para `authorized` por autorização humana
 * EXPLÍCITA — nunca automática. A máquina de estados que aplica essa regra
 * vive em `negotiation/negotiation-engine.js`; este arquivo só define a
 * FORMA do dado, sem lógica de transição.
 * ==========================================================================*/
"use strict";

const NEGOTIATION_ACTION_TYPES = Object.freeze({
  CANCELLATION: "cancellation",
  DEADLINE_EXTENSION_REQUEST: "deadline_extension_request",
  STRUCTURED_RESPONSE: "structured_response",
  MISSING_ITEM_REPORT: "missing_item_report",
  ALTERNATIVE_PROPOSAL: "alternative_proposal",
  STRUCTURED_REFUND: "structured_refund",
  DISPUTE_RESPONSE: "dispute_response"
});
const NEGOTIATION_ACTION_TYPE_LIST = Object.freeze(Object.values(NEGOTIATION_ACTION_TYPES));

const NEGOTIATION_STATUS = Object.freeze({
  PREPARED: "prepared", AUTHORIZED: "authorized", SENT: "sent",
  CONFIRMED: "confirmed", REJECTED: "rejected", EXPIRED: "expired", CANCELLED: "cancelled"
});

/**
 * @param {object} raw
 *   actionType         um de NEGOTIATION_ACTION_TYPES
 *   orderId
 *   proposedPayload     conteúdo estruturado da proposta (nunca texto livre não sanitizado)
 *   createdAt
 */
function buildNegotiationAction(raw) {
  const r = raw || {};
  if (!NEGOTIATION_ACTION_TYPE_LIST.includes(r.actionType)) return null;
  if (!r.orderId) return null;
  const crypto = require("crypto");
  return {
    action_id: null, // atribuído pelo engine na preparação
    order_id: r.orderId,
    action_type: r.actionType,
    status: NEGOTIATION_STATUS.PREPARED, // SEMPRE nasce assim — nunca outro valor aqui
    proposed_payload_hash: r.proposedPayload !== undefined
      ? crypto.createHash("sha256").update(JSON.stringify(r.proposedPayload)).digest("hex") : null,
    created_at: r.createdAt || null,
    authorized_at: null,
    authorized_by: null
  };
}

module.exports = { NEGOTIATION_ACTION_TYPES, NEGOTIATION_ACTION_TYPE_LIST, NEGOTIATION_STATUS, buildNegotiationAction };

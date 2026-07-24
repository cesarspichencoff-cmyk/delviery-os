/* ============================================================================
 * Motor de negociação estruturada — cancelamento, prazo, item faltante,
 * proposta alternativa, reembolso estruturado, resposta a disputa.
 * ----------------------------------------------------------------------------
 * Regra dura da missão: toda ação NASCE `prepared`; só avança para
 * `authorized` com identificação EXPLÍCITA de quem autoriza. Nunca chat
 * livre, nunca decisão financeira executada aqui — este módulo só prepara
 * e rastreia a AÇÃO estruturada; enviá-la de verdade é responsabilidade da
 * outbox/adapter, fora do escopo desta missão.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { buildNegotiationAction, NEGOTIATION_STATUS } = require("../contracts/negotiation");

const VALID_NEXT = Object.freeze({
  [NEGOTIATION_STATUS.PREPARED]: [NEGOTIATION_STATUS.AUTHORIZED, NEGOTIATION_STATUS.REJECTED, NEGOTIATION_STATUS.EXPIRED, NEGOTIATION_STATUS.CANCELLED],
  [NEGOTIATION_STATUS.AUTHORIZED]: [NEGOTIATION_STATUS.SENT, NEGOTIATION_STATUS.CANCELLED, NEGOTIATION_STATUS.EXPIRED],
  [NEGOTIATION_STATUS.SENT]: [NEGOTIATION_STATUS.CONFIRMED, NEGOTIATION_STATUS.REJECTED, NEGOTIATION_STATUS.EXPIRED],
  [NEGOTIATION_STATUS.CONFIRMED]: [],
  [NEGOTIATION_STATUS.REJECTED]: [],
  [NEGOTIATION_STATUS.EXPIRED]: [],
  [NEGOTIATION_STATUS.CANCELLED]: []
});

function createNegotiationEngine(store) {
  function prepare(raw) {
    const r = Object.assign({}, raw, { createdAt: (raw && raw.createdAt) || new Date().toISOString() });
    const built = buildNegotiationAction(r);
    if (!built) return { ok: false, reason: "acao_invalida" };
    const actionId = crypto.createHash("sha256")
      .update(JSON.stringify({ t: built.action_type, o: built.order_id, p: built.proposed_payload_hash, n: crypto.randomBytes(8).toString("hex") }))
      .digest("hex").slice(0, 32);
    const record = Object.assign({}, built, { action_id: actionId });
    const putRes = store.put("ifood_negotiation_actions", record);
    return { ok: putRes.ok, record, put: putRes };
  }

  function transition(actionId, nextStatus, extra) {
    const existing = store.get("ifood_negotiation_actions", actionId);
    if (!existing) return { ok: false, reason: "acao_nao_encontrada" };
    if (existing.status === nextStatus) return { ok: true, record: existing, idempotent: true };
    const allowed = VALID_NEXT[existing.status] || [];
    if (!allowed.includes(nextStatus)) return { ok: false, reason: `transicao_invalida:${existing.status}->${nextStatus}` };
    const updated = Object.assign({}, existing, { status: nextStatus }, extra || {});
    const putRes = store.put("ifood_negotiation_actions", updated);
    return putRes.ok
      ? { ok: true, record: updated, idempotent: false }
      : { ok: false, reason: "escrita_rejeitada:" + (putRes.errors || []).join(","), record: existing };
  }

  /** Autorização humana explícita — regra dura, nunca automática. */
  function authorize(actionId, authorizedBy) {
    if (!authorizedBy) return { ok: false, reason: "autorizacao_requer_identificacao_de_quem_autoriza" };
    return transition(actionId, NEGOTIATION_STATUS.AUTHORIZED, { authorized_by: authorizedBy, authorized_at: new Date().toISOString() });
  }

  function markSent(actionId) { return transition(actionId, NEGOTIATION_STATUS.SENT, {}); }
  function markConfirmed(actionId) { return transition(actionId, NEGOTIATION_STATUS.CONFIRMED, {}); }
  function markRejected(actionId) { return transition(actionId, NEGOTIATION_STATUS.REJECTED, {}); }
  function cancel(actionId) { return transition(actionId, NEGOTIATION_STATUS.CANCELLED, {}); }
  function markExpired(actionId) { return transition(actionId, NEGOTIATION_STATUS.EXPIRED, {}); }

  function get(actionId) { return store.get("ifood_negotiation_actions", actionId); }
  function all() { return store.all("ifood_negotiation_actions"); }

  return { prepare, authorize, markSent, markConfirmed, markRejected, cancel, markExpired, get, all };
}

module.exports = { createNegotiationEngine, VALID_NEXT };

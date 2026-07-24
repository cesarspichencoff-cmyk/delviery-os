/* ============================================================================
 * Outbox persistente de ações futuras — append-only via storage/store.js.
 * ----------------------------------------------------------------------------
 * NESTA MISSÃO NENHUMA AÇÃO É ENVIADA EXTERNAMENTE. `markSending()` existe
 * como transição de estado para uso futuro (quando um adapter real
 * existir); nenhum código aqui chama rede, nenhum teste depende de I/O
 * externo. Idempotência pela `idempotency_key` fornecida por quem chama
 * (chave natural do schema) — preparar a MESMA ação duas vezes devolve o
 * registro existente, nunca cria um segundo.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");

const OUTBOX_STATUS = Object.freeze({
  PREPARED: "prepared", AUTHORIZED: "authorized", PENDING: "pending", SENDING: "sending",
  CONFIRMED: "confirmed", RETRYABLE_FAILURE: "retryable_failure",
  PERMANENT_FAILURE: "permanent_failure", CANCELLED: "cancelled", EXPIRED: "expired"
});

const TERMINAL_STATUS = Object.freeze([
  OUTBOX_STATUS.CONFIRMED, OUTBOX_STATUS.PERMANENT_FAILURE, OUTBOX_STATUS.CANCELLED, OUTBOX_STATUS.EXPIRED
]);

/** Transições estruturalmente válidas — nunca decide SE deve acontecer, só SE é possível. */
const VALID_NEXT = Object.freeze({
  [OUTBOX_STATUS.PREPARED]: [OUTBOX_STATUS.AUTHORIZED, OUTBOX_STATUS.CANCELLED, OUTBOX_STATUS.EXPIRED],
  [OUTBOX_STATUS.AUTHORIZED]: [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.CANCELLED, OUTBOX_STATUS.EXPIRED],
  [OUTBOX_STATUS.PENDING]: [OUTBOX_STATUS.SENDING, OUTBOX_STATUS.CANCELLED, OUTBOX_STATUS.EXPIRED],
  [OUTBOX_STATUS.SENDING]: [OUTBOX_STATUS.CONFIRMED, OUTBOX_STATUS.RETRYABLE_FAILURE, OUTBOX_STATUS.PERMANENT_FAILURE],
  [OUTBOX_STATUS.RETRYABLE_FAILURE]: [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.PERMANENT_FAILURE, OUTBOX_STATUS.EXPIRED],
  [OUTBOX_STATUS.CONFIRMED]: [],
  [OUTBOX_STATUS.PERMANENT_FAILURE]: [],
  [OUTBOX_STATUS.CANCELLED]: [],
  [OUTBOX_STATUS.EXPIRED]: []
});

function actionId(idempotencyKey) {
  return crypto.createHash("sha256").update(String(idempotencyKey)).digest("hex").slice(0, 32);
}

function createOutbox(store) {
  /**
   * @param {object} raw
   *   idempotencyKey     obrigatório — identidade real da AÇÃO, não do envelope
   *   actionType, merchantId, orderId, dependency, createdAt
   *   payload              usado só para hash (nunca persistido inteiro)
   */
  function prepare(raw) {
    const r = raw || {};
    if (!r.idempotencyKey) return { ok: false, reason: "idempotency_key_obrigatoria" };
    const key = String(r.idempotencyKey);
    const existing = store.get("ifood_events_outbox", key);
    if (existing) return { ok: true, status: existing.status, record: existing, idempotent: true };

    const record = {
      action_id: actionId(key),
      idempotency_key: key,
      action_type: r.actionType || "unknown",
      merchant_id: r.merchantId || null,
      order_id: r.orderId || null,
      created_at: r.createdAt || new Date().toISOString(),
      next_attempt_at: null,
      attempt_count: 0,
      status: OUTBOX_STATUS.PREPARED,
      dependency: r.dependency || null,
      payload_hash: r.payload !== undefined
        ? crypto.createHash("sha256").update(JSON.stringify(r.payload)).digest("hex") : null,
      response_reference: null,
      failure_category: null
    };
    const putRes = store.put("ifood_events_outbox", record);
    return { ok: putRes.ok, status: record.status, record, idempotent: false };
  }

  /** Transição estrutural genérica — recusa qualquer salto fora de VALID_NEXT. */
  function transition(idempotencyKey, nextStatus, extra) {
    const existing = store.get("ifood_events_outbox", String(idempotencyKey));
    if (!existing) return { ok: false, reason: "acao_nao_encontrada" };
    const allowed = VALID_NEXT[existing.status] || [];
    if (existing.status === nextStatus) return { ok: true, record: existing, idempotent: true };
    if (!allowed.includes(nextStatus)) {
      return { ok: false, reason: `transicao_invalida:${existing.status}->${nextStatus}` };
    }
    const updated = Object.assign({}, existing, { status: nextStatus }, extra || {});
    const putRes = store.put("ifood_events_outbox", updated);
    // Nunca devolve um registro que não foi de fato persistido -- se a
    // escrita foi rejeitada (ex.: schema), o estado real continua sendo o
    // `existing` anterior, não o `updated` que só existia como tentativa.
    return putRes.ok
      ? { ok: true, record: updated, idempotent: false }
      : { ok: false, reason: "escrita_rejeitada:" + (putRes.errors || []).join(","), record: existing };
  }

  /** Autorização humana explícita — nunca automática (regra dura da missão). */
  function authorize(idempotencyKey, authorizedBy) {
    if (!authorizedBy) return { ok: false, reason: "autorizacao_requer_identificacao_de_quem_autoriza" };
    return transition(idempotencyKey, OUTBOX_STATUS.AUTHORIZED, { authorized_by: authorizedBy, authorized_at: new Date().toISOString() });
  }

  function markPending(idempotencyKey, nextAttemptAt) {
    return transition(idempotencyKey, OUTBOX_STATUS.PENDING, { next_attempt_at: nextAttemptAt || null });
  }

  /**
   * Marca como "enviando" -- NUNCA envia de verdade. Existe só como
   * transição de estado para um adapter real usar no futuro; nesta missão
   * nada chama rede a partir daqui.
   */
  function markSending(idempotencyKey) {
    const existing = store.get("ifood_events_outbox", String(idempotencyKey));
    const attemptCount = existing ? (existing.attempt_count || 0) + 1 : 1;
    return transition(idempotencyKey, OUTBOX_STATUS.SENDING, { attempt_count: attemptCount });
  }

  function markConfirmed(idempotencyKey, responseReference) {
    return transition(idempotencyKey, OUTBOX_STATUS.CONFIRMED, { response_reference: responseReference || null });
  }

  function markRetryableFailure(idempotencyKey, failureCategory) {
    return transition(idempotencyKey, OUTBOX_STATUS.RETRYABLE_FAILURE, { failure_category: failureCategory || "desconhecida" });
  }

  function markPermanentFailure(idempotencyKey, failureCategory) {
    return transition(idempotencyKey, OUTBOX_STATUS.PERMANENT_FAILURE, { failure_category: failureCategory || "desconhecida" });
  }

  function cancel(idempotencyKey) { return transition(idempotencyKey, OUTBOX_STATUS.CANCELLED, {}); }
  function markExpired(idempotencyKey) { return transition(idempotencyKey, OUTBOX_STATUS.EXPIRED, {}); }

  function pending() {
    return store.all("ifood_events_outbox").filter((r) => !TERMINAL_STATUS.includes(r.status));
  }

  function all() { return store.all("ifood_events_outbox"); }
  function get(idempotencyKey) { return store.get("ifood_events_outbox", String(idempotencyKey)); }

  return {
    prepare, authorize, markPending, markSending, markConfirmed,
    markRetryableFailure, markPermanentFailure, cancel, markExpired,
    pending, all, get, OUTBOX_STATUS
  };
}

module.exports = { createOutbox, OUTBOX_STATUS, VALID_NEXT, TERMINAL_STATUS };

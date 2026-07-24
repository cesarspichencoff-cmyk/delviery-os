/* ============================================================================
 * Inbox persistente de eventos recebidos — append-only via storage/store.js.
 * ----------------------------------------------------------------------------
 * Idempotência pela IDENTIDADE REAL do evento (envelope.js#eventIdentityKey
 * -> internal_event_id), nunca por posição/ordem de chegada. Payload
 * desconhecido (não bate com o contrato de envelope) vai para quarentena —
 * nunca é descartado, nunca trava o processamento dos demais. Nenhum campo
 * de PII é aceito aqui (contracts/schemas.js recusa via FORBIDDEN_FIELDS).
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { buildEventEnvelope, sha256 } = require("../contracts/envelope");

/**
 * Versões de schema de payload que esta integração sabe interpretar.
 * Uma versão fora daqui nunca é adivinhada/coagida — vai para quarentena
 * (mesma disciplina de "desconhecido é declarado, nunca forçado" de
 * `status-map.js` do conference-brain).
 */
const KNOWN_SCHEMA_VERSIONS = Object.freeze(["v0", "v1"]);

const PROCESSING_STATUS = Object.freeze({
  RECEIVED: "received", VALIDATED: "validated", NORMALIZED: "normalized",
  PROCESSED: "processed", ACKNOWLEDGED: "acknowledged", DUPLICATED: "duplicated",
  QUARANTINED: "quarantined", FAILED: "failed", EXPIRED: "expired"
});

/** Estados que significam "este evento não precisa mais de ação" — fora do backlog. */
const TERMINAL_STATUS = Object.freeze([
  PROCESSING_STATUS.ACKNOWLEDGED, PROCESSING_STATUS.QUARANTINED, PROCESSING_STATUS.EXPIRED
]);

function quarantineId(raw) {
  const seed = JSON.stringify({
    t: raw.eventType || null, m: raw.merchantId || null, o: raw.orderId || null,
    s: raw.source || null, r: raw.receivedAt || null, n: crypto.randomBytes(8).toString("hex")
  });
  return sha256(seed).slice(0, 32);
}

function createInbox(store) {
  /**
   * Recebe UM evento bruto (já no formato de entrada de
   * `buildEventEnvelope` — a normalização do payload externo real acontece
   * antes disso, na fronteira do receiver de polling/webhook). Nunca
   * lança; sempre devolve um status determinístico.
   */
  function quarantine(r, reason) {
    const record = {
      internal_event_id: quarantineId(r),
      external_event_id: r.externalEventId || null,
      event_type: r.eventType || "unknown",
      source: r.source || "unknown",
      received_at: r.receivedAt || new Date().toISOString(),
      payload_hash: r.rawPayload !== undefined ? sha256(r.rawPayload) : null,
      schema_version: r.schemaVersion || "v0",
      processing_status: PROCESSING_STATUS.QUARANTINED,
      retry_count: 0,
      quarantine_reason: reason,
      merchant_id: r.merchantId || null,
      order_id: r.orderId || null,
      occurred_at: r.occurredAt || null
    };
    const putRes = store.put("ifood_events_inbox", record);
    return { ok: putRes.ok, status: PROCESSING_STATUS.QUARANTINED, record, put: putRes };
  }

  function receive(raw) {
    const r = raw || {};
    const built = buildEventEnvelope(r);

    if (!built.ok) return quarantine(r, built.errors.join(","));

    // Versão de schema que esta integração não sabe interpretar -- nunca
    // adivinha o formato, vai para quarentena declarada.
    if (!KNOWN_SCHEMA_VERSIONS.includes(built.envelope.schema_version)) {
      return quarantine(r, "schema_version_desconhecida:" + built.envelope.schema_version);
    }

    const existing = store.get("ifood_events_inbox", built.envelope.internal_event_id);
    if (existing) {
      // Mesma identidade real -> retry de entrega (webhook repetido, ou
      // webhook+polling do mesmo fato). NUNCA regride o estado de
      // processamento já alcançado -- só relata que foi visto de novo.
      return { ok: true, status: PROCESSING_STATUS.DUPLICATED, record: existing, duplicate_of: existing.internal_event_id };
    }

    const record = {
      internal_event_id: built.envelope.internal_event_id,
      external_event_id: built.envelope.external_event_id,
      identity_key: built.envelope.identity_key,
      event_type: built.envelope.event_type,
      merchant_id: built.envelope.merchant_id,
      order_id: built.envelope.order_id,
      source: built.envelope.source,
      received_at: built.envelope.received_at,
      occurred_at: built.envelope.occurred_at,
      payload_hash: built.envelope.payload_hash,
      schema_version: built.envelope.schema_version,
      processing_status: PROCESSING_STATUS.RECEIVED,
      retry_count: 0
    };
    const putRes = store.put("ifood_events_inbox", record);
    return { ok: putRes.ok, status: putRes.ok ? PROCESSING_STATUS.RECEIVED : "rejected", record, put: putRes };
  }

  /** Avança o estado de processamento de UM evento já recebido. Nunca cria um registro novo. */
  function markStatus(internalEventId, status, extra) {
    const existing = store.get("ifood_events_inbox", internalEventId);
    if (!existing) return { ok: false, reason: "evento_nao_encontrado" };
    const updated = Object.assign({}, existing, { processing_status: status }, extra || {});
    const putRes = store.put("ifood_events_inbox", updated);
    return { ok: putRes.ok, record: updated };
  }

  /** Falha de processamento -- incrementa retry_count, registra categoria, nunca some o evento. */
  function markFailed(internalEventId, errorCategory) {
    const existing = store.get("ifood_events_inbox", internalEventId);
    if (!existing) return { ok: false, reason: "evento_nao_encontrado" };
    return markStatus(internalEventId, PROCESSING_STATUS.FAILED, {
      retry_count: (existing.retry_count || 0) + 1,
      last_error_category: errorCategory || "desconhecido"
    });
  }

  /** Eventos que ainda precisam de alguma ação -- nunca inclui os já encerrados. */
  function pending() {
    return store.all("ifood_events_inbox").filter((r) => !TERMINAL_STATUS.includes(r.processing_status));
  }

  function all() { return store.all("ifood_events_inbox"); }
  function get(internalEventId) { return store.get("ifood_events_inbox", internalEventId); }

  return { receive, markStatus, markFailed, pending, all, get, PROCESSING_STATUS };
}

module.exports = { createInbox, PROCESSING_STATUS, TERMINAL_STATUS, KNOWN_SCHEMA_VERSIONS };

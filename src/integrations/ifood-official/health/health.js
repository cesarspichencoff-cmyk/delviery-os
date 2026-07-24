/* ============================================================================
 * IfoodIntegrationHealth — projeção de saúde, SÓ DIAGNÓSTICO LOCAL. Nunca
 * altera nenhum painel operacional de produção existente (Conference
 * Brain, Copiloto, Capacidade Viva) — módulo isolado, próprio desta
 * integração.
 * ==========================================================================*/
"use strict";

const { PROCESSING_STATUS } = require("../inbox/inbox");

/**
 * @param {object} deps
 *   inbox            obrigatório
 *   outbox            opcional
 *   authState          "absent"|"valid"|"expiring_soon"|"expired"|"error" (contracts/auth.js#TOKEN_STATE)
 *   pollingStatus        "unknown"|"active"|"stalled"|"stopped" -- informado por quem agenda o polling
 *   webhookStatus          idem, para o webhook
 *   anomalies[]              anomalias agregadas de chamadas ao reconciliador (opcional)
 *   now
 */
function buildIntegrationHealth(deps) {
  const d = deps || {};
  const inbox = d.inbox;
  const outbox = d.outbox;
  const now = d.now || new Date().toISOString();

  const events = inbox ? inbox.all() : [];
  const receivedTimes = events.map((e) => e.received_at).filter(Boolean).sort();
  const processedTimes = events
    .filter((e) => [PROCESSING_STATUS.PROCESSED, PROCESSING_STATUS.ACKNOWLEDGED].includes(e.processing_status))
    .map((e) => e.received_at).filter(Boolean).sort();

  const inboxStats = inbox && typeof inbox.stats === "function" ? inbox.stats() : { duplicates_seen: 0 };
  const anomalies = Array.isArray(d.anomalies) ? d.anomalies : [];

  return {
    generated_at: now,
    last_event_received_at: receivedTimes.length ? receivedTimes[receivedTimes.length - 1] : null,
    last_event_processed_at: processedTimes.length ? processedTimes[processedTimes.length - 1] : null,
    inbox_backlog: inbox ? inbox.pending().length : 0,
    quarantine_count: events.filter((e) => e.processing_status === PROCESSING_STATUS.QUARANTINED).length,
    failure_count: events.filter((e) => e.processing_status === PROCESSING_STATUS.FAILED).length,
    auth_status: d.authState || "absent",
    polling_status: d.pollingStatus || "unknown",
    webhook_status: d.webhookStatus || "unknown",
    unresolved_merchants: new Set(events.filter((e) => !e.merchant_id).map((e) => e.internal_event_id)).size,
    duplicate_event_count: inboxStats.duplicates_seen || 0,
    out_of_order_event_count: anomalies.filter((a) => a.type === "regressao_de_progresso" || a.type === "empate_temporal_conflitante").length,
    outbox_pending_count: outbox ? outbox.pending().length : 0
  };
}

module.exports = { buildIntegrationHealth };

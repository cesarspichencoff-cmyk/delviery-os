/* ============================================================================
 * IfoodEventAcknowledgement — confirmação ENVIADA ao provedor de que um
 * evento foi recebido/processado. Nesta missão, nunca enviada de verdade
 * (ver outbox/ — toda confirmação fica em `prepared`/`pending`, nunca sai).
 * ==========================================================================*/
"use strict";

/**
 * @param {object} raw
 *   externalEventId   evento que está sendo confirmado
 *   status              "confirmed" | "failed"
 *   attempt              número da tentativa (1-based)
 *   responseReference     referência opaca da resposta do provedor (nunca o corpo bruto)
 */
function buildAcknowledgement(raw) {
  const r = raw || {};
  if (!r.externalEventId) return null;
  return {
    ack_id: null, // atribuído pela outbox no momento da preparação
    external_event_id: r.externalEventId,
    acknowledged_at: r.acknowledgedAt || null,
    status: r.status === "failed" ? "failed" : "confirmed",
    attempt: r.attempt || 1,
    response_reference: r.responseReference || null
  };
}

module.exports = { buildAcknowledgement };

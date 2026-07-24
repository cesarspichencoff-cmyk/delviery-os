/* ============================================================================
 * IfoodIntegrationHealth — forma do relatório de saúde. A lógica que
 * calcula estes campos a partir de inbox/outbox/auth vive em
 * `health/health.js`; este arquivo só define a FORMA.
 * ==========================================================================*/
"use strict";

function emptyIntegrationHealth(generatedAt) {
  return {
    generated_at: generatedAt || null,
    last_event_received_at: null,
    last_event_processed_at: null,
    inbox_backlog: 0,
    quarantine_count: 0,
    failure_count: 0,
    auth_status: "absent",
    polling_status: "unknown",
    webhook_status: "unknown",
    unresolved_merchants: 0,
    duplicate_event_count: 0,
    out_of_order_event_count: 0,
    outbox_pending_count: 0
  };
}

module.exports = { emptyIntegrationHealth };

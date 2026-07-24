/* ============================================================================
 * Registro de schemas da integração oficial — independente do
 * `conference-brain/contracts/schemas.js` (nenhum require cruzado, por
 * desenho — ver docs/integrations/ifood/IFOOD_EXISTING_ASSETS_INVENTORY.md §3.1).
 * ----------------------------------------------------------------------------
 * Mesmo estilo do conference-brain (nunca lança, devolve {ok, errors[]}),
 * porque é um padrão comprovado — mas reimplementado, não importado.
 * ==========================================================================*/
"use strict";

const FORBIDDEN_FIELDS = Object.freeze([
  "customer_name", "customer_phone", "customer_address", "customer_note",
  "raw_token", "raw_secret", "cookie", "session_token"
]);

const SCHEMAS = Object.freeze({
  ifood_events_inbox: {
    key: ["internal_event_id"],
    required: ["internal_event_id", "external_event_id", "event_type", "source",
               "received_at", "payload_hash", "schema_version", "processing_status"],
    optional: ["merchant_id", "order_id", "occurred_at", "retry_count",
               "last_error_category", "quarantine_reason", "identity_key"]
  },
  ifood_events_outbox: {
    key: ["idempotency_key"],
    required: ["action_id", "idempotency_key", "action_type", "created_at", "status"],
    optional: ["merchant_id", "order_id", "next_attempt_at", "attempt_count",
               "dependency", "payload_hash", "response_reference", "failure_category"]
  },
  ifood_order_snapshots: {
    key: ["order_id"],
    required: ["order_id", "order_status", "last_reconciled_at"],
    optional: ["external_order_id", "merchant_id", "last_event_id", "order_status_history",
               "delivery", "courier", "packaging", "schedule", "provenance"]
  },
  ifood_negotiation_actions: {
    key: ["action_id"],
    required: ["action_id", "order_id", "action_type", "status", "created_at"],
    optional: ["proposed_payload_hash", "authorized_at", "authorized_by"]
  },
  ifood_packaging_capabilities: {
    key: ["merchant_id", "capability"],
    required: ["merchant_id", "capability", "state"],
    optional: ["evidence_refs", "last_checked_at"]
  },
  ifood_integration_health_snapshots: {
    key: ["generated_at"],
    required: ["generated_at"],
    optional: ["last_event_received_at", "last_event_processed_at", "inbox_backlog",
               "quarantine_count", "failure_count", "auth_status", "polling_status",
               "webhook_status", "unresolved_merchants", "duplicate_event_count",
               "out_of_order_event_count", "outbox_pending_count"]
  }
});

function naturalKey(entity, record) {
  const schema = SCHEMAS[entity];
  if (!schema) return null;
  return schema.key.map((k) => String(record[k])).join("|");
}

function validate(entity, record) {
  const schema = SCHEMAS[entity];
  if (!schema) return { ok: false, errors: ["schema_desconhecido:" + entity] };
  if (!record || typeof record !== "object") return { ok: false, errors: ["registro_invalido"] };

  const errors = [];
  for (const f of schema.required) {
    if (record[f] === undefined || record[f] === null || record[f] === "") {
      errors.push("campo_obrigatorio_ausente:" + f);
    }
  }
  const known = new Set([].concat(schema.required, schema.optional || []));
  for (const f of Object.keys(record)) {
    if (!known.has(f)) errors.push("campo_desconhecido:" + f);
    if (FORBIDDEN_FIELDS.includes(f)) errors.push("campo_proibido_pii:" + f);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { SCHEMAS, naturalKey, validate, FORBIDDEN_FIELDS };

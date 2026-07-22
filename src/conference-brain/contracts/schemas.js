/* ============================================================================
 * Contratos de dados do cérebro da Conferência (Sprint 1).
 * ----------------------------------------------------------------------------
 * Validação leve e sem dependência externa (o repo tem zero deps de runtime).
 * Cada schema declara campos obrigatórios, opcionais e a chave natural usada
 * para idempotência/dedup.
 *
 * Privacidade: nenhum schema carrega dado pessoal de cliente. Endereço, nome,
 * telefone e mensagens pessoais NÃO entram no banco operacional nesta fase.
 * ==========================================================================*/
"use strict";

const S = require("./states");
const L = require("./live-states");

/** Campos que jamais devem ser persistidos (guarda ativa contra PII). */
const FORBIDDEN_FIELDS = Object.freeze([
  "customer_name", "cliente_nome", "customer_phone", "telefone", "phone",
  "address", "endereco", "customer_document", "cpf", "email",
  "message_text", "mensagem", "chat_text"
]);

const SCHEMAS = Object.freeze({
  ingestion_runs: {
    key: ["run_id"],
    required: ["run_id", "source", "started_at", "collector_version", "status"],
    optional: ["finished_at", "observed_count", "normalized_count", "rejected_count",
               "duplicate_count", "error", "checkpoint", "dry_run"]
  },
  ingestion_raw_records: {
    key: ["record_id"],
    required: ["record_id", "run_id", "source", "observed_at", "payload_hash", "parser_version", "status"],
    optional: ["external_id", "type", "raw_ref", "raw", "processing_note"]
  },
  orders: {
    key: ["order_id"],
    required: ["order_id", "external_id", "channel", "status", "first_observed_at", "last_observed_at", "confidence", "source"],
    optional: ["unit", "received_at", "confirmed_at", "ready_at", "dispatched_at",
               "cancelled_at", "concluded_at", "total_value", "distinct_items", "total_units"]
  },
  order_items: {
    key: ["order_id", "line_index"],
    required: ["order_id", "line_index", "raw_name", "normalized_name", "quantity", "confidence"],
    optional: ["external_item_id", "complements", "observation", "catalog_item_id", "catalog_match"]
  },
  order_status_events: {
    key: ["order_id", "status", "event_at"],
    required: ["order_id", "status", "event_at", "observed_at", "origin", "confidence"],
    optional: ["run_id", "note"]
  },
  operational_snapshots: {
    key: ["snapshot_at", "window_minutes"],
    required: ["snapshot_at", "window_minutes", "active_orders", "received_in_window",
               "ready_in_window", "concluded_in_window", "source_state", "confidence", "rule_version"],
    optional: ["convergence", "avg_ready_minutes", "queue_delta", "notes"]
  },
  ingestion_anomalies: {
    key: ["anomaly_id"],
    required: ["anomaly_id", "type", "severity", "description", "status"],
    optional: ["order_id", "run_id", "evidence", "resolution", "detected_at"]
  },
  conference_state: {
    key: ["snapshot_at"],
    required: ["snapshot_at", "mode", "base_state", "suggested_state", "active_orders",
               "reasons", "source_health", "confidence", "rule_version"],
    optional: ["missing_data", "modifiers", "window_minutes"]
  },
  source_evidence: {
    key: ["evidence_id"],
    required: ["evidence_id", "run_id", "source", "pointer", "hash"],
    optional: ["excerpt", "privacy"]
  },

  /* ---- Sprint 2: observador ao vivo -------------------------------------- */
  live_cycle_runs: {
    key: ["run_id", "cycle_id"],
    required: ["run_id", "cycle_id", "started_at", "collector_version", "source_health"],
    optional: ["finished_at", "duration_ms", "orders_observed", "fields_missing",
               "errors", "layout_signature", "notes"]
  },
  live_observations: {
    key: ["run_id", "cycle_id", "external_id"],
    required: ["run_id", "cycle_id", "external_id", "observed_at", "raw_status",
               "source_health", "confidence"],
    optional: ["status", "received_at", "promised_at", "ready_at", "departed_at", "items",
               "modality", "last_change_detected_at", "observation_hash", "missing_from_view",
               "dimensions"]
  },
  conference_clock_events: {
    key: ["event_id"],
    required: ["event_id", "order_id", "event_type", "event_time", "observed_at",
               "origin", "confidence", "collector_version"],
    optional: ["reason", "raw_status", "sequence"]
  }
});

/**
 * Valida um registro contra um schema. Nunca lança por dado de negócio —
 * devolve {ok, errors[]} para que o chamador decida quarentena vs rejeição.
 */
function validate(entity, record) {
  const schema = SCHEMAS[entity];
  const errors = [];
  if (!schema) return { ok: false, errors: ["schema_desconhecido:" + entity] };
  if (!record || typeof record !== "object") return { ok: false, errors: ["registro_invalido"] };

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
  // validações de domínio
  if (entity === "orders" && record.status && !S.ORDER_STATUS_LIST.includes(record.status)) {
    errors.push("status_invalido:" + record.status);
  }
  if (entity === "operational_snapshots" && record.source_state &&
      !S.SOURCE_STATE_LIST.includes(record.source_state)) {
    errors.push("source_state_invalido:" + record.source_state);
  }
  if (entity === "conference_state") {
    if (record.suggested_state && !S.CONFERENCE_STATE_LIST.includes(record.suggested_state)) {
      errors.push("suggested_state_invalido:" + record.suggested_state);
    }
    if (record.mode && record.mode !== "shadow") {
      errors.push("modo_nao_permitido_no_sprint1:" + record.mode);
    }
  }
  if (entity === "live_observations" || entity === "live_cycle_runs") {
    if (record.source_health && !L.LIVE_SOURCE_HEALTH_LIST.includes(record.source_health)) {
      errors.push("source_health_invalido:" + record.source_health);
    }
    if (record.raw_status !== undefined && typeof record.raw_status !== "string") {
      errors.push("raw_status_deve_ser_texto_bruto_da_tela");
    }
  }
  if (entity === "conference_clock_events") {
    if (record.event_type && !L.CLOCK_EVENT_TYPE_LIST.includes(record.event_type)) {
      errors.push("event_type_invalido:" + record.event_type);
    }
    if (record.origin && !L.CLOCK_EVENT_ORIGIN_LIST.includes(record.origin)) {
      errors.push("origin_invalido:" + record.origin);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Chave natural (string estável) usada para idempotência e dedup. */
function naturalKey(entity, record) {
  const schema = SCHEMAS[entity];
  if (!schema) throw new Error("schema_desconhecido:" + entity);
  return schema.key.map((k) => String(record[k])).join("|");
}

module.exports = { SCHEMAS, FORBIDDEN_FIELDS, validate, naturalKey };

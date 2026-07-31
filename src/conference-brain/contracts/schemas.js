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
  },

  /* ---- Unidade 5: Copiloto em sombra --------------------------------------
   * Mora AQUI, e não num store proprio, de proposito. O Copiloto herda de
   * graca tudo o que este armazenamento ja teve provado: chave natural
   * idempotente, JSONL append-only, recuperacao por `load` com validacao de
   * schema, contagem de linha corrompida e a guarda de PII por nome de campo.
   * Um store paralelo significaria reprovar tudo isso do zero — e um deles
   * divergiria no primeiro defeito.
   * ---------------------------------------------------------------------- */
  copilot_recommendations: {
    key: ["recommendation_id"],
    required: ["recommendation_id", "unit_id", "source_mode", "conclusion_ref",
               "conclusion_version", "policy_id", "bridge_version", "escopo",
               "titulo", "descricao", "evidencias", "evidence_grade", "confidence",
               "risk_level", "recommended_action", "requires_human", "shadow",
               "created_at", "expires_at", "status"],
    optional: ["policy_version", "external_id", "limitacoes", "motivo_de_saida"]
  }
});

/* --- Vocabulário do Copiloto em sombra ------------------------------------ */

const COPILOT_STATUS = Object.freeze([
  "proposed", "expired", "dismissed", "accepted_for_future", "invalidated"
]);
const COPILOT_ESCOPO = Object.freeze(["fonte", "pedido"]);
const COPILOT_EVIDENCE_GRADE = Object.freeze(["sustentada", "degradada", "stale"]);
const COPILOT_SOURCE_MODE = Object.freeze(["real", "simulated", "control"]);

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
  if (entity === "copilot_recommendations") {
    if (record.status && !COPILOT_STATUS.includes(record.status)) {
      errors.push("status_invalido:" + record.status);
    }
    if (record.escopo && !COPILOT_ESCOPO.includes(record.escopo)) {
      errors.push("escopo_invalido:" + record.escopo);
    }
    if (record.evidence_grade && !COPILOT_EVIDENCE_GRADE.includes(record.evidence_grade)) {
      // `insuficiente` NAO entra aqui de proposito: evidencia insuficiente e o
      // motivo de a recomendacao nao existir, nunca um atributo de uma que existe.
      errors.push("evidence_grade_invalido:" + record.evidence_grade);
    }
    if (record.source_mode && !COPILOT_SOURCE_MODE.includes(record.source_mode)) {
      errors.push("source_mode_invalido:" + record.source_mode);
    }
    // O modo sombra e' condicao de existencia, nao configuracao. Um registro
    // que nao se declara sombra nao entra no armazenamento — mesma escolha do
    // `conference_state`, que recusa `mode !== "shadow"`.
    if (record.shadow !== true) errors.push("recomendacao_fora_do_modo_sombra");
    if (record.requires_human !== true) errors.push("recomendacao_sem_exigencia_de_humano");
    // Confianca sem evidencia rastreavel e palpite com cara de medida.
    if (!Array.isArray(record.evidencias) || record.evidencias.length === 0) {
      errors.push("confianca_sem_evidencia_rastreavel");
    }
    if (typeof record.confidence !== "number" || !(record.confidence >= 0 && record.confidence <= 1)) {
      errors.push("confianca_invalida");
    }
    // Recomendacao sobre PEDIDO exige identidade de pedido observada. Sem ela,
    // sobra `trip_id` querendo passar por `external_id` — a fronteira da
    // Unidade 4 aplicada ao armazenamento.
    if (record.escopo === "pedido" && !record.external_id) {
      errors.push("recomendacao_de_pedido_sem_identidade_de_pedido");
    }
    if (record.escopo === "fonte" && record.external_id) {
      errors.push("recomendacao_de_fonte_com_identidade_de_pedido");
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

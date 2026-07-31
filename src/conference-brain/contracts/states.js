/* ============================================================================
 * Cérebro da Conferência — estados explícitos (fonte e Conferência).
 * ----------------------------------------------------------------------------
 * Regra inegociável: NUNCA mostrar um estado operacional confiante quando a
 * fonte está incompleta. Por isso os estados da fonte e os da Conferência são
 * vocabulários separados, e o estado da Conferência pode ser "degradado" pelo
 * estado da fonte — nunca o contrário.
 * ==========================================================================*/
"use strict";

/** Estados da FONTE — descrevem a qualidade da observação, não a operação. */
const SOURCE_STATES = Object.freeze({
  AVAILABLE: "disponivel",       // observação completa e recente
  PARTIAL: "parcial",            // observando, mas faltam campos/registros
  DELAYED: "atrasada",           // dado chega, mas velho demais para "agora"
  INCONSISTENT: "inconsistente", // conflito entre observações
  UNAVAILABLE: "indisponivel",   // não foi possível observar
  RECOVERING: "recuperando"      // voltando de falha; ainda reconstruindo
});
const SOURCE_STATE_LIST = Object.freeze(Object.values(SOURCE_STATES));

/** Estados da CONFERÊNCIA — o que a etapa está vivendo. */
const CONFERENCE_STATES = Object.freeze({
  CALM: "calmo",
  FLOWING: "fluindo",
  ATTENTION: "atencao",
  URGENCY: "urgencia",
  PARTIAL_READING: "leitura_parcial",   // há dado, mas não o bastante para afirmar
  SOURCE_UNAVAILABLE: "fonte_indisponivel"
});
const CONFERENCE_STATE_LIST = Object.freeze(Object.values(CONFERENCE_STATES));

/** Ordem de severidade operacional (só entre os estados que afirmam operação). */
const OPERATIONAL_SEVERITY = Object.freeze([
  CONFERENCE_STATES.CALM,
  CONFERENCE_STATES.FLOWING,
  CONFERENCE_STATES.ATTENTION,
  CONFERENCE_STATES.URGENCY
]);

/** Confiança declarada da leitura. */
const CONFIDENCE = Object.freeze({ HIGH: "alta", MEDIUM: "media", LOW: "baixa" });

/**
 * Estados de fonte que PROÍBEM afirmar um estado operacional confiante.
 * Com eles, a leitura vira leitura_parcial ou fonte_indisponivel.
 */
const SOURCE_BLOCKS_CONFIDENT_READING = Object.freeze([
  SOURCE_STATES.UNAVAILABLE,
  SOURCE_STATES.INCONSISTENT
]);
const SOURCE_DEGRADES_READING = Object.freeze([
  SOURCE_STATES.PARTIAL,
  SOURCE_STATES.DELAYED,
  SOURCE_STATES.RECOVERING
]);

/** Status canônicos de pedido reconhecidos pela normalização. */
const ORDER_STATUS = Object.freeze({
  RECEIVED: "recebido",
  CONFIRMED: "confirmado",
  READY: "pronto",
  DISPATCHED: "saiu",
  CONCLUDED: "concluido",
  CANCELLED: "cancelado",
  UNKNOWN: "desconhecido"
});
const ORDER_STATUS_LIST = Object.freeze(Object.values(ORDER_STATUS));

/** Severidade de anomalia de ingestão. */
const ANOMALY_SEVERITY = Object.freeze({
  INFO: "info", WARNING: "atencao", ERROR: "erro", CRITICAL: "critico"
});

/** Situação de processamento de um registro bruto. */
const RECORD_STATUS = Object.freeze({
  PENDING: "pendente",
  NORMALIZED: "normalizado",
  DUPLICATE: "duplicado",
  QUARANTINED: "quarentena",
  REJECTED: "rejeitado"
});

module.exports = {
  SOURCE_STATES, SOURCE_STATE_LIST,
  CONFERENCE_STATES, CONFERENCE_STATE_LIST, OPERATIONAL_SEVERITY,
  CONFIDENCE,
  SOURCE_BLOCKS_CONFIDENT_READING, SOURCE_DEGRADES_READING,
  ORDER_STATUS, ORDER_STATUS_LIST,
  ANOMALY_SEVERITY, RECORD_STATUS
};

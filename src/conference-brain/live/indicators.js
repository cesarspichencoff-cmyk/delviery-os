/* ============================================================================
 * Indicadores e alertas do cartão (Sprint 2.1, Fase 12).
 * ----------------------------------------------------------------------------
 * Puro. Cada sinal do Gestor é classificado corretamente — nenhum vira um
 * "status" por atalho. A classificação segue a distinção da auditoria
 * independente (docs/auditoria/CONFERENCE_BRAIN_SPRINT2_AUDIT.md §10).
 * ==========================================================================*/
"use strict";

const { INDICATOR_CODES, INDICATOR_CODE_LIST } = require("../contracts/live-states");
const { CONFIDENCE } = require("../contracts/states");

/**
 * categoria de cada código — nunca "status": um indicador é uma MEDIDA
 * (ex.: minutos restantes), um alerta é uma CONDIÇÃO que pede atenção, um
 * atributo é uma CARACTERÍSTICA do pedido (não muda com o tempo do ciclo).
 */
const CATEGORY_BY_CODE = Object.freeze({
  [INDICATOR_CODES.PREPARATION_TIME_REMAINING]: "indicador",
  [INDICATOR_CODES.HALF_PREPARATION_TIME_REACHED]: "alerta",
  [INDICATOR_CODES.PREPARATION_DELAYED]: "alerta",
  [INDICATOR_CODES.COURIER_SEARCHING]: "estado",   // espelha courier_state=searching
  [INDICATOR_CODES.COURIER_ETA]: "indicador",
  [INDICATOR_CODES.COURIER_AT_STORE]: "evento",     // chegada é um marco pontual, não uma medida continua
  [INDICATOR_CODES.CHAT_PENDING]: "alerta",
  [INDICATOR_CODES.NEGOTIATION_PENDING]: "alerta",
  [INDICATOR_CODES.GROUPED_DELIVERY]: "atributo",
  [INDICATOR_CODES.SCHEDULED_ORDER]: "atributo"
});

function classifyIndicator(code) {
  return CATEGORY_BY_CODE[code] || null;
}

/**
 * @param {object} raw  { code, value, unit, rawText, severity, origin, confidence, observedAt }
 * Código desconhecido é rejeitado (retorna null) — nunca vira indicador com
 * categoria adivinhada.
 */
function buildIndicator(raw) {
  const r = raw || {};
  if (!INDICATOR_CODE_LIST.includes(r.code)) return null;
  return {
    code: r.code,
    category: classifyIndicator(r.code),
    value: r.value != null ? r.value : null,
    unit: r.unit || null,
    raw_text: r.rawText || null,
    severity: r.severity || "info",
    origin: r.origin || "ifood_screen",
    confidence: r.confidence || CONFIDENCE.MEDIUM,
    observed_at: r.observedAt || null
  };
}

/** Constrói a lista de indicadores de um ciclo, descartando código desconhecido em silêncio controlado. */
function buildIndicatorList(rawList) {
  return (rawList || []).map(buildIndicator).filter(Boolean);
}

module.exports = { CATEGORY_BY_CODE, classifyIndicator, buildIndicator, buildIndicatorList };

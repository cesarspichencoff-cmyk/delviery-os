/* ============================================================================
 * Estado da loja e contexto de conta/unidade (Sprint 2.1, Fases 13-14).
 * ----------------------------------------------------------------------------
 * Puro. `store_state` é SEPARADO da saúde técnica da fonte (health.js):
 * loja fechada não é "fonte indisponível", e tela vazia com loja aberta não
 * é "layout quebrado" — são fatos operacionais distintos de fatos técnicos.
 * ==========================================================================*/
"use strict";

const { STORE_STATE } = require("../contracts/live-states");

const STORE_STATE_TEXT_MAP = Object.freeze([
  [/^(aberta|aberto|open)$/i, STORE_STATE.OPEN],
  [/^(fechada por hor[aá]rio|closed by schedule|fora do hor[aá]rio)$/i, STORE_STATE.CLOSED_BY_SCHEDULE],
  [/^(fechada manualmente|closed manually|pausada pelo lojista)$/i, STORE_STATE.CLOSED_MANUALLY],
  [/^(sem conex[aã]o|offline|closed by connectivity|desconectad[ao])$/i, STORE_STATE.CLOSED_BY_CONNECTIVITY],
  [/^(temporariamente indispon[ií]vel|temporarily unavailable)$/i, STORE_STATE.TEMPORARILY_UNAVAILABLE]
]);

function mapStoreState(rawText) {
  const s = String(rawText || "").trim();
  for (const [re, canon] of STORE_STATE_TEXT_MAP) if (re.test(s)) return canon;
  return STORE_STATE.UNKNOWN;
}

function buildStoreStateDimension(signal) {
  const s = signal || {};
  return {
    value: mapStoreState(s.rawText),
    raw_text: s.rawText || null,
    observed_at: s.observedAt || null
  };
}

/**
 * Explica por que a tela pode estar vazia — a mesma tela sem pedidos pode
 * significar coisas totalmente diferentes; o observador nunca escolhe uma
 * sozinho, só relata os sinais disponíveis para `health.js` decidir a razão.
 */
function emptyScreenExplanation(signal) {
  const s = signal || {};
  if (s.storeState === STORE_STATE.CLOSED_BY_SCHEDULE || s.storeState === STORE_STATE.CLOSED_MANUALLY) {
    return "loja_fechada";
  }
  if (s.filterActive) return "filtro_ativo_sem_resultado";
  if (s.scheduledOnlyTabSelected) return "somente_agendados_selecionado";
  if (s.wrongUnitSuspected) return "unidade_incerta";
  return "operacao_vazia_valida";
}

/* ---------------------------------------------------------------------------
 * Contexto de conta e unidade — o coletor nunca mistura pedidos de unidades
 * diferentes; sem confirmar a unidade, a leitura não pode ser confiante.
 * ------------------------------------------------------------------------- */

function sanitizeMerchantLabel(rawLabel) {
  if (!rawLabel) return null;
  return String(rawLabel)
    .replace(/\b\d{2,3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{0,2}\b/g, "[numero-suprimido]")
    .slice(0, 80);
}

/**
 * @param {object} raw
 *   merchantId, merchantLabel, selectedUnitId, multipleUnitsDetected,
 *   currentUnitConfirmed, confidence
 */
function buildAccountContext(raw) {
  const r = raw || {};
  return {
    merchant_id: r.merchantId || null,
    merchant_label_sanitized: sanitizeMerchantLabel(r.merchantLabel),
    selected_unit_id: r.selectedUnitId || null,
    multiple_units_detected: r.multipleUnitsDetected === true,
    current_unit_confirmed: r.currentUnitConfirmed === true,
    confidence: r.currentUnitConfirmed ? "alta" : "baixa"
  };
}

/**
 * A unidade não pôde ser confirmada -> a leitura NUNCA pode ser confiante
 * (regra explícita da missão). Devolve o motivo para `health.js` incorporar.
 */
function accountContextBlocksConfidentReading(context) {
  const c = context || {};
  if (!c.current_unit_confirmed) return "unidade_nao_confirmada";
  if (c.multiple_units_detected) return "multiplas_unidades_detectadas";
  return null;
}

module.exports = {
  mapStoreState, buildStoreStateDimension, emptyScreenExplanation,
  sanitizeMerchantLabel, buildAccountContext, accountContextBlocksConfidentReading
};

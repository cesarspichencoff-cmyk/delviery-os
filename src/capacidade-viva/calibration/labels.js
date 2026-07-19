/* ============================================================================
 * Rótulos obrigatórios — CALIBRAÇÃO / MODO SOMBRA / NÃO OPERACIONAL
 * ==========================================================================*/
"use strict";

const LABELS = Object.freeze({
  CALIBRACAO: "CALIBRAÇÃO",
  MODO_SOMBRA: "MODO SOMBRA",
  NAO_OPERACIONAL: "NÃO OPERACIONAL",
  banner: "CALIBRAÇÃO · MODO SOMBRA · NÃO OPERACIONAL"
});

const EPISTEMIC = Object.freeze({
  CONFIRMADO: "confirmado",
  INFERIDO_ALTA: "inferido_alta_confianca",
  INFERIDO_BAIXA: "inferido_baixa_confianca",
  AUSENTE: "ausente"
});

function stamp(obj) {
  return Object.assign(
    {
      labels: [LABELS.CALIBRACAO, LABELS.MODO_SOMBRA, LABELS.NAO_OPERACIONAL],
      operational: false,
      emits_real_alerts: false,
      applies_pause: false,
      ranks_employees: false
    },
    obj || {}
  );
}

module.exports = { LABELS, EPISTEMIC, stamp };

/* ============================================================================
 * Explicabilidade mínima de toda saída.
 * ==========================================================================*/
"use strict";

/**
 * Envelope canônico de dado explicável.
 */
function explainable(value, meta) {
  const m = meta || {};
  return {
    value,
    source: m.source || "capacidade-viva",
    timestamp: m.timestamp || new Date().toISOString(),
    confidence: m.confidence || "media",
    confirmation_status: m.confirmation_status || "unconfirmed",
    explanation: m.explanation || "",
    praca: m.praca || null,
    pedidos: m.pedidos || m.orders || [],
    itens: m.itens || m.items || [],
    sinais: m.sinais || m.signals || [],
    simulated: !!m.simulated
  };
}

function explainISF(isfResult) {
  const r = isfResult || {};
  return explainable(r.estado_geral, {
    source: "capacidade-viva.isf",
    confidence: r.confidence,
    explanation: r.estado_geral_reason || r.message_if_insufficient,
    praca: r.praca_critica,
    signals: Object.keys(r.por_praca || {}),
    simulated: false
  });
}

function explainIntervencao(iv) {
  const i = iv || {};
  return explainable(i.action, {
    source: "capacidade-viva.intervencao",
    confidence: i.confidence,
    explanation: i.explanation || i.reason,
    praca: i.praca,
    confirmation_status: i.requires_human_confirmation ? "requires_human" : "unconfirmed"
  });
}

module.exports = { explainable, explainISF, explainIntervencao };

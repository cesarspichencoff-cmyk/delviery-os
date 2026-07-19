/* ============================================================================
 * Análise de sensibilidade do ISF — contribuição por componente.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");

/**
 * A partir de ticks com `components`, estima influência relativa.
 */
function analyzeSensitivity(ticks) {
  const keys = [
    "carga_atual",
    "carga_prevista",
    "envelhecimento",
    "bloqueios",
    "fator_equipe",
    "fator_temporal"
  ];
  const sums = Object.fromEntries(keys.map((k) => [k, 0]));
  let n = 0;
  for (const t of ticks || []) {
    const c = t.components;
    if (!c) continue;
    n++;
    for (const k of keys) {
      if (c[k] != null) sums[k] += Math.abs(Number(c[k]) || 0);
    }
  }
  const total = Object.values(sums).reduce((a, b) => a + b, 0) || 1;
  const contribution = {};
  for (const k of keys) contribution[k] = round3(sums[k] / total);

  // map to mission names
  const named = {
    workload: contribution.carga_atual,
    forecast: contribution.carga_prevista,
    aging: contribution.envelhecimento,
    ready_wait_proxy_bloqueios: contribution.bloqueios,
    team_capacity: contribution.fator_equipe,
    temporal_context: contribution.fator_temporal,
    complexity: "embutida em carga_atual (peso de complexidade)",
    queue_growth: "derivado entre ticks (trend_up)",
    courier_wait: "via taxonomia de exceções, não no ISF base",
    source_confidence: "flag confianca no tick"
  };

  const maxKey = keys.reduce((a, b) => (sums[a] >= sums[b] ? a : b), keys[0]);
  const dominated = sums[maxKey] / total > 0.55;

  return stamp({
    n_ticks_with_components: n,
    contribution_raw: contribution,
    contribution_named: named,
    dominant_component: maxKey,
    risk_single_component_dominates: dominated,
    note: "Equipe simulada → CAPACIDADE HIPOTÉTICA"
  });
}

function round3(x) {
  return Math.round(Number(x) * 1000) / 1000;
}

module.exports = { analyzeSensitivity };

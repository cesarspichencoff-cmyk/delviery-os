/* ============================================================================
 * Modo sombra — o que o sistema teria dito (sem provar contrafactual).
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");
const { scoreShadow } = require("./calibrator");

/**
 * Resume linhas de sombra de um replay.
 */
function buildShadowReport(replay) {
  const ticks = (replay && replay.ticks) || [];
  const lines = ticks.map((t) => t.shadow).filter(Boolean);
  const metrics = scoreShadow(ticks);

  // Categorias de verificabilidade
  const buckets = { detectavel: 0, provavel: 0, nao_verificavel: 0 };
  for (const l of lines) {
    const v = l.verificabilidade || "nao_verificavel";
    if (buckets[v] != null) buckets[v]++;
    else buckets.nao_verificavel++;
  }

  return stamp({
    n_lines: lines.length,
    metrics,
    verificabilidade: buckets,
    sample_lines: lines.filter((_, i) => i % Math.max(1, Math.floor(lines.length / 20)) === 0).slice(0, 20),
    rules: {
      no_claim_action_would_work_without_counterfactual: true,
      no_real_alerts: true,
      no_pause_applied: true
    },
    recovery_liquida_historica: {
      status: "nao_calculavel_sem_acoes_conhecidas",
      contract: "requer ação + horário + antes/depois + sinais",
      protocol: "piloto futuro com log de intervenções humanas"
    }
  });
}

module.exports = { buildShadowReport };

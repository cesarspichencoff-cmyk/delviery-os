/* ============================================================================
 * Baselines ingênuos para comparação — sem afirmar superioridade.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");

/**
 * Compara classificação do motor vs regras simples nos mesmos ticks.
 */
function compareBaselines(ticks) {
  let agree_qty = 0;
  let agree_age = 0;
  let agree_ready = 0;
  let n = 0;
  const motorCrit = [];
  const baseQtyCrit = [];

  for (const t of ticks || []) {
    n++;
    const motorCritical = !!(t.tick_class && t.tick_class.has_critical) || t.shadow.estado === "excecao_critica";
    const motorAttention =
      motorCritical || (t.tick_class && t.tick_class.has_attention) || t.shadow.estado === "atencao";

    const qtyCrit = (t.active_orders || 0) >= 70;
    const qtyAtt = (t.active_orders || 0) >= 50;
    const ageCrit = t.shadow && t.shadow.sinais && t.shadow.sinais.isf_critica > 1.2; // proxy
    const readyCrit = t.shadow && t.shadow.sinais && t.shadow.sinais.ready >= 8;

    if (motorAttention === qtyAtt) agree_qty++;
    if (!!motorCritical === !!readyCrit) agree_ready++;
    // age baseline: oldest proxy via isf
    if (motorAttention === (t.active_orders >= 40 && (t.isf_critica || 0) > 0.8)) agree_age++;

    if (motorCritical) motorCrit.push(t.t_ms);
    if (qtyCrit) baseQtyCrit.push(t.t_ms);
  }

  return stamp({
    n_ticks: n,
    baselines: {
      only_order_count: { agreement_with_motor_attention: n ? round3(agree_qty / n) : null },
      only_aging_proxy: { agreement_with_motor_attention: n ? round3(agree_age / n) : null },
      only_ready_waiting: { agreement_with_motor_critical: n ? round3(agree_ready / n) : null },
      only_complexity: { note: "embutida na carga; comparar via sensibilidade" }
    },
    differentiation_note:
      "Capacidade Viva só é justificável se combinar sinais de forma estável; sem validação humana não afirmar superioridade",
    no_superiority_claim: true
  });
}

function round3(x) {
  return Math.round(Number(x) * 1000) / 1000;
}

module.exports = { compareBaselines };

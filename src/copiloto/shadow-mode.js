/**
 * Modo sombra — observar, explicar, recomendar, acompanhar, automatizar (com gates).
 */
"use strict";

const LEVELS = Object.freeze({
  1: "observe",
  2: "explain",
  3: "recommend",
  4: "follow_up",
  5: "automate_safe"
});

const GATES = Object.freeze({
  // quant + qual para subir de nível
  to_2: { min_shadow_hours: 20, max_false_alert_rate: 0.35, human_review: true },
  to_3: { min_shadow_hours: 40, max_false_alert_rate: 0.25, focus_stability_ok: true, human_review: true },
  to_4: { min_shadow_hours: 80, recommendation_accept_rate: 0.4, human_review: true },
  to_5: {
    min_shadow_hours: 120,
    max_false_alert_rate: 0.15,
    only_safe_actions: true,
    human_approval_per_action_type: true,
    human_review: true
  }
});

function createShadowLog(partial) {
  const p = partial || {};
  return {
    shadow_id: p.shadow_id || `sh_${Date.now()}`,
    at: p.at || new Date().toISOString(),
    level: p.level || 1,
    situation: p.situation || null,
    reading: p.reading || null,
    forecast: p.forecast || null,
    would_choose_focus: p.would_choose_focus || null,
    recommendation: p.recommendation || null,
    real_decision: p.real_decision || null,
    outcome: p.outcome || null,
    correct: p.correct ?? null,
    error_type: p.error_type || null, // false_positive|false_negative|wrong_focus|null
    missing_data: p.missing_data || [],
    notes: p.notes || null
  };
}

function canPromote(currentLevel, metrics) {
  const m = metrics || {};
  const next = currentLevel + 1;
  if (next > 5) return { ok: false, reason: "nivel_maximo" };
  const gate = GATES[`to_${next}`];
  if (!gate) return { ok: false, reason: "gate_ausente" };
  if (gate.min_shadow_hours && (m.shadow_hours || 0) < gate.min_shadow_hours) {
    return { ok: false, reason: "horas_insuficientes", gate };
  }
  if (gate.max_false_alert_rate != null && (m.false_alert_rate || 1) > gate.max_false_alert_rate) {
    return { ok: false, reason: "falsos_alertas", gate };
  }
  if (gate.focus_stability_ok && !m.focus_stability_ok) {
    return { ok: false, reason: "foco_oscilando", gate };
  }
  if (gate.recommendation_accept_rate && (m.recommendation_accept_rate || 0) < gate.recommendation_accept_rate) {
    return { ok: false, reason: "aceitacao_baixa", gate };
  }
  if (gate.human_review && !m.human_review_approved) {
    return { ok: false, reason: "falta_revisao_humana", gate };
  }
  return { ok: true, next_level: next, level_name: LEVELS[next], gate };
}

function safeAutomationAllowed(actionType, approvedTypes) {
  const safe = new Set(approvedTypes || ["ack_register", "silence_log"]);
  return safe.has(actionType);
}

module.exports = {
  LEVELS,
  GATES,
  createShadowLog,
  canPromote,
  safeAutomationAllowed
};

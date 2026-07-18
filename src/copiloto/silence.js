/**
 * Operação silenciosa — 3 níveis de interrupção.
 */
"use strict";

const { SILENCE, confidenceAtLeast } = require("./config");

function createSilenceState() {
  return {
    history: [], // {at, level, key}
    last_intervention_at: null,
    last_discreet_at: null
  };
}

/**
 * Decide nível de interrupção para um evento de atenção.
 */
function classifyInterruption(event, state, nowMin) {
  const e = event || {};
  const st = state || createSilenceState();
  const t = nowMin != null ? nowMin : 0;

  // Técnico / dados ruins → silencioso (registra, não grita)
  if (e.kind === "technical_failure" || e.technical_state === "failed") {
    return emit("silent", e, st, t, "falha_tecnica_registrada_sem_alarme_operacional");
  }

  // Oscilação → silencioso
  if (e.level === "oscillation" || e.kind === "oscillation") {
    return emit("silent", e, st, t, "oscilacao_sem_persistencia");
  }

  // Confiança insuficiente para intervir
  if (e.severity >= 2 && !confidenceAtLeast(e.confidence || "media", SILENCE.intervention.min_confidence)) {
    return emit("discreet", e, st, t, "gravidade_alta_confianca_baixa_atencao_discreta");
  }

  // Intervenção
  if (
    (e.severity || 0) >= SILENCE.intervention.min_severity &&
    confidenceAtLeast(e.confidence || "media", SILENCE.intervention.min_confidence)
  ) {
    const cd = SILENCE.intervention.cooldown_min;
    if (st.last_intervention_at != null && t - st.last_intervention_at < cd) {
      // agrupa / suprime
      return emit("discreet", e, st, t, "cooldown_intervencao_agrupado");
    }
    // rate limit
    const recent = st.history.filter((h) => h.level === "intervention" && t - h.at < 60);
    if (recent.length >= SILENCE.intervention.max_per_hour) {
      return emit("discreet", e, st, t, "rate_limit_intervencao");
    }
    st.last_intervention_at = t;
    return emit("intervention", e, st, t, "risco_operacional_importante");
  }

  // Atenção discreta
  if ((e.severity || 0) >= 1 || e.level === "attention") {
    const cd = SILENCE.discreet.cooldown_min;
    if (st.last_discreet_at != null && t - st.last_discreet_at < cd) {
      return emit("silent", e, st, t, "cooldown_discreto_suprimido");
    }
    st.last_discreet_at = t;
    return emit("discreet", e, st, t, "mudanca_relevante");
  }

  return emit("silent", e, st, t, "sem_necessidade_de_interrupcao");
}

function emit(level, event, state, t, reason) {
  state.history.push({ at: t, level, key: event.key || event.area || null, reason });
  if (state.history.length > 200) state.history = state.history.slice(-200);
  return {
    level,
    notify: SILENCE[level] ? SILENCE[level].notify : false,
    reason,
    product:
      level === "silent"
        ? "Registra sem interromper."
        : level === "discreet"
          ? "Mostra mudança relevante sem gritar."
          : "Notifica só porque o risco importa agora.",
    state
  };
}

module.exports = {
  createSilenceState,
  classifyInterruption,
  SILENCE
};

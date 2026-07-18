/**
 * Classificação de atraso, desvio, pressão, risco, oscilação, falha técnica.
 */
"use strict";

const { DEFAULT_THRESHOLDS, confidenceAtLeast } = require("./config");

function mergeThresholds(overrides) {
  const out = {};
  for (const area of Object.keys(DEFAULT_THRESHOLDS)) {
    out[area] = { ...DEFAULT_THRESHOLDS[area], ...(overrides && overrides[area]) };
  }
  return out;
}

/**
 * Nível de pressão da área a partir de fila e tempo.
 * Confiança baixa NÃO rebaixa gravidade — retorna confidence em campo separado.
 */
function classifyPressure(areaId, metrics, thresholds, opts) {
  const t = (thresholds || DEFAULT_THRESHOLDS)[areaId];
  if (!t) {
    return {
      level: "unknown",
      severity: 0,
      confidence: "baixa",
      reason: "area_sem_threshold",
      kind: "technical_failure"
    };
  }
  const m = metrics || {};
  const queue = m.queue_depth ?? 0;
  const dwell = m.median_dwell_min ?? m.dwell_min ?? 0;
  const confidence = m.confidence || "media";
  const dataOk = m.data_quality !== "failed" && m.data_quality !== "stale";

  if (!dataOk) {
    return {
      level: "unknown",
      severity: 0,
      confidence: "baixa",
      kind: "technical_failure",
      reason: m.data_quality === "stale" ? "dado_atrasado" : "dado_incompleto",
      required_data: t
    };
  }

  let level = "normal";
  let severity = 0;
  if (queue >= t.critical_queue || dwell >= t.critical_min) {
    level = "critical";
    severity = 3;
  } else if (queue >= t.pressure_queue || dwell >= t.pressure_min) {
    level = "pressure";
    severity = 2;
  } else if (queue >= t.attention_queue || dwell >= t.attention_min) {
    level = "attention";
    severity = 1;
  }

  // Oscilação: pico curto sem persistência
  const persistence = m.persistence_min ?? 0;
  if (level !== "normal" && persistence < t.min_persistence_min) {
    return {
      level: "oscillation",
      severity: 0,
      underlying_level: level,
      confidence,
      kind: "oscillation",
      reason: "persistencia_insuficiente",
      min_persistence_min: t.min_persistence_min,
      recovery: recoveryCondition(t)
    };
  }

  const confOk = confidenceAtLeast(confidence, t.min_confidence);
  return {
    level,
    severity,
    confidence,
    confidence_sufficient: confOk,
    kind: level === "normal" ? "normal" : "pressure",
    reason: describeReason(level, queue, dwell, t),
    recovery: recoveryCondition(t),
    thresholds_used: {
      normal_queue: t.normal_queue,
      attention_queue: t.attention_queue,
      pressure_queue: t.pressure_queue,
      critical_queue: t.critical_queue
    },
    // gravidade NÃO é reduzida por confiança baixa — só flag
    note: confOk ? null : "confianca_abaixo_do_minimo_nao_reduz_gravidade"
  };
}

function recoveryCondition(t) {
  return {
    queue_below: t.recovery_below_queue,
    dwell_below_min: t.recovery_below_min,
    sustained_min: t.min_persistence_min
  };
}

function describeReason(level, queue, dwell, t) {
  if (level === "normal") return "dentro_do_intervalo_esperado";
  if (queue >= t.critical_queue) return `fila ${queue} >= critico ${t.critical_queue}`;
  if (dwell >= t.critical_min) return `tempo ${dwell}min >= critico ${t.critical_min}`;
  if (queue >= t.pressure_queue) return `fila ${queue} >= pressao ${t.pressure_queue}`;
  if (dwell >= t.pressure_min) return `tempo ${dwell}min >= pressao ${t.pressure_min}`;
  if (queue >= t.attention_queue) return `fila ${queue} >= atencao ${t.attention_queue}`;
  return `tempo ${dwell}min >= atencao ${t.attention_min}`;
}

/** Atraso do pedido vs prometido */
function classifyPromiseDelay(delayMin) {
  if (delayMin == null) return { kind: "unknown", label: "sem_promessa" };
  if (delayMin <= 0) return { kind: "on_track", label: "no_prazo" };
  if (delayMin <= 5) return { kind: "at_risk", label: "proximo_do_prazo" };
  if (delayMin <= 15) return { kind: "delayed", label: "atrasado" };
  return { kind: "severely_delayed", label: "atraso_grave" };
}

/** Risco futuro (ainda não confirmado) */
function classifyFutureRisk(forecast) {
  if (!forecast) return { kind: "none", confidence: "baixa" };
  if (forecast.risk_orders_count > 0 && forecast.confidence !== "baixa") {
    return {
      kind: "future_risk",
      horizon_min: forecast.horizon_min,
      risk_orders_count: forecast.risk_orders_count,
      confidence: forecast.confidence
    };
  }
  return { kind: "none", confidence: forecast.confidence || "media" };
}

module.exports = {
  mergeThresholds,
  classifyPressure,
  classifyPromiseDelay,
  classifyFutureRisk,
  recoveryCondition
};

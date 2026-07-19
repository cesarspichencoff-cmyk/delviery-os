/**
 * Modelo operacional canônico do pedido e da área.
 * Fato ≠ inferência ≠ relato humano.
 */
"use strict";

const { AREAS, PRACA_TO_AREA } = require("./config");

const EPISTEMIC = Object.freeze({
  FACT: "fact",
  INFERENCE: "inference",
  HUMAN_REPORT: "human_report",
  HYPOTHESIS: "hypothesis",
  PATTERN: "pattern",
  VALIDATED_RULE: "validated_rule",
  ABSENT: "absent",
  UNKNOWN: "unknown"
});

const ORDER_STAGES = Object.freeze([
  "received",
  "in_production",
  "ready",
  "conference",
  "released",
  "with_courier",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "reissued"
]);

/**
 * @typedef {Object} EpistemicValue
 * @property {*} value
 * @property {string} epistemic - EPISTEMIC
 * @property {string} [source]
 * @property {string} [confidence] - alta|media|baixa
 * @property {string} [observed_at]
 */

function ev(value, epistemic, source, confidence, observed_at) {
  return {
    value: value === undefined ? null : value,
    epistemic: epistemic || EPISTEMIC.ABSENT,
    source: source || null,
    confidence: confidence || null,
    observed_at: observed_at || null
  };
}

/** Cria esqueleto canônico de um pedido */
function createCanonicalOrder(partial) {
  const p = partial || {};
  return {
    order_id: p.order_id || null,
    short_id: p.short_id || null,
    store_id: p.store_id || null,
    received_at: ev(p.received_at ?? null, p.received_at ? EPISTEMIC.FACT : EPISTEMIC.ABSENT, p.source),
    promised_at: ev(p.promised_at ?? null, p.promised_at ? EPISTEMIC.FACT : EPISTEMIC.ABSENT, p.source),
    items: p.items || [],
    item_count: typeof p.item_count === "number" ? p.item_count : (p.items ? p.items.length : null),
    complexity: p.complexity || null, // low|medium|high — inference when derived
    areas_involved: p.areas_involved || [],
    stages: {
      production_start: ev(p.production_start ?? null, EPISTEMIC.ABSENT),
      production_end: ev(p.production_end ?? null, EPISTEMIC.ABSENT),
      ready_at: ev(p.ready_at ?? null, p.ready_at ? EPISTEMIC.FACT : EPISTEMIC.ABSENT, p.source),
      conference_start: ev(p.conference_start ?? null, EPISTEMIC.ABSENT),
      conference_end: ev(p.conference_end ?? null, EPISTEMIC.ABSENT),
      release_at: ev(p.release_at ?? null, EPISTEMIC.ABSENT),
      courier_assigned_at: ev(p.courier_assigned_at ?? null, p.courier_assigned_at ? EPISTEMIC.FACT : EPISTEMIC.ABSENT, p.source),
      left_store_at: ev(p.left_store_at ?? null, p.left_store_at ? EPISTEMIC.FACT : EPISTEMIC.ABSENT, p.source),
      delivered_at: ev(p.delivered_at ?? null, p.delivered_at ? EPISTEMIC.FACT : EPISTEMIC.ABSENT, p.source),
      cancelled_at: ev(p.cancelled_at ?? null, p.cancelled_at ? EPISTEMIC.FACT : EPISTEMIC.ABSENT, p.source)
    },
    dwell_minutes: p.dwell_minutes || {}, // area_id -> minutes (inference or fact)
    wait_minutes: p.wait_minutes ?? null,
    courier_id: p.courier_id ?? null,
    cancellation: p.cancellation || null,
    reissue: p.reissue || null,
    occurrence: p.occurrence || null,
    outcome: p.outcome || null, // concluded|cancelled|declined|unknown
    delay_vs_promise_min: p.delay_vs_promise_min ?? null,
    technical: {
      completeness: p.completeness || "unknown",
      sources: p.sources || [],
      risks: p.risks || []
    }
  };
}

/** Estado de área operacional */
function createAreaState(areaId, partial) {
  const meta = AREAS[areaId];
  const p = partial || {};
  return {
    area_id: areaId,
    label: meta ? meta.label : areaId,
    role: meta ? meta.role : "unknown",
    queue_depth: p.queue_depth ?? 0,
    median_dwell_min: p.median_dwell_min ?? null,
    p75_dwell_min: p.p75_dwell_min ?? null,
    p90_dwell_min: p.p90_dwell_min ?? null,
    pressure_level: p.pressure_level || "normal", // normal|attention|pressure|critical
    trend: p.trend || "stable", // improving|stable|worsening
    open_orders: p.open_orders || [],
    dependency_on: p.dependency_on || [],
    effect_on: p.effect_on || [],
    data_quality: p.data_quality || "unknown",
    confidence: p.confidence || "baixa",
    last_updated_at: p.last_updated_at || null,
    notes: p.notes || []
  };
}

/** Classifica atraso do pedido vs prometido (só se prometido for fato) */
function classifyOrderDelay(order, nowIso) {
  const promised = order.promised_at && order.promised_at.value;
  if (!promised) {
    return { kind: "unknown", minutes: null, epistemic: EPISTEMIC.ABSENT, reason: "promised_at_ausente" };
  }
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  const p = Date.parse(promised);
  if (Number.isNaN(p) || Number.isNaN(now)) {
    return { kind: "unknown", minutes: null, epistemic: EPISTEMIC.UNKNOWN, reason: "timestamp_invalido" };
  }
  const min = Math.round((now - p) / 60000);
  if (min <= 0) return { kind: "on_track", minutes: min, epistemic: EPISTEMIC.FACT };
  if (min <= 5) return { kind: "at_risk", minutes: min, epistemic: EPISTEMIC.FACT };
  return { kind: "delayed", minutes: min, epistemic: EPISTEMIC.FACT };
}

function areasFromPracas(pracas) {
  const set = new Set();
  for (const pr of pracas || []) {
    const a = PRACA_TO_AREA[pr];
    if (a) set.add(a);
  }
  return Array.from(set);
}

module.exports = {
  EPISTEMIC,
  ORDER_STAGES,
  ev,
  createCanonicalOrder,
  createAreaState,
  classifyOrderDelay,
  areasFromPracas
};

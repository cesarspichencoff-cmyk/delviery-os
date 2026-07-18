/**
 * Memória do turno — fatos, inferências, relatos, hipóteses, padrões, regras.
 */
"use strict";

const { EPISTEMIC } = require("./canonical-model");

function createShiftMemory(partial) {
  const p = partial || {};
  return {
    schema_version: "1.0",
    shift_id: p.shift_id || `shift_${Date.now()}`,
    store_id: p.store_id || null,
    opened_at: p.opened_at || new Date().toISOString(),
    closed_at: p.closed_at || null,
    context: {
      dow: p.dow ?? null,
      planned_peak: p.planned_peak || null,
      team_notes: p.team_notes || [],
      external_signals: p.external_signals || []
    },
    volume: p.volume || { orders: 0, items: 0 },
    events: p.events || [],
    pressures: p.pressures || [],
    forecasts: p.forecasts || [],
    anomalies: p.anomalies || [],
    focus_timeline: p.focus_timeline || [],
    recommendations: p.recommendations || [],
    human_decisions: p.human_decisions || [],
    actions: p.actions || [],
    outcomes: p.outcomes || [],
    recovery_times_min: p.recovery_times_min || [],
    side_effects: p.side_effects || [],
    closing_report: p.closing_report || null,
    unexplained: p.unexplained || [],
    learnings: p.learnings || [],
    confidence_overall: p.confidence_overall || "media",
    entries: p.entries || [] // epistemic-tagged
  };
}

function addEntry(memory, entry) {
  const e = {
    entry_id: entry.entry_id || `e_${memory.entries.length + 1}`,
    at: entry.at || new Date().toISOString(),
    kind: entry.kind, // pressure|forecast|anomaly|focus|action|decision|outcome|report
    epistemic: entry.epistemic || EPISTEMIC.INFERENCE,
    payload: entry.payload,
    confidence: entry.confidence || "media",
    source: entry.source || null
  };
  memory.entries.push(e);
  // index mirrors
  if (e.kind === "pressure") memory.pressures.push(e.payload);
  if (e.kind === "forecast") memory.forecasts.push(e.payload);
  if (e.kind === "anomaly") memory.anomalies.push(e.payload);
  if (e.kind === "focus") memory.focus_timeline.push(e.payload);
  if (e.kind === "action") memory.actions.push(e.payload);
  if (e.kind === "decision") memory.human_decisions.push(e.payload);
  if (e.kind === "outcome") memory.outcomes.push(e.payload);
  if (e.kind === "report") memory.closing_report = e.payload;
  return memory;
}

function separateEpistemics(memory) {
  const buckets = {
    fact: [],
    inference: [],
    human_report: [],
    hypothesis: [],
    pattern: [],
    validated_rule: [],
    absent: [],
    unknown: []
  };
  for (const e of memory.entries || []) {
    const k = e.epistemic || "unknown";
    if (buckets[k]) buckets[k].push(e);
    else buckets.unknown.push(e);
  }
  return buckets;
}

module.exports = {
  createShiftMemory,
  addEntry,
  separateEpistemics,
  EPISTEMIC
};

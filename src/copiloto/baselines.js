/**
 * Linhas de base históricas — mediana, percentis, intervalo normal.
 * Não usa média simples como única referência.
 */
"use strict";

const { AREAS } = require("./config");

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function summarize(values) {
  const v = (values || []).filter((x) => typeof x === "number" && !Number.isNaN(x)).slice().sort((a, b) => a - b);
  if (!v.length) {
    return {
      n: 0,
      median: null,
      p25: null,
      p75: null,
      p90: null,
      p95: null,
      min: null,
      max: null,
      iqr: null,
      normal_low: null,
      normal_high: null,
      mean: null,
      stdev: null,
      dispersion: null
    };
  }
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
  const stdev = Math.sqrt(variance);
  const p25 = percentile(v, 25);
  const p75 = percentile(v, 75);
  const median = percentile(v, 50);
  return {
    n: v.length,
    median: round1(median),
    p25: round1(p25),
    p75: round1(p75),
    p90: round1(percentile(v, 90)),
    p95: round1(percentile(v, 95)),
    min: v[0],
    max: v[v.length - 1],
    iqr: round1(p75 - p25),
    normal_low: round1(p25),
    normal_high: round1(p75),
    mean: round1(mean),
    stdev: round1(stdev),
    dispersion: mean ? round1(stdev / mean) : null
  };
}

function round1(x) {
  if (x == null || Number.isNaN(x)) return null;
  return Math.round(x * 10) / 10;
}

/**
 * Gera série sintética calibrada a padrões documentados (jantar dominante ~72%,
 * p99 prod ~71, exp ~57) — rotulada synthetic_calibrated, NÃO dado bruto real.
 */
function generateSyntheticHistory(opts) {
  const o = opts || {};
  const seed = o.seed || 42;
  const days = o.days || 28;
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const samples = [];
  for (let d = 0; d < days; d++) {
    const dow = d % 7; // 0=dom
    for (let hour = 11; hour <= 23; hour++) {
      const isDinner = hour >= 18 && hour <= 21;
      const isWeekend = dow === 0 || dow === 6;
      const baseVol = isDinner ? (isWeekend ? 28 : 22) : hour >= 12 && hour <= 14 ? 10 : 6;
      const volume = Math.max(0, Math.round(baseVol + (rnd() - 0.5) * 8));
      for (const area of Object.keys(AREAS)) {
        if (area === "caixa") continue;
        const areaFactor = { sushi: 1.1, quentes: 0.85, cozinha: 0.7, conferencia: 0.6, motoboy: 0.55 }[area] || 1;
        const queue = Math.max(0, Math.round(volume * 0.15 * areaFactor + rnd() * 3));
        const dwellBase = { sushi: 14, quentes: 13, cozinha: 12, conferencia: 9, motoboy: 18 }[area] || 12;
        const dwell = dwellBase + (isDinner ? 4 : 0) + (rnd() - 0.3) * 10;
        samples.push({
          day_index: d,
          dow,
          hour,
          area,
          volume_orders: volume,
          queue_depth: queue,
          dwell_min: Math.max(2, dwell),
          synthetic: true
        });
      }
    }
  }
  return samples;
}

/**
 * Constrói baselines por área × dia da semana × faixa horária
 */
function buildBaselines(samples) {
  const groups = new Map();
  for (const row of samples || []) {
    const key = `${row.area}|${row.dow}|${bucketHour(row.hour)}`;
    if (!groups.has(key)) groups.set(key, { queue: [], dwell: [], volume: [] });
    const g = groups.get(key);
    g.queue.push(row.queue_depth);
    g.dwell.push(row.dwell_min);
    g.volume.push(row.volume_orders);
  }
  const out = {};
  for (const [key, g] of groups) {
    const [area, dow, hour_band] = key.split("|");
    if (!out[area]) out[area] = [];
    out[area].push({
      area,
      dow: Number(dow),
      hour_band,
      queue: summarize(g.queue),
      dwell_min: summarize(g.dwell),
      volume: summarize(g.volume),
      source: samples[0] && samples[0].synthetic ? "synthetic_calibrated" : "historical",
      confidence: samples[0] && samples[0].synthetic ? "media" : "alta"
    });
  }
  return out;
}

function bucketHour(h) {
  if (h < 14) return "11-13";
  if (h < 17) return "14-16";
  if (h < 20) return "17-19";
  return "20-23";
}

/** Lookup da baseline mais próxima */
function lookupBaseline(baselines, area, dow, hour) {
  const list = (baselines && baselines[area]) || [];
  const band = bucketHour(hour);
  let hit = list.find((b) => b.dow === dow && b.hour_band === band);
  if (hit) return hit;
  // fallback: mesma faixa, qualquer dia
  hit = list.find((b) => b.hour_band === band);
  if (hit) return { ...hit, confidence: "baixa", fallback: true };
  return null;
}

/** Desvio de etapa vs baseline (não é atraso de promessa) */
function stageDeviation(observedMin, baseline) {
  if (observedMin == null || !baseline || baseline.dwell_min.median == null) {
    return { kind: "unknown", ratio: null, minutes_above: null };
  }
  const med = baseline.dwell_min.median;
  const high = baseline.dwell_min.p75;
  const above = observedMin - med;
  const ratio = med > 0 ? observedMin / med : null;
  if (observedMin <= high) return { kind: "normal", ratio, minutes_above: Math.max(0, above) };
  if (observedMin <= (baseline.dwell_min.p90 || high * 1.3)) {
    return { kind: "elevated", ratio, minutes_above: above };
  }
  return { kind: "deviant", ratio, minutes_above: above };
}

module.exports = {
  percentile,
  summarize,
  generateSyntheticHistory,
  buildBaselines,
  lookupBaseline,
  stageDeviation,
  bucketHour
};

/**
 * Motor de previsão 10 / 15 / 30 min — modelos simples e interpretáveis.
 * Default: baseline histórico + tendência linear local + suavização exponencial.
 */
"use strict";

const { FORECAST_HORIZONS } = require("./config");
const { lookupBaseline } = require("./baselines");

function ema(series, alpha) {
  if (!series.length) return null;
  let v = series[0];
  for (let i = 1; i < series.length; i++) v = alpha * series[i] + (1 - alpha) * v;
  return v;
}

function linearSlope(series) {
  const n = series.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += series[i]; sxy += i * series[i]; sxx += i * i;
  }
  const den = n * sxx - sx * sx;
  if (!den) return 0;
  return (n * sxy - sx * sy) / den;
}

/**
 * Previsão de fila/tempo para uma área.
 * @param {object} input
 * @param {string} input.area
 * @param {number[]} input.queue_history - últimos N minutos (mais recente no fim)
 * @param {number[]} [input.dwell_history]
 * @param {object} [input.baselines]
 * @param {number} input.dow
 * @param {number} input.hour
 * @param {number} [input.horizon_min]
 * @param {string} [input.model] - baseline|ema|linear|ensemble
 */
function forecastArea(input) {
  const horizon = input.horizon_min || 15;
  const hist = input.queue_history || [];
  const dwellHist = input.dwell_history || [];
  const current = hist.length ? hist[hist.length - 1] : 0;
  const currentDwell = dwellHist.length ? dwellHist[dwellHist.length - 1] : null;
  const bl = lookupBaseline(input.baselines, input.area, input.dow, input.hour);
  const model = input.model || "ensemble";

  const missing = [];
  if (!hist.length) missing.push("queue_history");
  if (!bl) missing.push("baseline_context");
  if (currentDwell == null) missing.push("dwell_history");

  const baseQueue = bl && bl.queue.median != null ? bl.queue.median : current;
  const slope = linearSlope(hist.slice(-10));
  const emaVal = ema(hist.slice(-12), 0.35);
  const linearPred = current + slope * horizon;
  const emaPred = emaVal != null ? emaVal + slope * horizon * 0.5 : linearPred;
  const baselinePred = baseQueue;

  let point;
  let modelUsed;
  if (model === "baseline") {
    point = baselinePred;
    modelUsed = "baseline";
  } else if (model === "ema") {
    point = emaPred;
    modelUsed = "ema";
  } else if (model === "linear") {
    point = linearPred;
    modelUsed = "linear";
  } else {
    // ensemble interpretável: 40% baseline + 35% ema + 25% linear
    point = 0.4 * baselinePred + 0.35 * (emaPred ?? baselinePred) + 0.25 * linearPred;
    modelUsed = "ensemble_baseline_ema_linear";
  }
  point = Math.max(0, Math.round(point * 10) / 10);

  const spread = bl && bl.queue.iqr != null ? bl.queue.iqr : Math.max(1, Math.abs(slope) * horizon);
  const low = Math.max(0, round1(point - spread * 0.5));
  const high = round1(point + spread * 0.5);

  let confidence = "media";
  if (missing.length >= 2) confidence = "baixa";
  else if (hist.length >= 10 && bl && bl.confidence === "alta") confidence = "alta";
  else if (hist.length < 4) confidence = "baixa";

  const factors = [];
  factors.push({ factor: "current_queue", value: current, weight: "high" });
  if (bl) factors.push({ factor: "historical_median", value: baseQueue, weight: "medium" });
  factors.push({ factor: "local_trend_per_min", value: round1(slope), weight: "medium" });
  if (input.upstream_pressure) {
    factors.push({ factor: "upstream_pressure", value: input.upstream_pressure, weight: "high" });
    point = round1(point + input.upstream_pressure * 0.3);
  }

  const riskOrders = estimateRiskOrders({
    queue: point,
    dwell: currentDwell,
    horizon,
    area: input.area,
    atRiskNow: input.at_risk_orders || 0
  });

  const conclusion = buildConclusion(input.area, point, current, horizon, riskOrders);

  return {
    conclusion,
    horizon_min: horizon,
    area: input.area,
    metric: "queue_depth",
    value: point,
    range: { low, high },
    unit: "pedidos",
    confidence,
    model: modelUsed,
    factors,
    missing_data: missing,
    risk_orders_count: riskOrders,
    dwell_expected_min: currentDwell != null ? round1(currentDwell + slope * 0.2 * horizon) : null,
    change_conditions: [
      "chegada acima do ritmo histórico",
      "liberação rápida de área a montante",
      "falha de dado / desconexão de fonte"
    ],
    epistemic: "inference"
  };
}

function estimateRiskOrders({ queue, dwell, horizon, atRiskNow }) {
  let risk = atRiskNow || 0;
  if (queue >= 8) risk += Math.floor(queue / 4);
  if (dwell != null && dwell > 20) risk += 1;
  if (horizon >= 30 && queue >= 6) risk += 1;
  return risk;
}

function buildConclusion(area, point, current, horizon, risk) {
  const dir = point > current + 1 ? "acumular" : point < current - 1 ? "aliviar" : "manter";
  const riskTxt = risk > 0 ? ` Cerca de ${risk} pedido(s) com risco de prazo.` : "";
  const labels = {
    sushi: "Sushi",
    quentes: "Quentes",
    cozinha: "Cozinha",
    conferencia: "Conferência",
    motoboy: "Motoboy",
    caixa: "Caixa"
  };
  const name = labels[area] || area;
  if (dir === "acumular") {
    return `${name} tende a acumular nos próximos ${horizon} min (fila ~${point}).${riskTxt}`;
  }
  if (dir === "aliviar") {
    return `${name} tende a aliviar nos próximos ${horizon} min (fila ~${point}).${riskTxt}`;
  }
  return `${name} deve se manter estável nos próximos ${horizon} min (fila ~${point}).${riskTxt}`;
}

function forecastAllHorizons(input) {
  return FORECAST_HORIZONS.map((h) => forecastArea({ ...input, horizon_min: h }));
}

/**
 * Backtest walk-forward sem vazamento de futuro.
 * series: number[] por minuto; prediz horizon passos à frente usando só passado.
 */
function backtest(series, horizon, model) {
  const errors = [];
  const preds = [];
  for (let t = 12; t < series.length - horizon; t++) {
    const past = series.slice(0, t + 1);
    const actual = series[t + horizon];
    const f = forecastArea({
      area: "unknown",
      queue_history: past.slice(-20),
      dow: 5,
      hour: 19,
      horizon_min: horizon,
      model: model || "ensemble",
      baselines: null
    });
    const err = Math.abs(f.value - actual);
    errors.push(err);
    preds.push({ t, predicted: f.value, actual, abs_error: err });
  }
  const mae = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
  const p90err = errors.length
    ? errors.slice().sort((a, b) => a - b)[Math.floor(errors.length * 0.9)]
    : null;
  return {
    horizon_min: horizon,
    model: model || "ensemble",
    n: errors.length,
    mae: mae != null ? round1(mae) : null,
    p90_abs_error: p90err != null ? round1(p90err) : null,
    coverage: errors.length ? 1 : 0,
    samples: preds.slice(0, 5) // amostra, não dump completo
  };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

module.exports = {
  forecastArea,
  forecastAllHorizons,
  backtest,
  ema,
  linearSlope
};

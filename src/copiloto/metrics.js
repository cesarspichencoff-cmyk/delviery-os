/**
 * Métricas de produto para validação futura.
 */
"use strict";

const PRODUCT_METRICS = [
  "forecast_lead_time_min",
  "forecast_accuracy",
  "false_alert_rate",
  "missed_alert_rate",
  "focus_switches",
  "focus_duration_min",
  "recommendations_accepted",
  "recommendations_adapted",
  "recommendations_ignored",
  "resolutive_actions",
  "recovery_time_min",
  "interruptions",
  "closing_duration_sec",
  "closing_questions_count",
  "report_quality_score",
  "improvement_across_shifts"
];

function emptyMetrics() {
  const m = {};
  for (const k of PRODUCT_METRICS) m[k] = null;
  return m;
}

function recordFocusSwitch(metrics) {
  metrics.focus_switches = (metrics.focus_switches || 0) + 1;
  return metrics;
}

module.exports = { PRODUCT_METRICS, emptyMetrics, recordFocusSwitch };

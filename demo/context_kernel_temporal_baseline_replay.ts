import { readFileSync } from "node:fs";
import { buildAttentionDeliveryPlan } from "../src/contextKernel/attentionPolicy";
import {
  replayClosingTemporalBaseline,
  type ClosingTemporalObservation,
  type ClosingTemporalMetrics,
} from "../src/contextKernel/temporalBaseline";

type SourceRow = Record<string, unknown>;

function asString(value: unknown): string {
  return String(value ?? "");
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function mapMetrics(row: SourceRow): ClosingTemporalMetrics {
  return {
    gross_total: asNumber(row.report_gross_total),
    lunch_gross: asNumber(row.lunch_gross),
    dinner_gross: asNumber(row.dinner_gross),
    ifood_orders_total: asNumber(row.ifood_orders_total),
    ifood_value_total: asNumber(row.ifood_value_total),
    app_orders_total: asNumber(row.app_orders_total),
    app_value_total: asNumber(row.app_value_total),
    tel_orders_total: asNumber(row.tel_orders_total),
    tel_value_total: asNumber(row.tel_value_total),
    salao_value_total: asNumber(row.salao_value_total),
    discounts_value_total: asNumber(row.discounts_value_total),
  };
}

function mapObservation(row: SourceRow): ClosingTemporalObservation {
  return {
    observation_id: "mail:atendimento:closing:" + asString(row.mailbox_uid),
    business_date: asString(row.business_date),
    source_observed_at: asString(row.message_sent_at),
    ingested_at: asString(row.updated_at),
    readonly_verified: asBool(row.readonly_verified),
    totals_match: asBool(row.totals_match),
    period_label_mismatch: asBool(row.period_label_mismatch),
    metrics: mapMetrics(row),
  };
}

function sourceRows(parsed: unknown): SourceRow[] {
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("wrangler_json_shape_invalid");
  }
  const first = parsed[0] as Record<string, unknown>;
  if (!Array.isArray(first.results)) {
    throw new Error("wrangler_json_results_missing");
  }
  return first.results as SourceRow[];
}

function calendarGapCount(dates: readonly string[]): number {
  if (dates.length < 2) return 0;
  const sorted = [...dates].sort();
  const start = Date.parse(sorted[0] + "T00:00:00.000Z");
  const end = Date.parse(sorted[sorted.length - 1] + "T00:00:00.000Z");
  const seen = new Set(sorted);
  let gaps = 0;
  for (let time = start; time <= end; time += 86_400_000) {
    const day = new Date(time).toISOString().slice(0, 10);
    if (!seen.has(day)) gaps += 1;
  }
  return gaps;
}

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function weekdayCoverage(dates: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const label of WEEKDAY) result[label] = 0;
  for (const date of dates) {
    const day = new Date(date + "T00:00:00.000Z").getUTCDay();
    result[WEEKDAY[day]] += 1;
  }
  return result;
}

function lagCounts(observations: readonly ClosingTemporalObservation[]) {
  let over24h = 0;
  let over7d = 0;
  for (const item of observations) {
    const lag =
      Date.parse(item.ingested_at) - Date.parse(item.source_observed_at);
    if (lag > 24 * 60 * 60 * 1000) over24h += 1;
    if (lag > 7 * 24 * 60 * 60 * 1000) over7d += 1;
  }
  return {
    ingestion_lag_over_24h: over24h,
    ingestion_lag_over_7d: over7d,
  };
}

const inputPath = process.argv[2];
if (!inputPath) throw new Error("closing_export_path_required");

const text = readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const rows = sourceRows(JSON.parse(text));
const observations = rows.map(mapObservation);
const replay = replayClosingTemporalBaseline(observations);
const dates = observations.map((item) => item.business_date).sort();
const latest = replay.steps.at(-1);
const governorPlan = buildAttentionDeliveryPlan({
  needs_me: {
    state: "NO_KNOWN_NEED",
    mode: "UNKNOWN",
    reasons: [],
    global_clearance_claimed: false,
  },
  policy: [],
});

const candidateDays = replay.steps
  .filter((step) => step.anomaly_candidates.length > 0)
  .map((step) => ({
    business_date: step.business_date,
    candidates: step.anomaly_candidates.map((candidate) => ({
      metric: candidate.metric,
      direction: candidate.direction,
    })),
  }));

console.log(JSON.stringify({
  status: "PASS",
  source: "D1:cesar-gerencial-mail-bridge.daily_closings",
  replay_truth_class: replay.summary.replay_truth_class,
  data_scope: {
    row_count: observations.length,
    first_business_date: dates[0],
    last_business_date: dates.at(-1),
    calendar_gaps_observed: calendarGapCount(dates),
    weekday_source_counts: weekdayCoverage(dates),
    ...lagCounts(observations),
  },
  data_quality: {
    eligible_observations: replay.summary.eligible_observations,
    zero_gross_rows: replay.summary.zero_gross_rows,
    duplicate_metric_signature_rows:
      replay.summary.duplicate_metric_signature_rows,
    financial_reconciliation_open_rows:
      replay.summary.financial_reconciliation_open_rows,
    period_mapping_open_rows: replay.summary.period_mapping_open_rows,
  },
  temporal_replay: {
    ready_baseline_steps: replay.summary.ready_baseline_steps,
    insufficient_peer_steps: replay.summary.insufficient_peer_steps,
    anomaly_candidate_count: replay.summary.anomaly_candidate_count,
    days_with_anomaly_candidates:
      replay.summary.days_with_anomaly_candidates,
    candidate_days: candidateDays,
    latest_step: latest
      ? {
          business_date: latest.business_date,
          baseline_status: latest.baseline_status,
          peer_count_same_weekday: latest.peer_count_same_weekday,
          anomaly_candidate_count: latest.anomaly_candidates.length,
        }
      : null,
  },
  attention_replay: {
    evaluated_closing_steps: replay.steps.length,
    historical_mode_known: false,
    governor_mode_used: governorPlan.mode,
    needs_me_state: governorPlan.needs_me_state,
    reason_decision_count: governorPlan.reason_decisions.length,
    temporal_candidates_to_direct_attention_reasons:
      replay.summary.direct_attention_reasons_created,
    show_now_from_temporal_only: governorPlan.reason_decisions.filter(
      (item) => item.disposition === "SHOW_NOW",
    ).length,
    governor_effect_authorized: governorPlan.effect_authorized,
    external_effects_authorized: replay.summary.external_effects_authorized,
  },
}, null, 2));

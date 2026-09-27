/**
 * Retrospective temporal baseline for daily closing observations.
 *
 * Descriptive only: it can surface historical outlier candidates, but never
 * creates a NeedsMe reason, proves cause, or authorizes an external effect.
 */
export const CLOSING_TEMPORAL_BASELINE_VERSION =
  "closing-temporal-baseline@0.1.0";

export const CLOSING_TEMPORAL_METRICS = [
  "gross_total",
  "ifood_orders_total",
  "ifood_value_total",
  "salao_value_total",
  "discounts_value_total",
] as const;

export type ClosingTemporalMetric =
  (typeof CLOSING_TEMPORAL_METRICS)[number];

export interface ClosingTemporalMetrics {
  gross_total: number | null;
  lunch_gross: number | null;
  dinner_gross: number | null;
  ifood_orders_total: number | null;
  ifood_value_total: number | null;
  app_orders_total: number | null;
  app_value_total: number | null;
  tel_orders_total: number | null;
  tel_value_total: number | null;
  salao_value_total: number | null;
  discounts_value_total: number | null;
}

export interface ClosingTemporalObservation {
  observation_id: string;
  business_date: string;
  source_observed_at: string;
  ingested_at: string;
  readonly_verified: boolean;
  totals_match: boolean;
  period_label_mismatch: boolean;
  metrics: ClosingTemporalMetrics;
}

export type TemporalQualityIssue =
  | "READ_ONLY_UNVERIFIED"
  | "ZERO_GROSS_ROW"
  | "DUPLICATE_METRIC_SIGNATURE"
  | "FINANCIAL_RECONCILIATION_OPEN"
  | "PERIOD_LABEL_MAPPING_OPEN";

export interface TemporalAnomalyCandidate {
  metric: ClosingTemporalMetric;
  direction: "LOW" | "HIGH";
  observed_value: number;
  peer_count: number;
  peer_median: number;
  peer_q1: number;
  peer_q3: number;
  lower_fence: number;
  upper_fence: number;
  peer_scope: "SAME_WEEKDAY_PRIOR_ONLY";
  diagnostic_rule: "TUKEY_1_5_IQR";
  diagnostic_only: true;
  causal_status: "UNPROVEN";
  needs_me_reason_created: false;
  external_effect_authorized: false;
}

export interface ClosingTemporalReplayStep {
  observation_id: string;
  business_date: string;
  weekday_utc: number;
  quality_issues: TemporalQualityIssue[];
  baseline_eligible: boolean;
  peer_count_same_weekday: number;
  baseline_status: "EXCLUDED" | "INSUFFICIENT_PEERS" | "READY";
  anomaly_candidates: TemporalAnomalyCandidate[];
  attention_authority: "NONE";
}

export interface ClosingTemporalReplaySummary {
  baseline_version: typeof CLOSING_TEMPORAL_BASELINE_VERSION;
  replay_truth_class: "RETROSPECTIVE_SIMULATION";
  total_observations: number;
  eligible_observations: number;
  zero_gross_rows: number;
  duplicate_metric_signature_rows: number;
  read_only_unverified_rows: number;
  financial_reconciliation_open_rows: number;
  period_mapping_open_rows: number;
  ready_baseline_steps: number;
  insufficient_peer_steps: number;
  anomaly_candidate_count: number;
  days_with_anomaly_candidates: number;
  direct_attention_reasons_created: 0;
  external_effects_authorized: false;
}

export interface ClosingTemporalReplay {
  summary: ClosingTemporalReplaySummary;
  steps: ClosingTemporalReplayStep[];
}

const SIGNATURE_METRICS: readonly (keyof ClosingTemporalMetrics)[] = [
  "gross_total",
  "lunch_gross",
  "dinner_gross",
  "ifood_orders_total",
  "ifood_value_total",
  "app_orders_total",
  "app_value_total",
  "tel_orders_total",
  "tel_value_total",
  "salao_value_total",
  "discounts_value_total",
];

const MIN_PRIOR_WEEKDAY_PEERS = 4;

export function replayClosingTemporalBaseline(
  input: readonly ClosingTemporalObservation[],
): ClosingTemporalReplay {
  const observations = [...input].sort(
    (a, b) =>
      a.business_date.localeCompare(b.business_date) ||
      a.observation_id.localeCompare(b.observation_id),
  );
  assertObservationSet(observations);

  const prior: Array<{
    observation: ClosingTemporalObservation;
    weekday: number;
    eligible: boolean;
  }> = [];
  const seenSignatures = new Map<string, string>();
  const steps: ClosingTemporalReplayStep[] = [];
  for (const observation of observations) {
    const weekday = weekdayUtc(observation.business_date);
    const issues: TemporalQualityIssue[] = [];
    if (!observation.readonly_verified) issues.push("READ_ONLY_UNVERIFIED");
    if (observation.metrics.gross_total === 0) issues.push("ZERO_GROSS_ROW");
    if (!observation.totals_match) {
      issues.push("FINANCIAL_RECONCILIATION_OPEN");
    }
    if (observation.period_label_mismatch) {
      issues.push("PERIOD_LABEL_MAPPING_OPEN");
    }

    const signature = metricSignature(observation.metrics);
    if (seenSignatures.has(signature)) {
      issues.push("DUPLICATE_METRIC_SIGNATURE");
    }

    const eligible =
      observation.readonly_verified &&
      observation.metrics.gross_total !== null &&
      observation.metrics.gross_total > 0 &&
      !issues.includes("DUPLICATE_METRIC_SIGNATURE");

    const peers = prior.filter(
      (item) => item.eligible && item.weekday === weekday,
    );
    const anomalyCandidates = eligible
      ? buildAnomalyCandidates(
          observation,
          peers.map((item) => item.observation),
        )
      : [];

    const peerCount = peers.length;
    const status: ClosingTemporalReplayStep["baseline_status"] = !eligible
      ? "EXCLUDED"
      : peerCount < MIN_PRIOR_WEEKDAY_PEERS
        ? "INSUFFICIENT_PEERS"
        : "READY";

    steps.push({
      observation_id: observation.observation_id,
      business_date: observation.business_date,
      weekday_utc: weekday,
      quality_issues: issues,
      baseline_eligible: eligible,
      peer_count_same_weekday: peerCount,
      baseline_status: status,
      anomaly_candidates: anomalyCandidates,
      attention_authority: "NONE",
    });
    prior.push({ observation, weekday, eligible });
    if (eligible && !seenSignatures.has(signature)) {
      seenSignatures.set(signature, observation.observation_id);
    }
  }

  return {
    summary: summarize(steps),
    steps,
  };
}

function buildAnomalyCandidates(
  observation: ClosingTemporalObservation,
  peers: readonly ClosingTemporalObservation[],
): TemporalAnomalyCandidate[] {
  const candidates: TemporalAnomalyCandidate[] = [];

  for (const metric of CLOSING_TEMPORAL_METRICS) {
    const observed = observation.metrics[metric];
    const values = peers
      .map((peer) => peer.metrics[metric])
      .filter((value): value is number => value !== null);

    if (observed === null || values.length < MIN_PRIOR_WEEKDAY_PEERS) {
      continue;
    }
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    if (observed >= lowerFence && observed <= upperFence) continue;

    candidates.push({
      metric,
      direction: observed < lowerFence ? "LOW" : "HIGH",
      observed_value: observed,
      peer_count: values.length,
      peer_median: quantile(values, 0.5),
      peer_q1: q1,
      peer_q3: q3,
      lower_fence: lowerFence,
      upper_fence: upperFence,
      peer_scope: "SAME_WEEKDAY_PRIOR_ONLY",
      diagnostic_rule: "TUKEY_1_5_IQR",
      diagnostic_only: true,
      causal_status: "UNPROVEN",
      needs_me_reason_created: false,
      external_effect_authorized: false,
    });
  }
  return candidates;
}

function summarize(
  steps: readonly ClosingTemporalReplayStep[],
): ClosingTemporalReplaySummary {
  const issueCount = (issue: TemporalQualityIssue) =>
    steps.filter((step) => step.quality_issues.includes(issue)).length;

  return {
    baseline_version: CLOSING_TEMPORAL_BASELINE_VERSION,
    replay_truth_class: "RETROSPECTIVE_SIMULATION",
    total_observations: steps.length,
    eligible_observations: steps.filter((step) => step.baseline_eligible).length,
    zero_gross_rows: issueCount("ZERO_GROSS_ROW"),
    duplicate_metric_signature_rows: issueCount("DUPLICATE_METRIC_SIGNATURE"),
    read_only_unverified_rows: issueCount("READ_ONLY_UNVERIFIED"),
    financial_reconciliation_open_rows: issueCount(
      "FINANCIAL_RECONCILIATION_OPEN",
    ),
    period_mapping_open_rows: issueCount("PERIOD_LABEL_MAPPING_OPEN"),
    ready_baseline_steps: steps.filter(
      (step) => step.baseline_status === "READY",
    ).length,
    insufficient_peer_steps: steps.filter(
      (step) => step.baseline_status === "INSUFFICIENT_PEERS",
    ).length,
    anomaly_candidate_count: steps.reduce(
      (sum, step) => sum + step.anomaly_candidates.length,
      0,
    ),
    days_with_anomaly_candidates: steps.filter(
      (step) => step.anomaly_candidates.length > 0,
    ).length,
    direct_attention_reasons_created: 0,
    external_effects_authorized: false,
  };
}

function metricSignature(metrics: ClosingTemporalMetrics): string {
  return SIGNATURE_METRICS.map((metric) => {
    const value = metrics[metric];
    return value === null ? "null" : String(value);
  }).join("|");
}

function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("temporal_quantile_empty");
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return (
    sorted[lower] +
    (sorted[upper] - sorted[lower]) * (position - lower)
  );
}

function weekdayUtc(businessDate: string): number {
  return parseBusinessDate(businessDate).getUTCDay();
}

function parseBusinessDate(businessDate: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error("invalid_temporal_business_date");
  }
  const parsed = new Date(businessDate + "T00:00:00.000Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== businessDate
  ) {
    throw new Error("invalid_temporal_business_date");
  }
  return parsed;
}

function assertObservationSet(
  observations: readonly ClosingTemporalObservation[],
): void {
  const ids = new Set<string>();
  const dates = new Set<string>();

  for (const observation of observations) {
    if (!observation.observation_id.trim()) {
      throw new Error("invalid_temporal_observation_id");
    }
    parseBusinessDate(observation.business_date);
    if (!Number.isFinite(Date.parse(observation.source_observed_at))) {
      throw new Error("invalid_temporal_source_observed_at");
    }
    if (!Number.isFinite(Date.parse(observation.ingested_at))) {
      throw new Error("invalid_temporal_ingested_at");
    }
    if (ids.has(observation.observation_id)) {
      throw new Error("duplicate_temporal_observation_id");
    }
    if (dates.has(observation.business_date)) {
      throw new Error("duplicate_temporal_business_date");
    }
    ids.add(observation.observation_id);
    dates.add(observation.business_date);
    assertMetrics(observation.metrics);
  }
}

function assertMetrics(metrics: ClosingTemporalMetrics): void {
  for (const value of Object.values(metrics)) {
    if (value !== null && !Number.isFinite(value)) {
      throw new Error("invalid_temporal_metric");
    }
  }
}

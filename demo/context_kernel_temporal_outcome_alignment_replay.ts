import { readFileSync } from "node:fs";
import {
  replayClosingTemporalBaseline,
  type ClosingTemporalMetrics,
  type ClosingTemporalObservation,
} from "../src/contextKernel/temporalBaseline";
import {
  alignObservedOutcomesToTemporalReplay,
  type ObservedOutcomeEvidence,
} from "../src/contextKernel/temporalOutcomeAlignment";

type SourceRow = Record<string, unknown>;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metrics(row: SourceRow): ClosingTemporalMetrics {
  return {
    gross_total: num(row.report_gross_total),
    lunch_gross: num(row.lunch_gross),
    dinner_gross: num(row.dinner_gross),
    ifood_orders_total: num(row.ifood_orders_total),
    ifood_value_total: num(row.ifood_value_total),
    app_orders_total: num(row.app_orders_total),
    app_value_total: num(row.app_value_total),
    tel_orders_total: num(row.tel_orders_total),
    tel_value_total: num(row.tel_value_total),
    salao_value_total: num(row.salao_value_total),
    discounts_value_total: num(row.discounts_value_total),
  };
}

function observation(row: SourceRow): ClosingTemporalObservation {
  return {
    observation_id: "mail:atendimento:closing:" + String(row.mailbox_uid),
    business_date: String(row.business_date),
    source_observed_at: String(row.message_sent_at),
    ingested_at: String(row.updated_at),
    readonly_verified: row.readonly_verified === 1,
    totals_match: row.totals_match === 1,
    period_label_mismatch: row.period_label_mismatch === 1,
    metrics: metrics(row),
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
const REVIEW_RECEIPT =
  "GERENCIAL_WATCH_IFOOD_LIVE_RECEIPT_2026-09-24.md";
const PULSE_CALIBRATION =
  "GERENCIAL_WATCH_ANOMALY_CALIBRATION_2026-09-23.md";
const GERENCIAL_REPORT =
  "TATA_GERENCIAL_WATCH_RELATORIO_23-09-2026.md";

const observedOutcomes: ObservedOutcomeEvidence[] = [
  {
    business_date: "2026-08-21",
    evidence_kinds: ["CUSTOMER_REVIEW", "CRITICAL_INCIDENT"],
    source_refs: [REVIEW_RECEIPT, GERENCIAL_REPORT],
    observed_outcome: true,
  },
  {
    business_date: "2026-08-22",
    evidence_kinds: ["CUSTOMER_REVIEW", "CRITICAL_INCIDENT"],
    source_refs: [REVIEW_RECEIPT, GERENCIAL_REPORT],
    observed_outcome: true,
  },
  {
    business_date: "2026-08-26",
    evidence_kinds: ["CUSTOMER_REVIEW", "PULSE_OCCURRENCE_CLUSTER"],
    source_refs: [REVIEW_RECEIPT, PULSE_CALIBRATION],
    observed_outcome: true,
  },
  {
    business_date: "2026-08-28",
    evidence_kinds: ["CUSTOMER_REVIEW", "PULSE_OCCURRENCE_CLUSTER"],
    source_refs: [REVIEW_RECEIPT, PULSE_CALIBRATION],
    observed_outcome: true,
  },
  {
    business_date: "2026-08-29",
    evidence_kinds: ["CUSTOMER_REVIEW", "PULSE_OCCURRENCE_CLUSTER"],
    source_refs: [REVIEW_RECEIPT, PULSE_CALIBRATION],
    observed_outcome: true,
  },
  {
    business_date: "2026-08-31",
    evidence_kinds: ["CUSTOMER_REVIEW", "PULSE_OCCURRENCE_CLUSTER"],
    source_refs: [REVIEW_RECEIPT, PULSE_CALIBRATION],
    observed_outcome: true,
  },
  {
    business_date: "2026-09-12",
    evidence_kinds: ["CRITICAL_INCIDENT"],
    source_refs: [GERENCIAL_REPORT],
    observed_outcome: true,
  },
  {
    business_date: "2026-09-15",
    evidence_kinds: ["PULSE_OCCURRENCE_CLUSTER"],
    source_refs: [PULSE_CALIBRATION],
    observed_outcome: true,
  },
  {
    business_date: "2026-09-18",
    evidence_kinds: ["CRITICAL_INCIDENT", "RECURRENCE_PATTERN"],
    source_refs: [GERENCIAL_REPORT],
    observed_outcome: true,
  },
  {
    business_date: "2026-09-19",
    evidence_kinds: ["CRITICAL_INCIDENT", "RECURRENCE_PATTERN"],
    source_refs: [GERENCIAL_REPORT],
    observed_outcome: true,
  },
  {
    business_date: "2026-09-20",
    evidence_kinds: ["RECURRENCE_PATTERN"],
    source_refs: [GERENCIAL_REPORT],
    observed_outcome: true,
  },
  {
    business_date: "2026-09-21",
    evidence_kinds: ["RECURRENCE_PATTERN"],
    source_refs: [GERENCIAL_REPORT],
    observed_outcome: true,
  },
];

const inputPath = process.argv[2];
if (!inputPath) throw new Error("closing_export_path_required");
const text = readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const rows = sourceRows(JSON.parse(text));
const replay = replayClosingTemporalBaseline(rows.map(observation));
const alignment = alignObservedOutcomesToTemporalReplay(
  replay,
  observedOutcomes,
);

console.log(JSON.stringify({
  status: "PASS",
  source_scope: {
    closing_source: "D1:cesar-gerencial-mail-bridge.daily_closings",
    outcome_sources: [
      REVIEW_RECEIPT,
      PULSE_CALIBRATION,
      GERENCIAL_REPORT,
    ],
    outcome_source_is_exhaustive: false,
  },
  summary: alignment.summary,
  rows: alignment.rows.map((row) => ({
    business_date: row.business_date,
    evidence_kinds: row.evidence_kinds,
    baseline_status: row.baseline_status,
    temporal_candidate_count: row.temporal_candidate_count,
    status: row.status,
  })),
  interpretation_guards: {
    no_outcome_record_does_not_mean_no_incident: true,
    overlap_does_not_prove_cause: true,
    temporal_silence_does_not_mean_false_negative_without_full_coverage: true,
    temporal_baseline_is_not_incident_detector: true,
    attention_authority: "NONE",
    external_effects_authorized: false,
  },
}, null, 2));

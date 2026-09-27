import { strict as assert } from "node:assert";
import {
  replayClosingTemporalBaseline,
  type ClosingTemporalObservation,
} from "../src/contextKernel/temporalBaseline";
import {
  alignObservedOutcomesToTemporalReplay,
  type ObservedOutcomeEvidence,
} from "../src/contextKernel/temporalOutcomeAlignment";

function observation(
  businessDate: string,
  gross: number,
): ClosingTemporalObservation {
  return {
    observation_id: "closing:" + businessDate,
    business_date: businessDate,
    source_observed_at: businessDate + "T23:00:00.000Z",
    ingested_at: businessDate + "T23:10:00.000Z",
    readonly_verified: true,
    totals_match: true,
    period_label_mismatch: false,
    metrics: {
      gross_total: gross,
      lunch_gross: gross * 0.25,
      dinner_gross: gross * 0.75,
      ifood_orders_total: Math.round(gross),
      ifood_value_total: gross * 0.6,
      app_orders_total: 2,
      app_value_total: 100,
      tel_orders_total: 0,
      tel_value_total: 0,
      salao_value_total: gross * 0.35,
      discounts_value_total: gross * 0.01,
    },
  };
}

function outcome(
  businessDate: string,
  kind: ObservedOutcomeEvidence["evidence_kinds"][number] =
    "CUSTOMER_REVIEW",
): ObservedOutcomeEvidence {
  return {
    business_date: businessDate,
    evidence_kinds: [kind],
    source_refs: ["fixture:" + businessDate],
    observed_outcome: true,
  };
}

const replay = replayClosingTemporalBaseline([
  observation("2026-08-03", 100),
  observation("2026-08-10", 102),
  observation("2026-08-17", 98),
  observation("2026-08-24", 101),
  observation("2026-08-31", 250),
  observation("2026-09-07", 103),
]);

const aligned = alignObservedOutcomesToTemporalReplay(replay, [
  outcome("2026-07-27"),
  outcome("2026-08-24"),
  outcome("2026-08-31", "PULSE_OCCURRENCE_CLUSTER"),
  outcome("2026-09-07", "CRITICAL_INCIDENT"),
]);

assert.equal(aligned.summary.observed_outcome_dates, 4);
assert.equal(aligned.summary.baseline_missing_dates, 1);
assert.equal(aligned.summary.baseline_insufficient_dates, 1);
assert.equal(aligned.summary.ready_outcome_dates, 2);
assert.equal(aligned.summary.temporal_candidate_overlap_dates, 1);
assert.equal(aligned.summary.temporal_silent_on_observed_outcome_dates, 1);
assert.equal(aligned.summary.non_outcome_dates_are_unknown, true);
assert.equal(aligned.summary.false_positive_rate_authorized, false);
assert.equal(aligned.summary.incident_detection_claim_authorized, false);
assert.equal(aligned.summary.external_effects_authorized, false);

assert.equal(aligned.rows[0].status, "BASELINE_MISSING");
assert.equal(aligned.rows[1].status, "BASELINE_INSUFFICIENT");
assert.equal(aligned.rows[2].status, "TEMPORAL_CANDIDATE_OVERLAP");
assert.equal(
  aligned.rows[3].status,
  "TEMPORAL_SILENT_ON_OBSERVED_OUTCOME",
);
assert.ok(aligned.rows.every((row) => row.causal_status === "UNPROVEN"));
assert.ok(aligned.rows.every((row) => row.attention_authority === "NONE"));

assert.throws(
  () =>
    alignObservedOutcomesToTemporalReplay(replay, [
      outcome("2026-08-31"),
      outcome("2026-08-31"),
    ]),
  /duplicate_observed_outcome_date/,
);

assert.throws(
  () =>
    alignObservedOutcomesToTemporalReplay(replay, [
      {
        ...outcome("2026-02-03"),
        business_date: "2026-02-31",
      },
    ]),
  /invalid_outcome_business_date/,
);

console.log(JSON.stringify({
  status: "PASS",
  outcome_absence_not_assumed: true,
  baseline_missing_preserved: true,
  baseline_insufficient_preserved: true,
  observed_overlap_measured_without_causal_claim: true,
  observed_silence_measured_without_false_negative_claim: true,
  false_positive_rate_blocked_without_exhaustive_outcomes: true,
  attention_authority: "NONE",
  external_effects_authorized: false,
}, null, 2));

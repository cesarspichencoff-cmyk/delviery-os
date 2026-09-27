import { strict as assert } from "node:assert";
import { buildAttentionDeliveryPlan } from "../src/contextKernel/attentionPolicy";
import {
  replayClosingTemporalBaseline,
  type ClosingTemporalObservation,
} from "../src/contextKernel/temporalBaseline";

function observation(
  businessDate: string,
  gross: number,
  overrides: Partial<ClosingTemporalObservation> = {},
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
    ...overrides,
  };
}

const mondayReplay = replayClosingTemporalBaseline([
  observation("2026-08-03", 100),
  observation("2026-08-10", 102),
  observation("2026-08-17", 98),
  observation("2026-08-24", 101),
  observation("2026-08-31", 250),
]);

assert.equal(mondayReplay.steps[0].baseline_status, "INSUFFICIENT_PEERS");
assert.equal(mondayReplay.steps[3].baseline_status, "INSUFFICIENT_PEERS");
assert.equal(mondayReplay.steps[4].baseline_status, "READY");
assert.ok(
  mondayReplay.steps[4].anomaly_candidates.some(
    (item) => item.metric === "gross_total" && item.direction === "HIGH",
  ),
);
assert.equal(mondayReplay.summary.direct_attention_reasons_created, 0);
assert.equal(mondayReplay.summary.external_effects_authorized, false);

const governor = buildAttentionDeliveryPlan({
  needs_me: {
    state: "NO_KNOWN_NEED",
    mode: "UNKNOWN",
    reasons: [],
    global_clearance_claimed: false,
  },
  policy: [],
});
assert.equal(governor.reason_decisions.length, 0);
assert.equal(governor.effect_authorized, false);
const duplicate = observation("2026-09-03", 100, {
  metrics: { ...observation("2026-08-03", 100).metrics },
});
const duplicateReplay = replayClosingTemporalBaseline([
  observation("2026-08-03", 100),
  duplicate,
]);
assert.equal(duplicateReplay.steps[1].baseline_eligible, false);
assert.ok(
  duplicateReplay.steps[1].quality_issues.includes(
    "DUPLICATE_METRIC_SIGNATURE",
  ),
);

const zeroReplay = replayClosingTemporalBaseline([
  observation("2026-07-22", 0),
]);
assert.equal(zeroReplay.steps[0].baseline_status, "EXCLUDED");
assert.ok(zeroReplay.steps[0].quality_issues.includes("ZERO_GROSS_ROW"));

const qualityDebt = replayClosingTemporalBaseline([
  observation("2026-09-17", 90, {
    totals_match: false,
    period_label_mismatch: true,
  }),
]);
assert.equal(qualityDebt.steps[0].baseline_eligible, true);
assert.ok(
  qualityDebt.steps[0].quality_issues.includes(
    "FINANCIAL_RECONCILIATION_OPEN",
  ),
);
assert.ok(
  qualityDebt.steps[0].quality_issues.includes("PERIOD_LABEL_MAPPING_OPEN"),
);

assert.throws(
  () =>
    replayClosingTemporalBaseline([
      observation("2026-08-03", 100),
      {
        ...observation("2026-08-03", 101),
        observation_id: "closing:duplicate-date",
      },
    ]),
  /duplicate_temporal_business_date/,
);

const unverifiedDoesNotPoisonSignature = replayClosingTemporalBaseline([
  observation("2026-08-03", 100, { readonly_verified: false }),
  observation("2026-09-03", 100),
]);
assert.equal(unverifiedDoesNotPoisonSignature.steps[0].baseline_eligible, false);
assert.equal(unverifiedDoesNotPoisonSignature.steps[1].baseline_eligible, true);
assert.ok(
  !unverifiedDoesNotPoisonSignature.steps[1].quality_issues.includes(
    "DUPLICATE_METRIC_SIGNATURE",
  ),
);

assert.throws(
  () =>
    replayClosingTemporalBaseline([
      {
        ...observation("2026-02-03", 100),
        business_date: "2026-02-31",
      },
    ]),
  /invalid_temporal_business_date/,
);

console.log(JSON.stringify({
  status: "PASS",
  prior_only_same_weekday_baseline: true,
  robust_iqr_diagnostic_only: true,
  duplicate_metric_signature_excluded: true,
  zero_gross_row_excluded: true,
  reconciliation_debt_preserved: true,
  temporal_candidate_does_not_create_attention_reason: true,
  external_effect_authorized: false,
}, null, 2));

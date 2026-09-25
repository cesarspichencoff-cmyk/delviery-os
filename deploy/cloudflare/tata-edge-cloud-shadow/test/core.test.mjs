import test from "node:test";
import assert from "node:assert/strict";
import {
  CLOSING_SOURCE,
  ProducerError,
  closingRowToEdgeHandoff,
  normalizeClosingRow,
  shouldDispatchClosing,
} from "../src/core.mjs";

function closing(overrides = {}) {
  return {
    mailbox_uid: 100,
    business_date: "2026-09-24",
    message_sent_at: "2026-09-25T02:57:22.000Z",
    updated_at: "2026-09-25T03:00:39.554Z",
    readonly_verified: 1,
    totals_match: 1,
    period_label_mismatch: 1,
    ...overrides,
  };
}

test("verified closing becomes a FACT handoff without financial payload", () => {
  const handoff = closingRowToEdgeHandoff(
    closing(),
    "2026-09-25T17:00:00.000Z",
  );

  assert.equal(handoff.source_mode, "live_observed");
  assert.equal(handoff.fact_class, "FACT");
  assert.equal(handoff.observation_count, 1);
  assert.equal(handoff.source_coverage[0].source, CLOSING_SOURCE);
  assert.equal(handoff.source_coverage[0].unit_id, undefined);
  assert.equal(handoff.source_watermark_at, "2026-09-25T03:00:39.554Z");
  assert.equal(handoff.global_coverage_claim, "NOT_PROVIDED");
  assert.equal(handoff.external_effect_authorized, false);

  const serialized = JSON.stringify(handoff);
  assert.equal(serialized.includes("report_gross_total"), false);
  assert.equal(serialized.includes("ifood_value_total"), false);
  assert.equal(serialized.includes("discounts_value_total"), false);
});

test("unverified source cannot become FACT", () => {
  assert.throws(
    () => normalizeClosingRow(closing({ readonly_verified: 0 })),
    /closing_not_readonly_verified/,
  );
});

test("first source observation dispatches", () => {
  const decision = shouldDispatchClosing(closing(), {
    coverage: [],
  });
  assert.equal(decision.dispatch, true);
  assert.equal(decision.reason, "source_not_present_in_snapshot");
});

test("same source watermark is replay-safe", () => {
  const decision = shouldDispatchClosing(closing(), {
    coverage: [{
      source: CLOSING_SOURCE,
      last_observed_at: "2026-09-25T03:00:39.554Z",
    }],
  });
  assert.equal(decision.dispatch, false);
  assert.equal(decision.reason, "source_already_observed");
});

test("newer source watermark dispatches", () => {
  const decision = shouldDispatchClosing(
    closing({ updated_at: "2026-09-25T04:00:00.000Z" }),
    {
      coverage: [{
        source: CLOSING_SOURCE,
        last_observed_at: "2026-09-25T03:00:39.554Z",
      }],
    },
  );
  assert.equal(decision.dispatch, true);
  assert.equal(decision.reason, "new_source_observation");
});

test("producer generation cannot predate source observation", () => {
  assert.throws(
    () => closingRowToEdgeHandoff(
      closing(),
      "2026-09-25T02:00:00.000Z",
    ),
    /closing_observed_after_generation/,
  );
});

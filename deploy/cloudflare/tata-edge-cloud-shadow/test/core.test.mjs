import test from "node:test";
import assert from "node:assert/strict";
import {
  CLOSING_SOURCE,
  IFOOD_REVIEW_SOURCE,
  ProducerError,
  closingRowToEdgeHandoff,
  normalizeClosingRow,
  normalizeIfoodReviewRow,
  operationalRowsToEdgeHandoff,
  shouldDispatchClosing,
  shouldDispatchIfoodReview,
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

function ifoodReview(overrides = {}) {
  return {
    uid_validity: "1641920722",
    mailbox_uid: 300,
    message_sent_at: "2026-09-25T15:30:00.000Z",
    updated_at: "2026-09-25T15:31:00.000Z",
    readonly_verified: 1,
    attachment_count: 4,
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
  assert.equal(handoff.source_watermark_at, "2026-09-25T02:57:22.000Z");
  assert.equal(handoff.global_coverage_claim, "NOT_PROVIDED");
  assert.equal(handoff.external_effect_authorized, false);

  const serialized = JSON.stringify(handoff);
  assert.equal(serialized.includes("report_gross_total"), false);
  assert.equal(serialized.includes("ifood_value_total"), false);
  assert.equal(serialized.includes("discounts_value_total"), false);
});

test("canonical iFood review row keeps source time separate from ingestion time", () => {
  const normalized = normalizeIfoodReviewRow(ifoodReview());
  assert.equal(normalized.uid_validity, "1641920722");
  assert.equal(normalized.source_observed_at, "2026-09-25T15:30:00.000Z");
  assert.equal(normalized.ingested_at, "2026-09-25T15:31:00.000Z");
  assert.equal(normalized.attachment_count, 4);
});

test("closing and iFood review compose one minimized FACT handoff", () => {
  const handoff = operationalRowsToEdgeHandoff({
    closingRow: closing(),
    ifoodReviewRow: ifoodReview(),
  }, "2026-09-25T17:00:00.000Z");

  assert.equal(handoff.observation_count, 2);
  assert.deepEqual(
    handoff.source_coverage.map((item) => item.source),
    [CLOSING_SOURCE, IFOOD_REVIEW_SOURCE],
  );
  assert.equal(handoff.source_watermark_at, "2026-09-25T15:30:00.000Z");
  assert.equal(handoff.external_effect_authorized, false);
});

test("unverified iFood review cannot become FACT", () => {
  assert.throws(
    () => normalizeIfoodReviewRow(ifoodReview({ readonly_verified: 0 })),
    /ifood_review_not_readonly_verified/,
  );
});

test("iFood review replay is source-specific", () => {
  const decision = shouldDispatchIfoodReview(ifoodReview(), {
    coverage: [{
      source: IFOOD_REVIEW_SOURCE,
      last_observed_at: "2026-09-25T15:30:00.000Z",
    }],
  });
  assert.equal(decision.dispatch, false);
  assert.equal(decision.reason, "source_already_observed");
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
      last_observed_at: "2026-09-25T02:57:22.000Z",
    }],
  });
  assert.equal(decision.dispatch, false);
  assert.equal(decision.reason, "source_already_observed");
});

test("newer source watermark dispatches", () => {
  const decision = shouldDispatchClosing(
    closing({
      message_sent_at: "2026-09-25T03:30:00.000Z",
      updated_at: "2026-09-25T04:00:00.000Z",
    }),
    {
      coverage: [{
        source: CLOSING_SOURCE,
        last_observed_at: "2026-09-25T02:57:22.000Z",
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
    /closing_source_observed_after_generation/,
  );
});


test("ingestion time cannot manufacture source freshness", () => {
  const normalized = normalizeClosingRow(closing({
    business_date: "2026-09-19",
    message_sent_at: "2026-09-20T03:02:16.000Z",
    updated_at: "2026-09-25T10:00:00.000Z",
  }));

  assert.equal(normalized.source_observed_at, "2026-09-20T03:02:16.000Z");
  assert.equal(normalized.ingested_at, "2026-09-25T10:00:00.000Z");

  const decision = shouldDispatchClosing(
    closing({
      business_date: "2026-09-19",
      message_sent_at: "2026-09-20T03:02:16.000Z",
      updated_at: "2026-09-25T10:00:00.000Z",
    }),
    {
      coverage: [{
        source: CLOSING_SOURCE,
        last_observed_at: "2026-09-21T02:06:40.000Z",
      }],
    },
  );

  assert.equal(decision.dispatch, false);
  assert.equal(decision.reason, "source_already_observed");
  assert.equal(decision.source_watermark_at, "2026-09-20T03:02:16.000Z");
});

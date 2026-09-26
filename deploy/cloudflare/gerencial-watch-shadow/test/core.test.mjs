import test from "node:test";
import assert from "node:assert/strict";
import {
  ContractError,
  buildRuntimeSnapshot,
  classifyHandoffProgression,
  classifySourceFreshness,
  inputFingerprint,
  shouldRecomputeScheduled,
  validateEdgeHandoff,
} from "../src/core.mjs";

function valid(overrides = {}) {
  return {
    contract_version: "edge-watch-handoff@0.1.0",
    source_system: "TATA_EDGE",
    source_mode: "live_observed",
    fact_class: "FACT",
    generated_at: "2026-09-25T12:01:00.000Z",
    source_watermark_at: "2026-09-25T12:00:00.000Z",
    observation_count: 2,
    source_coverage: [{
      source: "tata_daily_closing",
      unit_id: "0001",
      observation_count: 2,
      first_observed_at: "2026-09-25T11:59:00.000Z",
      last_observed_at: "2026-09-25T12:00:00.000Z",
    }],
    identity_counts: {
      proven: 1,
      supported_inference: 0,
      candidate: 0,
      unknown: 0,
    },
    hard_exceptions: [],
    global_coverage_claim: "NOT_PROVIDED",
    external_effect_authorized: false,
    ...overrides,
  };
}

test("accepts a strict live observed envelope", () => {
  const input = valid();
  assert.equal(validateEdgeHandoff(input), input);
});

test("simulation cannot enter as FACT", () => {
  assert.throws(
    () => validateEdgeHandoff(valid({
      source_mode: "synthetic",
      fact_class: "FACT",
    })),
    /edge_handoff_truth_class_mismatch/,
  );
});

test("top-level unreviewed fields fail closed", () => {
  assert.throws(
    () => validateEdgeHandoff({ ...valid(), raw_payload: { token: "x" } }),
    /edge_handoff_unreviewed_field/,
  );
});

test("nested unreviewed fields fail closed", () => {
  const input = valid();
  input.hard_exceptions = [{
    attention_id: "a1",
    kind: "SOURCE_ADAPTER_FAILED",
    observed_at: "2026-09-25T12:00:00.000Z",
    reason_code: "SOURCE_FAILED",
    raw_error: "must-not-cross",
  }];
  assert.throws(
    () => validateEdgeHandoff(input),
    /edge_handoff_exception_unreviewed_field/,
  );
});

test("coverage count mismatch fails before admission", () => {
  assert.throws(
    () => validateEdgeHandoff(valid({ observation_count: 3 })),
    /edge_handoff_source_coverage_count_mismatch/,
  );
});

test("future source watermark fails closed", () => {
  assert.throws(
    () => validateEdgeHandoff(valid({
      generated_at: "2026-09-25T11:59:00.000Z",
    })),
    /edge_handoff_source_watermark_after_generation/,
  );
});

test("external effect authority can never cross this contract", () => {
  assert.throws(
    () => validateEdgeHandoff(valid({
      external_effect_authorized: true,
    })),
    /edge_handoff_external_effect_authority_forbidden/,
  );
});

test("input fingerprint is stable across object key order", async () => {
  const a = valid();
  const b = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(await inputFingerprint(a), await inputFingerprint(b));
});

test("fresh loaded source still cannot manufacture global all-clear", async () => {
  const input = valid({
    hard_exceptions: [{
      attention_id: "auth-1",
      kind: "IFOOD_AUTH_HUMAN_REQUIRED",
      unit_id: "0001",
      observed_at: "2026-09-25T12:00:00.000Z",
      reason_code: "AUTH_HUMAN_REQUIRED",
    }, {
      attention_id: "print-1",
      kind: "PRINT_SOFTWARE_ERROR",
      unit_id: "0001",
      observed_at: "2026-09-25T12:00:00.000Z",
      reason_code: "PRINT_ERROR",
    }],
  });
  const snapshot = await buildRuntimeSnapshot(
    input,
    "2026-09-25T12:02:00.000Z",
  );
  assert.equal(snapshot.validity.status, "DEGRADED");
  assert.equal(snapshot.validity.globalAllClearAuthorized, false);
  assert.equal(snapshot.sourceFreshness.length, 1);
  assert.equal(snapshot.sourceFreshness[0].status, "FRESH");
  assert.equal(snapshot.needsCesar.length, 1);
  assert.equal(snapshot.needsCesar[0].kind, "IFOOD_AUTH_HUMAN_REQUIRED");
  assert.equal(snapshot.criticalQueue.length, 2);
  assert.equal(snapshot.externalEffectsAuthorized, false);
});

test("source freshness distinguishes FRESH, AGING and STALE from source time", () => {
  const coverage = valid().source_coverage[0];

  assert.equal(
    classifySourceFreshness(coverage, "2026-09-26T11:59:59.000Z").status,
    "FRESH",
  );
  assert.equal(
    classifySourceFreshness(coverage, "2026-09-26T13:00:01.000Z").status,
    "AGING",
  );
  assert.equal(
    classifySourceFreshness(coverage, "2026-09-27T01:00:01.000Z").status,
    "STALE",
  );
});

test("unregistered source freshness is UNKNOWN, never guessed", () => {
  const freshness = classifySourceFreshness({
    source: "ifood_review_mail",
    observation_count: 1,
    first_observed_at: "2026-09-25T12:00:00.000Z",
    last_observed_at: "2026-09-25T12:00:00.000Z",
  }, "2026-09-25T12:02:00.000Z");

  assert.equal(freshness.status, "UNKNOWN");
  assert.equal(freshness.policyId, null);
  assert.equal(freshness.reason, "SOURCE_FRESHNESS_POLICY_NOT_PROVIDED");
});

test("empty envelope produces INSUFFICIENT, never all-clear", async () => {
  const input = valid({
    source_mode: "empty",
    fact_class: "EMPTY",
    source_watermark_at: null,
    observation_count: 0,
    source_coverage: [],
    identity_counts: {
      proven: 0,
      supported_inference: 0,
      candidate: 0,
      unknown: 0,
    },
    hard_exceptions: [],
  });
  const snapshot = await buildRuntimeSnapshot(input);
  assert.equal(snapshot.validity.status, "INSUFFICIENT");
  assert.equal(snapshot.validity.globalAllClearAuthorized, false);
  assert.equal(snapshot.needsCesar.length, 0);
});


test("scheduled recompute skips EMPTY source state", () => {
  const empty = valid({
    source_mode: "empty",
    fact_class: "EMPTY",
    source_watermark_at: null,
    observation_count: 0,
    source_coverage: [],
    identity_counts: {
      proven: 0,
      supported_inference: 0,
      candidate: 0,
      unknown: 0,
    },
    hard_exceptions: [],
  });
  assert.equal(shouldRecomputeScheduled(empty), false);
  assert.equal(shouldRecomputeScheduled(valid()), true);
});


test("handoff progression is idempotent and monotonic", () => {
  const latest = valid();

  assert.equal(
    classifyHandoffProgression(
      JSON.parse(JSON.stringify(latest)),
      latest,
    ),
    "DUPLICATE",
  );

  assert.equal(
    classifyHandoffProgression(
      valid({
        generated_at: "2026-09-25T12:00:30.000Z",
        source_watermark_at: "2026-09-25T12:00:00.000Z",
      }),
      latest,
    ),
    "STALE_GENERATION",
  );

  assert.equal(
    classifyHandoffProgression(
      valid({
        observation_count: 1,
        source_coverage: [{
          source: "ifood",
          unit_id: "0001",
          observation_count: 1,
          first_observed_at: "2026-09-25T11:59:00.000Z",
          last_observed_at: "2026-09-25T12:00:00.000Z",
        }],
      }),
      latest,
    ),
    "CONFLICT",
  );

  assert.equal(
    classifyHandoffProgression(
      valid({
        generated_at: "2026-09-25T12:02:00.000Z",
        source_watermark_at: "2026-09-25T11:59:30.000Z",
        source_coverage: [{
          source: "ifood",
          unit_id: "0001",
          observation_count: 2,
          first_observed_at: "2026-09-25T11:58:00.000Z",
          last_observed_at: "2026-09-25T11:59:30.000Z",
        }],
      }),
      latest,
    ),
    "SOURCE_WATERMARK_REGRESSION",
  );

  assert.equal(
    classifyHandoffProgression(
      valid({
        generated_at: "2026-09-25T12:02:00.000Z",
        source_watermark_at: "2026-09-25T12:01:00.000Z",
        source_coverage: [{
          source: "ifood",
          unit_id: "0001",
          observation_count: 2,
          first_observed_at: "2026-09-25T12:00:01.000Z",
          last_observed_at: "2026-09-25T12:01:00.000Z",
        }],
      }),
      latest,
    ),
    "ACCEPT",
  );
});

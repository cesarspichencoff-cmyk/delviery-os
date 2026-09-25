import { strict as assert } from "node:assert";
import { EDGE_SHADOW_FIXTURES } from "../src/edge/fixtures";
import {
  EDGE_MANAGER_SNAPSHOT_VERSION,
  projectManagerSnapshot,
} from "../src/edge/managerSnapshot";
import type { EdgeSourceObservation } from "../src/edge/simulator";

const synthetic = projectManagerSnapshot(
  [
    ...EDGE_SHADOW_FIXTURES,
    {
      source_mode: "synthetic",
      observation_id: "auth-human-manager",
      kind: "auth_state",
      source_ref: {
        source: "ifood",
        kind: "auth_session",
        id: "profile-manager",
        unit_id: "0001",
      },
      observed_at: "2026-09-25T01:00:00.000Z",
      payload: {
        health: "HUMAN_REQUIRED",
        customer_email: "must-not-cross@example.invalid",
      },
    },
  ],
  "2026-09-25T01:01:00.000Z",
);

assert.equal(synthetic.snapshot_version, EDGE_MANAGER_SNAPSHOT_VERSION);
assert.equal(synthetic.source_mode, "synthetic");
assert.equal(synthetic.fact_class, "SIMULATION");
assert.equal(synthetic.interruption_decision, "UNDECIDED");
assert.equal(synthetic.attention_candidate_count, 1);
assert.equal(
  synthetic.attention_candidates[0].kind,
  "IFOOD_AUTH_HUMAN_REQUIRED",
);
assert.equal(synthetic.identity.proven >= 1, true);
assert.equal(synthetic.identity.supported_inference >= 1, true);
assert.equal(synthetic.identity.candidate >= 1, true);
assert.equal(
  synthetic.source_coverage.some(
    (row) => row.source === "ifood" && row.unit_id === "0001",
  ),
  true,
);

const serialized = JSON.stringify(synthetic);
assert.equal(serialized.includes("must-not-cross"), false);
assert.equal(serialized.includes("INTERRUPT"), false);
assert.equal(serialized.includes("customer_email"), false);

const live: EdgeSourceObservation[] = [{
  source_mode: "live_observed",
  observation_id: "live-print-error",
  kind: "print_job",
  source_ref: {
    source: "windows_print",
    kind: "spool_job",
    id: "live-job-1",
    unit_id: "0001",
  },
  observed_at: "2026-09-25T01:02:00.000Z",
  payload: { state: "ERROR", raw_message: "must-not-cross" },
}];

const liveSnapshot = projectManagerSnapshot(
  live,
  "2026-09-25T01:03:00.000Z",
);
assert.equal(liveSnapshot.fact_class, "FACT");
assert.equal(liveSnapshot.source_mode, "live_observed");
assert.equal(liveSnapshot.attention_candidate_count, 1);
assert.equal(JSON.stringify(liveSnapshot).includes("raw_message"), false);

const empty = projectManagerSnapshot(
  [],
  "2026-09-25T01:04:00.000Z",
);
assert.equal(empty.source_mode, "empty");
assert.equal(empty.fact_class, "EMPTY");
assert.equal(empty.observation_count, 0);
assert.equal(empty.attention_candidate_count, 0);
assert.equal(empty.interruption_decision, "UNDECIDED");

assert.throws(
  () =>
    projectManagerSnapshot(
      [EDGE_SHADOW_FIXTURES[0], live[0]],
      "2026-09-25T01:05:00.000Z",
    ),
  /manager_snapshot_mixed_source_modes/,
);

console.log(JSON.stringify({
  status: "PASS",
  edge_snapshot_generated: true,
  raw_payload_not_forwarded: true,
  synthetic_not_labeled_fact: true,
  live_observed_can_be_fact: true,
  interruption_decision_remains_higher_layer: true,
  source_coverage_present: true,
  identity_summary_present: true,
}, null, 2));

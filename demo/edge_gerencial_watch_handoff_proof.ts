import { strict as assert } from "node:assert";
import {
  managerSnapshotToWatchHandoff,
  GERENCIAL_WATCH_EDGE_HANDOFF_VERSION,
} from "../src/edge/gerencialWatchHandoff";
import { projectManagerSnapshot } from "../src/edge/managerSnapshot";
import type { EdgeSourceObservation } from "../src/edge/simulator";

const observation: EdgeSourceObservation = {
  source_mode: "synthetic",
  observation_id: "watch-handoff-auth-human",
  kind: "auth_state",
  source_ref: {
    source: "ifood",
    kind: "auth_session",
    id: "profile-safe",
    unit_id: "0001",
  },
  observed_at: "2026-09-25T12:00:00.000Z",
  payload: {
    health: "HUMAN_REQUIRED",
    customer_email: "must-not-cross@example.invalid",
    token: "must-not-cross",
  },
};

const snapshot = projectManagerSnapshot(
  [observation],
  "2026-09-25T12:01:00.000Z",
);
const handoff = managerSnapshotToWatchHandoff(snapshot);

assert.equal(
  handoff.contract_version,
  GERENCIAL_WATCH_EDGE_HANDOFF_VERSION,
);
assert.equal(handoff.source_system, "TATA_EDGE");
assert.equal(handoff.source_mode, "synthetic");
assert.equal(handoff.fact_class, "SIMULATION");
assert.equal(
  handoff.source_watermark_at,
  "2026-09-25T12:00:00.000Z",
);
assert.equal(handoff.global_coverage_claim, "NOT_PROVIDED");
assert.equal(handoff.external_effect_authorized, false);
assert.equal(handoff.hard_exceptions.length, 1);
assert.equal(
  handoff.hard_exceptions[0].kind,
  "IFOOD_AUTH_HUMAN_REQUIRED",
);

const serialized = JSON.stringify(handoff);
assert.equal(serialized.includes("customer_email"), false);
assert.equal(serialized.includes("must-not-cross"), false);
assert.equal(serialized.includes('"payload"'), false);
assert.equal(serialized.includes("INTERRUPT"), false);

const empty = managerSnapshotToWatchHandoff(
  projectManagerSnapshot([], "2026-09-25T12:02:00.000Z"),
);
assert.equal(empty.source_mode, "empty");
assert.equal(empty.fact_class, "EMPTY");
assert.equal(empty.source_watermark_at, undefined);
assert.equal(empty.global_coverage_claim, "NOT_PROVIDED");

console.log(JSON.stringify({
  status: "PASS",
  versioned_handoff_contract: true,
  source_watermark_preserved: true,
  simulation_truth_preserved: true,
  raw_payload_not_exported: true,
  global_coverage_not_claimed_by_edge: true,
  external_effect_not_authorized: true,
}, null, 2));

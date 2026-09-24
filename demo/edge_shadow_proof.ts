import { strict as assert } from "node:assert";
import { classifyEvidence, OrderIdentityGraph } from "../src/edge/identityGraph";
import { EDGE_SHADOW_FIXTURES } from "../src/edge/fixtures";
import { replay } from "../src/edge/simulator";

const once = replay(EDGE_SHADOW_FIXTURES, 1);
const twice = replay(EDGE_SHADOW_FIXTURES, 2);

assert.equal(once.accepted_observations, EDGE_SHADOW_FIXTURES.length);
assert.equal(once.duplicate_observations, 0);
assert.equal(twice.accepted_observations, EDGE_SHADOW_FIXTURES.length);
assert.equal(twice.duplicate_observations, EDGE_SHADOW_FIXTURES.length);
assert.equal(once.snapshot, twice.snapshot, "replay must preserve the same graph");

const timeOnly = once.links.find((link) =>
  link.evidence.some((evidence) => evidence.evidence_id === "ev-only-time"),
);
assert.ok(timeOnly);
assert.equal(timeOnly.confidence, "CANDIDATE");
assert.notEqual(timeOnly.confidence, "PROVEN");

const exactId = once.links.find((link) =>
  link.evidence.some((evidence) => evidence.evidence_id === "ev-teknisa-ifood-external-id"),
);
assert.ok(exactId);
assert.equal(exactId.confidence, "PROVEN");

const multiSignal = once.links.find((link) =>
  link.evidence.some((evidence) => evidence.evidence_id === "ev-trip-unit"),
);
assert.ok(multiSignal);
assert.equal(multiSignal.confidence, "SUPPORTED_INFERENCE");

assert.equal(
  classifyEvidence([
    { evidence_id: "one", dimension: "timestamp_window", detail: "time_only" },
  ]),
  "CANDIDATE",
);

const graph = new OrderIdentityGraph();

assert.throws(
  () =>
    graph.upsert(
      { source: "ifood", kind: "order", id: "A", unit_id: "0001" },
      { source: "teknisa", kind: "sale", id: "B", unit_id: "0004" },
      [{ evidence_id: "unit-conflict", dimension: "exact_external_id", detail: "explicit_id" }],
      "2026-09-24T18:00:00.000Z",
    ),
  /identity_unit_conflict/,
);

graph.upsert(
  { source: "ifood", kind: "order", id: "C", unit_id: "0001" },
  { source: "teknisa", kind: "sale", id: "D", unit_id: "0001" },
  [{ evidence_id: "ev-conflict", dimension: "unit", detail: "same_unit" }],
  "2026-09-24T18:00:00.000Z",
);

assert.throws(
  () =>
    graph.upsert(
      { source: "ifood", kind: "order", id: "C", unit_id: "0001" },
      { source: "teknisa", kind: "sale", id: "D", unit_id: "0001" },
      [{ evidence_id: "ev-conflict", dimension: "amount", detail: "amount_match" }],
      "2026-09-24T18:00:01.000Z",
    ),
  /evidence_id_conflict/,
);

console.log(JSON.stringify({
  status: "PASS",
  observations: once.accepted_observations,
  links: once.links.length,
  replay_duplicate_meaning: 0,
  timestamp_only_proven: false,
  cross_unit_link_blocked: true,
  evidence_id_conflict_blocked: true,
}, null, 2));

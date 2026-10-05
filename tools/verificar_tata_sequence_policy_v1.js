"use strict";

const assert = require("node:assert/strict");
const {
  buildDailyStoreTataSequenceScope,
  planDailyStoreTataSequence,
  planTataSequence,
  validateSharedTataSequence,
} = require("../dist/src/production/tataSequence.js");

function baseState() {
  return {
    schema: "deliveryos.tata-sequence-state.v1",
    policy: { width: 3, min_value: 1, max_value: 999 },
    next_value: 1,
    bindings: [],
  };
}

function pad(n) {
  return String(n).padStart(3, "0");
}

const scope = buildDailyStoreTataSequenceScope({
  store_id: "0001",
  operational_date: "2026-10-05",
});
assert.equal(scope.scope_id, "STORE:0001|DATE:2026-10-05");
assert.equal(scope.evidence, "HUMAN_CONFIRMED_RULE");

// 001..999: unique, deterministic, no persistence side effect.
let state = baseState();
for (let i = 1; i <= 999; i += 1) {
  const orderId = "ORDER-" + pad(i);
  const plan = planDailyStoreTataSequence(
    state,
    { store_id: "0001", operational_date: "2026-10-05" },
    orderId,
  );
  assert.equal(plan.ready, true, "assignment should be ready for " + orderId);
  assert.equal(plan.reused_existing, false);
  assert.equal(plan.assignment.tata_sequence, pad(i));
  assert.equal(plan.assignment.teknisa_order_id, orderId);
  assert.equal(plan.effects.persistence_write, false);
  assert.equal(plan.effects.print, false);
  assert.equal(plan.effects.odhen_write, false);
  state = plan.next_state;
}
assert.equal(state.bindings.length, 999);
assert.equal(new Set(state.bindings.map(x => x.tata_sequence)).size, 999);

// Reprint/replay of order 999 must reuse 999 even when next numeric value is 1000.
const replay999 = planDailyStoreTataSequence(
  state,
  { store_id: "0001", operational_date: "2026-10-05" },
  "ORDER-999",
);
assert.equal(replay999.ready, true);
assert.equal(replay999.reused_existing, true);
assert.equal(replay999.assignment.tata_sequence, "999");
assert.equal(replay999.next_state.bindings.length, 999);

// 1000th distinct order must fail closed; never wrap in the same day.
const exhausted = planDailyStoreTataSequence(
  state,
  { store_id: "0001", operational_date: "2026-10-05" },
  "ORDER-1000",
);
assert.equal(exhausted.ready, false);
assert.ok(exhausted.blocking_reasons.includes("TATA_SEQUENCE_OUT_OF_RANGE"));
assert.equal(exhausted.assignment, null);
assert.equal(exhausted.next_state, null);

// New local calendar day resets independently to 001, while retaining prior bindings as history.
const nextDay = planDailyStoreTataSequence(
  state,
  { store_id: "0001", operational_date: "2026-10-06" },
  "ORDER-NEXT-DAY-001",
);
assert.equal(nextDay.ready, true);
assert.equal(nextDay.reused_existing, false);
assert.equal(nextDay.assignment.scope_id, "STORE:0001|DATE:2026-10-06");
assert.equal(nextDay.assignment.tata_sequence, "001");
assert.equal(nextDay.next_state.bindings.length, 1000);

// Different store resets independently too.
const otherStore = planDailyStoreTataSequence(
  state,
  { store_id: "0002", operational_date: "2026-10-05" },
  "OTHER-STORE-001",
);
assert.equal(otherStore.ready, true);
assert.equal(otherStore.assignment.scope_id, "STORE:0002|DATE:2026-10-05");
assert.equal(otherStore.assignment.tata_sequence, "001");

// Existing collision fails closed.
const collisionState = baseState();
collisionState.bindings = [
  { scope_id: scope.scope_id, teknisa_order_id: "A", tata_sequence: "001" },
  { scope_id: scope.scope_id, teknisa_order_id: "B", tata_sequence: "001" },
];
const collision = planTataSequence(collisionState, scope.scope_id, "C");
assert.equal(collision.ready, false);
assert.ok(collision.blocking_reasons.includes("EXISTING_TATA_SEQUENCE_COLLISION:001"));

// Same TATA sequence must be shared by every station ticket.
const sharedOk = validateSharedTataSequence(
  { scope_id: scope.scope_id, teknisa_order_id: "ORDER-001", tata_sequence: "001" },
  [
    { station: "BALCAOSUSHI1", tata_sequence: "001" },
    { station: "BAR", tata_sequence: "001" },
    { station: "COZINHA", tata_sequence: "001" },
  ],
);
assert.equal(sharedOk.ready, true);

const sharedBad = validateSharedTataSequence(
  { scope_id: scope.scope_id, teknisa_order_id: "ORDER-001", tata_sequence: "001" },
  [
    { station: "BALCAOSUSHI1", tata_sequence: "001" },
    { station: "BAR", tata_sequence: "002" },
  ],
);
assert.equal(sharedBad.ready, false);
assert.ok(sharedBad.blocking_reasons.includes("STATION_SEQUENCE_MISMATCH:BAR"));

console.log("tata-sequence-policy-v1: ok assignments=999 replay=999 exhaustion=blocked next_day=001 other_store=001");

"use strict";

const assert = require("node:assert/strict");
const {
  planDailyStoreTataSequence,
  validateSharedTataSequence,
} = require("../dist/src/production/tataSequence.js");

const policy = { width: 3, min_value: 1, max_value: 999 };
const empty = {
  schema: "deliveryos.tata-sequence-state.v1",
  policy,
  next_value: 1,
  bindings: [],
};

const day1 = { store_id: "0001", operational_date: "2026-10-05" };
const day2 = { store_id: "0001", operational_date: "2026-10-06" };

const first = planDailyStoreTataSequence(empty, day1, "ORDER-A");
assert.equal(first.ready, true);
assert.equal(first.assignment?.tata_sequence, "001");
assert.equal(first.reused_existing, false);
assert.equal(first.effects.persistence_write, false);
assert.ok(first.next_state);

const second = planDailyStoreTataSequence(first.next_state, day1, "ORDER-B");
assert.equal(second.ready, true);
assert.equal(second.assignment?.tata_sequence, "002");
assert.equal(second.reused_existing, false);
assert.ok(second.next_state);

const replay = planDailyStoreTataSequence(second.next_state, day1, "ORDER-A");
assert.equal(replay.ready, true);
assert.equal(replay.assignment?.tata_sequence, "001");
assert.equal(replay.reused_existing, true);

const nextDay = planDailyStoreTataSequence(second.next_state, day2, "ORDER-C");
assert.equal(nextDay.ready, true);
assert.equal(nextDay.assignment?.tata_sequence, "001");
assert.equal(nextDay.reused_existing, false);

const scope = "STORE:0001|DATE:2026-10-05";
const atLimit = {
  schema: "deliveryos.tata-sequence-state.v1",
  policy,
  next_value: 1,
  bindings: [
    { scope_id: scope, teknisa_order_id: "ORDER-999", tata_sequence: "999" },
  ],
};
const overflow = planDailyStoreTataSequence(atLimit, day1, "ORDER-1000");
assert.equal(overflow.ready, false);
assert.ok(overflow.blocking_reasons.includes("TATA_SEQUENCE_OUT_OF_RANGE"));

const collisionState = {
  schema: "deliveryos.tata-sequence-state.v1",
  policy,
  next_value: 1,
  bindings: [
    { scope_id: scope, teknisa_order_id: "ORDER-X", tata_sequence: "001" },
    { scope_id: scope, teknisa_order_id: "ORDER-Y", tata_sequence: "001" },
  ],
};
const collision = planDailyStoreTataSequence(collisionState, day1, "ORDER-Z");
assert.equal(collision.ready, false);
assert.ok(collision.blocking_reasons.some(x => x.startsWith("EXISTING_TATA_SEQUENCE_COLLISION:")));

const shared = validateSharedTataSequence(
  first.assignment,
  [
    { station: "BALCAOSUSHI1", tata_sequence: "001" },
    { station: "BAR", tata_sequence: "001" },
    { station: "BALCAOSUSHI2", tata_sequence: "001" },
  ],
);
assert.deepEqual(shared, { ready: true, blocking_reasons: [] });

const mismatch = validateSharedTataSequence(
  first.assignment,
  [
    { station: "BALCAOSUSHI1", tata_sequence: "001" },
    { station: "BAR", tata_sequence: "002" },
  ],
);
assert.equal(mismatch.ready, false);
assert.ok(mismatch.blocking_reasons.includes("STATION_SEQUENCE_MISMATCH:BAR"));

console.log("tata-sequence-v1: ok");

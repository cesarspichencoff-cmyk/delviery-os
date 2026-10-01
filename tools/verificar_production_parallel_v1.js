"use strict";

const assert = require("node:assert/strict");

const Tata = require("../dist/src/production/tataSequence.js");
const Kitchen = require("../dist/src/production/kitchenDependencies.js");
const Join = require("../dist/src/production/deliveryProductionJoin.js");

const initialSequenceState = {
  schema: "deliveryos.tata-sequence-state.v1",
  policy: { width: 3, min_value: 1, max_value: 999 },
  next_value: 37,
  bindings: [],
};

const assigned = Tata.planTataSequence(initialSequenceState, "SCOPE-EXPLICITO", "18452");
assert.equal(assigned.ready, true);
assert.equal(assigned.assignment.tata_sequence, "037");
assert.equal(assigned.reused_existing, false);
assert.equal(assigned.next_state.next_value, 38);
assert.equal(assigned.effects.persistence_write, false);
assert.equal(assigned.effects.print, false);
assert.equal(assigned.effects.odhen_write, false);

const unresolvedScope = Tata.planTataSequenceWithResolvedScope(
  initialSequenceState,
  {
    scope_id: null,
    evidence: "UNKNOWN",
    source_ref: null,
  },
  "18452",
);
assert.equal(unresolvedScope.ready, false);
assert.ok(
  unresolvedScope.blocking_reasons.includes("TATA_SEQUENCE_SCOPE_REQUIRED"),
);
assert.ok(
  unresolvedScope.blocking_reasons.includes(
    "TATA_SEQUENCE_SCOPE_EVIDENCE_REQUIRED",
  ),
);
assert.ok(
  unresolvedScope.blocking_reasons.includes(
    "TATA_SEQUENCE_SCOPE_SOURCE_REF_REQUIRED",
  ),
);

const resolvedScope = Tata.planTataSequenceWithResolvedScope(
  initialSequenceState,
  {
    scope_id: "SCOPE-EXPLICITO",
    evidence: "HUMAN_CONFIRMED_RULE",
    source_ref: "synthetic:sequence-scope-rule",
  },
  "18452",
);
assert.equal(resolvedScope.ready, true);
assert.equal(resolvedScope.assignment.tata_sequence, "037");

const dailyInitial = {
  schema: "deliveryos.tata-sequence-state.v1",
  policy: { width: 3, min_value: 1, max_value: 999 },
  next_value: 777,
  bindings: [],
};
const day1First = Tata.planDailyStoreTataSequence(
  dailyInitial,
  { store_id: "ITAIM", operational_date: "2026-10-01" },
  "18452",
);
assert.equal(day1First.ready, true);
assert.equal(day1First.assignment.tata_sequence, "001");

const day1Second = Tata.planDailyStoreTataSequence(
  day1First.next_state,
  { store_id: "ITAIM", operational_date: "2026-10-01" },
  "18453",
);
assert.equal(day1Second.ready, true);
assert.equal(day1Second.assignment.tata_sequence, "002");

const day1Reprint = Tata.planDailyStoreTataSequence(
  day1Second.next_state,
  { store_id: "ITAIM", operational_date: "2026-10-01" },
  "18452",
);
assert.equal(day1Reprint.ready, true);
assert.equal(day1Reprint.assignment.tata_sequence, "001");
assert.equal(day1Reprint.reused_existing, true);

const day2First = Tata.planDailyStoreTataSequence(
  day1Second.next_state,
  { store_id: "ITAIM", operational_date: "2026-10-02" },
  "19001",
);
assert.equal(day2First.ready, true);
assert.equal(day2First.assignment.tata_sequence, "001");

const otherStoreSameDay = Tata.planDailyStoreTataSequence(
  day1Second.next_state,
  { store_id: "HOUSE", operational_date: "2026-10-01" },
  "50001",
);
assert.equal(otherStoreSameDay.ready, true);
assert.equal(otherStoreSameDay.assignment.tata_sequence, "001");

const invalidDailyDate = Tata.planDailyStoreTataSequence(
  dailyInitial,
  { store_id: "ITAIM", operational_date: "2026-02-30" },
  "18452",
);
assert.equal(invalidDailyDate.ready, false);
assert.ok(
  invalidDailyDate.blocking_reasons.includes("TATA_SEQUENCE_SCOPE_REQUIRED"),
);

const replayed = Tata.planTataSequence(
  assigned.next_state,
  "SCOPE-EXPLICITO",
  "18452",
);
assert.equal(replayed.ready, true);
assert.equal(replayed.assignment.tata_sequence, "037");
assert.equal(replayed.reused_existing, true);
assert.equal(replayed.next_state.next_value, 38);

const existingCollision = Tata.planTataSequence(
  {
    schema: "deliveryos.tata-sequence-state.v1",
    policy: { width: 3, min_value: 1, max_value: 999 },
    next_value: 40,
    bindings: [
      {
        scope_id: "SCOPE-EXPLICITO",
        teknisa_order_id: "18452",
        tata_sequence: "037",
      },
      {
        scope_id: "SCOPE-EXPLICITO",
        teknisa_order_id: "18453",
        tata_sequence: "037",
      },
    ],
  },
  "SCOPE-EXPLICITO",
  "18454",
);
assert.equal(existingCollision.ready, false);
assert.ok(
  existingCollision.blocking_reasons.includes(
    "EXISTING_TATA_SEQUENCE_COLLISION:037",
  ),
);

const invalidPolicy = Tata.planTataSequence(
  {
    schema: "deliveryos.tata-sequence-state.v1",
    policy: { width: 3, min_value: 1, max_value: 9999 },
    next_value: 37,
    bindings: [],
  },
  "SCOPE-EXPLICITO",
  "18452",
);
assert.equal(invalidPolicy.ready, false);
assert.ok(invalidPolicy.blocking_reasons.includes("INVALID_SEQUENCE_POLICY"));

const stationCheck = Tata.validateSharedTataSequence(assigned.assignment, [
  { station: "COZINHA", tata_sequence: "037" },
  { station: "DELIVERY SUSHI 1", tata_sequence: "037" },
  { station: "DELIVERY SUSHI 2", tata_sequence: "037" },
]);
assert.equal(stationCheck.ready, true);

const stationMismatch = Tata.validateSharedTataSequence(assigned.assignment, [
  { station: "COZINHA", tata_sequence: "037" },
  { station: "DELIVERY SUSHI 2", tata_sequence: "038" },
]);
assert.equal(stationMismatch.ready, false);
assert.ok(
  stationMismatch.blocking_reasons.includes(
    "STATION_SEQUENCE_MISMATCH:DELIVERY SUSHI 2",
  ),
);

const partialRules = Kitchen.projectKitchenNeeds(
  [{ nome: "Uramaki Ebiten Especial", quantidade: 2 }],
  {
    schema: "deliveryos.kitchen-dependency-rules.v1",
    coverage: "PARTIAL",
    coverage_proof: "HUMAN_CONFIRMED",
    rules: [
      {
        canonical_item_name: "Uramaki Ebiten Especial",
        proof: "HUMAN_CONFIRMED",
        yields: { EBITEN: 1 },
      },
    ],
  },
);
assert.equal(partialRules.ready_for_complete_total, false);
assert.ok(
  partialRules.blocking_reasons.includes(
    "DEPENDENCY_RULESET_COVERAGE_NOT_COMPLETE",
  ),
);
assert.deepEqual(partialRules.totals, { hot: 0, ebiten: 2, shiso: 0 });

const unprovenCoverage = Kitchen.projectKitchenNeeds(
  [{ nome: "Hot Roll", quantidade: 1 }],
  {
    schema: "deliveryos.kitchen-dependency-rules.v1",
    coverage: "COMPLETE",
    coverage_proof: "UNPROVEN",
    rules: [
      {
        canonical_item_name: "Hot Roll",
        proof: "HUMAN_CONFIRMED",
        yields: { HOT: 1 },
      },
    ],
  },
);
assert.equal(unprovenCoverage.ready_for_complete_total, false);
assert.ok(
  unprovenCoverage.blocking_reasons.includes(
    "DEPENDENCY_RULESET_COVERAGE_NOT_PROVEN",
  ),
);

const completeRuleset = {
  schema: "deliveryos.kitchen-dependency-rules.v1",
  coverage: "COMPLETE",
  coverage_proof: "HUMAN_CONFIRMED",
  rules: [
    {
      canonical_item_name: "Hot Roll",
      proof: "HUMAN_CONFIRMED",
      yields: { HOT: 1 },
    },
    {
      canonical_item_name: "Uramaki Ebiten Especial",
      proof: "HUMAN_CONFIRMED",
      yields: { EBITEN: 1 },
    },
    {
      canonical_item_name: "Tuna Shisô Tartar",
      proof: "HUMAN_CONFIRMED",
      yields: { SHISO: 1 },
    },
  ],
};

const orderA = Kitchen.projectKitchenNeeds(
  [
    { nome: "Hot Roll", quantidade: 3 },
    { nome: "Uramaki Ebiten Especial", quantidade: 2 },
    { nome: "Tuna Shiso Tartar", quantidade: 1 },
  ],
  completeRuleset,
);
assert.equal(orderA.ready_for_complete_total, true);
assert.deepEqual(orderA.totals, { hot: 3, ebiten: 2, shiso: 1 });

const orderB = Kitchen.projectKitchenNeeds(
  [{ nome: "Hot Roll", quantidade: 2 }],
  completeRuleset,
);
const aggregate = Kitchen.aggregateKitchenNeeds([
  { teknisa_order_id: "18452", projection: orderA },
  { teknisa_order_id: "18453", projection: orderB },
]);
assert.equal(aggregate.ready_for_complete_total, true);
assert.deepEqual(aggregate.totals, { hot: 5, ebiten: 2, shiso: 1 });
assert.equal(aggregate.unique_orders, 2);

const duplicateAggregate = Kitchen.aggregateKitchenNeeds([
  { teknisa_order_id: "18452", projection: orderA },
  { teknisa_order_id: "18452", projection: orderA },
]);
assert.equal(duplicateAggregate.ready_for_complete_total, false);
assert.ok(
  duplicateAggregate.blocking_reasons.includes(
    "DUPLICATE_KITCHEN_AGGREGATE_ORDER:18452",
  ),
);

const joined = Join.joinDeliveryAndProduction(
  {
    pedido_interno: "18452",
    pedido_externo: "A1B2C3",
    items: [
      {
        item_index: 0,
        codigo: "1001",
        nome: "Uramaki de Salmão",
        quantidade: 2,
        observacoes: ["SEM CEBOLINHA"],
      },
      {
        item_index: 1,
        codigo: "1002",
        nome: "Tuna Shisô Tartar",
        quantidade: 1,
        observacoes: [],
      },
    ],
    order_observations: ["ENTREGAR JUNTO"],
  },
  {
    join_key_proof: "DLV_NRCOMANDA_PROVEN",
    pedido_interno_from_dlv: "18452",
    lines: [
      {
        nome: "URAMAKI DE SALMAO",
        quantidade: 2,
        tx_prod_com_ven: ["MOLHO A PARTE"],
        printer_key: "MODEL_A_PORT_1",
      },
      {
        nome: "URAMAKI DE SALMAO",
        quantidade: 2,
        tx_prod_com_ven: ["MOLHO A PARTE"],
        printer_key: "MODEL_B_PORT_2",
      },
      {
        nome: "TUNA SHISO TARTAR",
        quantidade: 1,
        tx_prod_com_ven: ["SEM PIMENTA"],
        printer_key: "MODEL_C_PORT_3",
      },
    ],
  },
);

assert.equal(joined.ready, true);
assert.equal(joined.ids.pedido_interno, "18452");
assert.equal(joined.ids.pedido_externo, "A1B2C3");
assert.equal(joined.items.length, 2);
assert.deepEqual(joined.items[0].tx_prod_com_ven, ["MOLHO A PARTE"]);
assert.deepEqual(joined.items[0].printer_keys, [
  "MODEL_A_PORT_1",
  "MODEL_B_PORT_2",
]);
assert.deepEqual(joined.items[1].tx_prod_com_ven, ["SEM PIMENTA"]);
assert.equal(joined.effects.print, false);
assert.equal(joined.effects.odhen_write, false);

const unprovenJoin = Join.joinDeliveryAndProduction(
  {
    pedido_interno: "18452",
    pedido_externo: null,
    items: [
      {
        item_index: 0,
        codigo: null,
        nome: "Hot Roll",
        quantidade: 1,
        observacoes: [],
      },
    ],
    order_observations: [],
  },
  {
    join_key_proof: "UNPROVEN",
    pedido_interno_from_dlv: "18452",
    lines: [
      {
        nome: "HOT ROLL",
        quantidade: 1,
        tx_prod_com_ven: [],
        printer_key: "MODEL_X_PORT_1",
      },
    ],
  },
);
assert.equal(unprovenJoin.ready, false);
assert.ok(
  unprovenJoin.blocking_reasons.includes(
    "PRODUCTION_DLV_JOIN_KEY_NOT_PROVEN",
  ),
);

const ambiguousJoin = Join.joinDeliveryAndProduction(
  {
    pedido_interno: "18452",
    pedido_externo: null,
    items: [
      {
        item_index: 0,
        codigo: "A",
        nome: "Hot Roll",
        quantidade: 1,
        observacoes: [],
      },
      {
        item_index: 1,
        codigo: "B",
        nome: "Hot Roll",
        quantidade: 1,
        observacoes: [],
      },
    ],
    order_observations: [],
  },
  {
    join_key_proof: "DLV_NRCOMANDA_PROVEN",
    pedido_interno_from_dlv: "18452",
    lines: [
      {
        nome: "HOT ROLL",
        quantidade: 1,
        tx_prod_com_ven: [],
        printer_key: "MODEL_X_PORT_1",
      },
    ],
  },
);
assert.equal(ambiguousJoin.ready, false);
assert.ok(
  ambiguousJoin.blocking_reasons.some((reason) =>
    reason.startsWith("AMBIGUOUS_DELIVERY_ITEM_SIGNATURE:"),
  ),
);

console.log("production-parallel-v1: ok");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { projectExpectedRouting } = require("../dist/src/shadow/expectedRouting.js");
const { planProductionPrintIntents } = require("../dist/src/production/productionPrintPlan.js");
const {
  planDailyStoreTataSequence,
  validateSharedTataSequence,
} = require("../dist/src/production/tataSequence.js");

function load(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8"));
}

const routing = load("data/odhen_product_routing_compact_v1.json");
const printers = load("data/runtime_printer_map_v1.json");
const calibration = load("data/production_printer_calibration_registry_v1.json");
const humanRules = load("data/tata_reader_human_operational_rules_20261005_v1.json");

assert.equal(humanRules.tata_sequence.width, 3);
assert.equal(humanRules.tata_sequence.min_value, 1);
assert.equal(humanRules.tata_sequence.max_value, 999);
assert.equal(humanRules.current_service.service, "LUNCH");
assert.equal(humanRules.current_service.historical_order_service_claim, false);

const initialSequenceState = {
  schema: "deliveryos.tata-sequence-state.v1",
  policy: { width: 3, min_value: 1, max_value: 999 },
  next_value: 1,
  bindings: [],
};

const sequencePlan = planDailyStoreTataSequence(
  initialSequenceState,
  { store_id: "0001", operational_date: "2026-10-04" },
  "0000348850",
);
assert.equal(sequencePlan.ready, true);
assert.equal(sequencePlan.assignment.tata_sequence, "001");

const sequenceReplay = planDailyStoreTataSequence(
  sequencePlan.next_state,
  { store_id: "0001", operational_date: "2026-10-04" },
  "0000348850",
);
assert.equal(sequenceReplay.ready, true);
assert.equal(sequenceReplay.reused_existing, true);
assert.equal(sequenceReplay.assignment.tata_sequence, "001");

const order = {
  ids: {
    pedido_interno: "0000348850",
    pedido_ifood: "9627",
  },
  items: [
    { item_index: 0, codigo: "9.80.00.010.00", nome: "COMBINADO KIDS", quantidade: 3 },
    { item_index: 1, codigo: "9.10.00.080.00", nome: "EDAMAME", quantidade: 1 },
    { item_index: 2, codigo: "9.10.00.020.00", nome: "NASU NO MISSO", quantidade: 1 },
    { item_index: 3, codigo: "9.30.00.090.00", nome: "SUSHI DE UNAGUI", quantidade: 1 },
  ],
};

const projection = projectExpectedRouting(order, routing, printers);
assert.equal(projection.ready, true);

const context = {
  tata_sequence: "001",
  teknisa_sequence: "0000348850",
  ifood_sequence: "9627",
  order_time: "2026-10-04T22:58:50-03:00",
  service_resolution: {
    service: "LUNCH",
    evidence: "HUMAN_CONFIRMED_RULE",
    source_ref: "human:cesar:2026-10-05:current-delivery-shift-LUNCH:replay-scenario-not-historical-claim",
  },
  template_version: "production-ticket-v2-shadow",
  order_observations: [],
  ticket_items: [
    { item_index: 0, item_observations: [], mount_group_id: "SUSHI-KIDS-750", box_label: "750", prep_components: [] },
    { item_index: 1, item_observations: [], mount_group_id: "COZ-EDAMAME-650", box_label: "650 selada", prep_components: [] },
    { item_index: 2, item_observations: [], mount_group_id: "COZ-NASU-650", box_label: "650 selada", prep_components: [] },
    { item_index: 3, item_observations: [], mount_group_id: "SUSHI-UNAGUI-240", box_label: "240", prep_components: [] },
  ],
};

const plan1 = planProductionPrintIntents(projection, context, calibration);
const plan2 = planProductionPrintIntents(projection, context, calibration);

assert.equal(plan1.ready_for_shadow_payload, true, plan1.blocking_reasons.join(","));
assert.equal(plan1.ready_for_physical_print, false);
assert.deepEqual(plan1.blocking_reasons, []);
assert.deepEqual(
  plan1.print_intents.map((x) => x.printer.printer_code).sort(),
  ["00002", "00009"],
);
assert.equal(plan1.print_intents.some((x) => x.printer.printer_code === "00003"), false);
assert.deepEqual(
  plan1.print_intents.map((x) => x.intent_fingerprint),
  plan2.print_intents.map((x) => x.intent_fingerprint),
);
assert.equal(
  new Set(plan1.print_intents.map((x) => x.intent_fingerprint)).size,
  plan1.print_intents.length,
);
assert.equal(plan1.effects.print, false);
assert.equal(plan1.effects.spooler_write, false);
assert.equal(plan1.effects.fiscal_action, false);

const shared = validateSharedTataSequence(
  sequencePlan.assignment,
  plan1.print_intents.map((intent) => ({
    station: intent.printer.printer_code,
    tata_sequence: intent.identifiers.tata_sequence,
  })),
);
assert.equal(shared.ready, true);
assert.deepEqual(shared.blocking_reasons, []);

const result = {
  schema: "deliveryos.real-order-unified-replay-proof.2026-10-05.v1",
  status: "PASS_REAL_ORDER_REPLAY_NO_PRINT",
  order_id: "0000348850",
  replay_boundary: {
    real_order_input: true,
    service_resolution: "CURRENT_CONFIRMED_LUNCH_REPLAY_SCENARIO",
    historical_service_claim: false,
    tata_sequence: "ISOLATED_REPLAY_STATE_USING_HUMAN_CONFIRMED_001_999_POLICY",
    live_caixa_sequence_state_persisted: false,
  },
  sequences: {
    ifood: "9627",
    teknisa: "0000348850",
    tata: "001",
  },
  production_targets: plan1.print_intents.map((intent) => ({
    printer_code: intent.printer.printer_code,
    printer_name: intent.printer.printer_name,
    fingerprint: intent.intent_fingerprint,
    lines: intent.lines.map((line) => ({
      product_code: line.product_code,
      quantity: line.quantity,
      mount_group_id: line.mount_group_id,
      box_label: line.box_label,
    })),
  })),
  delivery_check: {
    boxes: [
      { label: "750", quantity: 3 },
      { label: "650 selada", quantity: 2 },
      { label: "240", quantity: 1 },
    ],
    bags: [
      { label: "Quente P", quantity: 1, status: "FACT" },
      { label: "Fria", quantity: 1, size: null, status: "UNKNOWN_GENERIC_750_BAG_SIZE" },
    ],
    kits: [
      { label: "Kit Kids", quantity: 3 },
      { label: "Kit Quente", quantity: 1 },
    ],
    minimum_bags: 2,
  },
  deterministic_fingerprints: true,
  physical_effects: {
    print: false,
    spooler_write: false,
    odhen_write: false,
    fiscal_action: false,
    cutover: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log("TATA_REAL_ORDER_UNIFIED_REPLAY_PASS");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { projectExpectedRouting } = require("../dist/src/shadow/expectedRouting.js");
const { planProductionPrintIntents } = require("../dist/src/production/productionPrintPlan.js");

const routing = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "odhen_product_routing_compact_v1.json"), "utf8"),
);
const printers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "runtime_printer_map_v1.json"), "utf8"),
);
const nonProduction = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "non_production_delivery_items_v1.json"), "utf8"),
);
const calibration = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "production_printer_calibration_registry_v1.json"), "utf8"),
);

const order = {
  ids: { pedido_interno: "18452" },
  items: [
    {
      item_index: 0,
      codigo: "9150007500",
      nome: "COMBINADO SALMAO 1 PESSOA",
      quantidade: 1,
    },
    {
      item_index: 1,
      codigo: "9500000000",
      nome: "URAMAKI DE SALMAO",
      quantidade: 2,
    },
    {
      item_index: 2,
      codigo: "9750003000",
      nome: "WASABI",
      quantidade: 1,
    },
  ],
};

const projection = projectExpectedRouting(order, routing, printers, nonProduction);
assert.equal(projection.ready, true);

const plan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    template_version: "production-ticket-v2-shadow",
    ticket_items: [
      {
        item_index: 0,
        mount_group_id: "G1",
        box_label: "CX 750",
        item_observations: ["SEM CEBOLINHA"],
      },
      {
        item_index: 1,
        mount_group_id: "G2",
        box_label: "CX 750",
      },
    ],
  },
  calibration,
);

assert.equal(plan.ready_for_shadow_payload, true);
assert.equal(plan.ready_for_physical_print, false);
assert.equal(plan.print_intents.length, 4);

const byPrinter = new Map(plan.print_intents.map((x) => [x.printer.printer_code, x]));

assert.deepEqual(
  [...byPrinter.keys()].sort(),
  ["00003", "00004", "00006", "00009"],
);

assert.deepEqual(
  byPrinter.get("00009").lines.map((x) => [x.product_name, x.quantity]),
  [["COMBINADO SALMAO 1 PESSOA", 1]],
);
assert.deepEqual(
  byPrinter.get("00003").lines.map((x) => [x.product_name, x.quantity]),
  [["COMBINADO SALMAO 1 PESSOA", 1]],
);
assert.deepEqual(
  byPrinter.get("00006").lines.map((x) => [x.product_name, x.quantity]),
  [["URAMAKI DE SALMAO", 2]],
);
assert.deepEqual(
  byPrinter.get("00004").lines.map((x) => [x.product_name, x.quantity]),
  [["URAMAKI DE SALMAO", 2]],
);

for (const intent of plan.print_intents) {
  assert.equal(intent.identifiers.ifood_sequence, "A1B2C3");
  assert.equal(intent.identifiers.teknisa_sequence, "18452");
  assert.equal(intent.identifiers.tata_sequence, "037");
  assert.equal(intent.evidence, "PLANNED");
  assert.equal(intent.calibration_status, "CALIBRATION_REQUIRED");
  assert.equal(intent.physical_effect_authorized, false);
  assert.match(intent.semantic_key_material, /production-ticket-v1::18452::/);
}

assert.deepEqual(plan.no_own_production_ticket_items, [
  {
    item_index: 2,
    product_code: "9.75.00.030.00",
    product_name: "WASABI",
    quantity: 1,
    reason: nonProduction.items["9.75.00.030.00"].reason,
  },
]);

const missingSequencePlan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: null,
    order_time: "19:42",
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  calibration,
);
assert.equal(missingSequencePlan.ready_for_shadow_payload, false);
assert.ok(missingSequencePlan.blocking_reasons.includes("IFOOD_SEQUENCE_REQUIRED"));

assert.deepEqual(plan.effects, {
  print: false,
  spooler_write: false,
  odhen_write: false,
  fiscal_action: false,
  cutover: false,
});

console.log("production-print-plan-v1: ok");

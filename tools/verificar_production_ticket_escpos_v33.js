"use strict";

const assert = require("node:assert/strict");
const Kitchen = require("../dist/src/production/kitchenDependencies.js");
const Ticket = require("../dist/src/production/productionTicketV2.js");
const Esc = require("../dist/src/production/productionTicketEscPosV33.js");

const ruleset = {
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
};

const kitchen = Kitchen.projectKitchenNeeds(
  [
    { nome: "Combinado Salmao 1 Pessoa", quantidade: 1 },
    { nome: "Uramaki Ebiten Especial", quantidade: 2 },
  ],
  ruleset,
);

assert.deepEqual(kitchen.totals, { hot: 0, ebiten: 2, shiso: 0 });
assert.equal(kitchen.contributions.length, 1);
assert.equal(kitchen.contributions[0].item_name, "Uramaki Ebiten Especial");
assert.equal(kitchen.contributions[0].ebiten, 2);
assert.ok(kitchen.unmatched_items.includes("Combinado Salmao 1 Pessoa"));
assert.equal(kitchen.ready_for_complete_total, false);

const intent = {
  printer: {
    printer_code: "00009",
    printer_name: "BALCAOSUSHI1",
    printer_ip: "192.168.0.142",
    printer_port: "LPT4",
    peripherals_server: "192.168.0.24:3000",
  },
  template_version: "production-ticket-v33-test",
  service_resolution: {
    service: "LUNCH",
    evidence: "HUMAN_CONFIRMED_RULE",
    source_ref: "human:cesar:v33-2026-10-06",
  },
  order_observations: [],
  semantic_key_material: "v33-test",
  intent_fingerprint: "c".repeat(64),
  identifiers: {
    tata_sequence: "006",
    teknisa_sequence: "TESTE",
    ifood_sequence: "TESTE",
    order_time: "19:20",
  },
  lines: [
    {
      item_index: 0,
      product_code: "COMBO",
      product_name: "Combinado Salmao 1 Pessoa",
      quantity: 1,
      item_observations: [],
      mount_group_id: "G1",
      box_label: "CX 750",
      prep_components: [],
    },
    {
      item_index: 1,
      product_code: "EBITEN",
      product_name: "Uramaki Ebiten Especial",
      quantity: 2,
      item_observations: ["SEM CEBOLINHA"],
      mount_group_id: "G1",
      box_label: "CX 750",
      prep_components: [],
    },
  ],
  evidence: "PLANNED",
  calibration_status: "CALIBRATION_REQUIRED",
  physical_effect_authorized: false,
};

const ticket = Ticket.buildStationProductionTicketV2(intent);

const sushi = Esc.renderStationProductionTicketEscPosV33({
  ticket,
  display_station_name: "SUSHI",
  kitchen_needs: kitchen,
  test_banner: "*** TESTE V3.3 - NAO PRODUZIR ***",
});

assert.equal(sushi.ready_for_preview, true);
assert.equal(sushi.ready_for_automatic_operational_print, false);
assert.equal(sushi.effects.print, false);
assert.equal(sushi.effects.spooler_write, false);
assert.equal(sushi.effects.odhen_write, false);
assert.ok(sushi.bytes.length > 0);
assert.ok(sushi.text_trace.includes("1x Combinado Salmao 1 Pessoa"));
assert.ok(sushi.text_trace.includes("2x Uramaki Ebiten Especial"));
assert.ok(sushi.text_trace.includes("VEM DA COZINHA"));
assert.ok(sushi.text_trace.includes("2x EBITEN"));
assert.ok(sushi.text_trace.includes("SEM CEBOLINHA"));
assert.ok(sushi.text_trace.includes("TATA 006 | 19:20"));
assert.ok(sushi.text_trace.includes("IFOOD TESTE"));
assert.ok(sushi.text_trace.includes("TEKNISA TESTE"));
assert.ok(
  sushi.bytes.some(
    (_, index, bytes) =>
      bytes[index] === 0x1d &&
      bytes[index + 1] === 0x21 &&
      bytes[index + 2] === 0x01,
  ),
  "TATA/iFood footer emphasis command must be present",
);
assert.ok(!sushi.text_trace.includes("PREPARO:"));
assert.ok(
  !sushi.text_trace.includes("VEM DA COZINHA\n1x"),
  "combo shrimp must not create a kitchen dependency",
);

const kitchenTicket = Esc.renderKitchenDependencyTicketEscPosV33({
  ticket,
  kitchen_needs: kitchen,
  test_banner: "*** TESTE V3.3 - NAO PRODUZIR ***",
});

assert.equal(kitchenTicket.ready_for_preview, true);
assert.equal(kitchenTicket.ready_for_automatic_operational_print, false);
assert.ok(kitchenTicket.text_trace.includes("COZINHA"));
assert.ok(kitchenTicket.text_trace.includes("2x EBITEN"));
assert.ok(kitchenTicket.text_trace.includes("2x Uramaki Ebiten Especial"));
assert.ok(!kitchenTicket.text_trace.includes("Combinado Salmao"));
assert.ok(kitchenTicket.text_trace.includes("[ ] PRODUZIDO"));

console.log("production-ticket-escpos-v33: ok");

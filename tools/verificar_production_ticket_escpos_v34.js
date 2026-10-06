"use strict";

const assert = require("node:assert/strict");
const Kitchen = require("../dist/src/production/kitchenDependencies.js");
const Ticket = require("../dist/src/production/productionTicketV2.js");
const Esc = require("../dist/src/production/productionTicketEscPosV34.js");

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

const intent = {
  printer: {
    printer_code: "00009",
    printer_name: "BALCAOSUSHI1",
    printer_ip: "192.168.0.142",
    printer_port: "LPT4",
    peripherals_server: "192.168.0.24:3000",
  },
  template_version: "production-ticket-v34-test",
  service_resolution: {
    service: "LUNCH",
    evidence: "HUMAN_CONFIRMED_RULE",
    source_ref: "human:cesar:v34-2026-10-06",
  },
  order_observations: [],
  semantic_key_material: "v34-test",
  intent_fingerprint: "e".repeat(64),
  identifiers: {
    tata_sequence: "006",
    teknisa_sequence: "TESTE",
    ifood_sequence: "TESTE-IFOOD",
    order_time: "19:45",
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
const sushi = Esc.renderStationProductionTicketEscPosV34({
  ticket,
  display_station_name: "SUSHI",
  kitchen_needs: kitchen,
  test_banner: "*** TESTE V3.4 - NAO PRODUZIR ***",
});

assert.equal(sushi.ready_for_preview, true);
assert.equal(sushi.ready_for_automatic_operational_print, false);
assert.equal(sushi.effects.print, false);
assert.equal(sushi.effects.spooler_write, false);
assert.equal(sushi.effects.odhen_write, false);

const lines = sushi.text_trace.split("\n");
assert.ok(lines.includes("1x Combinado Salmao 1 Pessoa"));
assert.ok(lines.includes("2x Uramaki Ebiten Especial"));
const itemIndex = lines.indexOf("2x Uramaki Ebiten Especial");
const obsIndex = lines.indexOf("OBS: SEM CEBOLINHA");
const depIndex = lines.indexOf("VEM DA COZINHA");
assert.equal(obsIndex, itemIndex + 1, "observation must be immediately below its item");
assert.ok(depIndex > obsIndex, "kitchen dependency must come after item observation");
assert.ok(!sushi.text_trace.includes("[ ] FINALIZADO"));
assert.ok(lines.includes("IFOOD TESTE-IFOOD"));
assert.ok(lines.includes("TEKNISA TESTE"));
assert.ok(lines.includes("TATA"));
assert.ok(lines.includes("006"));
assert.equal(lines[lines.length - 1], "006");

const longButValid = Ticket.buildStationProductionTicketV2({
  ...intent,
  lines: [
    {
      ...intent.lines[0],
      product_name: "ITEM TESTE COM NOME LONGO PARA CABER EM UMA UNICA LINHA 123",
      item_observations: [],
    },
  ],
});
const longRender = Esc.renderStationProductionTicketEscPosV34({
  ticket: longButValid,
  display_station_name: "SUSHI",
  kitchen_needs: null,
});
assert.equal(longRender.ready_for_preview, true);
assert.ok(
  longRender.bytes.some(
    (_, index, bytes) =>
      bytes[index] === 0x1b &&
      bytes[index + 1] === 0x4d &&
      bytes[index + 2] === 0x01,
  ),
  "Font B fallback must be used for a >48-column item",
);

const tooLong = Ticket.buildStationProductionTicketV2({
  ...intent,
  lines: [
    {
      ...intent.lines[0],
      product_name:
        "ITEM DE TESTE DELIBERADAMENTE MAIOR QUE SESSENTA E QUATRO COLUNAS PARA BLOQUEAR",
      item_observations: [],
    },
  ],
});
const blocked = Esc.renderStationProductionTicketEscPosV34({
  ticket: tooLong,
  display_station_name: "SUSHI",
  kitchen_needs: null,
});
assert.equal(blocked.ready_for_preview, false);
assert.ok(
  blocked.blocking_reasons.some((reason) =>
    reason.startsWith("ITEM_LINE_EXCEEDS_64_COLUMNS:"),
  ),
);

console.log("production-ticket-escpos-v34: ok");

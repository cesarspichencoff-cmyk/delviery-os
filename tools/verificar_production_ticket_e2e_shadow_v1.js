"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { normalizeOdhenShadow } = require("../dist/src/shadow/odhenReadonly.js");
const { normalizeOdhenRouting } = require("../dist/src/shadow/odhenRoutingReadonly.js");
const { projectExpectedRouting } = require("../dist/src/shadow/expectedRouting.js");
const { planProductionPrintIntents } = require("../dist/src/production/productionPrintPlan.js");
const { buildStationProductionTicketV2 } = require("../dist/src/production/productionTicketV2.js");
const { renderProductionTicketPreview } = require("../dist/src/production/productionTicketPreview.js");
const { decideProductionPrintSubmission } = require("../dist/src/production/productionPrintIdempotency.js");

function load(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8"));
}

const routing = load("data/odhen_product_routing_compact_v1.json");
const printers = load("data/runtime_printer_map_v1.json");
const nonProduction = load("data/non_production_delivery_items_v1.json");
const calibration = load("data/production_printer_calibration_registry_v1.json");

const raw = {
  NRCOMANDA: "18452",
  NRCOMANDAEXT: "A1B2C3",
  NRVENDAREST: "297010",
  emissao: "19:42",
  internal_private_marker: "MUST_NOT_LEAK",
  products: [
    {
      CDPRODUTO: "9.15.00.075.00",
      NMPRODUTO: "COMBINADO SALMAO 1 PESSOA",
      QTPRODCOMVEN: 1,
    },
    {
      CDPRODUTO: "9.50.00.000.00",
      NMPRODUTO: "URAMAKI DE SALMAO",
      QTPRODCOMVEN: 2,
    },
    {
      CDPRODUTO: "9.75.00.030.00",
      NMPRODUTO: "WASABI",
      QTPRODCOMVEN: 1,
    },
  ],
  observation_scan_complete: true,
  observation_rows: [
    {
      source_field: "DSOBSDESCIT",
      value: "SEM CEBOLINHA",
      item_index: 0,
      scope_hint: "item",
      join_proven: true,
    },
    {
      source_field: "DSOBSCOMANDA",
      value: "MOLHO SEPARADO",
      scope_hint: "order",
      join_proven: true,
    },
  ],
};

const shadow = normalizeOdhenShadow(raw);
assert.equal(shadow.ready_for_motor, true);
assert.equal(JSON.stringify(shadow).includes("MUST_NOT_LEAK"), false);
assert.equal(shadow.ids.pedido_externo, "A1B2C3");
assert.deepEqual(
  shadow.items[0].observacoes.map((x) => x.value),
  ["SEM CEBOLINHA"],
);
assert.deepEqual(
  shadow.order_observations.map((x) => x.value),
  ["MOLHO SEPARADO"],
);

const routingInput = normalizeOdhenRouting(raw);
assert.equal(routingInput.ready_for_routing, true);
const projection = projectExpectedRouting(
  routingInput,
  routing,
  printers,
  nonProduction,
);
assert.equal(projection.ready, true);

const plan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: shadow.ids.pedido_interno,
    ifood_sequence: shadow.ids.pedido_externo,
    order_time: shadow.emissao,
    service_resolution: {
      service: "DINNER",
      evidence: "HUMAN_CONFIRMED_RULE",
      source_ref: "synthetic:validated-service-rule",
    },
    order_observations: shadow.order_observations.map((x) => ({
      value: x.value,
      source_ref: `odhen:${x.source_field}`,
      relevance: "PRODUCTION_RELEVANT",
      proof: "REAL_OBSERVED",
    })),
    template_version: "production-ticket-v2-shadow",
    ticket_items: shadow.items.map((item) => ({
      item_index: item.item_index,
      item_observations: item.observacoes.map((x) => x.value),
      mount_group_id: item.item_index === 0 ? "G1" : "G2",
      box_label: item.item_index === 0 ? "CX 750" : "CX 450",
      prep_components: [],
    })),
  },
  calibration,
);

assert.equal(plan.ready_for_shadow_payload, true);
assert.equal(plan.ready_for_physical_print, false);
assert.deepEqual(
  plan.print_intents.map((x) => x.printer.printer_code).sort(),
  ["00003", "00004"],
);
assert.equal(plan.no_own_production_ticket_items.length, 1);
assert.equal(plan.no_own_production_ticket_items[0].product_name, "WASABI");

for (const intent of plan.print_intents) {
  const ticket = buildStationProductionTicketV2(intent);
  for (const profile of [
    "EPSON_TM_T20_80MM_FONT_A",
    "EPSON_TM_T20_58MM_FONT_A",
  ]) {
    const preview = renderProductionTicketPreview(ticket, profile);
    assert.ok(preview.max_line_length <= preview.columns);
    assert.equal(preview.text.includes("MUST_NOT_LEAK"), false);
    assert.equal(preview.text.includes("WASABI"), false);
  }

  const first = decideProductionPrintSubmission(intent.intent_fingerprint, []);
  assert.equal(first.decision, "ALLOW_FIRST_SUBMISSION");
  assert.equal(first.effects.print, false);

  const ambiguous = decideProductionPrintSubmission(
    intent.intent_fingerprint,
    [{
      intent_fingerprint: intent.intent_fingerprint,
      attempt_id: "ATTEMPT-1",
      state: "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
    }],
  );
  assert.equal(ambiguous.decision, "BLOCK_RECONCILIATION_REQUIRED");
}

console.log("production-ticket-e2e-shadow-v1: ok");

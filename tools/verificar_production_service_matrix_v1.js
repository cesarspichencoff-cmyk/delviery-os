"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { projectExpectedRouting } = require("../dist/src/shadow/expectedRouting.js");
const { planProductionPrintIntents } = require("../dist/src/production/productionPrintPlan.js");

function load(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8"));
}

const routing = load("data/odhen_product_routing_compact_v1.json");
const printers = load("data/runtime_printer_map_v1.json");
const calibration = load("data/production_printer_calibration_registry_v1.json");

const pairs = [
  { lunch: "00009", dinner: "00003" },
  { lunch: "00006", dinner: "00004" },
];

function expectedForService(configured, service) {
  let selected = [...configured];
  for (const pair of pairs) {
    if (selected.includes(pair.lunch) && selected.includes(pair.dinner)) {
      const keep = service === "LUNCH" ? pair.lunch : pair.dinner;
      selected = selected.filter(
        (code) => (code !== pair.lunch && code !== pair.dinner) || code === keep,
      );
    }
  }
  return [...new Set(selected)].sort();
}

let checked = 0;
let dualAlternativeProducts = 0;

for (const [productCode, configuredCodes] of Object.entries(routing.products)) {
  const projection = projectExpectedRouting(
    {
      ids: { pedido_interno: `MATRIX-${productCode}` },
      items: [{
        item_index: 0,
        codigo: productCode,
        nome: productCode,
        quantidade: 1,
      }],
    },
    routing,
    printers,
  );

  assert.equal(projection.ready, true, `routing not ready for ${productCode}`);

  const hasDualAlternative = pairs.some(
    (pair) =>
      configuredCodes.includes(pair.lunch) &&
      configuredCodes.includes(pair.dinner),
  );
  if (hasDualAlternative) dualAlternativeProducts += 1;

  for (const service of ["LUNCH", "DINNER"]) {
    const plan = planProductionPrintIntents(
      projection,
      {
        tata_sequence: "001",
        teknisa_sequence: `MATRIX-${productCode}`,
        ifood_sequence: `IFOOD-${productCode}`,
        order_time: null,
        service_resolution: {
          service,
          evidence: "HUMAN_CONFIRMED_RULE",
          source_ref: "synthetic:service-matrix",
        },
        template_version: "production-ticket-v2-shadow",
        ticket_items: [],
      },
      calibration,
    );

    assert.equal(
      plan.ready_for_shadow_payload,
      true,
      `${service} plan not ready for ${productCode}: ${plan.blocking_reasons.join(",")}`,
    );
    assert.equal(plan.ready_for_physical_print, false);

    const actualCodes = plan.print_intents
      .map((intent) => intent.printer.printer_code)
      .sort();
    const expectedCodes = expectedForService(configuredCodes, service);

    assert.deepEqual(
      actualCodes,
      expectedCodes,
      `service route mismatch for ${productCode} / ${service}`,
    );

    for (const pair of pairs) {
      assert.equal(
        actualCodes.includes(pair.lunch) && actualCodes.includes(pair.dinner),
        false,
        `dual service printers leaked for ${productCode} / ${service}`,
      );
    }
  }

  if (hasDualAlternative) {
    const unresolved = planProductionPrintIntents(
      projection,
      {
        tata_sequence: "001",
        teknisa_sequence: `MATRIX-${productCode}`,
        ifood_sequence: `IFOOD-${productCode}`,
        order_time: null,
        service_resolution: {
          service: null,
          evidence: "UNKNOWN",
          source_ref: null,
        },
        template_version: "production-ticket-v2-shadow",
        ticket_items: [],
      },
      calibration,
    );
    assert.equal(unresolved.ready_for_shadow_payload, false);
    assert.ok(
      unresolved.blocking_reasons.some((reason) =>
        reason.startsWith("SERVICE_REQUIRED_FOR_ALTERNATE_ROUTE_ITEM_0_"),
      ),
      `missing service did not block ${productCode}`,
    );
  }

  checked += 1;
}

assert.equal(checked, Object.keys(routing.products).length);
assert.ok(checked > 0);

console.log(
  `production-service-matrix-v1: ok products=${checked} dual_alternatives=${dualAlternativeProducts}`,
);

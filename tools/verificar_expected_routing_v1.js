"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { projectExpectedRouting } = require("../dist/src/shadow/expectedRouting.js");
const routing = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "odhen_product_routing_compact_v1.json"), "utf8"),
);
const printers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "runtime_printer_map_v1.json"), "utf8"),
);

const order = {
  ids: { pedido_interno: "TEST-1" },
  items: [
    {
      item_index: 0,
      codigo: "9.15.00.075.00",
      nome: "COMBINADO SALMAO 1 PESSOA",
      quantidade: 1,
    },
    {
      item_index: 1,
      codigo: "9.50.00.000.00",
      nome: "TESTE SEGUNDA ROTA",
      quantidade: 1,
    },
  ],
};

const projection = projectExpectedRouting(order, routing, printers);

assert.equal(projection.ready, true);
assert.deepEqual(
  projection.items[0].targets.map((x) => [x.printer_code, x.printer_ip]),
  [
    ["00009", "192.168.0.142"],
    ["00003", "192.168.0.153"],
  ],
);
assert.deepEqual(
  projection.items[1].targets.map((x) => [x.printer_code, x.printer_ip]),
  [
    ["00006", "192.168.0.110"],
    ["00004", "192.168.0.4"],
  ],
);
assert.equal(
  projection.semantics,
  "EXPECTED_CONFIGURED_ROUTE_NOT_PHYSICAL_PRINT_PROOF",
);
assert.deepEqual(projection.effects, {
  print: false,
  database_write: false,
  odhen_change: false,
  fiscal_action: false,
});

const missingCode = projectExpectedRouting(
  {
    ids: { pedido_interno: "TEST-2" },
    items: [{ item_index: 0, codigo: null, nome: "X", quantidade: 1 }],
  },
  routing,
  printers,
);
assert.equal(missingCode.ready, false);
assert.ok(missingCode.blocking_reasons.includes("MISSING_PRODUCT_CODE_0"));

const unknownCode = projectExpectedRouting(
  {
    ids: { pedido_interno: "TEST-3" },
    items: [{ item_index: 0, codigo: "NOPE", nome: "X", quantidade: 1 }],
  },
  routing,
  printers,
);
assert.equal(unknownCode.ready, false);
assert.ok(unknownCode.blocking_reasons.includes("PRODUCT_ROUTE_NOT_FOUND_NOPE"));

const realSample = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data", "real_sale_item_routing_sample_20260930_comb_salmao1.json"),
    "utf8",
  ),
);
const realProjection = projectExpectedRouting(
  {
    ids: { pedido_interno: null },
    items: [
      {
        item_index: 0,
        codigo: realSample.registry_resolution.product_code,
        nome: realSample.exported_item.name,
        quantidade: realSample.exported_item.quantity,
      },
    ],
  },
  routing,
  printers,
);
assert.equal(realProjection.ready, true);
assert.deepEqual(realProjection.blocking_reasons, []);
assert.deepEqual(
  realProjection.order_targets.map((x) => [x.printer_code, x.printer_ip]),
  [
    ["00009", "192.168.0.142"],
    ["00003", "192.168.0.153"],
  ],
);
assert.equal(realProjection.effects.print, false);

console.log("expected-routing-v1: ok");

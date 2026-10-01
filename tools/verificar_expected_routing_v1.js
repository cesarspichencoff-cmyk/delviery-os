"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { projectExpectedRouting, canonicalizeRoutingProductCode } = require("../dist/src/shadow/expectedRouting.js");
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


const emptyOrder = projectExpectedRouting(
  { ids: { pedido_interno: "TEST-EMPTY" }, items: [] },
  routing,
  printers,
);
assert.equal(emptyOrder.ready, false);
assert.ok(emptyOrder.blocking_reasons.includes("NO_ITEMS"));

const invalidQty = projectExpectedRouting(
  {
    ids: { pedido_interno: "TEST-QTY" },
    items: [{ item_index: 0, codigo: "9.15.00.075.00", nome: "X", quantidade: 0 }],
  },
  routing,
  printers,
);
assert.equal(invalidQty.ready, false);
assert.ok(invalidQty.blocking_reasons.includes("INVALID_ITEM_QTY_0"));

const duplicateIndex = projectExpectedRouting(
  {
    ids: { pedido_interno: "TEST-IDX" },
    items: [
      { item_index: 0, codigo: "9.15.00.075.00", nome: "A", quantidade: 1 },
      { item_index: 0, codigo: "8.00.05.010.00", nome: "B", quantidade: 1 },
    ],
  },
  routing,
  printers,
);
assert.equal(duplicateIndex.ready, false);
assert.ok(duplicateIndex.blocking_reasons.includes("DUPLICATE_ITEM_INDEX_0"));

const duplicatePrinterMap = {
  ...printers,
  mappings: [...printers.mappings, { ...printers.mappings[0] }],
};
const ambiguousPrinter = projectExpectedRouting(order, routing, duplicatePrinterMap);
assert.equal(ambiguousPrinter.ready, false);
assert.ok(ambiguousPrinter.blocking_reasons.includes("DUPLICATE_PRINTER_CODE_00001"));

const duplicateRoute = JSON.parse(JSON.stringify(routing));
duplicateRoute.products["9.15.00.075.00"] = ["00009", "00003", "00003"];
const ambiguousRoute = projectExpectedRouting(
  {
    ids: { pedido_interno: "TEST-ROUTE" },
    items: [
      {
        item_index: 0,
        codigo: "9.15.00.075.00",
        nome: "COMBINADO SALMAO 1 PESSOA",
        quantidade: 1,
      },
    ],
  },
  duplicateRoute,
  printers,
);
assert.equal(ambiguousRoute.ready, false);
assert.ok(
  ambiguousRoute.blocking_reasons.includes(
    "DUPLICATE_ROUTE_TARGET_9.15.00.075.00_00003",
  ),
);


const storeMismatch = projectExpectedRouting(
  order,
  { ...routing, store: "STORE-A" },
  { ...printers, store: "STORE-B" },
);
assert.equal(storeMismatch.ready, false);
assert.ok(storeMismatch.blocking_reasons.includes("STORE_MISMATCH"));


assert.equal(canonicalizeRoutingProductCode("9150007500"), "9.15.00.075.00");
assert.equal(canonicalizeRoutingProductCode("9.15.00.075.00"), "9.15.00.075.00");
assert.equal(canonicalizeRoutingProductCode("2001201A00"), "2.00.12.01A.00");

const rawCodeProjection = projectExpectedRouting(
  {
    ids: { pedido_interno: "RAW-CODE" },
    items: [
      {
        item_index: 0,
        codigo: "9150007500",
        nome: "COMBINADO SALMAO 1 PESSOA",
        quantidade: 1,
      },
    ],
  },
  routing,
  printers,
);
assert.equal(rawCodeProjection.ready, true);
assert.equal(rawCodeProjection.items[0].source_product_code, "9150007500");
assert.equal(rawCodeProjection.items[0].product_code, "9.15.00.075.00");
assert.deepEqual(
  rawCodeProjection.order_targets.map((x) => [x.printer_code, x.printer_ip]),
  [
    ["00009", "192.168.0.142"],
    ["00003", "192.168.0.153"],
  ],
);

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

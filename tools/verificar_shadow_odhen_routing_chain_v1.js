"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Shadow = require("../dist/src/shadow/odhenReadonly.js");
const { projectExpectedRouting } = require("../dist/src/shadow/expectedRouting.js");

const routing = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "odhen_product_routing_compact_v1.json"), "utf8"),
);
const printers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "runtime_printer_map_v1.json"), "utf8"),
);

const raw = {
  NRCOMANDA: "ROUTING-CHAIN-FIXTURE",
  products: [
    {
      CDPRODUTO: "9.15.00.075.00",
      NMPRODUTO: "COMBINADO SALMAO 1 PESSOA",
      QTPRODCOMVEN: 1,
    },
  ],
  observation_scan_complete: true,
  observation_rows: [],
};

const normalized = Shadow.normalizeOdhenShadow(raw);
assert.equal(normalized.ready_for_motor, true);
assert.equal(normalized.items[0].codigo, "9.15.00.075.00");

const projection = projectExpectedRouting(normalized, routing, printers);
assert.equal(projection.ready, true);
assert.deepEqual(projection.blocking_reasons, []);
assert.deepEqual(
  projection.order_targets.map((x) => [x.printer_code, x.printer_name, x.printer_ip]),
  [
    ["00009", "BALCAOSUSHI1", "192.168.0.142"],
    ["00003", "DELIVERY SUSHI 1", "192.168.0.153"],
  ],
);
assert.equal(projection.semantics, "EXPECTED_CONFIGURED_ROUTE_NOT_PHYSICAL_PRINT_PROOF");
assert.equal(projection.effects.print, false);
assert.equal(normalized.effects.print, false);

console.log("shadow-odhen-routing-chain-v1: ok");

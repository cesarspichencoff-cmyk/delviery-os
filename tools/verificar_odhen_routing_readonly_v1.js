"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { normalizeOdhenRouting } = require("../dist/src/shadow/odhenRoutingReadonly.js");
const { projectExpectedRouting } = require("../dist/src/shadow/expectedRouting.js");

const routing = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "odhen_product_routing_compact_v1.json"), "utf8"),
);
const printers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "runtime_printer_map_v1.json"), "utf8"),
);

const raw = {
  NRCOMANDA: "ROUTING-ONLY-1",
  CONSUMIDOR: "CLIENTE FICTICIO",
  TELEFONE: "0000000000",
  ENDERECO: "RUA FICTICIA",
  PAGAMENTO: "FICTICIO",
  products: [
    {
      CDPRODUTO: "9.15.00.075.00",
      NMPRODUTO: "COMBINADO SALMAO 1 PESSOA",
      QTPRODCOMVEN: 1,
    },
  ],
};

const normalized = normalizeOdhenRouting(raw);
assert.equal(normalized.ready_for_routing, true);
assert.deepEqual(normalized.blocking_reasons, []);
assert.equal(normalized.ids.pedido_interno, "ROUTING-ONLY-1");
assert.deepEqual(normalized.items, [
  {
    item_index: 0,
    codigo: "9.15.00.075.00",
    nome: "COMBINADO SALMAO 1 PESSOA",
    quantidade: 1,
  },
]);

const serialized = JSON.stringify(normalized);
for (const forbidden of ["CLIENTE FICTICIO", "0000000000", "RUA FICTICIA", "PAGAMENTO"]) {
  assert.equal(serialized.includes(forbidden), false, "PII/payment leaked: " + forbidden);
}

assert.deepEqual(normalized.effects, {
  print: false,
  database_write: false,
  odhen_change: false,
  fiscal_action: false,
  service_install: false,
  watcher_install: false,
  cutover: false,
});

const projection = projectExpectedRouting(normalized, routing, printers);
assert.equal(projection.ready, true);
assert.deepEqual(
  projection.order_targets.map((x) => [x.printer_code, x.printer_name, x.printer_ip]),
  [
    ["00009", "BALCAOSUSHI1", "192.168.0.142"],
    ["00003", "DELIVERY SUSHI 1", "192.168.0.153"],
  ],
);

const missingCode = normalizeOdhenRouting({
  NRCOMANDA: "ROUTING-ONLY-2",
  products: [{ NMPRODUTO: "X", QTPRODCOMVEN: 1 }],
});
assert.equal(missingCode.ready_for_routing, false);
assert.ok(missingCode.blocking_reasons.includes("MISSING_PRODUCT_CODE_0"));

const missingOrder = normalizeOdhenRouting({
  products: [{ CDPRODUTO: "9.15.00.075.00", NMPRODUTO: "X", QTPRODCOMVEN: 1 }],
});
assert.equal(missingOrder.ready_for_routing, false);
assert.ok(missingOrder.blocking_reasons.includes("MISSING_NRCOMANDA"));

const badQty = normalizeOdhenRouting({
  NRCOMANDA: "ROUTING-ONLY-3",
  products: [{ CDPRODUTO: "9.15.00.075.00", NMPRODUTO: "X", QTPRODCOMVEN: 0 }],
});
assert.equal(badQty.ready_for_routing, false);
assert.ok(badQty.blocking_reasons.includes("INVALID_ITEM_QTY_0"));

console.log("odhen-routing-readonly-v1: ok");

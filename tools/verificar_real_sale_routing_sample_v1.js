"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routing = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "odhen_product_routing_compact_v1.json"), "utf8"),
);
const printers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "runtime_printer_map_v1.json"), "utf8"),
);
const sample = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data", "real_sale_item_routing_sample_20260930_comb_salmao1.json"),
    "utf8",
  ),
);

assert.equal(sample.schema, "deliveryos.real-sale-item-routing-sample.v1");
assert.equal(sample.exported_item.name, "COMBINADO SALMAO 1 PESSOA");
assert.equal(sample.exported_item.quantity, 1);
assert.equal(sample.exported_item.total_value, 109);

const code = sample.registry_resolution.product_code;
assert.equal(code, "9.15.00.075.00");
assert.deepEqual(routing.products[code], ["00009", "00003"]);

const byCode = new Map(printers.mappings.map((x) => [x.printer_code, x]));
const resolved = routing.products[code].map((printerCode) => {
  const p = byCode.get(printerCode);
  assert.ok(p, `missing printer ${printerCode}`);
  assert.ok(p.printer_ip, `missing printer IP ${printerCode}`);
  return [p.printer_code, p.printer_name, p.printer_ip];
});

assert.deepEqual(resolved, [
  ["00009", "BALCAOSUSHI1", "192.168.0.142"],
  ["00003", "DELIVERY SUSHI 1", "192.168.0.153"],
]);

assert.equal(sample.semantics, "EXPECTED_CONFIGURED_ROUTE_NOT_PHYSICAL_PRINT_PROOF");
assert.deepEqual(sample.effects, {
  print: false,
  database_write: false,
  odhen_change: false,
  fiscal_action: false,
});

console.log("real-sale-routing-sample-v1: ok");

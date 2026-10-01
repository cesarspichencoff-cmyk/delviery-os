"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const registry = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data", "non_production_delivery_items_v1.json"),
    "utf8",
  ),
);
const routing = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data", "odhen_product_routing_compact_v1.json"),
    "utf8",
  ),
);

assert.equal(registry.schema, "deliveryos.non-production-items.v1");
assert.equal(registry.semantics, "NO_OWN_PRODUCTION_TICKET");
assert.equal(registry.store, routing.store);

const expected = [
  "8.20.11.001.00",
  "9.75.00.030.00",
  "9.75.00.031.00",
  "9.75.00.032.00",
];

assert.deepEqual(Object.keys(registry.items).sort(), expected);

for (const code of expected) {
  const item = registry.items[code];
  assert.ok(item, code);
  assert.equal(item.proof, "HUMAN_CONFIRMED");
  assert.ok(item.product_name);
  assert.ok(item.reason);
  assert.equal(
    Object.prototype.hasOwnProperty.call(routing.products, code),
    false,
    "confirmed no-ticket item must not silently acquire a configured production route: " + code,
  );
}

console.log("non-production-delivery-items-v1: ok");

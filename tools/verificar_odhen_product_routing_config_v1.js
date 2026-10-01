"use strict";
const fs = require("node:fs");
const path = require("node:path");

const routingPath = path.join(__dirname, "..", "data", "odhen_product_routing_compact_v1.json");
const printersPath = path.join(__dirname, "..", "data", "runtime_printer_map_v1.json");
const routing = JSON.parse(fs.readFileSync(routingPath, "utf8"));
const printers = JSON.parse(fs.readFileSync(printersPath, "utf8"));

function fail(msg) {
  throw new Error("odhen-product-routing-config-v1: " + msg);
}

if (routing.schema !== "deliveryos.odhen.product-routing.compact.v1") fail("bad routing schema");
if (printers.schema !== "deliveryos.runtime-printer-map.v1") fail("bad printer schema");

const entries = Object.entries(routing.products || {});
if (entries.length !== 463 || routing.counts.products !== 463) fail("expected 463 products");

const counts = { one: 0, two: 0, zero: 0 };
const printerCodes = printers.mappings.map((x) => x.printer_code);
if (new Set(printerCodes).size !== printerCodes.length) fail("duplicate printer code");

const byCode = new Map(printers.mappings.map((x) => [x.printer_code, x]));
const actuallyUsedPrinters = new Set();

for (const [code, targets] of entries) {
  if (!Array.isArray(targets)) fail(`targets not array ${code}`);
  if (new Set(targets).size !== targets.length) fail(`duplicate target for ${code}`);
  if (targets.length === 0) counts.zero += 1;
  else if (targets.length === 1) counts.one += 1;
  else if (targets.length === 2) counts.two += 1;
  else fail(`too many targets ${code}`);

  for (const printerCode of targets) {
    actuallyUsedPrinters.add(printerCode);
    const printer = byCode.get(printerCode);
    if (!printer) fail(`unknown printer ${printerCode} for ${code}`);
    if (!printer.printer_ip) fail(`missing IP ${printerCode} for ${code}`);
  }
}

if (counts.one !== 346 || counts.two !== 117 || counts.zero !== 0) {
  fail(`route counts mismatch ${JSON.stringify(counts)}`);
}

if (JSON.stringify(routing.products["9.05.05.080.00"]) !== JSON.stringify(["00009"])) {
  fail("executivo salmao route mismatch");
}

for (const code of ["9.15.00.075.00", "9.15.00.076.00"]) {
  if (JSON.stringify(routing.products[code]) !== JSON.stringify(["00009", "00003"])) {
    fail(`salmon route mismatch ${code}`);
  }
}

const flaggedUsedPrinters = printers.mappings
  .filter((x) => x.used_by_products === true)
  .map((x) => x.printer_code)
  .sort();
const actualUsed = [...actuallyUsedPrinters].sort();

if (JSON.stringify(flaggedUsedPrinters) !== JSON.stringify(actualUsed)) {
  fail(`used_by_products flags mismatch ${JSON.stringify({ flaggedUsedPrinters, actualUsed })}`);
}

const p153 = [...byCode.values()].find((x) => x.printer_ip === "192.168.0.153");
const p142 = [...byCode.values()].find((x) => x.printer_ip === "192.168.0.142");

if (!p153 || p153.printer_code !== "00003" || p153.printer_name !== "DELIVERY SUSHI 1") {
  fail(".153 identity mismatch");
}
if (!p142 || p142.printer_code !== "00009" || p142.printer_name !== "BALCAOSUSHI1") {
  fail(".142 identity mismatch");
}

console.log("odhen-product-routing-config-v1: ok");

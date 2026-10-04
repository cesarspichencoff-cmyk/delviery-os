"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message) { throw new Error("tata-reader-real-order-direct-route: " + message); }
function load(rel) { return JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8")); }
function canonical(raw) {
  const v = String(raw ?? "").trim().toUpperCase().replace(/\./g, "");
  if (!/^[A-Z0-9]{10}$/.test(v)) fail("invalid compact code " + raw);
  return [v.slice(0,1),v.slice(1,3),v.slice(3,5),v.slice(5,8),v.slice(8,10)].join(".");
}

const ev = load("data/tata_reader_real_order_expected_route_direct_identity_20261004_v1.json");
const real = load("data/tata_reader_real_read_success_20261003_v1.json");
const cross = load("data/tata_reader_product_identity_observed_crosswalk_20261004_v1.json");
const routing = load("data/odhen_product_routing_compact_v1.json");
const printers = load("data/runtime_printer_map_v1.json");

if (ev.status !== "PROVEN_EXPECTED_ROUTE_FOR_OBSERVED_REAL_ORDER_NO_PRINT") fail("status");
if (ev.proof?.observed_real_order_expected_route !== "PROVEN") fail("expected route proof");
if (ev.proof?.physical_print !== "NOT_EXECUTED_NOT_PROVEN") fail("physical print boundary");
if (ev.proof?.unrestricted_global_runtime_authority !== false) fail("global authority");

if (String(ev.order?.NRCOMANDA) !== String(real.observed_order?.NRCOMANDA)) fail("order mismatch");

const crossById = new Map(cross.rows.map(x => [String(x.CDPRODUTO), x]));
const printerByCode = new Map(printers.mappings.map(x => [String(x.printer_code), x]));

for (const item of ev.items) {
  const c = crossById.get(String(item.sql_cdproduto));
  if (!c) fail("crosswalk missing " + item.sql_cdproduto);
  if (String(item.cdarvprod_raw) !== String(c.CDARVPROD)) fail("CDARVPROD mismatch " + item.sql_cdproduto);
  const code = canonical(item.cdarvprod_raw);
  if (code !== item.retail_product_code) fail("canonical mismatch " + item.sql_cdproduto);
  const expectedTargets = routing.products?.[code];
  if (!Array.isArray(expectedTargets) || !expectedTargets.length) fail("route missing " + code);
  const actualCodes = item.targets.map(x => String(x.printer_code));
  if (JSON.stringify(actualCodes) !== JSON.stringify(expectedTargets)) fail("target code mismatch " + code);
  for (const target of item.targets) {
    const p = printerByCode.get(String(target.printer_code));
    if (!p) fail("printer missing " + target.printer_code);
    if (p.printer_name !== target.printer_name) fail("printer name mismatch " + target.printer_code);
    if (p.printer_ip !== target.printer_ip) fail("printer ip mismatch " + target.printer_code);
  }
}
for (const [k,v] of Object.entries(ev.effects ?? {})) {
  if (v !== false) fail("unexpected effect " + k);
}
process.stdout.write("TATA_READER_REAL_ORDER_DIRECT_EXPECTED_ROUTE_PASS\n");

"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  throw new Error("tata-reader-identity-bridge-candidate: " + message);
}

function load(rel) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8"));
}

function canonicalize(raw) {
  const value = String(raw ?? "").trim().toUpperCase().replace(/\./g, "");
  if (!/^[A-Z0-9]{10}$/.test(value)) fail("invalid retail code " + raw);
  return [
    value.slice(0, 1),
    value.slice(1, 3),
    value.slice(3, 5),
    value.slice(5, 8),
    value.slice(8, 10),
  ].join(".");
}

const evidence = load("data/tata_reader_real_order_identity_bridge_candidate_20261004_v1.json");
const real = load("data/tata_reader_real_read_success_20261003_v1.json");
const routing = load("data/odhen_product_routing_compact_v1.json");
const printers = load("data/runtime_printer_map_v1.json");

if (evidence.schema !== "deliveryos.tata-reader-real-order-identity-bridge-candidate.v1") fail("schema");
if (evidence.status !== "PASS_CANDIDATE_BRIDGE_ONLY") fail("status");
if (evidence.bridge_method?.allowed_for_runtime !== false) fail("runtime authority must remain false");
if (evidence.bridge_method?.allowed_as_canonical_identity !== false) fail("canonical identity authority must remain false");
if (evidence.proof?.sql_internal_product_id_to_retail_product_code !== "UNKNOWN") fail("identity must remain UNKNOWN");
if (evidence.proof?.real_order_to_current_expected_route !== "CANDIDATE_ONLY_NOT_CANONICAL_IDENTITY_PROOF") fail("candidate semantics");

if (real.status !== "PROVEN_MINIMIZED_REAL_ORDER_READ") fail("real order proof status");
if (String(real.observed_order?.NRCOMANDA) !== String(evidence.real_order?.NRCOMANDA)) fail("order mismatch");

const realItems = new Map(real.observed_items.map((x) => [String(x.CDPRODUTO), x]));
const printerMap = new Map(printers.mappings.map((x) => [String(x.printer_code), x]));

for (const row of evidence.items) {
  const source = realItems.get(String(row.sql_cdproduto));
  if (!source) fail("source item missing " + row.sql_cdproduto);
  if (String(source.NMPRODUTO).trim() !== String(row.normalized_name)) fail("name mismatch " + row.sql_cdproduto);
  if (String(source.QTPRODCOMVEN) !== String(row.quantity)) fail("quantity mismatch " + row.sql_cdproduto);
  if (row.historical_snapshot_exact_trimmed_name_matches !== 1) fail("historical match count " + row.sql_cdproduto);

  const canonical = canonicalize(row.candidate_retail_compact_code);
  if (canonical !== row.candidate_retail_canonical_code) fail("canonical code mismatch " + row.sql_cdproduto);

  const configured = routing.products?.[canonical];
  if (!Array.isArray(configured) || configured.length === 0) fail("route missing " + canonical);
  const expectedCodes = row.configured_targets.map((x) => String(x.printer_code));
  if (JSON.stringify(configured) !== JSON.stringify(expectedCodes)) fail("route target mismatch " + canonical);

  for (const target of row.configured_targets) {
    const actual = printerMap.get(String(target.printer_code));
    if (!actual) fail("printer missing " + target.printer_code);
    if (actual.printer_name !== target.printer_name) fail("printer name mismatch " + target.printer_code);
    if (actual.printer_ip !== target.printer_ip) fail("printer ip mismatch " + target.printer_code);
  }
}

for (const [key, value] of Object.entries(evidence.effects ?? {})) {
  if (value !== false) fail("effect must remain false: " + key);
}

process.stdout.write("TATA_READER_IDENTITY_BRIDGE_CANDIDATE_PASS\n");

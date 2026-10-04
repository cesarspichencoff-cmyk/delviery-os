"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  throw new Error("tata-reader-cdarvprod-vs-routing: " + message);
}
function load(rel) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8"));
}
function compactRoutingCode(code) {
  const compact = String(code ?? "").trim().toUpperCase().replace(/\./g, "");
  if (!/^[A-Z0-9]{10}$/.test(compact)) fail("invalid routing code " + code);
  return compact;
}

const audit = load("data/tata_reader_cdarvprod_catalog_audit_result_20261004_v1.json");
const routing = load("data/odhen_product_routing_compact_v1.json");
const comparison = load("data/tata_reader_cdarvprod_vs_routing_comparison_20261004_v1.json");

if (audit.status !== "CDARVPROD_CATALOG_AGGREGATE_READ") fail("audit status");
if (audit.summary?.total_product_rows !== 554) fail("total product rows");
if (audit.summary?.null_or_blank_cdarvprod_rows !== 0) fail("null/blank rows");
if (audit.summary?.nonblank_cdarvprod_rows !== 554) fail("nonblank rows");
if (audit.summary?.distinct_nonblank_cdarvprod !== 554) fail("distinct count");
if (audit.distinct_values_returned !== 554) fail("returned count");

const localValues = audit.values.map(x => String(x.CDARVPROD));
if (localValues.length !== 554) fail("local values length");
if (new Set(localValues).size !== 554) fail("local values not unique");
for (const row of audit.values) {
  if (row.product_rows !== 1) fail("local value duplicate count " + row.CDARVPROD);
}

const local = new Set(localValues);
const routeValues = Object.keys(routing.products).map(compactRoutingCode);
const route = new Set(routeValues);
if (route.size !== 463) fail("routing count");

const overlap = [...route].filter(x => local.has(x)).sort();
const missing = [...route].filter(x => !local.has(x)).sort();
const extra = [...local].filter(x => !route.has(x)).sort();

if (overlap.length !== 391) fail("overlap count");
if (missing.length !== 72) fail("missing count");
if (extra.length !== 163) fail("extra count");

if (JSON.stringify(missing) !== JSON.stringify(comparison.comparison.routing_missing_from_local)) {
  fail("missing set mismatch");
}
if (JSON.stringify(extra) !== JSON.stringify(comparison.comparison.local_not_in_routing)) {
  fail("extra set mismatch");
}
if (comparison.status !== "GLOBAL_EQUIVALENCE_NOT_PROVEN") fail("comparison status");
if (comparison.interpretation?.runtime_global_authority !== false) fail("global authority must remain false");
if (comparison.interpretation?.cdarvprod_equals_current_463_routing_catalog !== "DISPROVEN_AS_SET_EQUIVALENCE") {
  fail("set-equivalence conclusion");
}

const invalidLocal = [...local].filter(x => !/^[A-Z0-9]{10}$/.test(x)).sort();
if (JSON.stringify(invalidLocal) !== JSON.stringify(["96500120"])) fail("invalid local code set");

process.stdout.write("TATA_READER_CDARVPROD_VS_ROUTING_COMPARISON_PASS\n");

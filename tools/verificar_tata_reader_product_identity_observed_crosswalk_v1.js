"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  throw new Error("tata-reader-product-identity-observed-crosswalk: " + message);
}
function load(rel) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8"));
}
function canonicalize(raw) {
  const value = String(raw ?? "").trim().toUpperCase().replace(/\./g, "");
  if (!/^[A-Z0-9]{10}$/.test(value)) fail("invalid compact retail code " + raw);
  return [value.slice(0,1),value.slice(1,3),value.slice(3,5),value.slice(5,8),value.slice(8,10)].join(".");
}

const observed = load("data/tata_reader_product_identity_observed_crosswalk_20261004_v1.json");
const prior = load("data/tata_reader_real_order_identity_bridge_candidate_20261004_v1.json");
const routing = load("data/odhen_product_routing_compact_v1.json");

if (observed.status !== "PROVEN_EXACT_FOR_TWO_OBSERVED_PRODUCTS") fail("status");
if (observed.rows?.length !== 2) fail("row count");
if (observed.proof?.runtime_global_authority !== false) fail("global runtime authority must remain false");
if (observed.proof?.cdarvprod_global_semantics_for_all_products !== "UNKNOWN") fail("global semantics must remain UNKNOWN");
if (observed.proof?.cdarvprod_global_uniqueness !== "UNKNOWN") fail("global uniqueness must remain UNKNOWN");
if (observed.proof?.cdarvprod_coverage_of_463_routing_products !== "UNKNOWN") fail("global coverage must remain UNKNOWN");

const priorById = new Map(prior.items.map(x => [String(x.sql_cdproduto), x]));
for (const row of observed.rows) {
  const p = priorById.get(String(row.CDPRODUTO));
  if (!p) fail("prior candidate missing " + row.CDPRODUTO);
  if (row.CDPRODINTE !== null) fail("CDPRODINTE expected null " + row.CDPRODUTO);
  if (row.CDPRODESTO !== null) fail("CDPRODESTO expected null " + row.CDPRODUTO);
  if (String(row.CDARVPROD) !== String(p.candidate_retail_compact_code)) fail("CDARVPROD mismatch " + row.CDPRODUTO);
  if (String(row.prior_candidate_retail_compact_code) !== String(p.candidate_retail_compact_code)) fail("persisted compact candidate mismatch " + row.CDPRODUTO);
  const canonical = canonicalize(row.CDARVPROD);
  if (canonical !== p.candidate_retail_canonical_code) fail("canonical form mismatch " + row.CDPRODUTO);
  if (!Array.isArray(routing.products?.[canonical])) fail("routing code missing " + canonical);
  if (row.exact_compact_match !== true) fail("exact match flag " + row.CDPRODUTO);
}

if (observed.effect_boundary?.product_row_read !== true) fail("authorized product row read must be true");
for (const [k,v] of Object.entries(observed.effect_boundary ?? {})) {
  if (k !== "product_row_read" && v !== false) fail("unexpected effect " + k);
}

process.stdout.write("TATA_READER_PRODUCT_IDENTITY_OBSERVED_CROSSWALK_PASS\n");

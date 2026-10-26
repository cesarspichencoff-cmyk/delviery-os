"use strict";

/**
 * G2 source-gap audit. Historical routing != current authenticated product identity.
 * No database, network, printers, mutation, or operational classification.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const routing = load("data/odhen_product_routing_compact_v1.json");
const audit = load("data/praca_routing_audit_snapshot_20260930.json");

// Occurrences of CLASSIFICATION_UNKNOWN in 200 recent shadow decisions as
// recorded in docs/comandas/AUDITORIA_SHADOW_ACADEMIA_20261026_REVIEW_ONLY.md.
// They are neither independent orders nor a current canonical crosswalk.
const sample = [
  ["9.10.05.000.00", "CARPACCIO DE SALMAO", 20],
  ["9.75.00.020.00", "MISSOSHIRO", 12],
  ["9.10.05.060.00", "TUNA SHISSO TARTAR", 9],
  ["9.15.00.060.00", "SALMAO/ATUM 1 PESSOA", 7],
  ["9.10.00.050.00", "SHIMEJI E SHITAKE", 7],
  ["8.00.05.000.00", "COCA COLA 350ML - UN", 4],
  ["8.20.00.061.00", "MOCHI INDIVIDUAL", 4],
  ["9.10.05.040.00", "TARTAR DE ATUM SPICY", 4],
  ["9.10.05.070.00", "CEVICHE", 4],
  ["8.00.00.010.00", "AGUA MINERAL C/GAS - UN", 3],
  ["9.10.05.050.00", "TARTAR DE SALMAO", 2],
  ["9.15.00.070.00", "SALMAO/ATUM 2 PESSOAS", 2],
  ["9.99.00.007.00", "TATA CHOCOLATE", 2],
  ["8.20.11.002.00", "COOKIE PISTACHE", 2],
];
assert.equal(routing.counts?.products ?? Object.keys(routing.products).length, 463);
assert.equal(audit.captured_date, "2026-09-30");
assert.equal(audit.sources.retail_products.products, 463);
assert.equal(audit.method.fuzzy_matching_promoted, false);
assert.equal(audit.method.auto_reclassification, false);

function historicalReview(code) {
  return audit.manual_review_checks.filter((x) =>
    x.product_code === code || (Array.isArray(x.candidates) &&
      x.candidates.some((y) => y.product_code === code))
  );
}
function classifyEvidence(code) {
  const reviews = historicalReview(code);
  const direct = reviews.filter((x) => x.product_code === code);
  const candidate = reviews.filter((x) =>
    Array.isArray(x.candidates) && x.candidates.some((y) => y.product_code === code));
  return {
    historical_exact_code_review: direct.length,
    historical_ambiguous_candidate: candidate.length,
    historical_plaza: direct.length === 1 ? direct[0].current_plaza : null,
    // Historical documentation is not a live, code-bound, authenticated
    // CDPRODUTO->name->classification->station attestation for this order.
    current_authenticated_crosswalk: false,
    automatic_classification_authorized: false,
  };
}
const seen = new Set();
const rows = sample.map(([code, observed_name, occurrences]) => {
  assert.match(code, /^\d+\.\d+\.\d+\.\d+\.\d+$/);
  assert.ok(!seen.has(code)); seen.add(code);
  const printer_codes = routing.products[code];
  assert.ok(Array.isArray(printer_codes) && printer_codes.length > 0,
    "Missing historical route: " + code);
  assert.ok(Number.isInteger(occurrences) && occurrences > 0);
  return {code, observed_name, occurrences_in_200_decisions:occurrences,
    historical_printer_routes:printer_codes, ...classifyEvidence(code),
    status:"HOLD_NEEDS_CURRENT_CODE_BOUND_SOURCE"};
});
assert.equal(rows.length, 14);
assert.equal(rows.filter((r) => r.automatic_classification_authorized).length, 0);
assert.equal(rows.find((r) => r.code === "9.75.00.020.00").historical_ambiguous_candidate, 1);
assert.equal(rows.find((r) => r.code === "9.10.05.060.00").historical_exact_code_review, 1);
assert.equal(classifyEvidence("9.75.00.020.01").historical_exact_code_review, 0);
assert.equal(classifyEvidence("9.10.05.060.01").automatic_classification_authorized, false);

console.log(JSON.stringify({
 schema:"deliveryos.comandas.classification-source-gap-audit.v1",
 mode:"REVIEW_ONLY", sample_decisions:200, item_codes:rows.length,
 historical_audit_date:audit.captured_date,
 with_exact_historical_review:rows.filter((r)=>r.historical_exact_code_review>0).length,
 with_ambiguous_historical_candidates:rows.filter((r)=>r.historical_ambiguous_candidate>0).length,
 currently_authorized_for_auto_classification:0,
 ready:false, rows,
 effects:{file_write:false,database_read:false,database_write:false,
   shift_write:false,printing:false,spooler:false,fiscal:false}
}));

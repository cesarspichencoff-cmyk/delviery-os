"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  throw new Error("plaza-vs-retail-v1: " + message);
}

function normalizeName(value) {
  if (value === null || value === undefined) return "";
  let text = String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  text = text
    .replace(/\bcomb\b/g, "combinado")
    .replace(/\bexec\b/g, "executivo")
    .replace(/\btrad\b/g, "tradicional")
    .replace(/\bshisso\b/g, "shiso")
    .replace(/\b([12])\s+p\b/g, "$1 pessoa")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function routeSignature(printerCodes) {
  if (!Array.isArray(printerCodes)) return "";
  return printerCodes.map((x) => String(x).trim()).filter(Boolean).join("+");
}

function auditPlazas(seed, catalog) {
  if (!seed || !Array.isArray(seed.itens)) fail("invalid seed");
  if (!catalog || catalog.schema !== "deliveryos.retail.product-catalog.v1") {
    fail("invalid Retail catalog");
  }
  if (!Array.isArray(catalog.products)) fail("catalog products must be an array");

  const byNormalizedName = new Map();
  for (const row of catalog.products) {
    const key = normalizeName(row.product_name);
    if (!key) continue;
    const list = byNormalizedName.get(key) || [];
    list.push(row);
    byNormalizedName.set(key, list);
  }

  const uniqueMatches = [];
  const ambiguous = [];
  const unmatched = [];

  for (const item of seed.itens) {
    const key = normalizeName(item.nome);
    const candidates = byNormalizedName.get(key) || [];

    if (candidates.length === 0) {
      unmatched.push({
        seed_id: item.id,
        seed_name: item.nome,
        plaza: item.praca_principal ?? null,
        manual_review: item.revisao_manual === true,
      });
      continue;
    }

    if (candidates.length > 1) {
      const signatures = [...new Set(candidates.map((x) => routeSignature(x.printer_codes)))];
      ambiguous.push({
        seed_id: item.id,
        seed_name: item.nome,
        plaza: item.praca_principal ?? null,
        manual_review: item.revisao_manual === true,
        disposition: signatures.length === 1 ? "AMBIGUOUS_SAME_ROUTE" : "AMBIGUOUS_DIFFERENT_ROUTE",
        candidates: candidates.map((x) => ({
          product_code: x.product_code,
          product_name: x.product_name,
          printer_codes: x.printer_codes,
          route_signature: routeSignature(x.printer_codes),
        })),
      });
      continue;
    }

    const candidate = candidates[0];
    uniqueMatches.push({
      seed_id: item.id,
      seed_name: item.nome,
      plaza: item.praca_principal ?? null,
      dependent_plazas: Array.isArray(item.pracas_dependentes) ? item.pracas_dependentes : [],
      seed_confidence: item.confianca_classificacao ?? null,
      manual_review: item.revisao_manual === true,
      product_code: candidate.product_code,
      retail_name: candidate.product_name,
      printer_codes: candidate.printer_codes,
      route_signature: routeSignature(candidate.printer_codes),
    });
  }

  const byPlaza = new Map();
  for (const row of uniqueMatches) {
    const plaza = row.plaza ?? "(sem_praca)";
    const list = byPlaza.get(plaza) || [];
    list.push(row);
    byPlaza.set(plaza, list);
  }

  const profiles = [];
  const reviewCandidates = [];

  for (const [plaza, rows] of [...byPlaza.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const counts = new Map();
    for (const row of rows) {
      counts.set(row.route_signature, (counts.get(row.route_signature) || 0) + 1);
    }

    const routeProfiles = [...counts.entries()]
      .map(([signature, count]) => ({ route_signature: signature, count }))
      .sort((a, b) => b.count - a.count || a.route_signature.localeCompare(b.route_signature));

    const dominant = routeProfiles[0] || null;
    const outliers =
      dominant === null
        ? []
        : rows.filter((row) => row.route_signature !== dominant.route_signature);

    profiles.push({
      plaza,
      unique_matches: rows.length,
      dominant_route_signature: dominant ? dominant.route_signature : null,
      dominant_count: dominant ? dominant.count : 0,
      route_profiles: routeProfiles,
      outliers: outliers.map((row) => ({
        seed_id: row.seed_id,
        seed_name: row.seed_name,
        product_code: row.product_code,
        route_signature: row.route_signature,
        manual_review: row.manual_review,
      })),
    });

    for (const row of outliers) {
      if (!row.manual_review) continue;
      reviewCandidates.push({
        seed_id: row.seed_id,
        seed_name: row.seed_name,
        current_plaza: row.plaza,
        product_code: row.product_code,
        route_signature: row.route_signature,
        plaza_dominant_route_signature: dominant.route_signature,
        disposition: "REVIEW_CANDIDATE_NOT_AUTO_CORRECTION",
        reason:
          "Manual-review seed item is a deterministic-name match and a physical-route outlier inside its logical plaza.",
      });
    }
  }

  return {
    schema: "deliveryos.plaza-vs-retail-audit.v1",
    store: catalog.store ?? null,
    captured_date: catalog.captured_date ?? null,
    invariants: [
      "LOGICAL_PLAZA_NE_PHYSICAL_PRINTER_ROUTE",
      "ROUTING_CAN_FLAG_BUT_NOT_AUTOMATICALLY_RECLASSIFY_PLAZA",
      "DETERMINISTIC_NAME_MATCH_ONLY",
      "NO_FUZZY_MATCH_PROMOTED_TO_FACT",
    ],
    coverage: {
      seed_items: seed.itens.length,
      retail_products: catalog.products.length,
      unique_matches: uniqueMatches.length,
      ambiguous_matches: ambiguous.length,
      unmatched_seed_items: unmatched.length,
    },
    profiles,
    review_candidates: reviewCandidates,
    ambiguous,
    unmatched,
    unique_matches: uniqueMatches,
    effects: {
      seed_write: false,
      motor_write: false,
      teknisa_write: false,
      print: false,
      cutover: false,
    },
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) fail("unexpected argument " + token);
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) fail("missing value for --" + key);
    out[key] = value;
    i += 1;
  }
  return out;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.seed) fail("missing --seed");
  if (!args.catalog) fail("missing --catalog");

  const report = auditPlazas(loadJson(args.seed), loadJson(args.catalog));
  const output = JSON.stringify(report, null, 2) + "\n";

  if (args.out) fs.writeFileSync(path.resolve(args.out), output);
  process.stdout.write(output);
}

module.exports = { normalizeName, routeSignature, auditPlazas };

if (require.main === module) {
  main();
}

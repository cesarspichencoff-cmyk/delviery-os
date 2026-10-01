"use strict";

const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");
const { canonicalizeProductCode } = require("./gerar_retail_routing_config_v1.js");
const { normalizeName } = require("./auditar_pracas_vs_retail_v1.js");

function fail(message) {
  throw new Error("active-delivery-routing-coverage-v1: " + message);
}

function readRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: true });
  const first = workbook.SheetNames[0];
  if (!first) fail("workbook has no sheet");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: null, raw: true });
  if (!rows.length) fail("sales sheet has no rows");
  const required = ["Modalidade", "Código", "Produto", "Nv. de Produto Superior", "Qtd."];
  const headers = new Set(Object.keys(rows[0]));
  for (const h of required) if (!headers.has(h)) fail("missing header " + h);
  return rows;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function rawToCanonical(value) {
  if (value === null || value === undefined || value === "") return null;
  return canonicalizeProductCode(value);
}

function inferPlaza(row, printerCodes) {
  const group = String(row.group || "").trim().toUpperCase();
  const name = String(row.product || "").trim().toUpperCase();
  const route = new Set(printerCodes || []);

  if (["AGUAS","CERVEJAS","REFRIGERANTES","SAKES HONJOZO"].includes(group)) return "bar_bebidas";
  if (["ENTRADAS QUENTES","PRATOS QUENTES"].includes(group)) return "cozinha_quentes";
  if (["SUSHIS","SASHIMIS","DYOS","SUSHIS TRUFADOS","SUSHIS ESPECIAIS"].includes(group)) return "duplas";
  if (group === "EVENTOS" && name.includes("SUSHI")) return "duplas";
  if (group === "COMBINADOS") return "combinados";
  if (group === "LETRAS E NUMEROS" && name.includes("COMB")) return "combinados";
  if (group === "HOSSOMAKIS") return "enrolados";
  if (["URAMAKIS","TEMAKIS"].includes(group)) {
    if (route.has("00004")) return "enrolados";
    if (route.has("00006")) return "enrolados_quentes";
  }
  if (group === "ENTRADAS FRIAS") {
    if (route.has("00006")) return "enrolados_quentes";
    if (route.has("00009")) return "duplas";
  }
  if (group === "MENU KIDS") {
    if (name.includes("COMBINADO")) return "combinados";
    if (route.has("00002")) return "cozinha_quentes";
  }
  if (group === "ACOMPANHAMENTOS") {
    if (name.includes("MISSOSHIRO")) return "cozinha_quentes";
    return "montagem_outros";
  }
  if (["MOCHIS","SOBREMESAS","COOCKIE"].includes(group)) return "sobremesa";

  return null;
}

function auditCoverage(rows, routing, seed) {
  if (routing.schema !== "deliveryos.odhen.product-routing.compact.v1") fail("routing schema mismatch");
  if (!Array.isArray(seed.itens)) fail("seed invalid");

  const bySeedName = new Map();
  for (const item of seed.itens) {
    const key = normalizeName(item.nome);
    if (!key) continue;
    const list = bySeedName.get(key) || [];
    list.push(item);
    bySeedName.set(key, list);
  }

  const aggregated = new Map();
  for (const row of rows) {
    const modality = String(row["Modalidade"] || "").trim();
    if (!modality.startsWith("Delivery")) continue;

    const canonical = rawToCanonical(row["Código"]);
    if (!canonical) fail("delivery row missing product code");

    const qty = Number(row["Qtd."] || 0);
    if (!Number.isFinite(qty) || qty < 0) fail("invalid quantity for " + canonical);

    const current = aggregated.get(canonical) || {
      product_code: canonical,
      source_codes: new Set(),
      product: String(row["Produto"] || "").trim(),
      group: String(row["Nv. de Produto Superior"] || "").trim(),
      quantity: 0,
      modalities: new Set(),
    };

    current.source_codes.add(String(row["Código"]));
    current.quantity += qty;
    current.modalities.add(modality);
    if (!current.product) current.product = String(row["Produto"] || "").trim();
    if (!current.group) current.group = String(row["Nv. de Produto Superior"] || "").trim();
    aggregated.set(canonical, current);
  }

  const products = [];
  let directRouteSkus = 0;
  let directRouteUnits = 0;
  let logicalResolvedSkus = 0;
  let logicalResolvedUnits = 0;

  for (const item of aggregated.values()) {
    const printerCodes = routing.products[item.product_code] || [];
    const directRoute = printerCodes.length > 0;

    const exact = bySeedName.get(normalizeName(item.product)) || [];
    let plaza = null;
    let plazaSource = null;

    if (exact.length === 1) {
      plaza = exact[0].praca_principal ?? null;
      plazaSource = "SEED_EXACT_NAME";
    } else if (exact.length > 1) {
      plazaSource = "SEED_NAME_AMBIGUOUS";
    } else {
      plaza = inferPlaza(item, printerCodes);
      plazaSource = plaza ? "INFERRED_GROUP_AND_ROUTE_RULE" : "UNRESOLVED";
    }

    if (directRoute) {
      directRouteSkus += 1;
      directRouteUnits += item.quantity;
    }
    if (plazaSource !== "UNRESOLVED" && plazaSource !== "SEED_NAME_AMBIGUOUS") {
      logicalResolvedSkus += 1;
      logicalResolvedUnits += item.quantity;
    }

    products.push({
      product_code: item.product_code,
      source_codes: [...item.source_codes],
      product: item.product,
      group: item.group,
      quantity: item.quantity,
      modalities: [...item.modalities].sort(),
      direct_route: directRoute,
      printer_codes: printerCodes,
      logical_plaza: plaza,
      logical_plaza_source: plazaSource,
    });
  }

  products.sort((a, b) => b.quantity - a.quantity || a.product.localeCompare(b.product));

  const totalSkus = products.length;
  const totalUnits = products.reduce((sum, x) => sum + x.quantity, 0);
  const physicalGaps = products.filter((x) => !x.direct_route);
  const logicalGaps = products.filter(
    (x) => x.logical_plaza_source === "UNRESOLVED" || x.logical_plaza_source === "SEED_NAME_AMBIGUOUS",
  );

  return {
    schema: "deliveryos.active-delivery-routing-coverage.v1",
    summary: {
      delivery_skus: totalSkus,
      delivery_units: totalUnits,
      direct_route_skus: directRouteSkus,
      direct_route_units: directRouteUnits,
      direct_route_sku_coverage: totalSkus ? directRouteSkus / totalSkus : 0,
      direct_route_unit_coverage: totalUnits ? directRouteUnits / totalUnits : 0,
      logical_plaza_resolved_skus: logicalResolvedSkus,
      logical_plaza_resolved_units: logicalResolvedUnits,
      physical_route_gap_skus: physicalGaps.length,
      physical_route_gap_units: physicalGaps.reduce((sum, x) => sum + x.quantity, 0),
      logical_plaza_gap_skus: logicalGaps.length,
      logical_plaza_gap_units: logicalGaps.reduce((sum, x) => sum + x.quantity, 0),
    },
    physical_route_gaps: physicalGaps,
    logical_plaza_gaps: logicalGaps,
    products,
    policy: {
      missing_direct_route: "BLOCK_PHYSICAL_ROUTE_PROOF_FOR_THAT_ITEM",
      inferred_logical_plaza: "INFERENCE_NOT_OPERATIONAL_FACT",
      physical_route_does_not_reclassify_logical_plaza: true,
    },
    effects: {
      teknisa_write: false,
      print: false,
      seed_write: false,
      motor_write: false,
      cutover: false,
    },
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) fail("unexpected arg " + token);
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) fail("missing value for --" + key);
    out[key] = value;
    i += 1;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  for (const req of ["sales", "routing", "seed"]) if (!args[req]) fail("missing --" + req);

  const report = auditCoverage(
    readRows(path.resolve(args.sales)),
    loadJson(args.routing),
    loadJson(args.seed),
  );

  const output = JSON.stringify(report, null, 2) + "\n";
  if (args.out) fs.writeFileSync(path.resolve(args.out), output);
  process.stdout.write(output);

  if (report.summary.physical_route_gap_skus > 0) process.exitCode = 2;
}

module.exports = { inferPlaza, auditCoverage };

if (require.main === module) main();

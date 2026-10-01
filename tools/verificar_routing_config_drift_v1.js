"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  throw new Error("routing-config-drift-v1: " + message);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function same(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

function diffRouting(baseline, candidate) {
  if (baseline.schema !== "deliveryos.odhen.product-routing.compact.v1") {
    fail("baseline routing schema mismatch");
  }
  if (candidate.schema !== "deliveryos.odhen.product-routing.compact.v1") {
    fail("candidate routing schema mismatch");
  }

  const before = baseline.products || {};
  const after = candidate.products || {};
  const beforeCodes = new Set(Object.keys(before));
  const afterCodes = new Set(Object.keys(after));

  const added = [...afterCodes].filter((x) => !beforeCodes.has(x)).sort();
  const removed = [...beforeCodes].filter((x) => !afterCodes.has(x)).sort();
  const changed = [...beforeCodes]
    .filter((x) => afterCodes.has(x) && !same(before[x], after[x]))
    .sort()
    .map((code) => ({ code, before: before[code], after: after[code] }));

  return { added, removed, changed };
}

function printerKey(row) {
  return String(row.printer_code || "");
}

function diffPrinters(baseline, candidate) {
  if (baseline.schema !== "deliveryos.runtime-printer-map.v1") {
    fail("baseline printer schema mismatch");
  }
  if (candidate.schema !== "deliveryos.runtime-printer-map.v1") {
    fail("candidate printer schema mismatch");
  }

  const before = new Map((baseline.mappings || []).map((x) => [printerKey(x), x]));
  const after = new Map((candidate.mappings || []).map((x) => [printerKey(x), x]));

  const added = [...after.keys()].filter((x) => !before.has(x)).sort();
  const removed = [...before.keys()].filter((x) => !after.has(x)).sort();

  const materialFields = [
    "printer_name",
    "printer_model",
    "printer_port",
    "printer_ip",
    "peripherals_server",
    "used_by_products",
  ];

  const changed = [...before.keys()]
    .filter((code) => after.has(code))
    .map((code) => {
      const b = before.get(code);
      const a = after.get(code);
      const fields = materialFields.filter((field) => !same(b[field] ?? null, a[field] ?? null));
      return fields.length
        ? {
            printer_code: code,
            fields: Object.fromEntries(
              fields.map((field) => [field, { before: b[field] ?? null, after: a[field] ?? null }]),
            ),
          }
        : null;
    })
    .filter(Boolean);

  return { added, removed, changed };
}

function compareConfig(baselineRouting, candidateRouting, baselinePrinters, candidatePrinters) {
  const routing = diffRouting(baselineRouting, candidateRouting);
  const printers = diffPrinters(baselinePrinters, candidatePrinters);

  const storeMismatch =
    baselineRouting.store !== candidateRouting.store ||
    baselinePrinters.store !== candidatePrinters.store ||
    candidateRouting.store !== candidatePrinters.store;

  const materialDrift =
    storeMismatch ||
    routing.added.length > 0 ||
    routing.removed.length > 0 ||
    routing.changed.length > 0 ||
    printers.added.length > 0 ||
    printers.removed.length > 0 ||
    printers.changed.length > 0;

  return {
    schema: "deliveryos.routing-config-drift.v1",
    material_drift: materialDrift,
    store_mismatch: storeMismatch,
    baseline: {
      store: baselineRouting.store ?? null,
      routing_captured_date: baselineRouting.captured_date ?? null,
      printer_captured_at_local: baselinePrinters.captured_at_local ?? null,
    },
    candidate: {
      store: candidateRouting.store ?? null,
      routing_captured_date: candidateRouting.captured_date ?? null,
      printer_captured_at_local: candidatePrinters.captured_at_local ?? null,
    },
    routing,
    printers,
    policy: {
      on_material_drift: "BLOCK_LIVE_ROUTING_UNTIL_REVIEWED_AND_BASELINE_REPLACED",
      physical_print_proof: "SEPARATE",
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

function main() {
  const args = parseArgs(process.argv);
  for (const required of [
    "baseline-routing",
    "candidate-routing",
    "baseline-printers",
    "candidate-printers",
  ]) {
    if (!args[required]) fail("missing --" + required);
  }

  const report = compareConfig(
    loadJson(args["baseline-routing"]),
    loadJson(args["candidate-routing"]),
    loadJson(args["baseline-printers"]),
    loadJson(args["candidate-printers"]),
  );

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.material_drift ? 2 : 0;
}

module.exports = { diffRouting, diffPrinters, compareConfig };

if (require.main === module) {
  main();
}

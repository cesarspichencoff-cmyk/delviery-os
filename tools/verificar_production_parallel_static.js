"use strict";

const fs = require("node:fs");
const path = require("node:path");

const files = [
  "src/production/tataSequence.ts",
  "src/production/kitchenDependencies.ts",
  "src/production/deliveryProductionJoin.ts",
  "src/production/productionTicket.ts",
];

function fail(msg) {
  throw new Error("production-parallel-static: " + msg);
}

for (const relative of files) {
  const text = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

  for (const forbidden of [
    /node:fs/,
    /require\(["']fs["']\)/,
    /from\s+["']fs["']/,
    /node:http/,
    /node:https/,
    /fetch\s*\(/,
    /axios/i,
    /child_process/,
    /execSync/,
    /spawn\s*\(/,
    /Invoke-WebRequest/i,
    /\/print/,
    /INSERT\s+INTO/i,
    /UPDATE\s+/i,
    /DELETE\s+FROM/i,
  ]) {
    if (forbidden.test(text)) {
      fail(relative + " forbidden effect/capability: " + forbidden);
    }
  }
}

const sequence = fs.readFileSync(
  path.join(__dirname, "..", "src/production/tataSequence.ts"),
  "utf8",
);
for (const required of [
  "MISSING_SEQUENCE_SCOPE",
  "ORDER_BOUND_TO_MULTIPLE_TATA_SEQUENCES",
  "TATA_SEQUENCE_COLLISION",
  "reused_existing",
  "persistence_write: false",
  "odhen_write: false",
]) {
  if (!sequence.includes(required)) fail("TATA guard missing: " + required);
}

const kitchen = fs.readFileSync(
  path.join(__dirname, "..", "src/production/kitchenDependencies.ts"),
  "utf8",
);
for (const required of [
  "DEPENDENCY_RULESET_COVERAGE_NOT_COMPLETE",
  "DEPENDENCY_RULESET_COVERAGE_NOT_PROVEN",
  "HUMAN_CONFIRMED",
  "DUPLICATE_KITCHEN_AGGREGATE_ORDER",
  "ready_for_complete_total",
  "persistence_write: false",
  "odhen_write: false",
]) {
  if (!kitchen.includes(required)) fail("kitchen guard missing: " + required);
}

const join = fs.readFileSync(
  path.join(__dirname, "..", "src/production/deliveryProductionJoin.ts"),
  "utf8",
);
for (const required of [
  "DLV_NRCOMANDA_PROVEN",
  "PRODUCTION_DLV_JOIN_KEY_NOT_PROVEN",
  "DELIVERY_PRODUCTION_NRCOMANDA_MISMATCH",
  "AMBIGUOUS_DELIVERY_ITEM_SIGNATURE",
  "PRODUCTION_ITEM_NOT_FOUND",
  "DELIVERY_ITEM_NOT_FOUND",
  "persistence_write: false",
  "odhen_write: false",
]) {
  if (!join.includes(required)) fail("join guard missing: " + required);
}

const baseline = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data/kitchen_dependency_rules_v1.json"),
    "utf8",
  ),
);
if (baseline.coverage !== "PARTIAL") fail("baseline coverage must remain PARTIAL");
if (baseline.coverage_proof !== "UNPROVEN") {
  fail("baseline coverage proof must remain UNPROVEN");
}
if (!Array.isArray(baseline.rules) || baseline.rules.length !== 0) {
  fail("baseline rules must remain empty until human confirmation");
}

console.log("production-parallel-static: ok");

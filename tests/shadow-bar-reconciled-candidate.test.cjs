"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const candidatePath = path.join(__dirname, "../runtime/shadow/candidates/CAIXA_MOOCA_consumer_bar_exact_20261007.cjs");
const source = fs.readFileSync(candidatePath, "utf8");
const first = source.indexOf("function classifyRetailBarExact(");
const last = source.indexOf("function classificationFromPackagingFactStrict(", first);
assert.ok(first >= 0 && last > first, "must contain isolated exact Bar classifier");
const sameSet = (a,b) => a.length === b.length &&
  [...a].sort().every((x,i) => x === [...b].sort()[i]);
const classifier = new Function("sameSet", source.slice(first,last) + "return classifyRetailBarExact;")(sameSet);

const cases = [
  ["coca cola 350ml - un", "8.00.05.000.00", ["00007"], "refrigerante"],
  ["agua mineral s/gas - un", "8.00.00.000.00", ["00007"], "agua"],
  ["agua mineral c/gas - un", "8.00.00.010.00", ["00007"], "agua"],
  ["coca cola zero 350ml - un", "8.00.05.010.00", ["00007"], null],
  ["coca cola 500ml - un", "8.00.05.000.00", ["00007"], null],
  ["agua mineral c/gas - un", "8.00.00.000.00", ["00007"], null],
  ["agua mineral c/gas - un", "8.00.00.010.00", ["00002"], null],
  ["agua mineral c/gas - un", "8.00.00.010.00", ["00007", "00002"], null],
  ["cha gelado de limao ice tea 450ml - un", "8.00.05.100.00", ["00007"], null],
  ["coca cola 350ml - un", "8.00.05.000.01", ["00007"], null]
];
for (const [name,code,routes,want] of cases) {
  const classified = classifier(name, code, routes);
  assert.equal(classified?.subfamily ?? null,want, "exact Bar identity mismatch: " + name);
  if (classified) {
    assert.equal(classified.family,"bebida");
    assert.equal(classified.station,"bar_bebidas");
    assert.equal(classified.review_required,false);
  }
}
const preserved = [
  "ALLERGEN_NOTE_REQUIRES_HUMAN_REVIEW",
  "observation_scan_complete",
  "human-order-overrides-v1.json",
  "HUMAN_CONFIRMED_NAME_ALIAS_2026_10_05",
  "ACADEMIA_OPERATIONAL_COMBO_BRIDGE_2026_10_07",
  "ACADEMIA_DOCUMENTED_CATEGORY_EXACT_NAME_AND_ROUTED_STATION_2026_10_07",
  "UPSTREAM_EVENT_NOT_READY",
  "observationBlockers",
  "spooler_write: false",
  "fiscal_action: false",
  "sefaz_call: false"
];
for(const marker of preserved) assert.ok(source.includes(marker), "missing protected runtime guard: " + marker);
assert.ok(source.includes('n === "coca cola zero 350ml - un"'),
  "the pre-existing exact Coca-Cola Zero route must remain untouched");
assert.ok(!source.includes('/^(?:coca cola|sprite)\\b/.test(n)'),
  "reconciled code must not introduce the reference consumer's broad Coke matcher");
console.log("bar-candidate-reconciled: " + cases.length + "/" + cases.length + " exact mapping tests and " + preserved.length + " safety markers passed");

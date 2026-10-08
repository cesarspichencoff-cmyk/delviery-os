"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../runtime/shadow/live_shadow_consumer_v1.cjs"), "utf8");
const start = source.indexOf("function classifyRetailBarExact(");
const end = source.indexOf("function logicalStationForRoutes(", start);
assert.ok(start >= 0 && end > start, "source must expose a single pure exact classifier");
const sameSet = (a,b) => a.length === b.length && [...a].sort().every((x,i) => x === [...b].sort()[i]);
const classify = new Function("sameSet", source.slice(start,end) + "\nreturn classifyRetailBarExact;")(sameSet);

const cases = [
  ["coca cola 350ml - un", "8.00.05.000.00", ["00007"], "refrigerante"],
  ["coca cola zero 350ml - un", "8.00.05.010.00", ["00007"], "refrigerante"],
  ["agua mineral s/gas - un", "8.00.00.000.00", ["00007"], "agua"],
  ["agua mineral c/gas - un", "8.00.00.010.00", ["00007"], "agua"],
  ["coca cola 350ml - un", "8.00.05.010.00", ["00007"], null],
  ["coca cola 500ml - un", "8.00.05.000.00", ["00007"], null],
  ["agua mineral c/gas - un", "8.00.00.010.00", ["00002"], null],
  ["agua mineral c/gas - un", "8.00.00.010.00", ["00007","00002"], null],
  ["cha gelado de limao ice tea 450ml - un", "8.00.05.100.00", ["00007"], null]
];
for(const [name,code,routes,expected] of cases) {
  const result = classify(name,code,routes);
  assert.equal(result?.subfamily ?? null, expected, name + ": exact code+route invariant");
  if (result) {
    assert.equal(result.family,"bebida");
    assert.equal(result.station,"bar_bebidas");
    assert.equal(result.review_required,false);
  }
}
assert.ok(source.includes('/^sprite\\b/.test(n)'),"legacy Sprite behavior must be retained");
assert.ok(!source.includes('/^(?:coca cola|sprite)\\b/.test(n)'),"broad Coca-Cola prefix must not bypass exact code");
console.log("shadow-retail-bar-exact: " + cases.length + "/" + cases.length + " passed");

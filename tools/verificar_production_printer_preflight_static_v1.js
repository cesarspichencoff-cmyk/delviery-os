"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "production_printer_preflight_readonly.ps1"),
  "utf8",
);
const comparator = fs.readFileSync(
  path.join(__dirname, "comparar_preflight_impressoras_v878_offline.cjs"),
  "utf8",
);
const routeMapBytes = fs.readFileSync(
  path.join(__dirname, "..", "data", "runtime_printer_map_v1.json"),
);
// Compare the canonical Git bytes. Existing Windows worktrees may predate the
// -text rule and still contain CRLF; a fresh checkout now preserves LF bytes.
const canonicalRouteMapBytes = Buffer.from(
  routeMapBytes.toString("utf8").replace(/\r\n/g, "\n"),
  "utf8",
);
const routeMapSha256 = crypto
  .createHash("sha256")
  .update(canonicalRouteMapBytes)
  .digest("hex");
const expectedRouteMapSha256 =
  "f37dae40779c5a205a26ceb289cd748d1c7747c1947c278f534a2dcc2f296f4c";

assert.equal(
  routeMapSha256,
  expectedRouteMapSha256,
  "pinned printer route-map bytes changed without contract review",
);
assert.ok(
  comparator.includes(expectedRouteMapSha256),
  "offline comparator does not pin the reviewed route-map bytes",
);

for (const forbidden of [
  "Out-Printer",
  "PrintDocument",
  "WritePrinter",
  "StartDocPrinter",
  "Set-Printer",
  "Set-PrintConfiguration",
  "Remove-Printer",
  "Add-Printer",
  "Restart-Service Spooler",
  "Stop-Service Spooler",
]) {
  assert.equal(
    script.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    "forbidden effect command present: " + forbidden,
  );
}

for (const required of [
  "Get-Printer",
  "Get-PrinterPort",
  "Get-PrintConfiguration",
  "Win32_Printer",
  "print_attempted = $false",
  "spooler_job_created = $false",
  "printer_configuration_changed = $false",
  'store = "0001 - TATA ITAIM"',
  'source = "data/runtime_printer_map_v1.json"',
  'source_sha256 = "f37dae40779c5a205a26ceb289cd748d1c7747c1947c278f534a2dcc2f296f4c"',
]) {
  assert.ok(script.includes(required), "missing read-only proof marker: " + required);
}

assert.match(script, /\[switch\]\$ProbeTcp9100/);
assert.match(script, /if \(\$ProbeTcp9100\)/);
assert.match(script, /Test-NetConnection/);

console.log("production-printer-preflight-static-v1: ok");

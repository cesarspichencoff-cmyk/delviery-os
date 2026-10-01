"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "production_printer_preflight_readonly.ps1"),
  "utf8",
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
]) {
  assert.ok(script.includes(required), "missing read-only proof marker: " + required);
}

assert.match(script, /\[switch\]\$ProbeTcp9100/);
assert.match(script, /if \(\$ProbeTcp9100\)/);
assert.match(script, /Test-NetConnection/);

console.log("production-printer-preflight-static-v1: ok");

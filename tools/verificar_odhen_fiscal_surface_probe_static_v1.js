"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "odhen_fiscal_surface_probe_readonly.ps1"),
  "utf8",
);

for (const required of [
  "NFCe",
  "NFC-e",
  "SEFAZ",
  "DANFE",
  "Transmissão Automática",
  "fiscal_action = $false",
  "sefaz_call = $false",
  "database_query = $false",
  "order_read = $false",
  "print = $false",
]) {
  assert.ok(script.includes(required), "missing fiscal probe marker: " + required);
}

for (const forbidden of [
  "Invoke-WebRequest",
  "Invoke-RestMethod",
  "Out-Printer",
  "WritePrinter",
  "StartDocPrinter",
  "Set-Printer",
  "Set-PrintConfiguration",
  "INSERT INTO",
  "UPDATE ",
  "DELETE FROM",
  "EXEC ",
]) {
  assert.equal(
    script.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    "forbidden fiscal effect surface present: " + forbidden,
  );
}

console.log("odhen-fiscal-surface-probe-static-v1: ok");

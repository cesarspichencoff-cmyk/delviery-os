"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "mooca_commandas_preflight_readonly.ps1"),
  "utf8",
);

for (const required of [
  "odhen_source_probe_readonly.ps1",
  "sql_integrated_readonly_preflight.ps1",
  "production_printer_preflight_readonly.ps1",
  "ready_for_one_minimized_order_read_candidate",
  "observation_semantics_proven = $false",
  "live_order_read_performed = $false",
  "physical_print_authorized = $false",
  "order_row_read = $false",
  "database_write = $false",
  "odhen_write = $false",
  "print = $false",
  "spooler_write = $false",
]) {
  assert.ok(script.includes(required), "missing safety marker: " + required);
}

for (const forbidden of [
  "Out-Printer",
  "WritePrinter",
  "StartDocPrinter",
  "Set-Printer",
  "Set-PrintConfiguration",
  "Invoke-WebRequest",
  "Invoke-RestMethod",
  "INSERT INTO",
  "UPDATE ",
  "DELETE FROM",
  "EXEC ",
  "-ProbeTcp9100",
]) {
  assert.equal(
    script.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    "forbidden effect surface present: " + forbidden,
  );
}

for (const token of [
  "NRCOMANDA",
  "NRCOMANDAEXT",
  "CDPRODUTO",
  "NMPRODUTO",
  "QTPRODCOMVEN",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "TXPRODCOMVEN",
]) {
  assert.ok(script.includes(token), "missing required source token: " + token);
}

console.log("mooca-commandas-preflight-static-v1: ok");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "odhen_topology_probe_readonly.ps1"),
  "utf8",
);

for (const required of [
  "READ_ONLY_DIRECTORY_METADATA_ONLY",
  "directory_metadata_read",
  "file_metadata_read",
  "file_content_read = $false",
  "database_query = $false",
  "database_write = $false",
  "order_row_read = $false",
  "fiscal_action = $false",
  "sefaz_call = $false",
  "print = $false",
  "spooler_write = $false",
  "printer_configuration_change = $false",
  "network_payload_sent_to_printer = $false",
  "evidence_file_write = $true",
  "\"log\",\"logs\",\"temp\",\"cache\",\"node_modules\"",
]) {
  assert.ok(script.includes(required), "missing topology safety marker: " + required);
}

for (const forbidden of [
  "Get-Content",
  "Select-String",
  "Get-FileHash",
  "Invoke-WebRequest",
  "Invoke-RestMethod",
  "Test-NetConnection",
  "Out-Printer",
  "WritePrinter",
  "StartDocPrinter",
  "Set-Printer",
  "Set-PrintConfiguration",
  "System.Data.SqlClient",
  "INSERT INTO",
  "UPDATE ",
  "DELETE FROM",
  "EXEC ",
  "Start-Process",
]) {
  assert.equal(
    script.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    "forbidden topology effect/content surface present: " + forbidden,
  );
}

console.log("odhen-topology-probe-static-v1: ok");
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "mooca_commandas_preflight_standalone_readonly.ps1"),
  "utf8",
);

for (const required of [
  "READ_ONLY_SOURCE_CODE_ONLY",
  "NRCOMANDA",
  "NRCOMANDAEXT",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "TXPRODCOMVEN",
  "NFCe",
  "SEFAZ",
  "DANFE",
  "WINDOWS_INTEGRATED_AUTH_METADATA_ONLY",
  "HAS_PERMS_BY_NAME",
  "IS_SRVROLEMEMBER",
  "Get-Printer",
  "Get-PrinterPort",
  "Get-PrintConfiguration",
  "order_row_read = $false",
  "database_write = $false",
  "odhen_write = $false",
  "fiscal_action = $false",
  "sefaz_call = $false",
  "print = $false",
  "spooler_write = $false",
  "printer_configuration_change = $false",
  "network_payload_sent_to_printer = $false",
  "evidence_file_write = $true",
  "ready_for_one_minimized_order_read_candidate",
]) {
  assert.ok(script.includes(required), "missing standalone safety marker: " + required);
}

const excludeGuardLines = script
  .split(/\r?\n/)
  .filter((line) => line.includes("-notmatch"));
for (const folder of ["Log", "Logs", "Temp", "cache", "node_modules"]) {
  assert.ok(
    excludeGuardLines.some((line) => line.includes(folder)),
    "missing excluded path guard: " + folder,
  );
}

for (const forbidden of [
  "Invoke-WebRequest",
  "Invoke-RestMethod",
  "Out-Printer",
  "WritePrinter",
  "StartDocPrinter",
  "Set-Printer",
  "Set-PrintConfiguration",
  "Start-Process",
  "Test-NetConnection",
  "raw.githubusercontent.com",
  "github.com/",
  "INSERT INTO",
  "UPDATE SET",
  "DELETE FROM",
  "MERGE INTO",
  "EXEC(",
  "EXEC ",
]) {
  assert.equal(
    script.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    "forbidden standalone effect surface present: " + forbidden,
  );
}

assert.equal(
  /&\s+powershell|powershell\s+-NoProfile/i.test(script),
  false,
  "standalone script must not invoke helper PowerShell processes",
);

console.log("mooca-preflight-standalone-static-v1: ok");

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "odhen_source_probe_readonly.ps1"),
  "utf8",
);

for (const required of [
  "READ_ONLY_SOURCE_CODE_ONLY",
  "REAL_CAIXA_MOOCA_2026-10-01",
  "Join-Path $OdhenRoot \"src\"",
  "Join-Path $OdhenRoot \"routes\"",
  "Join-Path $OdhenPosRoot \"mobile\"",
  "Join-Path $OdhenPosRoot \"backend_74000\"",
  "NRCOMANDA",
  "NRCOMANDAEXT",
  "NRVENDAREST",
  "CDPRODUTO",
  "NMPRODUTO",
  "QTPRODCOMVEN",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "TXPRODCOMVEN",
  "database_query = $false",
  "database_write = $false",
  "order_read = $false",
  "fiscal_action = $false",
  "sefaz_call = $false",
  "print = $false",
  "spooler_write = $false",
  "network_payload_sent_to_printer = $false",
  "file_write = $false",
]) {
  assert.ok(script.includes(required), "missing source-probe marker: " + required);
}

for (const folder of ["Log", "Logs", "Temp", "cache", "node_modules"]) {
  assert.ok(
    script.split(/\r?\n/).some((line) => line.includes("-notmatch") && line.includes(folder)),
    "missing exclusion guard: " + folder,
  );
}

for (const forbidden of [
  "Invoke-WebRequest",
  "Invoke-RestMethod",
  "Test-NetConnection",
  "System.Data.SqlClient",
  "Out-Printer",
  "WritePrinter",
  "StartDocPrinter",
  "Set-Printer",
  "Set-PrintConfiguration",
  "Start-Process",
  "INSERT INTO",
  "UPDATE ",
  "DELETE FROM",
  "EXEC ",
]) {
  assert.equal(
    script.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    "forbidden source-probe surface: " + forbidden,
  );
}

assert.equal(
  script.includes('Join-Path $OdhenRoot "perifericos\\src"'),
  false,
  "must not nest perifericos beneath OdhenRoot",
);
assert.equal(
  script.includes('Join-Path $OdhenRoot "odhenPOS\\mobile"'),
  false,
  "must not nest odhenPOS beneath perifericos root",
);

console.log("odhen-source-probe-static-v133: ok");
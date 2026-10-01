"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "odhen_source_semantics_probe_readonly.ps1"),
  "utf8",
);

for (const required of [
  "READ_ONLY_BOUNDED_SOURCE_CONTEXT",
  "routes.json",
  "Delivery.php",
  "MSDEQuery.php",
  "ImpressaoDelivery.php",
  "DeliveryRepository.js",
  "DeliveryService.js",
  "PerifericosService.js",
  "DeliveryController.js",
  "orderDelivery.json",
  "getAllDeliveryOrders",
  "BUSCA_ITPEDIDO_ENTREGA",
  "NRCOMANDAEXT",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "TXPRODCOMVEN",
  "database_query = $false",
  "database_write = $false",
  "order_read = $false",
  "log_read = $false",
  "fiscal_action = $false",
  "sefaz_call = $false",
  "print = $false",
  "spooler_write = $false",
  "network_payload_sent_to_printer = $false",
  "file_write = $false",
]) {
  assert.ok(script.includes(required), "missing semantics safety marker: " + required);
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
    "forbidden semantics surface: " + forbidden,
  );
}

for (const folder of ["Log", "Logs", "Temp", "cache", "node_modules"]) {
  assert.ok(
    script.split(/\r?\n/).some((line) => line.includes("-notmatch") && line.includes(folder)),
    "missing exclusion guard: " + folder,
  );
}

console.log("odhen-source-semantics-static-v1: ok");

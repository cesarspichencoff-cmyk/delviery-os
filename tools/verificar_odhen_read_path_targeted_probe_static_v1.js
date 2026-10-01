"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(
  path.join(__dirname, "odhen_read_path_targeted_probe_readonly.ps1"),
  "utf8",
);

for (const required of [
  "READ_ONLY_EXACT_FILES_BOUNDED_CONTEXT",
  "backend_74000\\routes.json",
  "src\\Controller\\Delivery.php",
  "src\\Service\\Delivery.php",
  "src\\Util\\MSDEQuery.php",
  "mobile\\js\\repositories\\DeliveryRepository.js",
  "mobile\\js\\services\\DeliveryService.js",
  "/DeliveryRepository",
  "/AllDeliveryRepository",
  "function getDeliveryOrders",
  "function getAllDeliveryOrders",
  "function getProdutosDlv",
  "GET_ALL_DELIVERY_ORDERS",
  "GET_PRODUTOS_PEDIDODLV",
  "DeliveryRepository.download",
  "database_query = $false",
  "database_write = $false",
  "order_read = $false",
  "log_read = $false",
  "http = $false",
  "file_write = $false",
]) {
  assert.ok(script.includes(required), "missing targeted read-path marker: " + required);
}

for (const forbidden of [
  "Get-ChildItem",
  "Get-Content",
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
    "forbidden targeted read-path surface: " + forbidden,
  );
}

console.log("odhen-read-path-targeted-static-v1: ok");

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "odhen_print_topology_probe_readonly.ps1");
const text = fs.readFileSync(file, "utf8");

function fail(msg) {
  throw new Error("odhen-print-topology-probe-static: " + msg);
}

for (const required of [
  'perifericos\\src',
  'perifericos\\routes',
  'odhenPOS\\mobile',
  'odhenPOS\\backend_74000',
  'TXPRODCOMVEN',
  'ImpressaoDelivery',
  'printCommands',
  'arrFila',
  'formatTX',
  'log_read = $false',
  'order_read = $false',
  'database_query = $false',
  'http = $false',
  'print = $false',
  'file_write = $false',
]) {
  if (!text.includes(required)) fail("required guard/token missing: " + required);
}

for (const forbidden of [
  /Invoke-WebRequest/i,
  /Invoke-RestMethod/i,
  /Start-Process/i,
  /Invoke-Sqlcmd/i,
  /\bsqlcmd\b/i,
  /environment\.xml/i,
  /Get-Content\s+.*\\Log(\\|["'])/i,
  /Get-ChildItem\s+.*\\Log(\\|["'])/i,
  /Set-Content/i,
  /Add-Content/i,
  /Out-File/i,
  /Remove-Item/i,
  /Move-Item/i,
  /Copy-Item/i,
  /New-Item/i,
]) {
  if (forbidden.test(text)) fail("forbidden capability/pattern present: " + forbidden);
}

if (!/\.FullName\s+-notmatch\s+"\\\\Log/.test(text)) {
  fail("Log exclusion missing");
}
if (!/\.FullName\s+-notmatch\s+"\\\\Logs/.test(text)) {
  fail("Logs exclusion missing");
}

console.log("odhen-print-topology-probe-static: ok");

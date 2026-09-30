"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "odhen_print_topology_probe_readonly.ps1");
const text = fs.readFileSync(file, "utf8");

function fail(msg) {
  throw new Error("odhen-print-topology-probe-static: " + msg);
}

for (const required of [
  'odhen-perifericos\\src\\IMP\\index.js',
  'odhen-perifericos\\routes\\imp.js',
  'odhenPOS\\backend_74000\\vendor\\odhen\\api\\src\\Service\\ImpressaoDelivery.php',
  'odhenPOS\\backend_74000\\vendor\\odhen\\api\\src\\Service\\ImpressaoPedido.php',
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
  'credential_read = $false',
  'file_write = $false',
  'READ_ONLY_TARGETED_SOURCE_CODE_ONLY'
]) {
  if (!text.includes(required)) fail("required guard/token missing: " + required);
}

for (const forbidden of [
  /Get-ChildItem/i,
  /-Recurse/i,
  /Invoke-WebRequest/i,
  /Invoke-RestMethod/i,
  /Start-Process/i,
  /Invoke-Sqlcmd/i,
  /\bsqlcmd\b/i,
  /environment\.xml/i,
  /\\Log(\\|["'])/i,
  /\\Logs(\\|["'])/i,
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

for (const broadToken of [
  '"porta"',
  '"fila"',
  '"printer"',
  '"modelo"',
  '"impressora"',
  '"setor"',
  '"praca"',
  '"cozinha"',
  '"producao"'
]) {
  if (text.includes(broadToken)) fail("broad scan token reintroduced: " + broadToken);
}

if (!text.includes('[System.Collections.Generic.List[object]]::new()')) {
  fail("bounded List-based accumulator missing");
}

console.log("odhen-print-topology-probe-static: ok");

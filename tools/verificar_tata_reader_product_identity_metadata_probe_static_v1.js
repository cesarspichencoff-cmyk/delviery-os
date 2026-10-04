"use strict";

const fs = require("node:fs");
const path = require("node:path");

const p = path.resolve(__dirname, "tata_reader_product_identity_metadata_probe_readonly.ps1");
const s = fs.readFileSync(p, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error("product-identity-metadata-probe-static: " + message);
}

for (const token of [
  "METADATA_ONLY_NO_OPERATIONAL_ROWS",
  "sys.objects",
  "sys.schemas",
  "sys.columns",
  "CDPRODUTO",
  "CDPROINTE",
  "CDARVPROD",
  "CDPRODESTO",
  "operational_row_read = $false",
  "database_write = $false",
  "fiscal_action = $false",
]) {
  assert(s.includes(token), "missing guard/token " + token);
}

for (const forbidden of [
  /\bINSERT\b/i,
  /\bUPDATE\s+TEKNISA\./i,
  /\bDELETE\s+FROM\b/i,
  /\bMERGE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bCREATE\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER|LOGIN|USER)\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bDENY\b/i,
  /TEKNISA\.(COMANDAVEN|ITCOMANDAVEN|VENDAREST)\b/i,
  /FROM\s+TEKNISA\.PRODUTO\b/i,
  /JOIN\s+TEKNISA\.PRODUTO\b/i,
  /\/print/i,
  /SEFAZ/i,
]) {
  assert(!forbidden.test(s), "forbidden capability/pattern " + forbidden);
}

assert(/FROM\s+sys\.objects/i.test(s), "metadata source sys.objects missing");
assert(/JOIN\s+sys\.columns/i.test(s), "metadata source sys.columns missing");

process.stdout.write("TATA_READER_PRODUCT_IDENTITY_METADATA_PROBE_STATIC_PASS\n");

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "sql_principal_inventory_metadata_only.ps1");
const text = fs.readFileSync(file, "utf8");

function fail(msg) {
  throw new Error("sql-principal-inventory-static: " + msg);
}

const forbiddenOperationalObjects = [
  "COMANDAVEN",
  "VENDAREST",
  "ITCOMANDAVEN",
  "PRODUTO",
  "DSOBSDESCIT",
  "DSOBSPEDDIGCMD",
  "DSOBSCOMANDA",
  "TXPRODCOMVEN"
];

for (const token of forbiddenOperationalObjects) {
  if (text.includes(token)) fail("operational object/field leaked into metadata inventory: " + token);
}

if (/EXECUTE\s+AS\s+(USER|LOGIN)/i.test(text)) fail("impersonation present");
if (/\b(GRANT|DENY|REVOKE|CREATE\s+USER|ALTER\s+USER|DROP\s+USER)\b/i.test(text)) {
  fail("permission/security mutation statement present");
}
if (/\b(INSERT\s+INTO|UPDATE\s+\[|DELETE\s+FROM|MERGE\s+INTO)\b/i.test(text)) {
  fail("data mutation statement present");
}
if (/environment\.xml/i.test(text)) fail("Odhen credential file reference present");

for (const required of [
  "sys.database_principals",
  "sys.database_role_members",
  "sys.database_permissions",
  "Integrated Security=SSPI",
  "impersonation = $false",
  "order_rows_read = $false",
  "database_write = $false"
]) {
  if (!text.includes(required)) fail("required guard missing: " + required);
}

console.log("sql-principal-inventory-static: ok");

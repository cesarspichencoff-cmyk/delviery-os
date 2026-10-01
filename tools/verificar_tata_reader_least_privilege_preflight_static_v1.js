"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const s = fs.readFileSync(
  path.join(__dirname, "tata_reader_least_privilege_preflight.ps1"),
  "utf8",
);

for (const required of [
  "WINDOWS_INTEGRATED_AUTH_COLUMN_LEVEL_METADATA_ONLY",
  "NT SERVICE\\TataComandaReader",
  "HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','SELECT',c.name,'COLUMN')",
  "HAS_PERMS_BY_NAME(s.name+'.'+o.name,'OBJECT','UPDATE',c.name,'COLUMN')",
  "extra_readable_columns",
  "writable_columns",
  "EXECUTABLE_PROCEDURE_PRESENT",
  "COLUMN_SURFACE_NOT_EXACT",
  "order_row_read = $false",
  "database_write = $false",
  "ddl = $false",
  "execute = $false",
]) {
  assert.ok(s.includes(required), "missing marker: " + required);
}

for (const forbidden of [
  "INSERT INTO",
  "DELETE FROM",
  "CREATE LOGIN",
  "CREATE USER",
  "GRANT ",
  "DENY ",
  "REVOKE ",
  "DROP LOGIN",
  "DROP USER",
  "Start-Process",
  "Invoke-WebRequest",
  "Invoke-RestMethod",
]) {
  assert.equal(
    s.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    "forbidden effect surface: " + forbidden,
  );
}

console.log("tata-reader-least-privilege-preflight-static-v1: ok");

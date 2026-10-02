"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "tata_reader_permission_manifest_v1.json"), "utf8"));
const preflight = fs.readFileSync(path.join(ROOT, "tools", "tata_reader_least_privilege_preflight.ps1"), "utf8");
const sql = fs.readFileSync(path.join(ROOT, "tools", "tata_reader_sql_apply_REVIEW_ONLY.sql"), "utf8");
const serviceApply = fs.readFileSync(path.join(ROOT, "tools", "tata_reader_windows_service_apply_REVIEW_ONLY.ps1"), "utf8");
const serviceRollback = fs.readFileSync(path.join(ROOT, "tools", "tata_reader_windows_service_rollback_REVIEW_ONLY.ps1"), "utf8");
const runtimeCleanup = fs.readFileSync(path.join(ROOT, "tools", "tata_reader_runtime_cleanup_REVIEW_ONLY.ps1"), "utf8");
const hostSource = fs.readFileSync(path.join(ROOT, "tools", "tata_reader_preflight_service", "TataComandaReader.PreflightService.cs"), "utf8");
const hostBuild = fs.readFileSync(path.join(ROOT, "tools", "tata_reader_preflight_service", "build.ps1"), "utf8");
const doc = fs.readFileSync(path.join(ROOT, "docs", "TATA_READER_ADMIN_REVIEW_GATE_2026-10-02.md"), "utf8");

function normalize(values) {
  return [...new Set(values.map((x) => String(x).trim()).filter(Boolean))].sort();
}

function equalSet(actual, expected, label) {
  assert.deepEqual(normalize(actual), normalize(expected), label);
}

function parsePreflight(table) {
  const re = new RegExp("\\b" + table + "\\s*=\\s*@\\(([\\s\\S]*?)\\)", "m");
  const match = preflight.match(re);
  assert.ok(match, "preflight allowlist missing " + table);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function parseSql(table) {
  const blocks = sql.split(/GRANT\s+SELECT/gi).slice(1);
  const targetRe = new RegExp("ON\\s+OBJECT::\\[TEKNISA\\]\\.\\[" + table + "\\]", "i");
  const block = blocks.find((x) => targetRe.test(x));
  assert.ok(block, "SQL grant missing " + table);
  const columnsPart = block.split(/ON\s+OBJECT::/i)[0];
  return [...columnsPart.matchAll(/\[([A-Z0-9_]+)\]/gi)].map((m) => m[1]);
}

function parseDoc(table) {
  const marker = "### TEKNISA." + table;
  const start = doc.indexOf(marker);
  assert.ok(start >= 0, "doc section missing " + table);
  const rest = doc.slice(start + marker.length);
  const line = rest.split(/\r?\n/).find((x) => x.trim().startsWith("`"));
  assert.ok(line, "doc column line missing " + table);
  return line.replace(/`/g, "").split(",").map((x) => x.trim());
}

assert.equal(manifest.status, "REVIEW_ONLY_NOT_AUTHORIZED");
assert.equal(manifest.principal, "NT SERVICE\\TataComandaReader");
assert.equal(manifest.server, "(local)\\SQLEXPRESS");
assert.equal(manifest.database, "teknisa");
assert.equal(manifest.object_schema, "TEKNISA");
assert.equal(manifest.scope_policy.integrated_delivery_channels_only, true);
assert.equal(manifest.scope_policy.manual_pos_delivery, false);
assert.equal(manifest.scope_policy.dscomanda, false);
assert.equal(manifest.scope_policy.combo_structure_columns, false);
assert.equal(manifest.scope_policy.takeaway_origin_column, false);

for (const table of Object.keys(manifest.allowed_columns)) {
  const expected = manifest.allowed_columns[table];
  equalSet(parsePreflight(table), expected, "preflight mismatch " + table);
  equalSet(parseSql(table), expected, "SQL mismatch " + table);
  equalSet(parseDoc(table), expected, "doc mismatch " + table);
}

for (const excluded of manifest.explicitly_excluded_columns) {
  for (const table of Object.keys(manifest.allowed_columns)) {
    assert.ok(!parsePreflight(table).includes(excluded), "excluded in preflight: " + excluded);
    assert.ok(!parseSql(table).includes(excluded), "excluded in SQL: " + excluded);
  }
}

assert.ok(preflight.includes("deliveryos.tata-reader-least-privilege-preflight.v4"));
assert.ok(preflight.includes("INTEGRATED_DELIVERY_CHANNELS_ONLY"));
assert.ok(!preflight.includes("AllowDsComanda"));
assert.ok(preflight.includes("SPECIFIC_LOGIN_IMPERSONATION_PRESENT"));
assert.ok(preflight.includes("SPECIFIC_USER_IMPERSONATION_PRESENT"));
assert.ok(preflight.includes("NON_TABLE_OBJECT_PERMISSION_PRESENT"));
assert.ok(preflight.includes("READABLE_SURFACE_OUTSIDE_ALLOWLIST"));
assert.ok(preflight.includes("'SO','AF'"));

assert.ok(/SET\s+NOEXEC\s+ON\s*;/i.test(sql), "review SQL must be inert");
assert.ok(!/\bGRANT\s+CONNECT\b/i.test(sql), "explicit CONNECT grant not allowed");
assert.ok(!/\bGRANT\s+(INSERT|UPDATE|DELETE|EXECUTE|ALTER|CONTROL|IMPERSONATE)\b/i.test(sql));
assert.ok(!/\bALTER\s+ROLE\b/i.test(sql));
assert.ok(!/\bsp_addrolemember\b/i.test(sql));

const applyThrow = serviceApply.indexOf('throw "REVIEW_ONLY_NOT_AUTHORIZED');
const applyCreate = serviceApply.indexOf("& sc.exe create");
assert.ok(applyThrow >= 0 && applyCreate > applyThrow, "service apply guard must precede create");
assert.ok(serviceApply.includes("$SqlDependency = \'MSSQL$SQLEXPRESS\'"));
assert.ok(serviceApply.includes("start= demand"));
assert.ok(!serviceApply.includes("start= auto"));
assert.ok(!serviceApply.includes("sidtype"));
assert.ok(!serviceApply.includes("password="));
assert.ok(!/&\s+sc\.exe\s+start/i.test(serviceApply));
assert.ok(serviceApply.includes("C:\\ProgramData\\TataComandaReader"));
assert.ok(serviceApply.includes("Copy-Item -LiteralPath $BinarySource"));
assert.ok(serviceApply.includes("Copy-Item -LiteralPath $PreflightSource"));
assert.ok(serviceApply.includes("icacls.exe $BinDirectory"));
assert.ok(serviceApply.includes("icacls.exe $EvidenceDirectory"));
assert.ok(serviceApply.includes("/inheritance:r"));
assert.ok(serviceApply.includes("S-1-5-18"));
assert.ok(serviceApply.includes("S-1-5-32-544"));
assert.ok(serviceApply.includes("Assert-PinnedHash"));
assert.ok(serviceApply.includes("__PIN_AFTER_CAIXA_BUILD__"));
assert.ok(serviceApply.includes("Get-CimInstance -ClassName Win32_Service"));
assert.ok(serviceApply.includes("SERVICE_ACCOUNT_MISMATCH"));
assert.ok(serviceApply.includes("SERVICE_START_MODE_MISMATCH"));
assert.ok(serviceApply.includes("SERVICE_SQL_DEPENDENCY_MISMATCH"));

const rollbackThrow = serviceRollback.indexOf('throw "REVIEW_ONLY_NOT_AUTHORIZED');
const rollbackStop = serviceRollback.indexOf("& sc.exe stop");
assert.ok(rollbackThrow >= 0 && rollbackStop > rollbackThrow, "service rollback guard must precede stop");

const cleanupThrow = runtimeCleanup.indexOf('throw "REVIEW_ONLY_NOT_AUTHORIZED');
const cleanupRemove = runtimeCleanup.indexOf("Remove-Item");
assert.ok(cleanupThrow >= 0 && cleanupRemove > cleanupThrow, "runtime cleanup guard must precede removal");
assert.ok(runtimeCleanup.includes("C:\\ProgramData\\TataComandaReader"));

assert.ok(hostSource.includes('ServiceNameValue = "TataComandaReader"'));
assert.ok(hostSource.includes('"tata_reader_least_privilege_preflight.ps1"'));
assert.ok(hostSource.includes('"preflight.json"'));
assert.ok(hostSource.includes('"preflight.exitcode.txt"'));
assert.ok(hostSource.includes('ExpectedIdentityName = @"NT SERVICE\\TataComandaReader"'));
assert.ok(hostSource.includes("WindowsIdentity.GetCurrent()"));
assert.ok(hostSource.includes('"preflight.identity.txt"'));
assert.ok(hostSource.includes("AutoLog = false;"));
assert.ok(hostSource.includes("WindowsPowerShell"));
for (const forbidden of ["HttpClient", "WebRequest", "TcpClient", "Socket", "SqlConnection", "Out-Printer"]) {
  assert.ok(!hostSource.includes(forbidden), "forbidden host surface: " + forbidden);
}
assert.ok(hostBuild.includes("Framework64\\\\v4.0.30319\\\\csc.exe"));
assert.ok(hostBuild.includes('nuget_used = $false'));

assert.ok(doc.includes("## Preflight v4 requirements"));
assert.ok(doc.includes("1. stop and delete Windows service `TataComandaReader`;"));
assert.ok(doc.indexOf("stop and delete Windows service") < doc.indexOf("drop SQL database user"));
assert.ok(doc.includes("start=demand"));
assert.ok(doc.includes("tata_reader_runtime_cleanup_REVIEW_ONLY.ps1"));
assert.ok(doc.includes("TataComandaReader.PreflightService.cs"));
assert.ok(doc.includes("build.ps1"));
assert.ok(doc.includes("verificar_tata_reader_admin_bundle_static_v1.js"));
assert.ok(doc.includes("verificar_tata_reader_admin_bundle_static_v1.ps1"));
assert.ok(doc.includes("final binary must be built on CAIXA_MOOCA"));

console.log("tata-reader-admin-bundle-static-v1: ok");
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "monitor_imp_printer_metadata_only.ps1");
const text = fs.readFileSync(file, "utf8");

function fail(msg) {
  throw new Error("imp-printer-metadata-monitor-static: " + msg);
}

for (const required of [
  'Get-ChildItem',
  '-File',
  '-Filter',
  'Length',
  'LastWriteTimeUtc',
  'CreationTimeUtc',
  'MUDOU',
  'NOVO',
  'REPLACED',
  'SUMIU',
  'Start-Sleep'
]) {
  if (!text.includes(required)) fail("required metadata behavior missing: " + required);
}

for (const forbidden of [
  /Get-Content/i,
  /ReadAllText/i,
  /ReadAllBytes/i,
  /FileStream/i,
  /OpenRead/i,
  /Select-String/i,
  /Set-Content/i,
  /Add-Content/i,
  /Out-File/i,
  /Remove-Item/i,
  /Move-Item/i,
  /Copy-Item/i,
  /Rename-Item/i,
  /New-Item/i,
  /Invoke-WebRequest/i,
  /Invoke-RestMethod/i,
  /Invoke-Sqlcmd/i,
  /Start-Process/i
]) {
  if (forbidden.test(text)) fail("forbidden content/effect capability present: " + forbidden);
}

if (!text.includes('yyyy_MM_dd") + "_IMP_"')) {
  fail("per-printer IMP prefix missing");
}

console.log("imp-printer-metadata-monitor-static: ok");

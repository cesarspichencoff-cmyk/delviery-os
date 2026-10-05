"use strict";
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");

const target=path.join(__dirname,"tata_reader_live_shadow_cutover_v2.ps1");
const text=fs.readFileSync(target,"utf8");

for(const required of [
  "ExpectedReportingEnvelopeSha256",
  'reporting=Join-Path $StageRoot "report_source_envelope_v1.cjs"',
  "reporting=$ExpectedReportingEnvelopeSha256",
  '$reportingDest=Join-Path $Shadow "report_source_envelope_v1.cjs"',
  "REPORTING_DEST_HASH_MISMATCH",
  "LIVE_SHADOW_WITH_REPORTING_RUNNING_PROVEN"
]){
  assert.ok(text.includes(required),"missing required marker: "+required);
}
const copyIndex=text.indexOf('Copy-Item -LiteralPath ([string]$stage.reporting)');
const startIndex=text.indexOf("Start-Service -Name $ServiceName");
assert.ok(copyIndex>=0,"reporting copy missing");
assert.ok(startIndex>=0,"service start missing");
assert.ok(copyIndex<startIndex,"reporting dependency must be installed before service start");
console.log("tata-reader-live-shadow-cutover-v2-reporting-static: ok");

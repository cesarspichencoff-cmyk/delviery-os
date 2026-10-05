"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");

const deployer = fs.readFileSync(
  "tools/tata_reader_continuous_transactional_cutover_v1.ps1",
  "utf8",
);
const rollback = fs.readFileSync(
  "tools/tata_reader_continuous_transactional_rollback_v1.ps1",
  "utf8",
);

for (const [name, source] of [
  ["deployer", deployer],
  ["rollback", rollback],
]) {
  assert.ok(source.includes("AUTHORIZATION_ID_MISMATCH"), name);
  assert.ok(source.includes("NT SERVICE"), name);
  assert.equal(/\b(INSERT|UPDATE|DELETE|MERGE)\b/i.test(source), false, name);
  assert.equal(/Invoke-WebRequest|Invoke-RestMethod|curl\.exe|wget\.exe/i.test(source), false, name);
  assert.equal(/Out-Printer|WritePrinter|StartDocPrinter/i.test(source), false, name);
  assert.equal(/SEFAZ|nfce|nota fiscal/i.test(source), false, name);
}

assert.ok(deployer.includes("ROLLBACK_COMPLETE"));
assert.ok(deployer.includes("CHECKPOINT_NOT_OBSERVED_AFTER_START"));
assert.ok(deployer.includes("SERVICE_IDENTITY_CHANGED_AFTER_START"));
assert.ok(deployer.includes("ExpectedReaderSha256"));
assert.ok(deployer.includes("ExpectedEntrypointSha256"));
assert.ok(rollback.includes("ROLLBACK_MANIFEST_SCHEMA_MISMATCH"));
assert.ok(rollback.includes("candidate_files_remove"));

console.log("continuous-transactional-cutover-static: ok");

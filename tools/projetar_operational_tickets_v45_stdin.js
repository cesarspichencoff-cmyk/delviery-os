"use strict";
/**
 * Offline/shadow only. Reads a JSON snapshot on stdin and emits projections.
 * No printer, spooler, network, inventory or fiscal side effects.
 */
const fs = require("node:fs");
const {
  projectOperationalTicketsFromMotorsV45,
} = require("../dist/src/production/operationalTicketsV45.js");

try {
  const source = fs.readFileSync(0, "utf8");
  if (!source.trim()) throw new Error("EMPTY_STDIN");
  const payload = JSON.parse(source);
  const result = projectOperationalTicketsFromMotorsV45(payload);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ready_for_semantic_preview) process.exitCode = 2;
} catch (error) {
  process.stderr.write("OPERATIONAL_TICKETS_V45_ERROR: " + String(error) + "\n");
  process.exitCode = 1;
}

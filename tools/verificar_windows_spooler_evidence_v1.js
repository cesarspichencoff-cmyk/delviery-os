"use strict";

const assert = require("node:assert/strict");
const {
  classifyWindowsSpoolerObservation,
} = require("../dist/src/production/windowsSpoolerEvidence.js");

const printed = classifyWindowsSpoolerObservation({
  job_exists: true,
  submission_rejected_before_job_creation: false,
  job_statuses: ["PRINTED"],
  printer_statuses: [],
});
assert.equal(printed.evidence, "SPOOLER_OBSERVED");
assert.equal(printed.fiscal_dispatch_ready, true);
assert.equal(printed.policy.printed_is_not_physical_confirmation, true);

const completeOnly = classifyWindowsSpoolerObservation({
  job_exists: true,
  submission_rejected_before_job_creation: false,
  job_statuses: ["COMPLETE"],
  printer_statuses: [],
});
assert.equal(
  completeOnly.evidence,
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
);
assert.equal(completeOnly.fiscal_dispatch_ready, false);
assert.ok(
  completeOnly.blocking_reasons.includes(
    "JOB_OBSERVED_BUT_PRINTED_NOT_PROVEN",
  ),
);

const paperOut = classifyWindowsSpoolerObservation({
  job_exists: true,
  submission_rejected_before_job_creation: false,
  job_statuses: ["PRINTING"],
  printer_statuses: ["PAPER_OUT"],
});
assert.equal(
  paperOut.evidence,
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
);
assert.equal(paperOut.fiscal_dispatch_ready, false);
assert.ok(paperOut.blocking_reasons.includes("PRINTER_FAULT:PAPER_OUT"));

const doorOpen = classifyWindowsSpoolerObservation({
  job_exists: true,
  submission_rejected_before_job_creation: false,
  job_statuses: ["SPOOLING"],
  printer_statuses: ["DOOR_OPEN"],
});
assert.equal(
  doorOpen.evidence,
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
);
assert.ok(doorOpen.blocking_reasons.includes("PRINTER_FAULT:DOOR_OPEN"));

const rejectedPreEffect = classifyWindowsSpoolerObservation({
  job_exists: false,
  submission_rejected_before_job_creation: true,
  job_statuses: [],
  printer_statuses: ["OFFLINE"],
});
assert.equal(rejectedPreEffect.evidence, "PROVEN_NO_EFFECT_FAILURE");
assert.equal(rejectedPreEffect.fiscal_dispatch_ready, false);

const missingJobAmbiguous = classifyWindowsSpoolerObservation({
  job_exists: false,
  submission_rejected_before_job_creation: false,
  job_statuses: [],
  printer_statuses: [],
});
assert.equal(
  missingJobAmbiguous.evidence,
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
);
assert.equal(missingJobAmbiguous.fiscal_dispatch_ready, false);
assert.ok(
  missingJobAmbiguous.blocking_reasons.includes(
    "NO_JOB_RECORD_EFFECT_UNKNOWN",
  ),
);

const printedButOffline = classifyWindowsSpoolerObservation({
  job_exists: true,
  submission_rejected_before_job_creation: false,
  job_statuses: ["PRINTED"],
  printer_statuses: ["OFFLINE"],
});
assert.equal(
  printedButOffline.evidence,
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
);
assert.equal(printedButOffline.fiscal_dispatch_ready, false);

console.log("windows-spooler-evidence-v1: ok");

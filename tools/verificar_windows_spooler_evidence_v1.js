"use strict";

const assert = require("node:assert/strict");
const {
  classifyWindowsSpoolerObservation,
} = require("../dist/src/production/windowsSpoolerEvidence.js");
const {
  decideProductionPrintSubmission,
} = require("../dist/src/production/productionPrintIdempotency.js");

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

const rejectedButPrinted = classifyWindowsSpoolerObservation({
  job_exists: false,
  submission_rejected_before_job_creation: true,
  job_statuses: ["PRINTED"],
  printer_statuses: [],
});
assert.equal(
  rejectedButPrinted.evidence,
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
);
assert.equal(rejectedButPrinted.fiscal_dispatch_ready, false);
assert.ok(
  rejectedButPrinted.blocking_reasons.includes(
    "OBSERVATION_CONTRADICTION:STATUS_WITHOUT_JOB",
  ),
);

const rejectedButJobExists = classifyWindowsSpoolerObservation({
  job_exists: true,
  submission_rejected_before_job_creation: true,
  job_statuses: ["PRINTED"],
  printer_statuses: [],
});
assert.equal(
  rejectedButJobExists.evidence,
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
);
assert.ok(
  rejectedButJobExists.blocking_reasons.includes(
    "OBSERVATION_CONTRADICTION:REJECTED_BEFORE_CREATION_WITH_JOB",
  ),
);

const printedWithUnknownJobStatus = classifyWindowsSpoolerObservation({
  job_exists: true,
  submission_rejected_before_job_creation: false,
  job_statuses: ["PRINTED", "FUTURE_JOB_STATUS"],
  printer_statuses: [],
});
assert.equal(
  printedWithUnknownJobStatus.evidence,
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
);
assert.equal(printedWithUnknownJobStatus.fiscal_dispatch_ready, false);
assert.ok(
  printedWithUnknownJobStatus.blocking_reasons.includes(
    "JOB_STATUS_UNRECOGNIZED:FUTURE_JOB_STATUS",
  ),
);

const printedWithUnknownPrinterStatus = classifyWindowsSpoolerObservation({
  job_exists: true,
  submission_rejected_before_job_creation: false,
  job_statuses: ["PRINTED"],
  printer_statuses: ["FUTURE_PRINTER_STATUS"],
});
assert.equal(
  printedWithUnknownPrinterStatus.evidence,
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
);
assert.equal(printedWithUnknownPrinterStatus.fiscal_dispatch_ready, false);
assert.ok(
  printedWithUnknownPrinterStatus.blocking_reasons.includes(
    "PRINTER_STATUS_UNRECOGNIZED:FUTURE_PRINTER_STATUS",
  ),
);

const contradictoryRetry = decideProductionPrintSubmission("intent-v880", [
  {
    intent_fingerprint: "intent-v880",
    attempt_id: "attempt-contradictory",
    state: rejectedButPrinted.evidence,
  },
]);
assert.equal(contradictoryRetry.decision, "BLOCK_RECONCILIATION_REQUIRED");
assert.equal(contradictoryRetry.automatic_retry_allowed, false);

const provenNoEffectRetry = decideProductionPrintSubmission("intent-v880", [
  {
    intent_fingerprint: "intent-v880",
    attempt_id: "attempt-pre-effect-rejection",
    state: rejectedPreEffect.evidence,
  },
]);
assert.equal(provenNoEffectRetry.decision, "ALLOW_RETRY_PROVEN_NO_EFFECT");
assert.equal(provenNoEffectRetry.automatic_retry_allowed, true);

console.log("WINDOWS_SPOOLER_EVIDENCE_V880=13/13 OFFLINE NO_PRINT NO_RETRY_ON_CONTRADICTION");

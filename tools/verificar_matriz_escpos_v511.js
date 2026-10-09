"use strict";
/**
 * V5.11 — independent, read-only ESC/POS gate audit.
 * Runs entirely on synthetic byte arrays. Never contacts a printer, USB,
 * serial device, spooler, network endpoint, drawer or production service.
 *
 * Intentionally RED until the V5.1 inspector strictly enforces the approved
 * ESC/POS profile. This does not modify or replace the inspector or V5.7 RED.
 */
const assert = require("node:assert/strict");
const {inspectEscPos} = require("./escposByteInspectorV51.js");

const header = [0x1b,0x40,0x1b,0x74,0x10,0x1b,0x4d,0x00];
const approved = new Set([0x00,0x01,0x10,0x11]);
const acceptedUnsupported = [];
const rejectedApproved = [];

for(let n=0;n<256;n++){
  const result = inspectEscPos([...header,0x1d,0x21,n,0x58,0x0a]);
  if(approved.has(n)){
    if(!result.pass) rejectedApproved.push({n,errors:result.errors});
  } else if(result.pass){
    acceptedUnsupported.push({n,pass:result.pass,errors:result.errors});
  }
}

const baseline = inspectEscPos([...header,0x41,0x0a]);
const midDocumentReset = inspectEscPos([
  ...header,0x41,0x0a,0x1b,0x40,0x42,0x0a,
]);
const lateCodePage = inspectEscPos([
  0x1b,0x40,0x1b,0x4d,0x00,0x41,0x0a,
  0x1b,0x74,0x10,0x42,0x0a,
]);

console.log(JSON.stringify({
  audit:"V5.11_ESC_POS_INDEPENDENT_MATRIX",
  profile:"approved GS! bytes 00,01,10,11 only",
  matrix:256,
  approved_expected:4,
  unsupported_expected:252,
  unsupported_rejected_observed:252-acceptedUnsupported.length,
  unsupported_accepted_observed:acceptedUnsupported.length,
  approved_rejected:rejectedApproved,
  unsupported_not_rejected:acceptedUnsupported.map(x=>({
    n:"0x"+x.n.toString(16).padStart(2,"0"),pass:x.pass,errors:x.errors,
  })),
  baseline_pass:baseline.pass,
  mid_document_reset:{pass:midDocumentReset.pass,errors:midDocumentReset.errors},
  late_code_page:{pass:lateCodePage.pass,errors:lateCodePage.errors},
  effects:{print:false,spooler_write:false,cut:false,device_access:false},
}));

// Evaluate every independent contract before failing the job: one early RED
// must not hide other unsafe command-sequencing behavior.
const violations = [];
if(!baseline.pass) violations.push("APPROVED_BASELINE_REJECTED");
if(rejectedApproved.length) violations.push("APPROVED_SIZE_REJECTED");
if(acceptedUnsupported.length) violations.push("UNSUPPORTED_SIZE_ACCEPTED:"+acceptedUnsupported.length);
if(midDocumentReset.pass) violations.push("MID_DOCUMENT_RESET_ACCEPTED");
if(!midDocumentReset.errors.some(e=>e.includes("MID_DOCUMENT_RESET")))
  violations.push("MID_DOCUMENT_RESET_REASON_MISSING");
if(lateCodePage.pass) violations.push("LATE_CODE_PAGE_ACCEPTED");
if(!lateCodePage.errors.length) violations.push("LATE_CODE_PAGE_REASON_MISSING");
console.log("ESC_POS_CONTRACT_VIOLATIONS="+JSON.stringify(violations));
assert.deepEqual(violations,[],"All ESC/POS profile and ordering contracts are mandatory");
console.log("thermal-escpos-matrix-v511: 256/256 profile checks and command ordering PASS; SHADOW ONLY");

"use strict";
// Read-only/structural gate for an intentionally non-executed one-shot RAW pilot.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const src=fs.readFileSync(path.join(__dirname,"comandas_raw_fn112_v748_pilot_once_hold.ps1"),"utf8");
const required=[
 "param(","[switch]$PrintOnce","if(-not $PrintOnce)",
 "V748_PREFLIGHT_ONLY_NOT_AUTHORIZED_TO_PRINT",
 "if($Approval -cne 'CESAR_EXPLICIT_V748_RAW_FICTITIOUS_ONCE')",
 "CAIXA_V748_RAW_ONCE_PRINT_ATTEMPT.marker",
 "FileMode]::CreateNew","RAW_PARTIAL_WRITE_NO_RETRY",
 "HOLD_QUEUE_OR_DRIVER_CHANGED_IMMEDIATELY_BEFORE_PRINT",
 "HOLD_SHA256_SOURCE_DRIFT","HOLD_FN112_HEADER_CHANGED",
 "HOLD_FN50_TRAILER_CHANGED","HOLD_NOT_SYNTHETIC",
 "status='V748_SINGLE_RAW_SYNTHETIC_JOB_ATTEMPTED'",
 "source_hash=$expectedPayload","real_orders_used=$false",
 "pDatatype='RAW'","OpenPrinterW","StartDocPrinterW",
 "WritePrinter","EndDocPrinter","ClosePrinter",
 "ACE7450A2E6699133BA39FA2F3B625EB46D296EAEB6EAE477877F9F855F1C780"
];
for(const s of required){assert.ok(src.includes(s),"V748_MISSING_GUARD:"+s)}
const mark=src.indexOf("$f=[IO.File]::Open($marker,");
const start=src.indexOf("$jobId=[TataRawOnceV748]::StartDocPrinter");
const actualWrite=src.indexOf("if(-not [TataRawOnceV748]::WritePrinter(");
const approval=src.indexOf("if($Approval -cne ");
assert.ok(approval>=0&&mark>approval&&start>mark&&actualWrite>start,
 "V748_HUMAN_AUTHORITY_OR_ATOMIC_MARKER_ORDER_INVALID");
assert.ok(src.indexOf("if(-not $PrintOnce)")<approval,
 "V748_DEFAULT_MUST_REMAIN_NO_PRINT");
assert.doesNotMatch(src,/(?:^|\n)\s*(?:Set-Printer|Set-PrintConfiguration|Restart-Service|Stop-Service|Start-Service|Remove-Item|Set-ItemProperty|Invoke-Expression)\b/im);
assert.doesNotMatch(src,/(?:\x1dV|\x1b\x70|GS V|CUT_PAPER)/i);
console.log(JSON.stringify({status:"V748_STATIC_HOLD_PASS",marker_before_job:true,
 default_no_print:true,explicit_approval_required:true,
 only_synthetic_pin:true,source_not_executed:true}));

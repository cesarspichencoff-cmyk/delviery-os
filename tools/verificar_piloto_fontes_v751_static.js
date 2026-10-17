"use strict";
// V7.51: static fail-closed proof only. NEVER call the pilot or any printer API.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const content=fs.readFileSync(path.join(__dirname,"comandas_native_font_v751_pilot_once_hold.ps1"),"utf8");
const mandatory=[
 "[switch]$PrintOnce","if(-not $PrintOnce)",
 "V751_PREFLIGHT_ONLY_NOT_AUTHORIZED_TO_PRINT",
 "if($Approval -cne 'CESAR_EXPLICIT_V751_NATIVE_FONT_ONCE')",
 "CAIXA_V751_NATIVE_FONT_ONCE_PRINT_ATTEMPT.marker",
 "FileMode]::CreateNew","HOLD_SHA256_SOURCE_DRIFT",
 "HOLD_QUEUE_OR_DRIVER_CHANGED_IMMEDIATELY_BEFORE_PRINT",
 "if($raw.Length -ne 842)",
 "624A3F8C310F6AE570A0B6768B9924AEA075FF75B2243C2F1D4992B2EB076BBE",
 "$header=[byte[]]@(27,116,2,27,97,0,29,33,0)",
 "$footer=[byte[]]@(27,69,0,27,71,0,27,77,0,29,33,0,27,116,0,27,97,0)",
 "$raw[$raw.Length-18+$i]",
 "HOLD_FONT_PROTOCOL_HEADER_CHANGED","HOLD_FONT_RESET_TRAILER_CHANGED",
 "TATA_V751_FONTES_NATIVAS_TESTE_NAO_PRODUZIR",
 "OpenPrinterW","StartDocPrinterW","WritePrinter","EndDocPrinter","ClosePrinter",
 "HOLD_NOT_SYNTHETIC","HOLD_DIFFERENT_PRINTER_OR_BUSY",
 "EPSON TM-T20 ReceiptE4","Epson Port Handler Monitor",
 "raw_transport_physically_unverified=$true"
];
for(const invariant of mandatory)
 assert.ok(content.includes(invariant),"MISSING_V751_MATERIAL_GUARD:"+invariant);
assert.doesNotMatch(content,/(?:^|\n)\s*(?:Remove-Item|Set-Printer|Set-PrintConfiguration|Restart-Service|Stop-Service|Start-Service|Invoke-Expression)\b/im);
const noPrint=content.indexOf("if(-not $PrintOnce)"),
 approved=content.indexOf("if($Approval -cne 'CESAR_EXPLICIT_V751_NATIVE_FONT_ONCE')"),
 marker=content.indexOf("$f=[IO.File]::Open($marker,"),
 start=content.indexOf("$jobId=[TataRawOnceV751]::StartDocPrinter"),
 write=content.indexOf("[TataRawOnceV751]::WritePrinter($handle,");
assert.ok(noPrint>=0&&approved>noPrint&&marker>approved&&start>marker&&write>start,
 "PILOT_PRINT_WITHOUT_AUTHORIZATION_ORDERED_GATES");
assert.doesNotMatch(content,/\bV748\b|30118|FN112/);
console.log(JSON.stringify({schema:"deliveryos.native-font-pilot-v751-static",
 status:"PASS",script_executed:false,printer_accessed:false,
 marker_before_effect:true,one_specific_approval_required:true,
 shared_printer_settings_not_changed_by_script:true,
 printer_internal_formatting_state_after_pilot_unproven:true}));

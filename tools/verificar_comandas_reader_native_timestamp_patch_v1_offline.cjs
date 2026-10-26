"use strict";
const assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const {transform,nativeFunction,additionalGuard,EXPECTED_SOURCE_SHA256,CONTRACT}
 =require("./comandas_reader_native_timestamp_patch_v1_offline.cjs");
let passed=0;
function check(label,fn){fn();passed++;console.log("PASS "+passed+" "+label);}
const old=[
"param([switch]$EmitExistingOnBootstrap)",
'$ServiceStatePath = "C:\\ProgramData\\TataComandaReader\\state\\production-service-state.json"',
"function Read-ServiceState([datetime]$OrderOpenedAt) {",
"  $old='SERVICE_STATE_EXPIRED_FOR_ORDER'",
"  $other='SERVICE_STATE_DATE_MISMATCH_ORDER_DATE'",
"  $source='valid_from_local'",
"  $guard='SERVICE_STATE_VALID_FROM_REQUIRED'",
"  return @{ service='LUNCH'; blockers=@() }",
"}",
"$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name",
'$hard="UNEXPECTED_SERVICE_IDENTITY UNEXPECTED_SQL_LOGIN"',
'$observations="observation_rows=@($observationRows)"',
'$hash="snapshot_hash=$hash"',
'$event="Write-AtomicJson $eventPath $event"',
'$timestamp="DTHRABERMESA=$order.DTHRABERMESA"',
'$effects="database_write=$false print=$false;spooler_write=$false"',
"if ($true) {",
"  $service=Read-ServiceState ([datetime]$order.DTHRABERMESA)",
"}"
].join("\n");
function newText(){return transform(old);}
check("contract identity and pinned historic source",()=>{
 assert.ok(CONTRACT.includes("review-only"));
 assert.match(EXPECTED_SOURCE_SHA256,/^[a-f0-9]{64}$/);
});
check("source function swapped in exactly one place",()=>{
 const s=newText();assert.equal(s.split("function Read-NativeOrderTime").length-1,1);
 assert.equal(s.split("$service=Read-NativeOrderTime").length-1,1);
});
check("no shift file, daily human approval, or clock time used",()=>{
 const s=newText();for(const bad of ["Read-ServiceState","SERVICE_STATE_EXPIRED_FOR_ORDER",
 "production-service-state.json","valid_from_local","Get-Date","new Date()"]){
  assert.ok(!s.includes(bad),"legacy dependency "+bad);
 }
});
check("output exposes native timestamp, no route or service choice",()=>{
 assert.ok(nativeFunction.includes("TEKNISA.VENDAREST.DTHRABERMESA"));
 assert.ok(nativeFunction.includes("production_role=$null"));
 assert.ok(nativeFunction.includes("service=$null"));
 assert.ok(!nativeFunction.includes("LUNCH")||nativeFunction.includes("Never infer LUNCH"));
 assert.ok(!nativeFunction.includes("printer_code"));
});
check("rejects non-ifood native source and unknown order status",()=>{
 assert.ok(nativeFunction.includes("NATIVE_ORDER_ORIGIN_NOT_IFOOD"));
 assert.ok(nativeFunction.includes("NATIVE_ORDER_STATUS_NOT_ATTESTED"));
 assert.ok(nativeFunction.includes("$Status -cne 'A'"));
});
check("retains timestamp range, strict short ID and source evidence",()=>{
 assert.ok(nativeFunction.includes("NATIVE_ORDER_TIMESTAMP_UNTRUSTED"));
 assert.ok(nativeFunction.includes("NATIVE_IFOOD_SHORT_ID_MISSING_OR_INVALID"));
 assert.ok(nativeFunction.includes("order_opened_at_local="));
});
check("items must be present and individually validated",()=>{
 for(const key of ["NATIVE_ORDER_ITEM_LINES_MISSING","NATIVE_ITEM_IDENTITY_MISSING",
  "NATIVE_ITEM_QUANTITY_INVALID","NATIVE_ITEM_STATUS_NOT_ATTESTED"]){
  assert.ok(additionalGuard.includes(key));
 }
});
check("original snapshot, observations, SQL identity and no effects preserved",()=>{
 const s=newText();for(const required of [
  "observation_rows=@($observationRows)","snapshot_hash=$hash",
  "UNEXPECTED_SQL_LOGIN","UNEXPECTED_SERVICE_IDENTITY",
  "Write-AtomicJson $eventPath $event","database_write=$false",
  "print=$false;spooler_write=$false"]){assert.ok(s.includes(required),required)}
});
check("false missing old source function rejected",()=>{
 assert.throws(()=>transform(old.replace("function Read-ServiceState","function Read-Nothing")),
 /LEGACY_READER_ANCHORS_UNPROVEN/);
});
check("multiple old service calls rejected",()=>{
 assert.throws(()=>transform(old.replace("if ($true) {","$service=Read-ServiceState ([datetime]$order.DTHRABERMESA)\nif ($true) {")),
 /LEGACY_READER_ANCHORS_UNPROVEN/);
});
check("changed old daily gate semantics rejected",()=>{
 assert.throws(()=>transform(old.replace("SERVICE_STATE_VALID_FROM_REQUIRED","OTHER_REASON")),
 /LEGACY_SHIFT_SEMANTICS_CHANGED/);
});
check("missing original observation integrity rejected",()=>{
 assert.throws(()=>transform(old.replace("observation_rows=@($observationRows)","observations=[]")),
 /CRITICAL_CONTRACT_LOST/);
});
check("missing no-print evidence rejected",()=>{
 assert.throws(()=>transform(old.replace("print=$false;spooler_write=$false","print=$true;spooler_write=$false")),
 /CRITICAL_CONTRACT_LOST/);
});
check("malformed or absent source rejected",()=>{
 assert.throws(()=>transform(null),/SOURCE_TEXT_REQUIRED/);
 assert.throws(()=>transform(""),/LEGACY_READER_ANCHORS_UNPROVEN/);
});
if(process.env.GITHUB_ACTIONS==="true"&&process.platform==="win32"){
 const program=[
  "$ErrorActionPreference='Stop'",
  nativeFunction,
  "$cases=@(",
  "  @{t=[datetime]'2026-10-25T19:41:30';o='DLV_IFO';s='A';id='0068'},",
  "  @{t=[datetime]'2026-10-25T19:41:30';o='DLV_NMO';s='A';id='0068'},",
  "  @{t=[datetime]'2026-10-25T19:41:30';o='DLV_IFO';s='P';id='0068'},",
  "  @{t=[datetime]'2026-10-25T19:41:30';o='DLV_IFO';s='A';id='NOID'},",
  "  @{t=[datetime]'2010-10-25T19:41:30';o='DLV_IFO';s='A';id='0068'}",
  ")",
  "$out=@()",
  "foreach($c in $cases){$r=Read-NativeOrderTime $c.t $c.o $c.s $c.id;",
  " $out += [pscustomobject]@{blockers=@($r.blockers);service=$r.service;",
  " role=$r.production_role;source=[string]$r.source_ref;day=[string]$r.operational_date;",
  " timestamp=[string]$r.order_opened_at_local;short=$c.id}}",
  "$out|ConvertTo-Json -Depth 5 -Compress"
 ].join("\n");
 const r=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",program],
  {encoding:"utf8",timeout:25000,windowsHide:true});
 if(r.status!==0)throw new Error("WINDOWS_FUNCTION_RUNTIME_FAILED:"+String(r.stderr).slice(-650));
 let a;try{a=JSON.parse(r.stdout.trim())}catch{throw new Error("WINDOWS_JSON_INVALID")}
 check("hosted Windows actual native function: positive + four negative inputs",()=>{
  assert.equal(a.length,5);
  assert.deepEqual(a[0].blockers,[]);
  assert.equal(a[0].service,null);
  assert.equal(a[0].role,null);
  assert.equal(a[0].day,"2026-10-25");
  assert.ok(a[0].timestamp.startsWith("2026-10-25T19:41:30"));
  assert.ok(a[1].blockers.includes("NATIVE_ORDER_ORIGIN_NOT_IFOOD"));
  assert.ok(a[2].blockers.includes("NATIVE_ORDER_STATUS_NOT_ATTESTED"));
  assert.ok(a[3].blockers.includes("NATIVE_IFOOD_SHORT_ID_MISSING_OR_INVALID"));
  assert.ok(a[4].blockers.includes("NATIVE_ORDER_TIMESTAMP_UNTRUSTED"));
  for(const x of a)assert.equal(x.source,"TEKNISA.VENDAREST.DTHRABERMESA");
 });
}
console.log("COMANDAS_NATIVE_TIMESTAMP_PATCH_V1="+passed+"/"+passed+
 " REVIEW_ONLY NO_DAILY_SHIFT NO_ROUTE_GUESS NO_PRODUCTION_EFFECT");

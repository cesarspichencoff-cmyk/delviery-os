"use strict";
/*
 * REVIEW_ONLY / NO DEPLOY. Adapt the SHA-pinned real Windows reader source
 * without publishing the shop's installed script into a public repository.
 * Changes ONLY the legacy daily shift gate and one call site; any unknown
 * source bytes abort. Output is a NEW file in an offline review directory.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");

const EXPECTED_SOURCE_SHA256="a58e428826d70edf27763c3fa47893608305a7fb48f973ee1f84f02e5da19c5c";
const FUNCTION_OPEN="function Read-ServiceState([datetime]$OrderOpenedAt) {";
const FUNCTION_CLOSE="\n$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name";
const LEGACY_CALL="$service=Read-ServiceState ([datetime]$order.DTHRABERMESA)";
const NATIVE_CALL="$service=Read-NativeOrderTime ([datetime]$order.DTHRABERMESA) ([string]$order.IDORGCMDVENDA) ([string]$order.IDSTCOMANDA) ([string]$order.NRCOMANDAEXT)";
const CONTRACT="deliveryos.tata-reader-native-order-time.review-only.v1";

const nativeFunction=[
"function Read-NativeOrderTime([datetime]$OrderOpenedAt,[string]$Origin,[string]$Status,[string]$ShortId) {",
"  # Native source authority ONLY for opening timestamp and the order identity.",
"  # Never infer LUNCH/DINNER, route A/B, a human sign-off, or a printer.",
"  $blockers = @()",
"  if ($OrderOpenedAt -eq [datetime]::MinValue -or",
"      $OrderOpenedAt.Year -lt 2020 -or $OrderOpenedAt.Year -gt 2100) {",
"    $blockers += 'NATIVE_ORDER_TIMESTAMP_UNTRUSTED'",
"  }",
"  if ($Origin -cne 'DLV_IFO') { $blockers += 'NATIVE_ORDER_ORIGIN_NOT_IFOOD' }",
"  # Installed source: A can mean scheduled. Status alone never proves production eligibility.",
"  # P is assigned before an optional print attempt; even P cannot prove paper.",
"  if ($Status -cnotmatch '^[A-Za-z0-9]{1,4}$') {",
"    $blockers += 'NATIVE_ORDER_STATUS_INVALID'",
"  }",
"  $blockers += 'NATIVE_ORDER_STATUS_NOT_ATTESTED'",
"  if ($ShortId -cnotmatch '^[0-9]{1,12}$') {",
"    $blockers += 'NATIVE_IFOOD_SHORT_ID_MISSING_OR_INVALID'",
"  }",
"  return [ordered]@{",
"    service=$null;production_role=$null",
"    evidence='TEKNISA_NATIVE_ORDER_OPENED_AT_ONLY'",
"    source_ref='TEKNISA.VENDAREST.DTHRABERMESA'",
"    operational_date=$OrderOpenedAt.ToString('yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)",
"    order_opened_at_local=$OrderOpenedAt.ToString('o',[Globalization.CultureInfo]::InvariantCulture)",
"    blockers=@($blockers)",
"  }",
"}"
].join("\n");

const additionalGuard=[
"            # Readiness means eligible for SHADOW review, never print authority.",
"            # An order with missing/corrupt item content may not be marked ready.",
"            if (@($order.items).Count -eq 0) {",
"              $service.blockers += 'NATIVE_ORDER_ITEM_LINES_MISSING'",
"            }",
"            for ($itemIndex=0; $itemIndex -lt @($order.items).Count; $itemIndex++) {",
"              $sourceItem=$order.items[$itemIndex]",
"              if ([string]::IsNullOrWhiteSpace([string]$sourceItem.CDPRODUTO) -or",
"                  [string]::IsNullOrWhiteSpace([string]$sourceItem.CDARVPROD)) {",
"                $service.blockers += ('NATIVE_ITEM_IDENTITY_MISSING:' + ($itemIndex+1))",
"              }",
"              if ([string]$sourceItem.QTPRODCOMVEN -cnotmatch '^(?:0*[1-9][0-9]*)(?:\\.0+)?$') {",
"                $service.blockers += ('NATIVE_ITEM_QUANTITY_INVALID:' + ($itemIndex+1))",
"              }",
"              # Source can INSERT legitimate items with status 1 or 4.",
"              if ([string]$sourceItem.IDSTPRCOMVEN -cnotmatch '^[A-Za-z0-9]{1,4}$') {",
"                $service.blockers += ('NATIVE_ITEM_STATUS_INVALID:' + ($itemIndex+1))",
"              }",
"              $service.blockers += ('NATIVE_ITEM_STATUS_NOT_ATTESTED:' + ($itemIndex+1))",
"            }"
].join("\n");

function occurrences(s,p){return s.split(p).length-1;}
function transform(source){
 if(typeof source!=="string")throw new Error("SOURCE_TEXT_REQUIRED");
 if(occurrences(source,FUNCTION_OPEN)!==1 ||
    occurrences(source,FUNCTION_CLOSE)!==1 ||
    occurrences(source,LEGACY_CALL)!==1)throw new Error("LEGACY_READER_ANCHORS_UNPROVEN");
 const start=source.indexOf(FUNCTION_OPEN);
 const end=source.indexOf(FUNCTION_CLOSE,start);
 if(end<=start)throw new Error("LEGACY_READER_ORDER_INVALID");
 const originalFunction=source.slice(start,end);
 for(const required of ["SERVICE_STATE_EXPIRED_FOR_ORDER",
   "SERVICE_STATE_DATE_MISMATCH_ORDER_DATE","valid_from_local",
   "SERVICE_STATE_VALID_FROM_REQUIRED"]){
   if(!originalFunction.includes(required))throw new Error("LEGACY_SHIFT_SEMANTICS_CHANGED:"+required);
 }
 let next=source.slice(0,start)+nativeFunction+"\n"+source.slice(end);
 // Use a replacement FUNCTION to preserve literal PowerShell regex anchors.
 next=next.replace(LEGACY_CALL,()=>NATIVE_CALL+"\n"+additionalGuard);
 if(next.includes("Read-ServiceState") ||
   next.includes("SERVICE_STATE_EXPIRED_FOR_ORDER") ||
   next.includes("production-service-state.json")){
  // The old state path may still be declared globally. It is inert but must
  // be removed from the candidate so it cannot be used by a future caller.
  next=next.replace(
   '$ServiceStatePath = "C:\\ProgramData\\TataComandaReader\\state\\production-service-state.json"\n',"");
 }
 if(next.includes("Read-ServiceState")||next.includes("SERVICE_STATE_EXPIRED_FOR_ORDER")||
    next.includes("production-service-state.json"))throw new Error("LEGACY_SHIFT_DEPENDENCY_REMAINED");
 for(const required of [
  "observation_rows=@($observationRows)",
  "snapshot_hash=$hash",
  "Write-AtomicJson $eventPath $event",
  "UNEXPECTED_SERVICE_IDENTITY",
  "UNEXPECTED_SQL_LOGIN",
  "DTHRABERMESA=$order.DTHRABERMESA",
  "database_write=$false",
  "print=$false;spooler_write=$false"
 ])if(!next.includes(required))throw new Error("CRITICAL_CONTRACT_LOST:"+required);
 if(!next.includes("production_role=$null")||!next.includes("NATIVE_ORDER_STATUS_NOT_ATTESTED")||
    next.includes("$Status -cne 'A'")||
    !next.includes("NATIVE_ITEM_STATUS_NOT_ATTESTED"))
  throw new Error("NATIVE_AUTHORITY_GUARD_LOST");
 return next;
}
function cli(args){
 if(args.length!==2)throw new Error("USAGE: node patch.js <local-live-source-copy> <new-output-file>");
 const sourceFile=path.resolve(args[0]),outFile=path.resolve(args[1]);
 if(sourceFile===outFile)throw new Error("SOURCE_OVERWRITE_FORBIDDEN");
 for(const f of [sourceFile,outFile]){
  if(/\\programdata\\|\\teknisa\\|\\odhen-perifericos\\/i.test(f))
   throw new Error("OPERATIONAL_PATH_FORBIDDEN");
 }
 if(fs.existsSync(outFile))throw new Error("OUTPUT_EXISTS_REFUSE_OVERWRITE");
 const bytes=fs.readFileSync(sourceFile);
 const digest=crypto.createHash("sha256").update(bytes).digest("hex");
 if(digest!==EXPECTED_SOURCE_SHA256)throw new Error("SOURCE_BYTES_NOT_VERIFIED");
 const result=transform(bytes.toString("utf8"));
 fs.writeFileSync(outFile,result,{encoding:"utf8",flag:"wx"});
 const after=crypto.createHash("sha256").update(fs.readFileSync(outFile)).digest("hex");
 console.log(JSON.stringify({schema:CONTRACT,status:"OFFLINE_CANDIDATE_CREATED",
   source_sha256:digest,candidate_sha256:after,output:path.basename(outFile),
   producer:"SHAPINNED_LOCAL_READ_ONLY",installed:false,
   effects:{sql_write:false,printer:false,service:false,sequence:false}}));
}
if(require.main===module){try{cli(process.argv.slice(2))}catch(e){
 console.error("COMANDAS_READER_PATCH_HOLD:"+e.message);process.exitCode=7;
}}
module.exports={transform,nativeFunction,additionalGuard,EXPECTED_SOURCE_SHA256,CONTRACT};

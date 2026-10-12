"use strict";
/**
 * Prospective shift-state source preparation ONLY. Never a service/SCM hook.
 * Accept exactly the audited Oct-12 installed watcher V2 SHA-256, produce
 * a NEW candidate in a caller-created temp folder, never edit the original.
 *
 * The new v3 JSON *shape* is not an authenticated human approval. Issuance
 * and service deployment remain independent human-controlled effect gates.
 */
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),
  crypto=require("node:crypto");
const WATCHER_V2_SHA256=
  "43494d2e9c7c654e1a66c9bc0b9b06c32e6aa2f1eaa5460f153d7abc081d1752";
const WATCHER_SHIFT_START="function Read-ServiceState([datetime]$OrderOpenedAt) {";
const WATCHER_SHIFT_END="\n}\n";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const occurrence=(text,needle)=>text.split(needle).length-1;
const lines=(...xs)=>xs.join("\n");
function transformWatcher(sourceText){
  if(typeof sourceText!=="string"||sourceText.charCodeAt(0)===0xfeff)
    throw Error("SOURCE_TEXT_ENCODING_INVALID");
  const eol=sourceText.includes("\r\n")?"\r\n":"\n";
  const input=sourceText.replace(/\r\n/g,"\n");
  const begin=input.indexOf(WATCHER_SHIFT_START);
  if(begin<0||occurrence(input,WATCHER_SHIFT_START)!==1)
    throw Error("SHIFT_FUNCTION_NOT_EXACTLY_ONE");
  const end=input.indexOf(WATCHER_SHIFT_END,begin);
  if(end<begin)throw Error("SHIFT_FUNCTION_END_MISSING");
  const before=input.slice(begin,end+WATCHER_SHIFT_END.length);
  const oldSchema='"deliveryos.production-service-shift-state.v2"';
  const untilAnchor='    $validUntilRaw = [string]$state.valid_until_local\n';
  const finalAnchor='    if ($blockers.Count -gt 0) {\n';
  if(occurrence(before,oldSchema)!==1||
     occurrence(before,untilAnchor)!==1||
     occurrence(before,finalAnchor)!==1||
     !before.includes('elseif ($OrderOpenedAt -gt $validUntil) {')||
     !before.includes('SERVICE_STATE_EXPIRED_FOR_ORDER'))
    throw Error("INSTALLED_SHIFT_BODY_DRIFT");
  let changed=before.replace(oldSchema,
    '"deliveryos.production-service-shift-state.v3"');
  const fromRules=lines(
    '    # New v3 contract: no retroactive order may inherit a later human review.',
    '    $validFromRaw = [string]$state.valid_from_local',
    '    $confirmedRaw = [string]$state.confirmed_at_local',
    '    $validFrom = [datetime]::MinValue',
    '    $confirmedAt = [datetime]::MinValue',
    '    $fromOk = [datetime]::TryParseExact($validFromRaw, "yyyy-MM-ddTHH:mm:ss",',
    '      [Globalization.CultureInfo]::InvariantCulture,',
    '      [Globalization.DateTimeStyles]::None, [ref]$validFrom)',
    '    $confirmationOk = [datetime]::TryParseExact($confirmedRaw, "yyyy-MM-ddTHH:mm:ss",',
    '      [Globalization.CultureInfo]::InvariantCulture,',
    '      [Globalization.DateTimeStyles]::None, [ref]$confirmedAt)',
    '    if (-not $fromOk) { $blockers += "SERVICE_STATE_VALID_FROM_REQUIRED" }',
    '    if (-not $confirmationOk) { $blockers += "SERVICE_STATE_CONFIRMED_AT_REQUIRED" }',
    '    if ($fromOk -and $confirmationOk -and $validFrom -lt $confirmedAt) {',
    '      $blockers += "SERVICE_STATE_RETROACTIVE_WINDOW_FORBIDDEN"',
    '    }',
    '    if ($fromOk -and $validFrom.ToString("yyyy-MM-dd") -ne $orderDate) {',
    '      $blockers += "SERVICE_STATE_VALID_FROM_DAY_MISMATCH"',
    '    }',
    '    if ($confirmationOk -and $confirmedAt.ToString("yyyy-MM-dd") -ne $orderDate) {',
    '      $blockers += "SERVICE_STATE_CONFIRMATION_DAY_MISMATCH"',
    '    }',
    '    if ($fromOk -and $OrderOpenedAt -lt $validFrom) {',
    '      $blockers += "SERVICE_STATE_NOT_YET_EFFECTIVE_FOR_ORDER"',
    '    }',
    ''
  );
  changed=changed.replace(untilAnchor,fromRules+untilAnchor);
  const crossWindow=lines(
    '    if ($fromOk -and $validUntil -ne [datetime]::MinValue -and',
    '        $validFrom -gt $validUntil) {',
    '      $blockers += "SERVICE_STATE_INTERVAL_INVALID"',
    '    }',
    '    if ($validUntil -ne [datetime]::MinValue -and',
    '        $validUntil.ToString("yyyy-MM-dd") -ne $orderDate) {',
    '      $blockers += "SERVICE_STATE_VALID_UNTIL_DAY_MISMATCH"',
    '    }',
    ''
  );
  // Safety stop: the signed V7.32 verifier is a SEPARATE, read-only module
  // with no validated Windows service/identity binding yet. Never let a
  // structurally plausible v3 JSON become operative human authorization.
  const humanAuthorityHold=lines(
    '    # Signature review code is NOT connected to this Windows watcher.',
    '    # No JSON field can promote itself to operator-approved FACT.',
    '    $blockers += "SERVICE_STATE_INDEPENDENT_AUTHORITY_NOT_VERIFIED"',
    ''
  );
  changed=changed.replace(finalAnchor,
    crossWindow+humanAuthorityHold+finalAnchor);
  if(changed===before||!changed.includes("SERVICE_STATE_NOT_YET_EFFECTIVE_FOR_ORDER"))
    throw Error("PATCH_FAILED");
  const output=input.slice(0,begin)+changed+
    input.slice(end+WATCHER_SHIFT_END.length);
  if(occurrence(output,"function Read-ServiceState(")!==1)
    throw Error("PATCH_SCOPE_INVALID");
  return output.replace(/\n/g,eol);
}
function extractShiftFunction(sourceText){
 const norm=sourceText.replace(/\r\n/g,"\n");
 const start=norm.indexOf(WATCHER_SHIFT_START);
 const end=norm.indexOf(WATCHER_SHIFT_END,start);
 if(start<0||end<0)throw Error("SHIFT_FUNCTION_NOT_FOUND");
 return norm.slice(start,end+WATCHER_SHIFT_END.length);
}
function prepare(argv){
 if(argv.length!==4||argv[0]!=="--source"||argv[2]!=="--output-dir")
   throw Error("EXACT_ARGUMENTS_REQUIRED");
 const source=path.resolve(argv[1]);
 const dir=path.resolve(argv[3]);
 const tmp=fs.realpathSync(os.tmpdir());
 const dst=fs.realpathSync(dir);
 if(!dst.startsWith(tmp+path.sep)||dst===tmp||
    fs.lstatSync(dir).isSymbolicLink())
   throw Error("ONLY_PREEXISTING_TEMP_OUTPUT_DIRECTORY_ALLOWED");
 const stat=fs.lstatSync(source);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536||stat.size<4096)
   throw Error("WATCHER_FILE_INVALID");
 const raw=fs.readFileSync(source);
 if(sha(raw)!==WATCHER_V2_SHA256)
   throw Error("INSTALLED_WATCHER_SHA256_NOT_PINNED");
 const result=transformWatcher(raw.toString("utf8"));
 const filename="tata_reader_continuous_watch_candidate_v3_prospective.ps1";
 const dest=path.join(dst,filename);
 if(dest===source)throw Error("NO_IN_PLACE_REPLACEMENT");
 fs.writeFileSync(dest,Buffer.from(result,"utf8"),{flag:"wx",mode:0o600});
 return {schema:"deliveryos.shift-prospective-preparation.v731",
   status:"NEW_CANDIDATE_IN_TEMP_ONLY_NOT_INSTALLED",
   source_sha256:WATCHER_V2_SHA256,
   candidate_sha256:sha(Buffer.from(result,"utf8")),
   human_approval_authenticated:false,
   service_state_written:false,service_changed:false,
   windows_service_installed:false,printer_access:false,print:false,
   output_filename:filename};
}
if(require.main===module)try{
  console.log(JSON.stringify(prepare(process.argv.slice(2))));
}catch{
  console.log(JSON.stringify({status:"BLOCKED",candidate_created:false,
    service_changed:false,print:false}));
  process.exitCode=2;
}
module.exports={transformWatcher,extractShiftFunction,prepare,
  WATCHER_V2_SHA256};

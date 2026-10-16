'use strict';
/**
 * V8.14: in-memory ONE-LINE relocation preview of the audited, uninstalled
 * Windows V2 watcher. SHA pin is taken from CAIXA_MOOCA read-only observation.
 * No output files, no service, SQL, printers, spooler or Windows registry.
 * Preview is NEVER deployment approval and protected folder ACL not attested.
 */
const crypto=require('node:crypto');
const fs=require('node:fs');
const PINNED_WINDOWS_V2_SHA256='A58E428826D70EDF27763C3FA47893608305A7FB48F973EE1F84F02E5DA19C5C';
const OLD_PATH=String.raw`$ServiceStatePath = "C:\ProgramData\TataComandaReader\state\production-service-state.json"`;
const NEW_PATH=String.raw`$ServiceStatePath = "C:\ProgramData\TataComandaReader\approved-shift\production-service-state.json"`;
const SHA=x=>crypto.createHash('sha256').update(x).digest('hex').toUpperCase();
function hold(reason){return Object.freeze({
  schema:'deliveryos.comandas.v814.protected-shift-relocation.preview',
  status:'HOLD',reason,proposed_bytes:null,operational_activation_allowed:false,
  human_authorization_authenticated:false,acl_world_proven:false,production_effects:false
});}
function transformBounded(sourceBuffer,expectedSha){
  if(!Buffer.isBuffer(sourceBuffer)||sourceBuffer.length<1000||sourceBuffer.length>100000)
   return hold('SOURCE_BYTES_NOT_BOUNDED');
  if(SHA(sourceBuffer)!==expectedSha)return hold('SOURCE_HASH_DRIFT');
  const source=sourceBuffer.toString('utf8');
  if(!Buffer.from(source,'utf8').equals(sourceBuffer))return hold('SOURCE_NOT_UTF8_EXACT');
  if(source.includes(NEW_PATH))return hold('ALREADY_RELOCATED_NO_DOUBLE_PATCH');
  if(source.split(OLD_PATH).length!==2)return hold('EXACT_SHIFT_PATH_NOT_UNIQUE');
  const guardSignals=[
    'function Read-ServiceState([datetime]$OrderOpenedAt)',
    '$state = Get-Content -LiteralPath $ServiceStatePath -Raw -Encoding UTF8 | ConvertFrom-Json',
    '$ExpectedLogin = "NT SERVICE\\TataComandaReader"',
    '$CheckpointPath = "C:\\ProgramData\\TataComandaReader\\state\\reader-watch-checkpoint-v1.json"',
    '$EventDir = "C:\\ProgramData\\TataComandaReader\\state\\reader-events-v1"',
    'SERVICE_STATE_VALID_FROM_REQUIRED',
    'SERVICE_STATE_EXPIRED_FOR_ORDER'
  ];
  if(guardSignals.some(signal=>!source.includes(signal)))
    return hold('V2_WATCHER_CONTRACT_NOT_PINNED');
  const candidate=source.replace(OLD_PATH,NEW_PATH);
  const origLines=source.split(/\r?\n/),newLines=candidate.split(/\r?\n/);
  if(origLines.length!==newLines.length||
     origLines.filter((l,i)=>l!==newLines[i]).length!==1 ||
     !candidate.includes(NEW_PATH)||candidate.includes(OLD_PATH))
    return hold('MORE_THAN_ONE_LINE_CHANGED');
  return {
    schema:'deliveryos.comandas.v814.protected-shift-relocation.preview',
    status:'REVIEW_ONLY_UNINSTALLED',reason:'INDEPENDENT_ACL_AND_HUMAN_APPROVAL_NOT_WORLD_PROVEN',
    original_sha256:SHA(sourceBuffer),
    candidate_sha256:SHA(Buffer.from(candidate,'utf8')),
    source_length_bytes:sourceBuffer.length,
    candidate_length_bytes:Buffer.byteLength(candidate,'utf8'),
    changed_lines:1,old_line:OLD_PATH,new_line:NEW_PATH,
    candidate_text: candidate,
    watcher_checkpoint_path_unchanged:true,watcher_event_path_unchanged:true,
    sql_and_order_logic_unchanged:true,operational_activation_allowed:false,
    human_authorization_authenticated:false,acl_world_proven:false,production_effects:false
  };
}
function proposePinnedWindowsV2(input){return transformBounded(input,PINNED_WINDOWS_V2_SHA256)}
function previewReport(r){const {candidate_text,...safe}=r;return safe}
if(require.main===module){
 // Explicit offline fixture path, never live Windows source. Do not emit code.
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--offline-source'){
  process.stdout.write(JSON.stringify(previewReport(hold('OFFLINE_SOURCE_ARGUMENT_REQUIRED')))+'\n');
  process.exitCode=2;
 }else{
  const target=args[1];
  // Refuse to open a production path even if called from a privileged shell.
  if(/(?:ProgramData|TataComandaReader|Windows|System32)/i.test(target)||
     !/\.ps1$/.test(target)){
    process.stdout.write(JSON.stringify(previewReport(hold('OFFLINE_FIXTURE_PATH_REQUIRED')))+'\n');
    process.exitCode=2;
  }else{
    try{
      const result=proposePinnedWindowsV2(fs.readFileSync(target));
      process.stdout.write(JSON.stringify(previewReport(result))+'\n');
      if(result.status!=='REVIEW_ONLY_UNINSTALLED')process.exitCode=2;
    }catch{
      process.stdout.write(JSON.stringify(previewReport(hold('OFFLINE_FILE_UNAVAILABLE')))+'\n');
      process.exitCode=2;
    }
  }
 }
}
module.exports={proposePinnedWindowsV2,previewReport,transformBounded,hold,PINNED_WINDOWS_V2_SHA256,OLD_PATH,NEW_PATH};

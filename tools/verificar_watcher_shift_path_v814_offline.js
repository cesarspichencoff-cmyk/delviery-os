'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {transformBounded,proposePinnedWindowsV2,previewReport,OLD_PATH,NEW_PATH,
 PINNED_WINDOWS_V2_SHA256}=require('./comandas_watcher_shift_path_v814_offline.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const fixture=[
 'param([string]$CheckpointPath = "C:\\ProgramData\\TataComandaReader\\state\\reader-watch-checkpoint-v1.json",',
 '      [string]$EventDir = "C:\\ProgramData\\TataComandaReader\\state\\reader-events-v1")',
 '$ExpectedLogin = "NT SERVICE\\TataComandaReader"',
 OLD_PATH,
 'function Read-ServiceState([datetime]$OrderOpenedAt) {',
 '  $state = Get-Content -LiteralPath $ServiceStatePath -Raw -Encoding UTF8 | ConvertFrom-Json',
 '  if ($null -eq $state.valid_from_local) { throw "SERVICE_STATE_VALID_FROM_REQUIRED" }',
 '  if ($OrderOpenedAt -ge [datetime]$state.valid_until_local) { throw "SERVICE_STATE_EXPIRED_FOR_ORDER" }',
 '}',
 ...Array.from({length:75},(_,i)=>'# filler for bounded immutable watcher fixture '+i)
].join('\r\n')+'\r\n';
const buf=Buffer.from(fixture);
let checks=0;const check=(name,fn)=>{fn();checks++;};
check('exact pinned host digest is immutable',()=>{
 assert.equal(PINNED_WINDOWS_V2_SHA256,'A58E428826D70EDF27763C3FA47893608305A7FB48F973EE1F84F02E5DA19C5C');
});
check('known fixture changes exactly one watched state path',()=>{
 const r=transformBounded(buf,sha(buf));
 assert.equal(r.status,'REVIEW_ONLY_UNINSTALLED');
 assert.equal(r.changed_lines,1);
 assert.equal(r.original_sha256,sha(buf));
 assert.equal(r.candidate_sha256,sha(Buffer.from(r.candidate_text)));
 assert.equal(r.candidate_text.split(OLD_PATH).length,1);
 assert.equal(r.candidate_text.split(NEW_PATH).length,2);
 assert.equal(r.candidate_text.replace(NEW_PATH,OLD_PATH),fixture);
 assert.equal(r.watcher_checkpoint_path_unchanged,true);
 assert.equal(r.watcher_event_path_unchanged,true);
 assert.equal(r.operational_activation_allowed,false);
 assert.equal(r.human_authorization_authenticated,false);
 assert.equal(r.production_effects,false);
});
check('host-pinned source rejects unpinned synthetic fixture',()=>{
 assert.equal(proposePinnedWindowsV2(buf).reason,'SOURCE_HASH_DRIFT');
});
check('mutation of one fixture byte rejects even with original digest',()=>{
 const wrong=Buffer.from(buf);wrong[wrong.length-2]^=1;
 assert.equal(transformBounded(wrong,sha(buf)).reason,'SOURCE_HASH_DRIFT');
});
check('path collision or duplicate anchor cannot grant review',()=>{
 const duplicate=Buffer.from(fixture+OLD_PATH+'\n');
 assert.equal(transformBounded(duplicate,sha(duplicate)).reason,'EXACT_SHIFT_PATH_NOT_UNIQUE');
});
check('path already relocated cannot be patched again',()=>{
 const newer=Buffer.from(fixture.replace(OLD_PATH,NEW_PATH));
 assert.equal(transformBounded(newer,sha(newer)).reason,'ALREADY_RELOCATED_NO_DOUBLE_PATCH');
});
check('V2 runtime semantics must be pinned before producing patch',()=>{
 const changed=Buffer.from(fixture.replace('SERVICE_STATE_VALID_FROM_REQUIRED','IGNORED_START'));
 assert.equal(transformBounded(changed,sha(changed)).reason,'V2_WATCHER_CONTRACT_NOT_PINNED');
});
check('source buffer must be bounded',()=>{
 assert.equal(transformBounded(Buffer.from('a'),sha(Buffer.from('a'))).reason,'SOURCE_BYTES_NOT_BOUNDED');
});
check('reject invalid UTF-8 bytes',()=>{
 const invalid=Buffer.concat([buf,Buffer.from([0xff,0xfe])]);
 assert.equal(transformBounded(invalid,sha(invalid)).reason,'SOURCE_NOT_UTF8_EXACT');
});
check('sanitized reporting strips executable source',()=>{
 const r=previewReport(transformBounded(buf,sha(buf)));
 assert.equal(Object.hasOwn(r,'candidate_text'),false);
 assert.equal(r.operational_activation_allowed,false);
 assert.equal(r.acl_world_proven,false);
});
check('production paths forbidden even when CLI called with absolute host path',()=>{
 const r=spawnSync(process.execPath,[path.join(__dirname,'comandas_watcher_shift_path_v814_offline.cjs'),
 '--offline-source','C:\\ProgramData\\TataComandaReader\\bin\\tata_reader_continuous_watch_candidate_v2.ps1'],
 {encoding:'utf8',timeout:5000});
 assert.equal(r.status,2);
 const data=JSON.parse(r.stdout);
 assert.equal(data.reason,'OFFLINE_FIXTURE_PATH_REQUIRED');
 assert.equal(data.operational_activation_allowed,false);
});
check('CLI cannot accept unexpected arguments or write candidate file',()=>{
 const filename=path.join(__dirname,'comandas_watcher_shift_path_v814_offline.cjs');
 const r=spawnSync(process.execPath,[filename,'--write-to','C:\\ProgramData\\TataComandaReader'],{encoding:'utf8',timeout:5000});
 assert.equal(r.status,2);
 assert.equal(JSON.parse(r.stdout).status,'HOLD');
 const own=fs.readFileSync(filename,'utf8');
 assert.equal(own.includes('writeFileSync'),false);
 assert.equal(own.includes('child_process'),false);
});
console.log(JSON.stringify({schema:'deliveryos.comandas.v814.watcher-shift-relocation',
 status:'PASS',checks,synthetic_fixture_only:true,
 original_host_sha_pinned:true,host_candidate_executed:false,
 installed_watcher_modified:false,acl_changed:false,sql:false,printer:false}));

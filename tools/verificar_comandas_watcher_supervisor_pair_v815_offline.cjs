'use strict';
/**
 * V8.15 adversarial proof of the EXACT paired watcher/config preview.
 * Synthetic bytes ONLY, no Windows service, production filesystem, SQL,
 * printer, spooler, process launch, ACL, GitHub token or external data.
 */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {simulateWithPins,safeReport,SHA,KEYS,
 OLD_WATCHER_PATH,NEW_WATCHER_PATH}=require('./comandas_watcher_supervisor_pair_v815_offline.cjs');
const {OLD_PATH,NEW_PATH}=require('./comandas_watcher_shift_path_v814_offline.cjs');
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
 ...Array.from({length:75},(_,i)=>'# bounded synthetic watcher source line '+i)
].join('\r\n')+'\r\n';
const watcher=Buffer.from(fixture,'utf8');
const settings={
 schema:'deliveryos.tata-reader-supervisor-config.v1',
 watcher_path:OLD_WATCHER_PATH,
 watcher_sha256:sha(watcher),
 heartbeat_path:'C:\\ProgramData\\TataComandaReader\\state\\reader-supervisor-heartbeat-v1.json',
 child_record_path:'C:\\ProgramData\\TataComandaReader\\state\\reader-supervisor-child-v1.json',
 lock_path:'C:\\ProgramData\\TataComandaReader\\state\\reader-supervisor-v1.lock',
 powershell_exe:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
 batch_polls:8,min_backoff_seconds:2,max_backoff_seconds:30,heartbeat_every_seconds:5
};
const config=(o=settings)=>Buffer.from(JSON.stringify(o,null,2)+'\n','utf8');
const pins={watcher:sha(watcher),config:sha(config())};
let checks=0;
function check(name,fn){fn();checks++;process.stdout.write('PASS '+checks+' '+name+'\n');}
function hold(w,c,p=pins,reason){
 const x=simulateWithPins(w,c,p);
 assert.equal(x.status,'HOLD');
 if(reason)assert.equal(x.reason,reason);
 assert.equal(x.operational_activation_allowed,false);
 assert.equal(x.host_effects,false);
 assert.equal(x.installed_acl_modified,false);
 assert.equal(x.human_authorization_authenticated,false);
 assert.equal(x.staged_watcher_text,null);
 assert.equal(x.staged_config_text,null);
}
check('bounded synthetic positive pair is review-only and never deployable',()=>{
 const x=simulateWithPins(watcher,config(),pins);
 assert.equal(x.status,'REVIEW_ONLY_UNINSTALLED');
 assert.equal(x.source_watcher_sha256,pins.watcher);
 assert.equal(x.source_config_sha256,pins.config);
 assert.equal(x.changed_watcher_lines,1);
 assert.deepEqual(x.changed_config_fields,['watcher_path','watcher_sha256']);
 assert.equal(x.runtime_supervisor_tested,false);
 assert.equal(x.human_authorization_authenticated,false);
 assert.equal(x.operational_activation_allowed,false);
 assert.equal(x.host_effects,false);
 assert.equal(x.installed_acl_modified,false);
 assert.equal(x.v1_entrypoint_unchanged,true);
 assert.equal(x.v2_existing_watcher_preserved,true);
 assert.equal(x.heartbeat_and_event_paths_unchanged,true);
 assert.ok(x.staged_watcher_text.includes(NEW_PATH));
 assert.ok(!x.staged_watcher_text.includes(OLD_PATH));
});
check('only two config fields change and bytes of other fields are preserved',()=>{
 const x=simulateWithPins(watcher,config(),pins);
 const next=JSON.parse(x.staged_config_text);
 const previous=JSON.parse(config().toString('utf8'));
 assert.deepEqual(Object.keys(previous).sort(),[...KEYS].sort());
 assert.equal(next.watcher_path,NEW_WATCHER_PATH);
 assert.equal(next.watcher_sha256,x.staged_watcher_sha256);
 for(const key of KEYS.filter(k=>!['watcher_path','watcher_sha256'].includes(k)))
   assert.deepEqual(next[key],previous[key]);
 assert.equal(x.staged_config_sha256,sha(Buffer.from(x.staged_config_text)));
 assert.equal(x.staged_watcher_sha256,sha(Buffer.from(x.staged_watcher_text)));
});
check('in-memory rollback exactly reproduces both original source buffers',()=>{
 const x=simulateWithPins(watcher,config(),pins);
 const undoWatcher=x.staged_watcher_text.replace(NEW_PATH,OLD_PATH);
 const undoConfig=x.staged_config_text
   .replace(JSON.stringify(NEW_WATCHER_PATH),JSON.stringify(OLD_WATCHER_PATH))
   .replace(x.staged_watcher_sha256,pins.watcher);
 assert.equal(Buffer.compare(Buffer.from(undoWatcher,'utf8'),watcher),0);
 assert.equal(Buffer.compare(Buffer.from(undoConfig,'utf8'),config()),0);
 assert.equal(sha(Buffer.from(undoWatcher)),pins.watcher);
 assert.equal(sha(Buffer.from(undoConfig)),pins.config);
});
check('safeReport cannot leak runnable script or supervisor configuration',()=>{
 const x=simulateWithPins(watcher,config(),pins),safe=safeReport(x);
 assert.equal(Object.hasOwn(safe,'staged_watcher_text'),false);
 assert.equal(Object.hasOwn(safe,'staged_config_text'),false);
 assert.equal(safe.operational_activation_allowed,false);
 assert.equal(safe.runtime_supervisor_tested,false);
});
check('a single watcher-byte alteration violates pinned source',()=>{
 const bad=Buffer.from(watcher);bad[bad.length-3]^=1;
 hold(bad,config(),pins,'PAIR_SOURCE_DIGEST_DRIFT');
});
check('a single config-byte alteration violates pinned source',()=>{
 const bad=Buffer.from(config());bad[bad.length-2]^=1;
 hold(watcher,bad,pins,'PAIR_SOURCE_DIGEST_DRIFT');
});
check('watcher and config pins cannot be exchanged',()=>{
 hold(watcher,config(),{watcher:pins.config,config:pins.watcher},'PAIR_SOURCE_DIGEST_DRIFT');
});
check('old watcher must contain a unique state path',()=>{
 const bad=Buffer.from(fixture+OLD_PATH,'utf8');
 hold(bad,config(),{watcher:sha(bad),config:pins.config},'WATCHER_EXACT_SHIFT_PATH_NOT_UNIQUE');
});
check('already migrated watcher refuses a second patch',()=>{
 const bad=Buffer.from(fixture.replace(OLD_PATH,NEW_PATH),'utf8');
 hold(bad,config(),{watcher:sha(bad),config:pins.config},'WATCHER_ALREADY_RELOCATED_NO_DOUBLE_PATCH');
});
check('missing watcher state contract refuses preview',()=>{
 const bad=Buffer.from(fixture.replace('SERVICE_STATE_VALID_FROM_REQUIRED','IGNORED_STATE_START'),'utf8');
 hold(bad,config(),{watcher:sha(bad),config:pins.config},'WATCHER_V2_WATCHER_CONTRACT_NOT_PINNED');
});
check('invalid UTF-8 watcher refuses preview',()=>{
 const bad=Buffer.concat([watcher,Buffer.from([0xff])]);
 hold(bad,config(),{watcher:sha(bad),config:pins.config},'WATCHER_SOURCE_NOT_UTF8_EXACT');
});
check('missing config key cannot pass exact schema',()=>{
 const x={...settings};delete x.lock_path;const b=config(x);
 hold(watcher,b,{watcher:pins.watcher,config:sha(b)},'CONFIG_EXACT_KEYS_DRIFT');
});
check('extra config key cannot pass exact schema',()=>{
 const b=config({...settings,unreviewed_flag:true});
 hold(watcher,b,{watcher:pins.watcher,config:sha(b)},'CONFIG_EXACT_KEYS_DRIFT');
});
check('wrong supervisor watcher path blocks rather than guessing',()=>{
 const b=config({...settings,watcher_path:'C:\\unknown\\watcher.ps1'});
 hold(watcher,b,{watcher:pins.watcher,config:sha(b)},'SUPERVISOR_PIN_MISMATCH');
});
check('wrong supervisor watcher digest blocks',()=>{
 const b=config({...settings,watcher_sha256:'F'.repeat(64)});
 hold(watcher,b,{watcher:pins.watcher,config:sha(b)},'SUPERVISOR_PIN_MISMATCH');
});
check('ambiguous duplicated old watcher path is rejected',()=>{
 const b=config({...settings,extra:OLD_WATCHER_PATH});
 // Schema rejects unknown field even before duplicate string check.
 hold(watcher,b,{watcher:pins.watcher,config:sha(b)},'CONFIG_EXACT_KEYS_DRIFT');
});
check('runtime heartbeat/lock cannot point outside state',()=>{
 const b=config({...settings,heartbeat_path:'C:\\temp\\rogue.json'});
 hold(watcher,b,{watcher:pins.watcher,config:sha(b)},'RUNTIME_PATH_NOT_IN_STATE');
});
check('malformed supervisor config blocks',()=>{
 const b=Buffer.from('{ bad json '.repeat(30));
 hold(watcher,b,{watcher:pins.watcher,config:sha(b)},'CONFIG_PARSE_FAILED');
});
check('invalid backoff settings block',()=>{
 const b=config({...settings,max_backoff_seconds:1});
 hold(watcher,b,{watcher:pins.watcher,config:sha(b)},'SUPERVISOR_SETTINGS_INVALID');
});
check('unexpected PowerShell executable blocks',()=>{
 const b=config({...settings,powershell_exe:'C:\\other\\sh.exe'});
 hold(watcher,b,{watcher:pins.watcher,config:sha(b)},'SUPERVISOR_SETTINGS_INVALID');
});
check('truncated input blocks without effects',()=>{
 hold(Buffer.from('x'),config(),{watcher:sha(Buffer.from('x')),config:pins.config},'WATCHER_SOURCE_BYTES_NOT_BOUNDED');
});
check('non-buffer input blocks without effects',()=>{
 hold('NOT_BUFFER',config(),pins,'PAIR_BYTES_UNBOUNDED');
});
check('uppercase SHA function is deterministic',()=>{
 assert.equal(SHA(watcher),pins.watcher);
 assert.equal(SHA(config()),pins.config);
});
process.stdout.write(JSON.stringify({
 schema:'deliveryos.comandas.v815.paired-supervisor-adversarial-test',
 status:'PASS',checks,synthetic_fixture_only:true,
 actual_supervisor_invoked:false,actual_watcher_invoked:false,
 current_shift_changed:false,service_changed:false,sql:false,
 spooler:false,printer:false,host_deployment:false,rollback_simulated_in_memory:true
})+'\n');
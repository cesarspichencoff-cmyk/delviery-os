'use strict';
/**
 * V8.15 offline only. Preview of one V2 watcher path change paired with
 * an exact-hash supervisor-config update. Never writes/starts anything.
 * The old watcher is preserved; executable staging is NOT authorized.
 */
const crypto=require('node:crypto');
const {transformBounded,OLD_PATH,NEW_PATH,PINNED_WINDOWS_V2_SHA256}=
 require('./comandas_watcher_shift_path_v814_offline.cjs');
const SCHEMA='deliveryos.comandas.v815.paired-supervisor-preview';
const ORIGINAL_CONFIG_SHA='FE213C3E865D88C48C7A6B803459804A44C8E287B85B1C574DC42400D73DCD19';
const PINNED_PREVIEW_WATCHER_SHA='0DF2F5C7AAEE8749C1B48EA9C6162025AA1C9821F948F11351CBF6BC24FC4392';
const OLD_WATCHER_PATH='C:\\ProgramData\\TataComandaReader\\bin\\tata_reader_continuous_watch_candidate_v2.ps1';
const NEW_WATCHER_PATH='C:\\ProgramData\\TataComandaReader\\bin\\tata_reader_continuous_watch_candidate_v2_protected_v815.ps1';
const KEYS=[
 'schema','watcher_path','watcher_sha256','heartbeat_path','child_record_path',
 'lock_path','powershell_exe','batch_polls','min_backoff_seconds',
 'max_backoff_seconds','heartbeat_every_seconds'
];
const SHA=x=>crypto.createHash('sha256').update(x).digest('hex').toUpperCase();
function hold(reason){return {
 schema:SCHEMA,status:'HOLD',reason,source_watcher_sha256:null,
 source_config_sha256:null,staged_watcher_text:null,staged_config_text:null,
 runtime_supervisor_tested:false,human_authorization_authenticated:false,
 installed_acl_modified:false,operational_activation_allowed:false,host_effects:false
};}
function simulateWithPins(watcherBytes,configBytes,pins){
 if(!Buffer.isBuffer(watcherBytes)||!Buffer.isBuffer(configBytes)||
    configBytes.length<200||configBytes.length>5000)return hold('PAIR_BYTES_UNBOUNDED');
 if(SHA(watcherBytes)!==pins.watcher||SHA(configBytes)!==pins.config)
   return hold('PAIR_SOURCE_DIGEST_DRIFT');
 const watcher=transformBounded(watcherBytes,pins.watcher);
 if(watcher.status!=='REVIEW_ONLY_UNINSTALLED')return hold('WATCHER_'+watcher.reason);
 if(pins.watcher===PINNED_WINDOWS_V2_SHA256&&
    watcher.candidate_sha256!==PINNED_PREVIEW_WATCHER_SHA)
   return hold('EXPECTED_CANDIDATE_DIGEST_DRIFT');
 const raw=configBytes.toString('utf8');
 if(!Buffer.from(raw,'utf8').equals(configBytes))return hold('CONFIG_UTF8_INVALID');
 let cfg;
 try{cfg=JSON.parse(raw)}catch{return hold('CONFIG_PARSE_FAILED')}
 if(!cfg||Array.isArray(cfg)||typeof cfg!=='object'||
    Object.keys(cfg).sort().join('|')!==[...KEYS].sort().join('|'))
   return hold('CONFIG_EXACT_KEYS_DRIFT');
 if(cfg.schema!=='deliveryos.tata-reader-supervisor-config.v1'||
    cfg.watcher_path!==OLD_WATCHER_PATH||cfg.watcher_sha256!==pins.watcher)
   return hold('SUPERVISOR_PIN_MISMATCH');
 for(const key of ['heartbeat_path','child_record_path','lock_path']){
   if(typeof cfg[key]!=='string'||!cfg[key].includes('\\state\\'))
    return hold('RUNTIME_PATH_NOT_IN_STATE');
 }
 if(typeof cfg.powershell_exe!=='string'||
    !cfg.powershell_exe.toLowerCase().endsWith('powershell.exe')||
    !Number.isInteger(cfg.batch_polls)||cfg.batch_polls<1||
    !Number.isInteger(cfg.min_backoff_seconds)||cfg.min_backoff_seconds<1||
    !Number.isInteger(cfg.max_backoff_seconds)||cfg.max_backoff_seconds<cfg.min_backoff_seconds||
    !Number.isInteger(cfg.heartbeat_every_seconds)||cfg.heartbeat_every_seconds<1)
   return hold('SUPERVISOR_SETTINGS_INVALID');
 const literalOld=JSON.stringify(OLD_WATCHER_PATH);
 const literalNew=JSON.stringify(NEW_WATCHER_PATH);
 if(raw.split(literalOld).length!==2||raw.split(pins.watcher).length!==2)
   return hold('CONFIG_REFERENCES_NOT_UNIQUE');
 const nextText=raw.replace(literalOld,literalNew).replace(pins.watcher,watcher.candidate_sha256);
 let next;
 try{next=JSON.parse(nextText)}catch{return hold('NEW_CONFIG_PARSE_FAILED')}
 const changes=KEYS.filter(k=>cfg[k]!==next[k]).sort();
 if(changes.join('|')!=='watcher_path|watcher_sha256'||
    next.watcher_path!==NEW_WATCHER_PATH||
    next.watcher_sha256!==watcher.candidate_sha256)
   return hold('CONFIG_DIFFERENCE_SET_VIOLATED');
 return {
  schema:SCHEMA,status:'REVIEW_ONLY_UNINSTALLED',
  reason:'REAL_SUPERVISOR_STAGED_PATH_AND_HUMAN_CUSTODY_NOT_VERIFIED',
  source_watcher_sha256:SHA(watcherBytes),source_config_sha256:SHA(configBytes),
  staged_watcher_sha256:watcher.candidate_sha256,
  staged_config_sha256:SHA(Buffer.from(nextText,'utf8')),
  changed_watcher_lines:1,changed_config_fields:changes,
  old_watcher_path:OLD_WATCHER_PATH,new_watcher_path:NEW_WATCHER_PATH,
  old_shift_path:OLD_PATH,new_shift_path:NEW_PATH,
  v1_entrypoint_unchanged:true,v2_existing_watcher_preserved:true,
  heartbeat_and_event_paths_unchanged:true,
  runtime_supervisor_tested:false,human_authorization_authenticated:false,
  installed_acl_modified:false,operational_activation_allowed:false,host_effects:false,
  staged_watcher_text:watcher.candidate_text,staged_config_text:nextText
 };
}
function previewPinnedPair(watcherBytes,configBytes){
 return simulateWithPins(watcherBytes,configBytes,{
  watcher:PINNED_WINDOWS_V2_SHA256,config:ORIGINAL_CONFIG_SHA
 });
}
function safeReport(out){
 const {staged_watcher_text,staged_config_text,...safe}=out;return safe;
}
module.exports={simulateWithPins,previewPinnedPair,safeReport,SHA,hold,KEYS,
 ORIGINAL_CONFIG_SHA,PINNED_WINDOWS_V2_SHA256,PINNED_PREVIEW_WATCHER_SHA,
 OLD_WATCHER_PATH,NEW_WATCHER_PATH};

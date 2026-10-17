'use strict';
const assert=require('node:assert/strict');
const {evaluate,SCHEMA,OLD,STAGED,SUPERVISOR}=require('./comandas_cutover_quiescence_v816_offline.cjs');
const now=Date.parse('2026-10-16T07:00:00Z');
const initial=()=>({schema:SCHEMA,source:'SYNTHETIC_TEST_INPUT',
 observed_at_utc:new Date(now).toISOString(),inventory_complete:true,inventory_error:null,
 windows_service_stopped:true,service_restart_inhibited:true,
 supervisor_lock_released:true,child_record:null,processes:[]});
const proc=(id,cmd)=>({pid:id,started_utc:'2026-10-16T06:55:00Z',command_line:cmd});
let cases=0;
function check(name,fixture,reason){
 const result=evaluate(fixture,now);cases++;
 if(reason){assert.equal(result.status,'HOLD',name);assert.ok(result.reasons.includes(reason),name+':'+result.reasons)}
 else{assert.equal(result.status,'SYNTHETIC_QUIESCENCE_CONSISTENT_REVIEW_ONLY',name);
  assert.equal(result.synthetic_checks_consistent,true,name)}
 assert.equal(result.world_inventory_attested,false);
 assert.equal(result.human_authorization_authenticated,false);
 assert.equal(result.activation_authorized,false);
 assert.ok(Object.values(result.effects).every(v=>v===false));
}
check('empty synthetic inventory only allows review',initial());
check('old orphan with NO child record must block',{...initial(),processes:[proc(21,'powershell.exe -File "'+OLD+'"')]},'OLD_GENERATION_PROCESS_PRESENT');
check('new watcher must block',{...initial(),processes:[proc(22,'powershell.exe -File "'+STAGED+'"')]},'STAGED_GENERATION_PROCESS_PRESENT');
check('supervisor still active must block',{...initial(),processes:[proc(23,'powershell.exe -File "'+SUPERVISOR+'"')]},'SUPERVISOR_PROCESS_PRESENT');
check('two generations must block',{...initial(),processes:[proc(21,OLD),proc(22,STAGED)]},'OLD_GENERATION_PROCESS_PRESENT');
check('unknown command line must block',{...initial(),processes:[proc(4,'')]},'PROCESS_COMMANDLINE_UNAVAILABLE');
check('unreliable WMI inventory must block',{...initial(),inventory_complete:false},'PROCESS_ENUMERATION_NOT_CONFIRMED');
check('enumeration error must block',{...initial(),inventory_error:'LIST_UNKNOWN'},'PROCESS_ENUMERATION_NOT_CONFIRMED');
check('still-running supervisor service blocks',{...initial(),windows_service_stopped:false},'SERVICE_STILL_RUNNING_OR_UNKNOWN');
check('restart not prevented blocks',{...initial(),service_restart_inhibited:false},'SERVICE_CAN_RESTART');
check('lock still held blocks',{...initial(),supervisor_lock_released:false},'SUPERVISOR_LOCK_NOT_CLEARED');
check('unreconciled child record blocks',{...initial(),child_record:{pid:21}},'CHILD_RECORD_NOT_RECONCILED');
check('missing PID blocks',{...initial(),processes:[{pid:null,started_utc:'2026-10-16T06:55:00Z',command_line:'pwsh.exe'}]},'PROCESS_IDENTITY_UNKNOWN');
check('PID reused or duplicate blocks',{...initial(),processes:[proc(1,'pwsh.exe'),proc(1,'pwsh.exe')]},'PROCESS_IDENTITY_UNKNOWN');
check('stale inventory blocks',{...initial(),observed_at_utc:'2026-10-16T06:58:00Z'},'INVENTORY_STALE_OR_FUTURE');
check('future inventory blocks',{...initial(),observed_at_utc:'2026-10-16T07:01:00Z'},'INVENTORY_STALE_OR_FUTURE');
check('untrusted self-reported source blocks',{...initial(),source:'REAL_HOST_ATTESTED'},'INVENTORY_ORIGIN_NOT_TRUSTED');
check('unexpected schema key blocks',{...initial(),print_authorized:true},'INVENTORY_SCHEMA_OR_FIELDS_INVALID');
check('benign process still does not authorize deployment',{...initial(),processes:[proc(56,'powershell.exe -NoProfile')]});
console.log(JSON.stringify({schema:'deliveryos.comandas.v816.cutover-tests',status:'PASS',cases,
 cross_generation_orphan_guard:'TEST_PASS_SYNTHETIC',windows_process_enumeration_tested:false,
 production_ready:false,service_effects:false,sql:false,printer:false}));

'use strict';
/**
 * V8.16 pure evaluation of a SYNTHETIC cross-generation cutover inventory.
 * This is not an inventory collector or an approval to operate on a host.
 * Real supervisor startup has a path-specific orphan hunt; an unrecorded old
 * watcher can be missed after changing watcher_path. Fail closed here.
 */
const OLD='C:\\ProgramData\\TataComandaReader\\bin\\tata_reader_continuous_watch_candidate_v2.ps1';
const STAGED='C:\\ProgramData\\TataComandaReader\\bin\\tata_reader_continuous_watch_candidate_v2_protected_v815.ps1';
const SUPERVISOR='C:\\ProgramData\\TataComandaReader\\bin\\tata_reader_continuous_watch_candidate_v1.ps1';
const SCHEMA='deliveryos.comandas.cutover-process-inventory.v816.synthetic';
const PROCESS_KEYS=['pid','started_utc','command_line'];
const INPUT_KEYS=['schema','source','observed_at_utc','inventory_complete','inventory_error',
  'windows_service_stopped','service_restart_inhibited','supervisor_lock_released',
  'child_record','processes'];
const NO_EFFECTS=Object.freeze({host_read:false,host_write:false,windows_service:false,
  sql:false,print:false,spooler:false,acl:false,deploy:false,activation:false});
function exact(x,keys){return !!x&&typeof x==='object'&&!Array.isArray(x)&&
  Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));}
function evaluate(snapshot,referenceUtc){
 const reasons=[];const flag=x=>reasons.push(x);
 if(!exact(snapshot,INPUT_KEYS))flag('INVENTORY_SCHEMA_OR_FIELDS_INVALID');
 if(!Number.isFinite(referenceUtc))flag('REFERENCE_TIME_UNTRUSTED');
 if(reasons.length)return hold(reasons);
 if(snapshot.schema!==SCHEMA||snapshot.source!=='SYNTHETIC_TEST_INPUT')flag('INVENTORY_ORIGIN_NOT_TRUSTED');
 const ms=Date.parse(snapshot.observed_at_utc);
 if(!Number.isFinite(ms)||Math.abs(ms-referenceUtc)>30000)flag('INVENTORY_STALE_OR_FUTURE');
 if(snapshot.inventory_complete!==true||snapshot.inventory_error!==null)flag('PROCESS_ENUMERATION_NOT_CONFIRMED');
 if(snapshot.windows_service_stopped!==true)flag('SERVICE_STILL_RUNNING_OR_UNKNOWN');
 if(snapshot.service_restart_inhibited!==true)flag('SERVICE_CAN_RESTART');
 if(snapshot.supervisor_lock_released!==true)flag('SUPERVISOR_LOCK_NOT_CLEARED');
 if(snapshot.child_record!==null)flag('CHILD_RECORD_NOT_RECONCILED');
 if(!Array.isArray(snapshot.processes)||snapshot.processes.length>2000)flag('PROCESS_LIST_UNBOUNDED');
 else {
  const ids=new Set();
  for(const p of snapshot.processes){
   if(!exact(p,PROCESS_KEYS)||!Number.isSafeInteger(p.pid)||p.pid<=0||ids.has(p.pid)||
      !Number.isFinite(Date.parse(p.started_utc))) {flag('PROCESS_IDENTITY_UNKNOWN');continue;}
   ids.add(p.pid);
   if(typeof p.command_line!=='string'||p.command_line.length===0||p.command_line.length>4096){
    flag('PROCESS_COMMANDLINE_UNAVAILABLE');continue;
   }
   const cmd=p.command_line.toLowerCase();
   if(cmd.includes(OLD.toLowerCase()))flag('OLD_GENERATION_PROCESS_PRESENT');
   if(cmd.includes(STAGED.toLowerCase()))flag('STAGED_GENERATION_PROCESS_PRESENT');
   if(cmd.includes(SUPERVISOR.toLowerCase()))flag('SUPERVISOR_PROCESS_PRESENT');
  }
 }
 if(reasons.length)return hold(reasons);
 return Object.freeze({schema:'deliveryos.comandas.cutover-quiescence.v816',
  status:'SYNTHETIC_QUIESCENCE_CONSISTENT_REVIEW_ONLY',
  reasons:[],synthetic_checks_consistent:true,world_inventory_attested:false,
  human_authorization_authenticated:false,activation_authorized:false,effects:NO_EFFECTS});
}
function hold(reasons){return Object.freeze({schema:'deliveryos.comandas.cutover-quiescence.v816',
 status:'HOLD',reasons:[...new Set(reasons)].sort(),synthetic_checks_consistent:false,
 world_inventory_attested:false,human_authorization_authenticated:false,
 activation_authorized:false,effects:NO_EFFECTS});}
module.exports={evaluate,SCHEMA,OLD,STAGED,SUPERVISOR,NO_EFFECTS};

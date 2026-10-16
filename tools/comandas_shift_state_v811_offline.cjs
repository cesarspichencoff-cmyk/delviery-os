'use strict';
/**
 * V8.11 - PURE proposal validator, never an operational shift-state writer.
 * No file, SQL, HTTP, service, spooler or printer operations. A valid window
 * is NOT a trusted human authorization and never grants operational effect.
 */
const SCHEMA='deliveryos.comandas-shift-window-review.v811.offline';
const REQUIRED=['store_id','operational_date','service','valid_from_local','valid_until_local'];
const NO_EFFECTS=Object.freeze({state_write:false,history_append:false,service_change:false,
  sql:false,printer:false,spooler:false,cutover:false,operational_authority:false});
const ymd=/^\d{4}-\d{2}-\d{2}$/;
const stamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
function isDay(v){
 if(typeof v!=='string'||!ymd.test(v))return false;
 const d=new Date(v+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function isLocal(v){
 if(typeof v!=='string'||!stamp.test(v)||!isDay(v.slice(0,10)))return false;
 const d=new Date(v+'Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,19)===v;
}
function hold(reasons,currentDay=null){return {
 schema:SCHEMA,status:'HOLD',reasons:[...new Set(reasons)].sort(),
 valid_window:false,review_projection:null,
 installed_updater_safe_to_run:false,independent_approval_authenticated:false,
 current_SQL_grants_proven:false,operational_activation_allowed:false,
 current_state_day:currentDay,effects:NO_EFFECTS};}
function inspect(current,proposal){
 const reasons=[];
 const validRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 if(!validRecord(current)||current.schema!=='deliveryos.production-service-shift-state.v2')
  reasons.push('CURRENT_SHIFT_STATE_SCHEMA_NOT_PROVEN');
 if(!validRecord(proposal))return hold([...reasons,'PROPOSAL_MISSING_OR_INVALID']);
 if(Object.keys(proposal).length!==REQUIRED.length||
    REQUIRED.some(k=>!Object.hasOwn(proposal,k)))reasons.push('EXACT_REVIEW_FIELDS_REQUIRED');
 if(proposal.store_id!=='0001'||
   (validRecord(current)&&current.store_id!==proposal.store_id))
  reasons.push('STORE_ID_UNSUPPORTED_OR_CHANGED');
 if(!isDay(proposal.operational_date))reasons.push('OPERATIONAL_DATE_INVALID');
 if(!['LUNCH','DINNER'].includes(proposal.service))reasons.push('SERVICE_NOT_EXACT');
 if(!isLocal(proposal.valid_from_local)||!isLocal(proposal.valid_until_local))
  reasons.push('LOCAL_TIMESTAMP_INVALID');
 if(isDay(proposal.operational_date)&&isLocal(proposal.valid_from_local)&&
    isLocal(proposal.valid_until_local)){
   if(proposal.valid_from_local.slice(0,10)!==proposal.operational_date||
      proposal.valid_until_local.slice(0,10)!==proposal.operational_date)
    reasons.push('WINDOW_MUST_STAY_WITHIN_OPERATIONAL_DAY');
   if(proposal.valid_from_local>=proposal.valid_until_local)
    reasons.push('WINDOW_NOT_INCREASING');
 }
 // Windows V2 requires BOTH bounds. The installed v1 writer omits valid_from_local.
 // No field in the proposal is accepted as proof that a human approved it.
 if(reasons.length)return hold(reasons,validRecord(current)?String(current.operational_date||''):null);
 return {schema:SCHEMA,status:'REVIEW_ONLY_AUTHORIZATION_REQUIRED',reasons:[
    'TRUSTED_HUMAN_AUTHORIZATION_MISSING',
    'HOST_WRITER_AND_V2_WATCHER_COMPATIBILITY_NOT_WORLD_PROVEN',
    'SEPARATE_HOST_EFFECT_APPROVAL_REQUIRED'],
  valid_window:true,review_projection:{schema:'deliveryos.production-service-shift-state.v2',
   store_id:proposal.store_id,operational_date:proposal.operational_date,
   service:proposal.service,valid_from_local:proposal.valid_from_local,
   valid_until_local:proposal.valid_until_local,
   evidence:'NOT_AUTHENTICATED_DRAFT',source_ref:null,clock_inference_used:false},
  installed_updater_safe_to_run:false,independent_approval_authenticated:false,
  current_SQL_grants_proven:false,operational_activation_allowed:false,
  current_state_day:current.operational_date,effects:NO_EFFECTS};
}
module.exports={inspect,SCHEMA,NO_EFFECTS,isDay,isLocal};

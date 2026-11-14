'use strict';
// Offline GetIn SHAPE mirror, reconstructed from passive inspection of
// installed source. NOT a copy of, or execution of, the productive scripts.
// No filesystem, browser, clock scheduler, sessions, network or customer data.
const {createHash}=require('node:crypto');
const Unit='TATÁ Sushi Itaim';
const mode='WINDOWS_SCHEDULER';
const fail=(reason)=>Object.freeze({ok:false,reason});
const sha=(s)=>createHash('sha256').update(s,'utf8').digest('hex');
const brDate=(value)=>{
 try{
  if(typeof value!=='string' && !(value instanceof Date))return null;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return null;
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(date);
 }catch{return null;}
};
const isoDate=d=>typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !Number.isNaN(Date.parse(d+'T12:00:00Z')) &&
  new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const dmy=d=>d.split('-').reverse().join('/');
const validTotals=r=>r && r.totals && Number.isInteger(r.totals.reservations) &&
 r.totals.reservations>=0 && Number.isInteger(r.totals.people) &&
 r.totals.people>=0 && Array.isArray(r.entries) &&
 r.entries.length===r.totals.reservations;
const peopleSum=r=>r.entries.every(e=>Number.isInteger(e.people) && e.people>=0) &&
  r.entries.reduce((s,e)=>s+e.people,0)===r.totals.people;
function collect({expected,child,report,message,finishedAt}){
 if(!isoDate(expected))return fail('HOLD_EXPECTED_DATE_INVALID');
 if(!child || child.status!=='DETAIL_READ_VALIDATED' || child.date!==expected)
  return fail('HOLD_CHILD_RESPONSE');
 if(!report || report.date!==expected || report.unit!==Unit ||
    !validTotals(report) || typeof message!=='string' ||
    !message.includes(dmy(expected)))return fail('HOLD_SAVED_ARTIFACTS_INVALID');
 if(!peopleSum(report))return fail('HOLD_PEOPLE_RECONCILIATION');
 if(brDate(finishedAt)===null)return fail('HOLD_FINISHED_AT_INVALID');
 return Object.freeze({ok:true,receipt:{
  status:'SUCCESS',targetDate:expected,finishedAt,sha256:sha(message),
  reservations:report.totals.reservations,people:report.totals.people,
  turns:report.turns??{},files:['detail-latest.json','whatsapp-detailed.txt'],
  mode
 }});
}
function visual({status,report,message,now}){
 if(!status||!report||typeof message!=='string'||!isoDate(report.date)||
    !validTotals(report)||!peopleSum(report))return fail('HOLD_VISUAL_SOURCE_UNVERIFIED');
 if(status.status!=='SUCCESS' || status.targetDate!==report.date ||
    typeof status.sha256!=='string' || !/^[0-9a-f]{64}$/.test(status.sha256) ||
    sha(message)!==status.sha256 ||
    brDate(status.finishedAt)===null || brDate(now)===null ||
    brDate(status.finishedAt)!==brDate(now))
  return fail('HOLD_VISUAL_SOURCE_UNVERIFIED');
 return Object.freeze({ok:true,receipt:{
  state:'LAB_VISUAL_INPUTS_VALIDATED',date:report.date,
  sourceHashMatched:true,sourceFinishedToday:true,
  reservations:report.totals.reservations,people:report.totals.people,
  pngActuallyRendered:false,source:'SOURCE_SHAPE_MIRROR_ONLY',
  ordersPublishable:0
 }});
}
function escapeHtml(value){
 return String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
}
function lockDecision({exists,ageMs}){
 if(!exists)return 'ACQUIRE_EXCLUSIVE';
 if(!Number.isFinite(ageMs)||ageMs<0)return 'HOLD_AGE_UNKNOWN';
 return ageMs>25*60*1000?'REVIEW_STALE_LOCK':'HOLD_ALREADY_RUNNING';
}
module.exports=Object.freeze({Unit,brDate,sha,isoDate,collect,visual,escapeHtml,lockDecision});

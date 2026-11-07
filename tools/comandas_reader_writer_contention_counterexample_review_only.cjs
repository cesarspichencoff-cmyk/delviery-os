'use strict';
/**
 * STAGE 3 / PR #135 — read/writer blocking COUNTEREXAMPLES ONLY.
 *
 * Pure deterministic timing illustration; not SQL Server lock emulation,
 * execution, a production benchmark, or a prediction of actual wait time.
 * A synthetic acquired/held reader lock and conflicting writer are
 * assumptions supplied by the fixture, not database observations.
 *
 * For SERIALIZABLE with RCSI OFF, shared/key-range read locks can block a
 * conflicting writer. SET LOCK_TIMEOUT 100 constrains how long the READER
 * waits to acquire a lock, not how long the WRITER can be delayed by it.
 * Deadlock priority changes deadlock victim preference, not regular waits.
 *
 * All paths are HOLD; no live SQL, SHOWPLAN, PowerShell, files or printer.
 */
const SCHEMA='tata.comandas.reader-writer-contention-review.v1';
const EFFECTS=Object.freeze({sql:false,showplan:false,network:false,
 files:false,service:false,printer:false,sequence:false,deploy:false});
const exact=(x,names)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join('|')===names.slice().sort().join('|');
const safeTime=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000;
function hold(reason,values={}){
 return Object.freeze({
  schema:SCHEMA,status:'HOLD',reason,
  hypothetical_writer_wait_ms:values.hypothetical_writer_wait_ms??null,
  modeled_conflict:values.modeled_conflict??false,
  reader_lock_timeout_ms:100,
  scenario_is_synthetic:true,
  measured_sql_wait_ms:null,actual_lock_mode_proven:false,
  writer_safety_proven:false,source_revision_proven:false,
  candidate_sql_plan_proven:false,
  query_execution_authorized:false,print_authorized:false,
  effects:EFFECTS
 });
}
function review(input){
 try{
  if(!exact(input,['schema','candidate_sql','scenario'])||input.schema!==SCHEMA||
    typeof input.candidate_sql!=='string'||input.candidate_sql.length<500||
    input.candidate_sql.length>25000)return hold('INPUT_INVALID');
  const src=input.candidate_sql.replace(/\/\*[\s\S]*?\*\//g,' ')
    .replace(/--[^\r\n]*/g,' ');
  const must=[
   /\bSET TRANSACTION ISOLATION LEVEL SERIALIZABLE\s*;/i,
   /\bSET LOCK_TIMEOUT 100\s*;/i,
   /\bSET DEADLOCK_PRIORITY LOW\s*;/i,
   /\bSELECT TOP \(201\)\s/i,
   /\bOPTION \(MAXDOP 1\)\s*;/i,
   /\bc\.CDFILIAL='0001'/i,/\bc\.CDLOJA='01'/i,
   /\bc\.IDORGCMDVENDA='DLV_IFO'/i,
   /\bc\.NRVENDAREST=@nrVendaRest/i,/\bc\.NRCOMANDA=@nrComanda/i
  ];
  if(must.some(rx=>!rx.test(src))||
     (src.match(/\bSELECT\b/gi)||[]).length!==1||
     /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|TRUNCATE|EXEC|BEGIN TRAN|NOLOCK|READPAST)\b/i.test(src))
    return hold('SQL_CANDIDATE_POLICY_DRIFT');
  const s=input.scenario;
  if(!exact(s,['reader_lock_acquired_ms','reader_lock_released_ms',
     'writer_attempted_ms','relation','reader_lock_kind','writer_action',
     'reader_lock_timeout_ms'])||
     !safeTime(s.reader_lock_acquired_ms)||
     !safeTime(s.reader_lock_released_ms)||
     !safeTime(s.writer_attempted_ms)||
     s.reader_lock_released_ms<s.reader_lock_acquired_ms||
     s.reader_lock_timeout_ms!==100||
     !['SAME_ROW','INTERSECTING_KEY_RANGE','DISJOINT','UNKNOWN'].includes(s.relation)||
     !['SHARED_READ','KEY_RANGE_READ','UNKNOWN'].includes(s.reader_lock_kind)||
     !['UPDATE','INSERT','DELETE'].includes(s.writer_action))
   return hold('SYNTHETIC_TIMELINE_INVALID');
  // Never infer the first lock winner if writer requested before reader.
  if(s.writer_attempted_ms<s.reader_lock_acquired_ms)
   return hold('WRITER_FIRST_OR_ACQUISITION_ORDER_UNPROVEN');
  if(s.writer_attempted_ms>=s.reader_lock_released_ms)
   return hold('NO_HYPOTHETICAL_OVERLAP_NOT_REAL_SAFETY',{
     hypothetical_writer_wait_ms:0});
  if(s.relation==='UNKNOWN')return hold('LOCK_INTERSECTION_UNPROVEN');
  if(s.relation==='DISJOINT')
   return hold('DISJOINT_FIXTURE_NOT_WHOLE_PLAN_PROOF',{
    hypothetical_writer_wait_ms:0});
  if(s.reader_lock_kind==='UNKNOWN')
   return hold('LOCK_MODE_UNPROVEN');
  if(s.writer_action==='INSERT'&&s.relation!=='INTERSECTING_KEY_RANGE')
   return hold('INSERT_LOCK_RANGE_NOT_ESTABLISHED');
  // Counterfactual ONLY: assume an incompatible writer on the same
  // protected resource and a read lock held until released_ms.
  // Actual SQL Server wait can differ or involve unrelated operations.
  const wait=s.reader_lock_released_ms-s.writer_attempted_ms;
  return hold(wait>100
   ?'HYPOTHETICAL_WRITER_DELAY_EXCEEDS_READER_LOCK_TIMEOUT'
   :'HYPOTHETICAL_WRITER_DELAY_NOT_A_SAFETY_PROOF',{
     hypothetical_writer_wait_ms:wait,modeled_conflict:true});
 }catch{return hold('REVIEW_EXCEPTION')}
}
module.exports={review,SCHEMA};

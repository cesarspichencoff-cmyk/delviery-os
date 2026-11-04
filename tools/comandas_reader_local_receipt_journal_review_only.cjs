'use strict';
/**
 * PR #135 — PURE OFFLINE recovery journal contract review.
 * Distinguishes observed occurrences with a local sequence, never claims
 * a native Teknisa revision, durable NTFS write, SQL snapshot, or print.
 * This file is NOT imported by the Reader; all outcomes are HOLD.
 */
const {createHash}=require('node:crypto');
const SCHEMA='tata.comandas.reader-local-journal-review.v1';
const GENERATION=/^[a-f0-9]{32}$/;
const HEX=/^[a-f0-9]{64}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(value,names)=>object(value)&&
 Object.keys(value).sort().join('|')===names.slice().sort().join('|');
const digest=s=>createHash('sha256').update(s,'utf8').digest('hex');
const effects=Object.freeze({
 sql:false,filesystem:false,service:false,network:false,
 checkpoint_write:false,event_write:false,print:false,sequence:false
});
const genesis=g=>digest('GENESIS:'+g);
function makeReceipt({generation_id,seq,kind,order_key,snapshot_hash,prev_hash,event_bytes_sha256=null}){
 if(!GENERATION.test(generation_id)||!Number.isSafeInteger(seq)||seq<1||
   !['OBSERVED','BOOTSTRAP_SUPPRESSED','EVENT_FILE_WRITTEN'].includes(kind)||
   typeof order_key!=='string'||order_key.length<7||order_key.length>512||
   !HEX.test(snapshot_hash)||!HEX.test(prev_hash)||
   (kind==='EVENT_FILE_WRITTEN'?!HEX.test(event_bytes_sha256):event_bytes_sha256!==null))
   throw Error('INVALID_SYNTHETIC_RECEIPT_INPUT');
 const v={generation_id,seq,kind,order_key,snapshot_hash,prev_hash,event_bytes_sha256};
 return {...v,receipt_hash:digest(JSON.stringify(v))};
}
function hold(reason,counts={}){
 return Object.freeze({
  schema:SCHEMA,status:'HOLD',reason,
  witnessed_local_occurrences:counts.witnessed_local_occurrences||0,
  witnessed_files:counts.witnessed_files||0,
  checkpoint_entries:counts.checkpoint_entries||0,
  native_order_revision_proven:false,
  native_transaction_atomicity_proven:false,
  all_source_transitions_observed:false,
  local_journal_durable_proven:false,
  journal_origin_authenticated:false,
  no_reemit_proven:false,no_loss_proven:false,
  migration_authorized:false,print_authorized:false,
  recoverable_events:null,effects
 });
}
function review(input){
 try{
  if(!own(input,['schema','checkpoint','journal','event_witnesses'])||
    input.schema!==SCHEMA||!object(input.checkpoint)||!Array.isArray(input.journal)||
    !Array.isArray(input.event_witnesses)||input.journal.length>1500||
    input.event_witnesses.length>1500)return hold('INPUT_INVALID');
  const cp=input.checkpoint;
  if(!own(cp,['generation_id','last_seq','last_receipt_hash','entries'])||
    !GENERATION.test(cp.generation_id)||!Number.isSafeInteger(cp.last_seq)||
    cp.last_seq<0||!HEX.test(cp.last_receipt_hash)||
    !Array.isArray(cp.entries)||cp.entries.length>250)
   return hold('CHECKPOINT_SHAPE_INVALID');
  const keys=new Set();
  for(const e of cp.entries){
   if(!own(e,['order_key','snapshot_hash'])||
      typeof e.order_key!=='string'||e.order_key.length<7||
      e.order_key.length>512||!HEX.test(e.snapshot_hash)||
      keys.has(e.order_key.toUpperCase()))return hold('CHECKPOINT_ENTRIES_INVALID');
   keys.add(e.order_key.toUpperCase());
  }
  let prior=genesis(cp.generation_id),lastSeq=0;
  const bySeq=new Map(),lastObservedByKey=new Map();
  for(const r of input.journal){
   if(!own(r,['generation_id','seq','kind','order_key','snapshot_hash','prev_hash',
     'event_bytes_sha256','receipt_hash'])||r.generation_id!==cp.generation_id||
      !Number.isSafeInteger(r.seq)||r.seq!==lastSeq+1||
      !['OBSERVED','BOOTSTRAP_SUPPRESSED','EVENT_FILE_WRITTEN'].includes(r.kind)||
      typeof r.order_key!=='string'||r.order_key.length<7||
      r.order_key.length>512||!HEX.test(r.snapshot_hash)||
      !HEX.test(r.prev_hash)||!HEX.test(r.receipt_hash)||
      (r.kind==='EVENT_FILE_WRITTEN'?!HEX.test(r.event_bytes_sha256):
       r.event_bytes_sha256!==null))
    return hold('JOURNAL_SEQUENCE_OR_GENERATION_INVALID');
   if(r.prev_hash!==prior)return hold('JOURNAL_HASH_CHAIN_BROKEN');
   let calc;
   try{calc=makeReceipt(r)}catch{return hold('JOURNAL_RECEIPT_INVALID')}
   if(calc.receipt_hash!==r.receipt_hash)
    return hold('JOURNAL_RECEIPT_CONTENT_CHANGED');
   bySeq.set(r.seq,r);
   lastObservedByKey.set(r.order_key.toUpperCase(),r.snapshot_hash);
   prior=r.receipt_hash;lastSeq=r.seq;
  }
  for(const e of cp.entries){
   const recorded=lastObservedByKey.get(e.order_key.toUpperCase());
   if(recorded===undefined)return hold('CHECKPOINT_ORDER_NOT_IN_JOURNAL');
   if(recorded!==e.snapshot_hash)return hold('CHECKPOINT_LAST_OBSERVED_HASH_MISMATCH');
  }
  const seenFiles=new Set();
  const actualFileSeq=new Set();
  for(const w of input.event_witnesses){
   if(!own(w,['seq','receipt_hash','filename','json_utf8','raw_sha256'])||
      !Number.isSafeInteger(w.seq)||w.seq<1||
      !HEX.test(w.receipt_hash)||typeof w.filename!=='string'||
      w.filename.length<8||w.filename.length>256||
      /[\\\/]/.test(w.filename)||seenFiles.has(w.filename.toUpperCase())||
      actualFileSeq.has(w.seq))return hold('FILE_WITNESS_INVALID');
   if(typeof w.json_utf8!=='string'||typeof w.raw_sha256!=='string'||
      !HEX.test(w.raw_sha256)||Buffer.byteLength(w.json_utf8,'utf8')>1048576||
      Buffer.byteLength(w.json_utf8,'utf8')<2||w.json_utf8.charCodeAt(0)===0xfeff||
      digest(w.json_utf8)!==w.raw_sha256)return hold('EVENT_WITNESS_BYTES_INVALID');
   let event;
   try{event=JSON.parse(w.json_utf8)}catch{return hold('EVENT_WITNESS_JSON_INVALID')}
   if(!own(event,['schema','local_seq','order_key','snapshot_hash'])||
      event.schema!=='tata.comandas.reader-event-witness-review.v1'||
      !Number.isSafeInteger(event.local_seq)||!HEX.test(event.snapshot_hash)||
      typeof event.order_key!=='string'||JSON.stringify(event)!==w.json_utf8)
    return hold('EVENT_WITNESS_CONTENT_INVALID');
   seenFiles.add(w.filename.toUpperCase());actualFileSeq.add(w.seq);
   const record=bySeq.get(w.seq);
   if(!record||record.kind!=='EVENT_FILE_WRITTEN'||
      record.receipt_hash!==w.receipt_hash)
    return hold('ORPHAN_OR_WRONG_EVENT_WITNESS');
   if(record.event_bytes_sha256!==w.raw_sha256)
    return hold('EVENT_WITNESS_RECEIPT_DIGEST_MISMATCH');
   if(event.local_seq!==record.seq||event.order_key!==record.order_key||
      event.snapshot_hash!==record.snapshot_hash)
    return hold('EVENT_WITNESS_PAYLOAD_MISMATCH');
   if(w.filename!==('local_'+w.seq+'_'+record.snapshot_hash+'.json'))
    return hold('FILE_WITNESS_NAME_MISMATCH');
  }
  for(const rec of input.journal){
   if(rec.kind==='EVENT_FILE_WRITTEN'&&!actualFileSeq.has(rec.seq))
    return hold('JOURNALED_EVENT_FILE_MISSING');
   if(rec.kind!=='EVENT_FILE_WRITTEN'&&actualFileSeq.has(rec.seq))
    return hold('NON_FILE_OBSERVATION_HAS_EVENT_WITNESS');
  }
  if(cp.last_seq>lastSeq)return hold('CHECKPOINT_AHEAD_OF_JOURNAL');
  if(cp.last_seq<lastSeq)return hold('CHECKPOINT_BEHIND_JOURNAL_RECOVERY_UNPROVEN');
  if(cp.last_receipt_hash!==prior)return hold('CHECKPOINT_JOURNAL_FORK');
  // All these values are self supplied. Even a continuous SHA chain can
  // be forged or rolled back with the checkpoint; neither origin nor SQL
  // semantic completeness has been independently attested.
  return hold('LOCAL_OBSERVATION_CHAIN_ONLY_NO_SOURCE_PROOF',{
   witnessed_local_occurrences:lastSeq,witnessed_files:actualFileSeq.size,
   checkpoint_entries:cp.entries.length
  });
 }catch{return hold('UNSUPPORTED_INPUT')}
}
module.exports={SCHEMA,genesis,makeReceipt,review};

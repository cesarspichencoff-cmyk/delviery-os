'use strict';
/**
 * REVIEW ONLY: pure restart/crash discrepancy analysis on invented metadata.
 * No checkpoint migration, source authentication, SQL connection, watcher,
 * printer, filesystem operations or network. Matching shape STILL HOLDs.
 * These self-supplied observations are not a trusted external witness.
 */
const {createHash}=require('node:crypto');
const SCHEMA='tata.comandas.reader-restart-boundary-review.v1';
const HEX=/^[0-9A-F]{64}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(obj,keys)=>object(obj)&&Object.keys(obj).sort().join('|')===keys.slice().sort().join('|');
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const effects=Object.freeze({database:false,service:false,checkpoint_write:false,
 event_write:false,print:false,sequence:false,network:false});
const hold=(reason,extras={})=>Object.freeze({schema:SCHEMA,state:'HOLD',reason,
 inspected_revision_count:extras.inspected_revision_count||0,
 source_revision_proven:false,legacy_migration_authorized:false,
 no_reemit_proven:false,no_loss_proven:false,operational_print_authorized:false,
 artifacts:null,effects});
function parse(snapshot){
 if(!own(snapshot,['checkpoint','event_files'])||!own(snapshot.checkpoint,['entries','bootstrap_complete'])||
   snapshot.checkpoint.bootstrap_complete!==true||!Array.isArray(snapshot.checkpoint.entries)||
   !Array.isArray(snapshot.event_files)||snapshot.checkpoint.entries.length>250||
   snapshot.event_files.length>1500)throw Error('SNAPSHOT_SHAPE_INVALID');
 const cp=new Map(),files=new Map(),byOrder=new Map();
 for(const e of snapshot.checkpoint.entries){
  if(!own(e,['order_key','snapshot_hash','emitted_hash'])||
     typeof e.order_key!=='string'||e.order_key.length<7||e.order_key.length>512||
     !HEX.test(e.snapshot_hash)||
     !(e.emitted_hash===null||HEX.test(e.emitted_hash)))
   throw Error('CHECKPOINT_ENTRY_INVALID');
  const key=e.order_key.toUpperCase();
  if(cp.has(key))throw Error('DUPLICATE_CHECKPOINT_KEY');
  cp.set(key,e);
 }
 for(const f of snapshot.event_files){
  if(!own(f,['name','json_utf8','raw_sha256'])||
     typeof f.name!=='string'||f.name.length<7||f.name.length>256||
     /[\\/]/.test(f.name)||typeof f.json_utf8!=='string'||
     Buffer.byteLength(f.json_utf8,'utf8')>1024*1024||
     Buffer.from(f.json_utf8,'utf8').toString('utf8')!==f.json_utf8||
     !/^[a-f0-9]{64}$/.test(f.raw_sha256)||sha(f.json_utf8)!==f.raw_sha256)
    throw Error('EVENT_FILE_BYTES_UNVERIFIED');
  const name=f.name.toUpperCase();
  if(files.has(name))throw Error('DUPLICATE_EVENT_FILENAME');
  files.set(name,f);
  if(/\.tmp\./i.test(f.name))throw Error('UNCOMMITTED_TEMP_EVENT_FILE');
  let event;try{event=JSON.parse(f.json_utf8)}catch{throw Error('EVENT_JSON_INVALID')}
  if(!object(event)||event.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
     typeof event.order_key!=='string'||!HEX.test(event.snapshot_hash)||
     !object(event.order)||event.order.IDORGCMDVENDA!=='DLV_IFO'||
     event.order.CDFILIAL!=='0001'||event.order.CDLOJA!=='01'||
     [event.order.CDFILIAL,event.order.CDLOJA,
      event.order.NRVENDAREST,event.order.NRCOMANDA].join('|')!==event.order_key)
   throw Error('EVENT_SOURCE_SHAPE_INVALID');
  const expected=String(event.order.NRCOMANDA).replace(/[^0-9A-Za-z_-]/g,'_')+
    '_'+event.snapshot_hash+'.json';
  if(f.name!==expected)throw Error('EVENT_FILENAME_IDENTITY_MISMATCH');
  const k=event.order_key.toUpperCase(),h=event.snapshot_hash;
  if(!byOrder.has(k))byOrder.set(k,new Map());
  if(byOrder.get(k).has(h))throw Error('DUPLICATE_ORDER_REVISION_FILE');
  byOrder.get(k).set(h,f);
 }
 return {cp,files,byOrder};
}
function review(input){
 try{
  if(!own(input,['schema','before','after'])||input.schema!==SCHEMA)return hold('INPUT_INVALID');
  let before,after;
  try{before=parse(input.before);after=parse(input.after)}
  catch(err){return hold(String(err.message).slice(0,100))}
  for(const [name,f] of before.files){
    const next=after.files.get(name);
    if(!next)return hold('PERSISTED_EVENT_FILE_DISAPPEARED');
    if(f.raw_sha256!==next.raw_sha256||f.json_utf8!==next.json_utf8)
      return hold('PERSISTED_EVENT_FILE_CHANGED');
  }
  for(const [key,entry] of before.cp){
    if(!after.cp.has(key))return hold('CHECKPOINT_ENTRY_EVICTED_OR_LOST');
    if(entry.emitted_hash!==null&&entry.snapshot_hash!==entry.emitted_hash)
      return hold('PREVIOUS_CHECKPOINT_REVISION_MISMATCH');
  }
  for(const [key,entry] of after.cp){
    if(entry.emitted_hash!==null&&entry.snapshot_hash!==entry.emitted_hash)
      return hold('CHECKPOINT_SNAPSHOT_EMITTED_HASH_DIFFER');
    if(entry.emitted_hash!==null&&!after.byOrder.get(key)?.has(entry.emitted_hash))
      return hold('CHECKPOINT_AHEAD_OF_EVENT_FILE');
    const old=before.cp.get(key);
    if(old&&old.snapshot_hash!==entry.snapshot_hash)
      return hold('HASH_TRANSITION_HAS_NO_NATIVE_REVISION_ATTESTATION');
    if(!old&&entry.emitted_hash!==null)
      return hold('NEW_CHECKPOINT_ENTRY_WITHOUT_PREVIOUS_BASELINE');
  }
  for(const [key,revisions] of after.byOrder){
    for(const h of revisions.keys()){
      const already=before.byOrder.get(key)?.has(h);
      const nowRecorded=after.cp.get(key)?.emitted_hash===h;
      if(!already&&!nowRecorded)return hold('EVENT_FILE_AHEAD_OF_CHECKPOINT');
    }
  }
  // Self-attested bytes do not prove a native SQL transaction, absence
  // of ABA, or any effect on physical paper.
  return hold('MATCHED_SHAPE_WITHOUT_EXTERNAL_SOURCE_OR_ATOMICITY_PROOF',{
   inspected_revision_count:[...after.byOrder.values()].reduce((n,m)=>n+m.size,0)});
 }catch{return hold('INVALID_OR_UNSUPPORTED_INPUT')}
}
module.exports={review,SCHEMA};

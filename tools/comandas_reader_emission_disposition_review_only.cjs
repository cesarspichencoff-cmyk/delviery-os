'use strict';
/**
 * Review-only disposition analysis of FUTURE fresh canonical checkpoints.
 * Never backfills legacy checkpoints, never issues orders, never writes files.
 * Markers and self-reported event bytes are not an external source receipt.
 */
const {createHash}=require('node:crypto');
const {snapshotHash}=require('./tata_comanda_reader_native_essentials_v857_offline.cjs');
const SCHEMA='tata.comandas.reader-disposition-review.v1';
const OLD='deliveryos.tata-reader-continuous-checkpoint.v1';
const EVENT='deliveryos.tata-reader-stable-order-event.v1';
const HEX=/^[0-9a-f]{64}$/;
const GENERATION=/^[0-9a-f]{32}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const digest=x=>createHash('sha256').update(x,'utf8').digest('hex');
const counts=()=>({bootstrap_suppressed:0,event_persisted:0,not_emitted:0,changed_revision_pending:0});
const effects=Object.freeze({sql:false,service:false,checkpoint_write:false,
 event_write:false,print:false,sequence:false,network:false,deploy:false});
const hold=(reason,c=counts())=>Object.freeze({schema:SCHEMA,state:'HOLD',reason,
 counts:Object.freeze({...c}),source_authenticated:false,transaction_atomic:false,
 bootstrap_history_proven:false,persistence_durable_proven:false,
 migration_authorized:false,no_reemit_proven:false,no_loss_proven:false,
 returnable_events:null,operational_print_authorized:false,effects});
function review(input){
 try{
  if(!obj(input)||input.schema!==SCHEMA||!obj(input.checkpoint)||
    !Array.isArray(input.event_witnesses))return hold('INPUT_INVALID');
  const cp=input.checkpoint;
  if(cp.schema!==OLD||cp.hash_contract_version!=='NODE_CANONICAL_JSON_SHA256_V1'||
     cp.checkpoint_origin!=='FRESH_NODE_CANONICAL_V2'||
     typeof cp.checkpoint_generation!=='string'||
     !GENERATION.test(cp.checkpoint_generation)||cp.bootstrap_complete!==true)
   return hold('FRESH_CHECKPOINT_CONTRACT_UNVERIFIED');
  if(!Array.isArray(cp.entries)||cp.entries.length>250||
     input.event_witnesses.length>250)
   return hold('CHECKPOINT_OR_WITNESS_BOUND_INVALID');
  const cpkeys=new Set(),witnesses=new Map(),filenames=new Set();
  for(const w of input.event_witnesses){
   if(!obj(w)||typeof w.name!=='string'||w.name.length>256||
      /[\/\\]/.test(w.name)||typeof w.json_utf8!=='string'||
      Buffer.byteLength(w.json_utf8,'utf8')>1048576||
      Buffer.from(w.json_utf8,'utf8').toString('utf8')!==w.json_utf8||
      typeof w.raw_sha256!=='string'||!HEX.test(w.raw_sha256)||
      digest(w.json_utf8)!==w.raw_sha256)
    return hold('EVENT_WITNESS_BYTES_INVALID');
   const filename=w.name.toUpperCase();
   if(filenames.has(filename))return hold('EVENT_FILENAME_DUPLICATED');
   filenames.add(filename);
   let event;
   try{event=JSON.parse(w.json_utf8)}catch{return hold('EVENT_WITNESS_JSON_INVALID')}
   if(!obj(event)||event.schema!==EVENT||typeof event.order_key!=='string'||
      !HEX.test(event.snapshot_hash)||!obj(event.order))
    return hold('EVENT_WITNESS_STRUCTURE_INVALID');
   const expectedName=String(event.order.NRCOMANDA).replace(/[^0-9A-Za-z_-]/g,'_')+
     '_'+event.snapshot_hash+'.json';
   if(expectedName!==w.name||event.order.CDFILIAL!=='0001'||
      event.order.CDLOJA!=='01'||event.order.IDORGCMDVENDA!=='DLV_IFO'||
      [event.order.CDFILIAL,event.order.CDLOJA,event.order.NRVENDAREST,
       event.order.NRCOMANDA].join('|')!==event.order_key||
      snapshotHash(event.order)!==event.snapshot_hash)
    return hold('EVENT_SOURCE_OR_CANONICAL_HASH_INVALID');
   const index=event.order_key.toUpperCase();
   if(!witnesses.has(index))witnesses.set(index,new Map());
   const revisions=witnesses.get(index);
   if(revisions.has(event.snapshot_hash))
    return hold('EVENT_REVISION_WITNESS_DUPLICATED');
   revisions.set(event.snapshot_hash,w);
  }
  const c=counts();
  for(const entry of cp.entries){
   if(!obj(entry)||typeof entry.order_key!=='string'||
      entry.order_key.length<7||entry.order_key.length>512||
      !HEX.test(entry.snapshot_hash)||
      !(entry.emitted_hash===null||HEX.test(entry.emitted_hash)))
    return hold('CHECKPOINT_ENTRY_INVALID',c);
   const key=entry.order_key.toUpperCase();
   if(cpkeys.has(key))return hold('CHECKPOINT_DUPLICATE_IDENTITY',c);
   cpkeys.add(key);
   const status=entry.emission_disposition;
   if(!['BOOTSTRAP_SUPPRESSED','EVENT_PERSISTED','NOT_EMITTED'].includes(status))
    return hold('DISPOSITION_MISSING_OR_UNRECOGNIZED',c);
   const candidate=entry.disposition_hash;
   const current=entry.snapshot_hash,prior=entry.emitted_hash;
   const related=witnesses.get(key);
   if(status==='NOT_EMITTED'){
    if(prior!==null||candidate!==null)return hold('PENDING_ENTRY_HAS_EMITTED_HASH',c);
    if(related&&related.size)return hold('PENDING_ENTRY_HAS_EVENT_WITNESS',c);
    c.not_emitted++;
    continue;
   }
   if(prior===null||candidate!==prior)
    return hold('DISPOSITION_EMITTED_HASH_MISMATCH',c);
   if(status==='BOOTSTRAP_SUPPRESSED'){
    if(related&&related.has(prior))
      return hold('BOOTSTRAP_SUPPRESSED_BUT_EVENT_EXISTS',c);
    c.bootstrap_suppressed++;
   }else{
    const witness=related&&related.get(prior);
    if(!witness)return hold('PERSISTED_EVENT_WITNESS_MISSING',c);
    if(entry.receipt_sha256!==witness.raw_sha256||
       typeof entry.receipt_sha256!=='string'||!HEX.test(entry.receipt_sha256))
      return hold('PERSISTED_RECEIPT_DIGEST_INVALID',c);
    c.event_persisted++;
   }
   if(prior!==current)c.changed_revision_pending++;
  }
  for(const key of witnesses.keys()){
   if(!cpkeys.has(key))return hold('ORPHAN_EVENT_WITNESS',c);
  }
  // Markers, file bytes, and an SHA in the SAME checkpoint are mutually
  // self-attesting. They do not prove SQL revision, durable write, or origin.
  return hold('STRUCTURAL_DISPOSITION_ONLY_NOT_EXTERNAL_PROOF',c);
 }catch{return hold('UNSUPPORTED_OR_CONFLICTING_INPUT')}
}
module.exports={review,SCHEMA};

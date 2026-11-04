'use strict';
/**
 * READ-ONLY legacy Reader V2 checkpoint/event diagnostic. It never migrates,
 * returns events, or asserts authentic SQL provenance. Run on invented fixtures
 * or separately approved private offline evidence only; never on CAIXA_MOOCA.
 * The PR #137 in-memory consumer bridge is independent and must not be copied.
 */
const {createHash}=require('node:crypto');
const {snapshotHash}=require('./tata_comanda_reader_native_essentials_v857_offline.cjs');
const SCHEMA='tata.comandas.reader-legacy-reconciliation-review.v1';
const OLD='deliveryos.tata-reader-continuous-checkpoint.v1';
const EVENT='deliveryos.tata-reader-stable-order-event.v1';
const HEX_UPPER=/^[0-9A-F]{64}$/;
const HEX_LOWER=/^[0-9a-f]{64}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const safeUtf8=x=>typeof x==='string'&&Buffer.from(x,'utf8').toString('utf8')===x;
const noEffects=Object.freeze({sql:false,network:false,service:false,
 checkpoint_write:false,event_write:false,sequence:false,print:false});
const response=(reason,count=0,bytes=false)=>Object.freeze({
 schema:SCHEMA,state:'HOLD',reason,matched_shape_count:count,
 original_bytes_hash_checked:bytes,source_provenance_authenticated:false,
 sql_revision_atomicity_proven:false,semantic_completeness_proven:false,
 migration_authorized:false,converted_checkpoint:null,events:null,
 orders_publishable:0,print_authorized:false,effects:noEffects
});
function review(input){
 try{
  if(!object(input)||Object.keys(input).sort().join('|')!==
    'checkpoint|event_witnesses|schema'||input.schema!==SCHEMA)
   return response('INVALID_INPUT');
  const cp=input.checkpoint,w=input.event_witnesses;
  if(!object(cp)||cp.schema!==OLD||cp.bootstrap_complete!==true||
    Object.hasOwn(cp,'hash_contract_version')||
    !Array.isArray(cp.entries)||cp.entries.length<1||cp.entries.length>250||
    !Array.isArray(w)||w.length!==cp.entries.length)
   return response('LEGACY_CHECKPOINT_OR_WITNESS_COVERAGE_INVALID');
  // PowerShell/NTFS identifiers can collide under case-insensitive comparison.
  const seen=new Set();
  for(const e of cp.entries){
   if(!object(e)||typeof e.order_key!=='string'||e.order_key.length<7||
     seen.has(e.order_key.toUpperCase())||!HEX_UPPER.test(e.snapshot_hash)||
     !HEX_UPPER.test(e.emitted_hash)||e.emitted_hash!==e.snapshot_hash||
     !Number.isSafeInteger(e.stable_count)||e.stable_count<2)
    return response('CHECKPOINT_ENTRY_UNSAFE');
   seen.add(e.order_key.toUpperCase());
  }
  const byKey=new Map(),filenames=new Set();
  for(const witness of w){
   if(!object(witness)||typeof witness.name!=='string'||
     typeof witness.json_utf8!=='string'||!safeUtf8(witness.json_utf8)||
     Buffer.byteLength(witness.json_utf8,'utf8')>1024*1024||
     !HEX_LOWER.test(witness.raw_sha256)||
     sha(witness.json_utf8)!==witness.raw_sha256)
    return response('EVENT_BYTES_UNVERIFIED');
   let event;
   try{event=JSON.parse(witness.json_utf8)}catch{return response('EVENT_JSON_INVALID')}
   if(!object(event)||event.schema!==EVENT||!object(event.order)||
     typeof event.order_key!=='string'||byKey.has(event.order_key.toUpperCase())||
     filenames.has(witness.name.toUpperCase())||!HEX_UPPER.test(event.snapshot_hash))
    return response('EVENT_ENVELOPE_OR_DUPLICATE_INVALID');
   byKey.set(event.order_key.toUpperCase(),{event,name:witness.name});
   filenames.add(witness.name.toUpperCase());
  }
  let matched=0;
  for(const entry of cp.entries){
   const witness=byKey.get(entry.order_key.toUpperCase());
   if(!witness)return response('MISSING_OR_EXTRA_ORDER_WITNESS',matched);
   const e=witness.event,o=e.order;
   if(o.CDFILIAL!=='0001'||o.CDLOJA!=='01'||o.IDORGCMDVENDA!=='DLV_IFO'||
     !['3','P','X'].includes(o.IDSTCOMANDA)||
     !Array.isArray(o.items)||o.items.length<1||
     o.observation_scan_complete!==true||
     !Array.isArray(o.observation_rows)||
     [o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|')!==entry.order_key)
    return response('SOURCE_SCOPE_OR_OBSERVATION_SHAPE_INVALID',matched);
   const expectedName=String(o.NRCOMANDA).replace(/[^0-9A-Za-z_-]/g,'_')+
     '_'+entry.snapshot_hash+'.json';
   if(e.order_key!==entry.order_key||e.snapshot_hash!==entry.snapshot_hash||
     witness.name!==expectedName)
    return response('LEGACY_CHECKPOINT_EVENT_IDENTITY_MISMATCH',matched);
   // IMPORTANT: PowerShell ConvertTo-Json may escape apostrophes differently.
   // Only byte-equivalent canonical matches are diagnostic, never migration.
   const computed=snapshotHash(o);
   if(typeof computed!=='string'||!HEX_LOWER.test(computed)||
      computed.toUpperCase()!==entry.snapshot_hash)
    return response('LEGACY_HASH_NOT_CANONICAL_EQUIVALENT',matched);
   matched++;
  }
  // A file's self-provided SHA is byte-integrity only. It does not authenticate
  // its source, prove the event is the latest native revision, or prevent ABA.
  return response('SOURCE_PROVENANCE_AND_SQL_COMPLETENESS_NOT_ATTESTED',matched,true);
 }catch{return response('INVALID_OR_UNSUPPORTED_EVIDENCE')}
}
module.exports={review,SCHEMA};

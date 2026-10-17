'use strict';
/**
 * V6.8 preflight on exact archived ten event/legacy-decision pairs.
 * Privacy: outputs COUNTS ONLY. Never prints order keys, hashes, notes,
 * products, filenames, raw exceptions or original event contents.
 * No service, SQL, network, process spawn, write, render or printer calls.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {watcherHash}=require('./comandas_bag_human_proposal_v1.cjs');
const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/i.test(s);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const NO_EFFECTS=Object.freeze({prints:0,service_changed:false,spooler_touched:false,
 production_state_changed:false,sql_queried:false,consumer_run:false,v68_run:false});
const COUNTERS=['DSOBSCOMANDA','DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN'];
const emptyCounts=()=>Object.fromEntries(COUNTERS.map(k=>[k,0]));
function hold(code){
 return {schema:'deliveryos.ten-v68-note-scope-audit.v1',status:'HOLD',reason:code,
 files_verified:0,source_text_emitted:false,counts:emptyCounts(),
 orders_with_general_note:0,orders_with_item_note:0,notes_total:0,
 human_relevance_review_pending:true,v68_authorized:false,print_authorized:false,
 effects:NO_EFFECTS};
}
function readLeaf(dir,name){
 if(!path.isAbsolute(dir)||fs.lstatSync(dir).isSymbolicLink()||
   !fs.statSync(dir).isDirectory())throw Error('SOURCE_LOCATION_UNSAFE');
 const file=path.join(dir,name),s=fs.lstatSync(file);
 if(s.isSymbolicLink()||!s.isFile()||s.size<1||s.size>1048576)throw Error('SOURCE_FILE_UNSAFE');
 return fs.readFileSync(file);
}
function findExact(dir,snap,decision){
 if(!hex(snap))throw Error('SNAPSHOT_INVALID');
 const ending=decision?'.decision.json':'.json';
 const pattern=new RegExp('^[0-9]{10}_'+snap+ending.replace(/\./g,'\\.')+'$','i');
 const matches=fs.readdirSync(dir).filter(n=>pattern.test(n));
 if(matches.length!==1)throw Error('EXACT_SOURCE_MISSING_OR_AMBIGUOUS');
 return matches[0];
}
function inspect(manifest,eventDir,decisionDir){
 try{
  if(manifest?.schema!=='tata-comandas-private-ten-original-pair-evidence.v2'||
     !Array.isArray(manifest.ten_cases)||manifest.ten_cases.length!==10)
   throw Error('MANIFEST_INVALID');
  const cases=manifest.ten_cases,seen=new Set(),counts=emptyCounts();
  let general=0,item=0,total=0;
  for(const c of cases){
   if(!hex(c?.snapshot_hash)||!hex(c.event_file_sha256)||
      !hex(c.legacy_decision_file_sha256)||
      c.legacy_decision_ready!==false||
      JSON.stringify(c.legacy_blockers)!=='["BAG_SIZE_NOT_FACT"]'||
      !Number.isSafeInteger(c.observation_rows)||c.observation_rows<0)
    throw Error('CASE_INVALID');
   const snapshot=c.snapshot_hash.toLowerCase();
   if(seen.has(snapshot))throw Error('DUPLICATE_SNAPSHOT');
   seen.add(snapshot);
   const eventBytes=readLeaf(eventDir,findExact(eventDir,snapshot,false));
   const legacyBytes=readLeaf(decisionDir,findExact(decisionDir,snapshot,true));
   if(hash(eventBytes)!==c.event_file_sha256.toLowerCase()||
      hash(legacyBytes)!==c.legacy_decision_file_sha256.toLowerCase())
    throw Error('ORIGINAL_BYTES_CHANGED');
   const ev=JSON.parse(eventBytes.toString('utf8').replace(/^\uFEFF/,'')),
         v1=JSON.parse(legacyBytes.toString('utf8').replace(/^\uFEFF/,''));
   if(ev.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
      v1.schema!=='deliveryos.live-shadow-decision.v1'||
      ev.snapshot_hash?.toLowerCase()!==snapshot||
      v1.snapshot_hash?.toLowerCase()!==snapshot||
      ev.order_key!==v1.order_key||
      watcherHash(ev)!==snapshot||!Array.isArray(ev.order?.observation_rows)||
      ev.order.observation_scan_complete!==true||
      ev.order.observation_rows.length!==c.observation_rows||
      v1.ready!==false||JSON.stringify(v1.blocking_reasons)!=='["BAG_SIZE_NOT_FACT"]')
    throw Error('ORIGINAL_EVENT_DECISION_INTEGRITY_INVALID');
   let withGeneral=false,withItem=false;const unique=new Set();let orderNote=0;
   for(const note of ev.order.observation_rows){
    if(note?.join_proven!==true||typeof note.value!=='string'||!note.value.trim()||
      note.value!==note.value.trim()||!COUNTERS.includes(note.source_field))
     throw Error('OBSERVATION_NOT_VERIFIED');
    if(note.scope_hint==='order'){
     if(note.source_field!=='DSOBSCOMANDA'||++orderNote>1)
       throw Error('ORDER_NOTE_SCOPE_INVALID');
     withGeneral=true;
    }else if(note.scope_hint==='item'){
     if(note.source_field==='DSOBSCOMANDA'||
        !Number.isSafeInteger(note.item_index)||
        note.item_index<0||note.item_index>=ev.order.items.length||
        note.CDPRODUTO!==ev.order.items[note.item_index].CDPRODUTO)
       throw Error('ITEM_NOTE_SOURCE_NOT_PAIRED');
     const uniq=note.item_index+'|'+note.source_field;
     if(unique.has(uniq))throw Error('ITEM_NOTE_DUPLICATE');
     unique.add(uniq);withItem=true;
    }else throw Error('UNKNOWN_NOTE_SCOPE');
    counts[note.source_field]++;total++;
   }
   if(withGeneral)general++;if(withItem)item++;
  }
  return {schema:'deliveryos.ten-v68-note-scope-audit.v1',
    status:general?'REVIEW_REQUIRED_FOR_GENERAL_NOTES':'NO_GENERAL_NOTES_V68_STILL_UNPROVEN',
    reason:general?'V68_GENERAL_NOTE_RELEVANCE_NOT_PROVEN':'INDEPENDENT_V68_JOIN_STILL_REQUIRED',
    files_verified:20,source_text_emitted:false,
    counts,orders_with_general_note:general,orders_with_item_note:item,
    notes_total:total,human_relevance_review_pending:general>0,
    v68_authorized:false,print_authorized:false,effects:NO_EFFECTS};
 }catch{return hold('MISSING_OR_CHANGED_OR_UNVERIFIABLE_SOURCE')}
}
if(require.main===module){
 const args=process.argv.slice(2);
 let res=hold('EXPLICIT_LOCAL_INPUT_REQUIRED');
 if(args.length===3){
  try{
   const b=readLeaf(path.dirname(args[0]),path.basename(args[0]));
   if(b.length>128000)throw Error('MANIFEST_TOO_LARGE');
   res=inspect(JSON.parse(b.toString('utf8')),args[1],args[2]);
  }catch{res=hold('MISSING_OR_CHANGED_OR_UNVERIFIABLE_SOURCE')}
 }
 console.log(JSON.stringify(res));process.exitCode=res.files_verified===20?0:2;
}
module.exports={inspect,NO_EFFECTS};

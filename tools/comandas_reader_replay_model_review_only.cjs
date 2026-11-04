'use strict';
/**
 * IN-MEMORY COUNTEREXAMPLE MODEL of the PR135 REVIEW_ONLY Reader V2.
 * This is not a deployed watcher, durable store, source receipt, or migration.
 * Reproduces explicitly inspected branches: bootstrap suppression, stable=2,
 * dedupe by emitted_hash, file keyed by order+hash, and checkpoint top 250.
 * Every analysis refuses an operational conclusion.
 */
const {createHash}=require('node:crypto');
const SCHEMA='tata.comandas.reader-replay-model-review.v1';
const h=s=>createHash('sha256').update(String(s),'utf8').digest('hex');
function model({stablePolls=2,emitOnBootstrap=false}={}){
  if(!Number.isSafeInteger(stablePolls)||stablePolls<2||stablePolls>10)throw Error('INVALID_POLL_WINDOW');
  return {bootstrapComplete:false,emitOnBootstrap,stablePolls,
    seen:new Map(),files:new Map(),persisted:null,checkpointSequence:0,
    writes:[],suppressions:[],observations:[],saveHistory:[]};
}
function key(i){return '0001|01|LABSALE'+i+'|LABCMD'+i}
function filename(i,hash){return 'LABCMD'+i+'_'+hash+'.json'}
function observe(m,{id,hash,revision,orderTime=id,failAfterEventWrite=false}){
  if(!Number.isSafeInteger(id)||id<1||id>100000||typeof hash!=='string'||
    !/^[a-f0-9]{64}$/.test(hash)||typeof revision!=='string')throw Error('INVALID_SYNTHETIC_OBSERVATION');
  const k=key(id),f=filename(id,hash);let e=m.seen.get(k);
  if(!e){const base=!m.bootstrapComplete&&!m.emitOnBootstrap?hash:null;
    e={key:k,snapshot_hash:hash,emitted_hash:base,stable_count:1,last_seen_order_time:orderTime};
    m.seen.set(k,e);
  }else if(e.snapshot_hash===hash){e.stable_count++;e.last_seen_order_time=orderTime;
  }else{e.snapshot_hash=hash;e.stable_count=1;e.last_seen_order_time=orderTime;}
  m.observations.push({id,hash,revision});
  const eligible=m.bootstrapComplete||m.emitOnBootstrap;
  if(eligible&&e.stable_count>=m.stablePolls){
    if(e.emitted_hash===hash){m.suppressions.push({id,hash,revision,reason:'EMITTED_HASH_EQUAL'});
    }else{
      if(!m.files.has(f)){
        m.files.set(f,{id,hash,firstRevision:revision,bytes_hash:h(id+'|'+hash+'|'+revision)});
        m.writes.push({id,hash,revision,filename:f});
      }else m.suppressions.push({id,hash,revision,reason:'EXISTING_FILENAME'});
      if(failAfterEventWrite)throw Error('SYNTHETIC_CRASH_AFTER_FILE_BEFORE_CHECKPOINT');
      e.emitted_hash=hash;
    }
  }
  return e;
}
function persist(m){
  m.bootstrapComplete=true;
  const entries=[...m.seen.values()].sort((a,b)=>b.last_seen_order_time-a.last_seen_order_time).slice(0,250);
  m.persisted={bootstrapComplete:true,entries:entries.map(x=>({...x}))};
  m.checkpointSequence++;
  m.saveHistory.push({seq:m.checkpointSequence,entryCount:entries.length,ramCount:m.seen.size});
  return m.persisted;
}
function checkpointCopy(m){return m.persisted&&JSON.parse(JSON.stringify(m.persisted))}
function restart(m,checkpoint=checkpointCopy(m)){
  if(!checkpoint||!Array.isArray(checkpoint.entries))throw Error('CHECKPOINT_UNAVAILABLE');
  m.seen=new Map(checkpoint.entries.map(e=>[e.key,{...e}]));
  m.bootstrapComplete=checkpoint.bootstrapComplete;
  m.persisted=JSON.parse(JSON.stringify(checkpoint));
  return m;
}
function deleteFile(m,id,hash){return m.files.delete(filename(id,hash))}
function audit(m){
  return Object.freeze({schema:SCHEMA,status:'HOLD',
    observed:m.observations.length,eventWrites:m.writes.length,
    persistedFiles:m.files.size,checkpointEntries:m.persisted?.entries.length??null,
    unknownNativeRevisions:true,noLossProven:false,noReemitProven:false,
    migrationAuthorized:false,printAuthorized:false,
    effects:Object.freeze({sql:false,service:false,filesystem:false,network:false,print:false,sequence:false})});
}
module.exports={model,key,filename,observe,persist,checkpointCopy,restart,deleteFile,audit,h,SCHEMA};

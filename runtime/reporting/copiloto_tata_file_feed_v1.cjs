'use strict';
// Server-side library only. Caller owns authenticated unit and trusted source provenance.
// No HTTP route, watcher, cursor mutation, permission grant or source-mode inference.
const fs=require('node:fs'),path=require('node:path');
const {adaptStableTataOrderV1}=require('./copiloto_tata_reader_adapter_v1.cjs');
const {projectTataOrdersForCopilotV1}=require('./copiloto_tata_orders_v1.cjs');
const {explicitInstant}=require('./tata_source_time_v1.cjs');
function readTataFileFeed({root,scope,now,maxAgeMs,maxFiles=250,maxBytes=8*1024*1024,selection='checkpoint'}){
  const common={schema:'deliveryos.copiloto-tata-file-feed.v1',live_source_verified:false,
    operational_order_total:null,no_action_executed:true,coverage:selection==='checkpoint'?'producer_checkpoint_observations_not_active_order_inventory':'bounded_directory_observations_not_active_order_inventory'};
  const denied=reason=>({...common,state:'unavailable',reason,view:null});
  if(!scope||!['unitId','sourceUnitId','sourceStoreId','mappingEvidenceRef'].every(k=>typeof scope[k]==='string'&&scope[k].trim())||
      !['real','control','simulated'].includes(scope.sourceMode))return denied('SOURCE_CONFIGURATION_REQUIRED');
  if(!explicitInstant(now)||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<=0||
    !Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>1000||
    !Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>32*1024*1024)return denied('BOUNDED_READ_POLICY_REQUIRED');
  if(typeof root!=='string'||!path.isAbsolute(root))return denied('TRUSTED_ABSOLUTE_ROOT_REQUIRED');
  if(!['checkpoint','directory'].includes(selection))return denied('SOURCE_SELECTION_INVALID');
  const directory=path.join(root,'state','reader-events-v1'),files=[],revisions=[],readStats=[];
  let handle,bytes=0,ignoredHistorical=0;
  try{
    for(const p of [root,path.join(root,'state'),directory]){
      const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(p)!==path.resolve(p))return denied('SOURCE_PATH_INVALID');
    }
    const beforeDir=fs.statSync(directory),selected=new Map();let checkpointPath,checkpointRaw;
    if(selection==='checkpoint'){
      checkpointPath=path.join(root,'state','reader-watch-checkpoint-v1.json');
      const st=fs.lstatSync(checkpointPath);
      if(!st.isFile()||st.isSymbolicLink()||st.size>1048576)return denied('SOURCE_CHECKPOINT_INVALID');
      const fd=fs.openSync(checkpointPath,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
      try{const buf=Buffer.alloc(st.size+1),n=fs.readSync(fd,buf,0,buf.length,0);if(n!==st.size)return denied('SOURCE_CHANGED_DURING_READ');checkpointRaw=buf.subarray(0,n).toString('utf8');}finally{fs.closeSync(fd);}
      bytes+=st.size;if(bytes>maxBytes)return denied('SOURCE_READ_BUDGET_EXCEEDED');
      const ck=JSON.parse(checkpointRaw.replace(/^\uFEFF/,''));
      if(ck.schema!=='deliveryos.tata-reader-continuous-checkpoint.v1'||ck.bootstrap_complete!==true||!Array.isArray(ck.entries)||ck.entries.length>250)return denied('SOURCE_CHECKPOINT_INVALID');
      for(const e of ck.entries){
        if(typeof e?.order_key!=='string'||e.order_key.length>512)return denied('SOURCE_CHECKPOINT_INVALID');
        const k=e.order_key.split('|');if(k.length!==4||k.some(v=>!v))return denied('SOURCE_CHECKPOINT_INVALID');
        if(k[0]!==scope.sourceUnitId||k[1]!==scope.sourceStoreId)continue;
        if(typeof e.snapshot_hash!=='string'||!/^[A-Fa-f0-9]{64}$/.test(e.snapshot_hash)||e.emitted_hash!==e.snapshot_hash||!Number.isInteger(e.stable_count)||e.stable_count<1)return denied('SOURCE_REVISION_PENDING');
        const file=path.join(directory,k[3].replace(/[^0-9A-Za-z_-]/g,'_')+'_'+e.snapshot_hash+'.json');
        if(selected.has(file))return denied('SOURCE_CHECKPOINT_CONFLICT');
        selected.set(file,{key:e.order_key,hash:e.snapshot_hash,parts:k});files.push(file);
      }
      if(files.length>maxFiles)return denied('SOURCE_READ_BUDGET_EXCEEDED');
    }else{
      handle=fs.opendirSync(directory);let entries=0;
      for(let e;(e=handle.readSync());){
        if(++entries>maxFiles)return denied('SOURCE_READ_BUDGET_EXCEEDED');
        if(!e.isFile()||e.isSymbolicLink()||!/^[A-Za-z0-9_-]+\.json$/.test(e.name))return denied('SOURCE_ENTRY_INVALID');
        files.push(path.join(directory,e.name));
      }
      handle.closeSync();handle=null;
    }
    for(const file of files){
      const pre=fs.lstatSync(file);
      if(!pre.isFile()||pre.isSymbolicLink()||pre.size>1048576||(bytes+=pre.size)>maxBytes)return denied('SOURCE_READ_BUDGET_EXCEEDED');
      let fd;
      let raw;
      try{
        fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
        const opened=fs.fstatSync(fd);
        if(!opened.isFile()||opened.ino!==pre.ino||opened.dev!==pre.dev||opened.size!==pre.size||opened.mtimeMs!==pre.mtimeMs)return denied('SOURCE_CHANGED_DURING_READ');
        // Fixed buffer, even if the file grows after the size check.
        const buf=Buffer.alloc(pre.size+1);const read=fs.readSync(fd,buf,0,buf.length,0);
        const post=fs.fstatSync(fd);
        if(read!==pre.size||post.size!==pre.size||post.mtimeMs!==pre.mtimeMs)return denied('SOURCE_CHANGED_DURING_READ');
        raw=buf.subarray(0,read).toString('utf8');
      }finally{if(fd!==undefined)fs.closeSync(fd);}
      readStats.push({file,pre});
      const event=JSON.parse(raw.replace(/^\uFEFF/,''));
      if(event?.schema!=='deliveryos.tata-reader-stable-order-event.v1'||!event.order||
        typeof event.order.CDFILIAL!=='string'||typeof event.order.CDLOJA!=='string')return denied('SOURCE_EVENT_INVALID');
      const expected=selected.get(file);
      if(expected&&(event.order_key!==expected.key||event.snapshot_hash!==expected.hash||[event.order.CDFILIAL,event.order.CDLOJA,event.order.NRVENDAREST,event.order.NRCOMANDA].some((v,i)=>v!==expected.parts[i])))return denied('SOURCE_CHECKPOINT_EVENT_MISMATCH');
      if(event.order.CDFILIAL!==scope.sourceUnitId||event.order.CDLOJA!==scope.sourceStoreId)continue;
      if(!explicitInstant(event.observed_at))return denied('SOURCE_OBSERVATION_INVALID');
      const age=Date.parse(now)-Date.parse(event.observed_at);
      if(age<0)return denied('SOURCE_FUTURE_OBSERVATION');
      if(age>maxAgeMs){ignoredHistorical++;continue;}
      const adapted=adaptStableTataOrderV1(event,scope);
      // A rejected current revision must not silently leave an older order visible.
      if(adapted.state!=='adapted')return denied('SOURCE_CURRENT_REVISION_BLOCKED');
      revisions.push(adapted.revision);
    }
    for(const {file,pre} of readStats){
      const post=fs.lstatSync(file);
      if(!post.isFile()||post.isSymbolicLink()||post.ino!==pre.ino||post.dev!==pre.dev||post.size!==pre.size||post.mtimeMs!==pre.mtimeMs)return denied('SOURCE_CHANGED_DURING_READ');
    }
    if(checkpointPath){
      const st=fs.lstatSync(checkpointPath);
      if(!st.isFile()||st.isSymbolicLink()||st.size!==Buffer.byteLength(checkpointRaw))return denied('SOURCE_CHANGED_DURING_READ');
      const fd=fs.openSync(checkpointPath,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
      try{const buf=Buffer.alloc(st.size+1),n=fs.readSync(fd,buf,0,buf.length,0);if(n!==st.size||buf.subarray(0,n).toString('utf8')!==checkpointRaw)return denied('SOURCE_CHANGED_DURING_READ');}finally{fs.closeSync(fd);}
    }
    const afterDir=fs.statSync(directory);
    if(beforeDir.mtimeMs!==afterDir.mtimeMs)return denied('SOURCE_CHANGED_DURING_READ');
    const view=projectTataOrdersForCopilotV1({unitId:scope.unitId,sourceUnitId:scope.sourceUnitId,revisions,now,maxAgeMs});
    return {...common,state:view.state,reason:null,filesRead:files.length,ignoredHistorical,view};
  }catch{return denied('SOURCE_UNREADABLE_OR_INVALID');}
  finally{if(handle)handle.closeSync();}
}
module.exports={readTataFileFeed};

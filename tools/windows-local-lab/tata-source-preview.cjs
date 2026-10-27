'use strict';
// Bounded metadata preview. Never returns order/customer content or mutates the reader.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function previewTataSource({root,binding,hostName,limit=20}) {
  if (!binding || binding.schema!=='deliveryos.tata-source-binding.v1' ||
      typeof binding.hostName!=='string' || binding.hostName.toUpperCase()!==hostName.toUpperCase() ||
      binding.unitId!=='ITAIM' || !binding.evidence || binding.publishEnabled!==false ||
      ![binding.sourceUnitId,binding.sourceStoreId].every(x=>typeof x==='string'&&x.trim()))
    throw Error('SOURCE_BINDING_INVALID');
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('BOUNDED_SAMPLE_REQUIRED');
  const receipt={schema:'deliveryos.tata-source-preview.v1',observedAtUtc:new Date().toISOString(),
    unitId:binding.unitId,sourceBindingConfirmed:true,publishEnabled:false,
    sampleLimit:limit,sampleSelection:'bounded_directory_window_not_current_order_inventory',
    sampledFiles:0,scopeMatches:0,scopeMismatches:0,invalidFiles:0,unreadableFiles:0,
    producerAllowsDownstream:0,producerBlocksDownstream:0,blockers:{},serviceState:null,servicePolicy:{state:'not_configured'},
    sourceMode:binding.sourceMode??null,liveSourceVerified:false,operationalOrderTotal:null};
  function read(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>1048576)throw Error('SIGNAL_INVALID');
    return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
  try {const s=read(path.join(root,'state','production-service-state.json'));
    receipt.serviceState={schema:s.schema==='deliveryos.production-service-shift-state.v2'?s.schema:null,
      operationalDate:/^\d{4}-\d{2}-\d{2}$/.test(s.operational_date)?s.operational_date:null,
      validFromLocal:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s.valid_from_local)?s.valid_from_local:null,
      validUntilLocal:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s.valid_until_local)?s.valid_until_local:null,
      service:['LUNCH','DINNER'].includes(s.service)?s.service:null};
  }catch{receipt.serviceState={state:'missing_or_invalid'};}
  const policyPath=path.join(root,'bin','production-service-weekly-policy.json');
  try {const p=read(policyPath),seen=new Set();
    if(p.schema!=='deliveryos.production-service-weekly-policy.v1'||p.enabled!==true||p.clock_inference_used!==false||
       p.unit_id!==binding.unitId||p.source_unit_id!==binding.sourceUnitId||p.source_store_id!==binding.sourceStoreId||
       p.host_name!==hostName||p.timezone!=='America/Sao_Paulo'||p.order_time_basis!=='NATIVE_DTHRABERMESA_LOCAL'||
       p.boundary!=='START_INCLUSIVE_END_EXCLUSIVE'||p.evidence!=='HUMAN_CONFIRMED_RULE'||
       typeof p.source_ref!=='string'||!p.source_ref.trim()||typeof p.policy_version!=='string'||!p.policy_version.trim()||
       !/^\d{4}-\d{2}-\d{2}$/.test(p.effective_from)||p.effective_until!==null||
       !Array.isArray(p.week)||p.week.length!==7)throw Error('INVALID_POLICY');
    if(new Date(p.effective_from+'T00:00:00Z').toISOString().slice(0,10)!==p.effective_from)throw Error('INVALID_DATE');
    const week=p.week.map(d=>{
      if(!Number.isInteger(d.day_of_week)||d.day_of_week<0||d.day_of_week>6||seen.has(d.day_of_week)||
         !Array.isArray(d.windows)||d.windows.length!==2)throw Error('INVALID_DAY');
      seen.add(d.day_of_week);let end='00:00';const services=new Set();
      return {dayOfWeek:d.day_of_week,windows:d.windows.map(w=>{
        if(!['LUNCH','DINNER'].includes(w.service)||services.has(w.service)||
           !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(w.start)||
           !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(w.end)||w.start>=w.end||w.start<end)throw Error('INVALID_WINDOW');
        services.add(w.service);end=w.end;return {service:w.service,start:w.start,end:w.end};
      })};
    });
    receipt.servicePolicy={state:'configured',effectiveFrom:p.effective_from,
      timezone:'America/Sao_Paulo',boundary:'START_INCLUSIVE_END_EXCLUSIVE',week};
  }catch{if(fs.existsSync(policyPath))receipt.servicePolicy={state:'invalid'};}
  const dir=path.join(root,'state','reader-events-v1');
  const files=[];let handle;
  try { handle=fs.opendirSync(dir);let scanned=0;
    while(files.length<limit&&scanned<limit*3){const entry=handle.readSync();if(!entry)break;scanned++;
      if(entry.isFile()&&!entry.isSymbolicLink()&&/^[A-Za-z0-9_-]+\.json$/.test(entry.name))files.push({p:path.join(dir,entry.name)});}
  }catch{receipt.state='source_unavailable';return receipt;}
  finally{if(handle)handle.closeSync();}
  for(const {p} of files){
    receipt.sampledFiles++;let e;try{e=read(p);}catch{receipt.unreadableFiles++;continue;}
    if(e?.schema!=='deliveryos.tata-reader-stable-order-event.v1'||!e.order||
       typeof e.order.CDFILIAL!=='string'||typeof e.order.CDLOJA!=='string'){
      receipt.invalidFiles++;continue;}
    if(e.order.CDFILIAL!==binding.sourceUnitId||e.order.CDLOJA!==binding.sourceStoreId){receipt.scopeMismatches++;continue;}
    receipt.scopeMatches++;
    if(e.ready_for_downstream_shadow===true&&Array.isArray(e.blockers)&&e.blockers.length===0&&
       Array.isArray(e.service_resolution?.blockers)&&e.service_resolution.blockers.length===0)
      receipt.producerAllowsDownstream++;
    else receipt.producerBlocksDownstream++;
    // Never echo unknown codes/text: it can contain identifiers or customer information.
    const known=new Set(['SERVICE_STATE_DATE_MISMATCH_ORDER_DATE','SERVICE_STATE_EXPIRED_FOR_ORDER',
      'SERVICE_STATE_MISSING','SERVICE_STATE_SCHEMA_MISMATCH','SERVICE_STATE_EVIDENCE_REQUIRED',
      'SERVICE_STATE_VALID_UNTIL_REQUIRED','SERVICE_STATE_STORE_MISMATCH','SERVICE_STATE_READ_FAILED']);
    for(const c of ['SERVICE_WEEKLY_POLICY_INVALID','SERVICE_WEEKLY_POLICY_MISSING','SERVICE_WEEKLY_POLICY_NOT_EFFECTIVE',
      'SERVICE_NATIVE_LOCAL_TIME_REQUIRED','SERVICE_HOURS_OUTSIDE_WINDOW'])known.add(c);
    const codes=new Set([...(Array.isArray(e.blockers)?e.blockers:[]),
      ...(Array.isArray(e.service_resolution?.blockers)?e.service_resolution.blockers:[])]);
    for(const code of codes){const key=known.has(code)?code:'OTHER_SOURCE_BLOCKER';receipt.blockers[key]=(receipt.blockers[key]||0)+1;}
  }
  receipt.state=receipt.scopeMismatches||receipt.invalidFiles||receipt.unreadableFiles?'review_required'
    :receipt.producerBlocksDownstream?'source_blocked':receipt.scopeMatches?'sample_observed':'no_evidence';
  return receipt;
}
if(require.main===module){try{
  const binding=JSON.parse(fs.readFileSync(path.join(__dirname,'tata-source-binding.json'),'utf8'));
  const receipt=previewTataSource({root:'C:\\ProgramData\\TataComandaReader',binding,hostName:os.hostname()});
  fs.writeFileSync(path.join(__dirname,'tata-source-preview-proof.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt));
}catch(e){console.error('SOURCE_PREVIEW_REFUSED',e.message);process.exitCode=1;}}
module.exports={previewTataSource};

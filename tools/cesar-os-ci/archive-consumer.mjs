// Bounded, public GitHub Actions archive consumer - planning only, no database writes.
// Importing this module does not run code, schedule jobs, publish files, or call GitHub.
import {createHash} from 'node:crypto';
import {archivePathFor} from './archive.mjs';
import {requestJson} from './snapshot.mjs';

export const REPO='cesarspichencoff-cmyk/delviery-os';
export const REPO_ID='1279837591';
export const OWNER_ID='292320191';
export const SOURCE='github-actions-public-deliveryos';
export const SNAPSHOT_BRANCH='cesar-os-ci-snapshots';
export const MAX_DAYS=7, MAX_ARCHIVES=200, MAX_RECONCILE=20;
const DAY_MS=86400000;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA=/^[a-f0-9]{40}$/;
const STATUS=new Set(['queued','in_progress','completed','waiting','requested','pending']);
const CONCLUSION=new Set([null,'success','failure','cancelled','skipped','neutral','timed_out','action_required','stale','startup_failure']);
const assert=(condition,error)=>{if(!condition)throw Error(error);};
const stamp=(date)=>{
  assert(typeof date==='string'&&ISO.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString()===date,'invalid_utc_iso');
  return Date.parse(date);
};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pathForDay=date=>'ci-snapshots/deliveryos/archive/'+date.slice(0,4)+'/'+date.slice(5,7)+'/'+date.slice(8,10);
const API='https://api.github.com/repos/'+REPO;

export function verifyHorizon(start,end,{now=new Date()}={}){
  const a=stamp(start), b=stamp(end), n=now.getTime();
  assert(a<b&&b-a<=MAX_DAYS*DAY_MS&&b<=n+60000,'archive_horizon_invalid');
  return {start,end,startMs:a,endMs:b};
}

export function validateArchive(snapshot,expectedPath){
  const path=archivePathFor(snapshot); // existing producer identity/limits validator
  assert(path===expectedPath,'archive_path_mismatch');
  assert(String(snapshot.repository_id)===REPO_ID&&String(snapshot.repository_owner_id)===OWNER_ID,'archive_identity_mismatch');
  assert(snapshot.raw_payload_persisted===false&&snapshot.possible_commitment===false&&
    snapshot.continuity_complete===false&&snapshot.lifecycle_updates_complete===false,
    'archive_overclaimed');
  const start=stamp(snapshot.window_start),end=stamp(snapshot.window_end);
  const ids=new Set();
  for(const r of snapshot.records){
    assert(Number.isSafeInteger(r?.id)&&r.id>0&&!ids.has(r.id)&&
      typeof r.workflow==='string'&&r.workflow.length>0&&r.workflow.length<=100&&
      typeof r.branch==='string'&&r.branch.length>0&&r.branch.length<=130&&
      !/[\x00-\x1f\x7f]/.test(r.workflow+r.branch)&&
      STATUS.has(r.status)&&CONCLUSION.has(r.conclusion)&&
      (r.conclusion===null||r.status==='completed'), 'archive_run_invalid');
    ids.add(r.id);
    const created=Date.parse(r.created_at),updated=Date.parse(r.updated_at);
    assert(Number.isFinite(created)&&Number.isFinite(updated)&&created>=start-1000&&created<=end+1000&&
      updated>=created&&updated<=end+60000,'archive_run_time_invalid');
  }
  return {path,hash:digest(snapshot),snapshot};
}

export function checkpointShape(value){
  if(value==null)return {schema:'cesar-os-ci-replay-cursor-v1',source_id:SOURCE,revision:0,reconcile_offset:0,archives:{}};
  assert(value.schema==='cesar-os-ci-replay-cursor-v1'&&value.source_id===SOURCE&&
    Number.isSafeInteger(value.revision)&&value.revision>=0&&
    Number.isSafeInteger(value.reconcile_offset??0)&&(value.reconcile_offset??0)>=0&&
    value.archives&&typeof value.archives==='object'&&!Array.isArray(value.archives),'cursor_invalid');
  const entries=Object.entries(value.archives);
  assert(entries.length<=MAX_ARCHIVES,'cursor_too_many_archives');
  for(const [p,h] of entries){
    assert(/^ci-snapshots\/deliveryos\/archive\/\d{4}\/\d{2}\/\d{2}\/\d{8}T\d{9}Z\.json$/.test(p)&&
      /^[a-f0-9]{64}$/.test(h),'cursor_archive_invalid');
  }
  return {schema:value.schema,source_id:SOURCE,revision:value.revision,reconcile_offset:value.reconcile_offset??0,archives:{...value.archives}};
}

// Pure recovery plan: never claims full source/lifecycle coverage.
export function planReplay(archives,{start,end,cursor=null,now=new Date()}={}){
  const hz=verifyHorizon(start,end,{now});
  assert(Array.isArray(archives)&&archives.length<=MAX_ARCHIVES,'archive_count_invalid');
  const prev=checkpointShape(cursor);
  const byPath=new Map();
  for(const {path,snapshot} of archives){
    const verified=validateArchive(snapshot,path);
    const other=byPath.get(path);
    assert(!other||other.hash===verified.hash,'archive_path_collision');
    byPath.set(path,verified);
  }
  const sorted=[...byPath.values()].sort((a,b)=>a.snapshot.window_start.localeCompare(b.snapshot.window_start)||a.path.localeCompare(b.path));
  let bound=hz.startMs;
  const gaps=[],states=new Map();
  const kept={};
  let newArchives=0;
  for(const record of sorted){
    const {path,snapshot:s,hash}=record;
    const p=prev.archives[path];
    assert(!p||p===hash,'archive_changed_since_checkpoint');
    // Windows outside the requested horizon are deliberately excluded from this replay.
    const left=Math.max(stamp(s.window_start),hz.startMs),right=Math.min(stamp(s.window_end),hz.endMs);
    if(left>=right)continue;
    if(left>bound)gaps.push({start:new Date(bound).toISOString(),end:new Date(left).toISOString(),reason:'NO_ARCHIVED_EVIDENCE'});
    bound=Math.max(bound,right);
    kept[path]=hash;
    if(!p)newArchives++;
    for(const run of s.records){
      const existing=states.get(run.id),updated=Date.parse(run.updated_at);
      if(!existing||updated>Date.parse(existing.updated_at))states.set(run.id,run);
      else if(updated===Date.parse(existing.updated_at)&&
        (run.status!==existing.status||run.conclusion!==existing.conclusion))throw Error('same_update_conflicting_state');
    }
  }
  if(bound<hz.endMs)gaps.push({start:new Date(bound).toISOString(),end,reason:'NO_ARCHIVED_EVIDENCE'});
  assert(Object.keys(kept).length<=MAX_ARCHIVES,'cursor_overflow');
  const runs=[...states.values()].sort((a,b)=>
    Number(a.status==='completed')-Number(b.status==='completed')||a.updated_at.localeCompare(b.updated_at)||a.id-b.id);
  const count=Math.min(MAX_RECONCILE,runs.length);
  const offset=runs.length?prev.reconcile_offset%runs.length:0;
  const reconcile_ids=Array.from({length:count},(_,i)=>runs[(offset+i)%runs.length].id);
  return {
    schema:'cesar-os-ci-replay-plan-v1',source_id:SOURCE,
    horizon:{start,end},archives_seen:sorted.length,archives_new:newArchives,
    coverage:{status:gaps.length?'GAPS_DETECTED':runs.length?'BOUNDED_OBSERVED':'BOUNDED_EMPTY',gaps,
      continuity_complete:false,lifecycle_updates_complete:false,coverage_complete_claimed:false},
    records:runs.map(r=>({...r,source_claim_only:true,possible_commitment:false})),
    reconcile_ids,reconcile_deferred:Math.max(0,runs.length-count),
    cursor:{schema:prev.schema,source_id:SOURCE,revision:prev.revision+1,reconcile_offset:runs.length?(offset+count)%runs.length:0,archives:kept},
    expected_previous_revision:prev.revision,
    external_effect_authorized:false,db_writes:0
  };
}

// GitHub Contents API discovery, bounded to seven calendar days / 200 archive files.
// Result is evidence; missing days are not interpreted as empty CI windows.
export async function discoverArchiveEvidence(token,{start,end,now=new Date(),fetchFn=fetch}={}){
  const hz=verifyHorizon(start,end,{now});
  assert(typeof token==='string'&&token.length>=30,'github_token_missing');
  const get=(path)=>requestJson(API+path,{token,fetchFn});
  const first=Math.floor(hz.startMs/DAY_MS)*DAY_MS;
  const last=Math.floor((hz.endMs-1)/DAY_MS)*DAY_MS;
  const found=[],daysMissing=[];
  for(let t=first;t<=last;t+=DAY_MS){
    const day=new Date(t).toISOString().slice(0,10),directory=pathForDay(day);
    const result=await get('/contents/'+directory+'?ref='+SNAPSHOT_BRANCH);
    if(result.status===404){daysMissing.push(day);continue;}
    assert(result.status===200&&Array.isArray(result.value)&&result.value.length<=100,
      'archive_directory_invalid');
    for(const item of result.value){
      assert(item.type==='file'&&typeof item.path==='string'&&item.path.startsWith(directory+'/')&&
        /^\d{8}T\d{9}Z\.json$/.test(item.name)&&item.path===directory+'/'+item.name&&
        SHA.test(item.sha),'archive_listing_untrusted');
      found.push({path:item.path,sha:item.sha});
    }
  }
  assert(found.length<=MAX_ARCHIVES,'archive_discovery_overflow');
  const seen=new Set(),snapshots=[];
  for(const item of found){
    assert(!seen.has(item.path),'archive_listing_duplicate');seen.add(item.path);
    const response=await get('/contents/'+item.path+'?ref='+SNAPSHOT_BRANCH);
    assert(response.status===200&&response.value?.sha===item.sha&&
      response.value.encoding==='base64'&&typeof response.value.content==='string'&&
      response.value.content.length<=140000,'archive_content_invalid');
    const bytes=Buffer.from(response.value.content.replace(/\s/g,''),'base64');
    assert(bytes.length<=100000,'archive_content_oversized');
    let snapshot;
    try{snapshot=JSON.parse(bytes.toString('utf8'));}catch{throw Error('archive_json_invalid');}
    validateArchive(snapshot,item.path);
    snapshots.push({path:item.path,snapshot});
  }
  return {snapshots,days_missing:daysMissing,source_id:SOURCE,complete_claimed:false};
}

// DeliveryOS CI public snapshot producer. No private data, PAT, or raw API persistence.
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import {archiveSnapshot} from './archive.mjs';

export const REPO='cesarspichencoff-cmyk/delviery-os';
export const REPO_ID='1279837591';
export const OWNER_ID='292320191';
export const SNAPSHOT_BRANCH='cesar-os-ci-snapshots';
export const SNAPSHOT_PATH='ci-snapshots/deliveryos/latest.json';
export const MAX_RUNS=100;
const SOURCE='github-actions-public-deliveryos';
const API='https://api.github.com';
const STATUSES=new Set(['queued','in_progress','completed','waiting','requested','pending']);
const CONCLUSIONS=new Set([null,'success','failure','cancelled','skipped','neutral','timed_out','action_required','stale','startup_failure']);
const safeText=(x,n)=>String(x||'unknown').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,n);
const ms=x=>Date.parse(x);

export function verifyContext(env) {
  if(env.GITHUB_REPOSITORY!==REPO || String(env.GITHUB_REPOSITORY_ID)!==REPO_ID ||
     String(env.GITHUB_REPOSITORY_OWNER_ID)!==OWNER_ID ||
     env.GITHUB_REF!=='refs/heads/main' ||
     !['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) ||
     !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'') ||
     typeof env.GITHUB_TOKEN!=='string' || env.GITHUB_TOKEN.length<30)
    throw Error('untrusted_workflow_context');
  return {repository:REPO,sha:env.GITHUB_SHA};
}
export function windowFor(now=new Date()){
  if(!Number.isFinite(now.getTime()))throw Error('invalid_clock');
  return {start:new Date(now.getTime()-3600000).toISOString(),end:now.toISOString()};
}
export function makeSnapshot(runs, total, win){
  if(!Array.isArray(runs)||!Number.isSafeInteger(total)||total<0||
     total>MAX_RUNS||runs.length!==total)throw Error('incomplete_run_window');
  if(!Number.isFinite(ms(win.start))||!Number.isFinite(ms(win.end))||
     ms(win.end)-ms(win.start)!==3600000)throw Error('window_invalid');
  const seen=new Set(), rows=[];
  for(const r of runs){
    if(!Number.isSafeInteger(r?.id)||r.id<1 ||
       r.repository?.full_name!==REPO ||
       !STATUSES.has(r.status)||!CONCLUSIONS.has(r.conclusion)||
       (r.conclusion!==null&&r.status!=='completed')||
       !Number.isFinite(ms(r.created_at))||!Number.isFinite(ms(r.updated_at))||
       ms(r.updated_at)<ms(r.created_at)||ms(r.updated_at)>ms(win.end)+60000||
       ms(r.created_at)<ms(win.start)-1000||ms(r.created_at)>ms(win.end)+1000)
      throw Error('run_provenance_invalid');
    if(seen.has(r.id))throw Error('run_duplicate');
    seen.add(r.id);
    rows.push({id:r.id,workflow:safeText(r.name,100),
      branch:safeText(r.head_branch,130),status:r.status,conclusion:r.conclusion,
      created_at:r.created_at,updated_at:r.updated_at});
  }
  rows.sort((a,b)=>a.id-b.id);
  return {schema:'cesar-os-github-public-ci-snapshot-v1',
    source_id:SOURCE,repository:REPO,repository_id:REPO_ID,
    repository_owner_id:OWNER_ID,generated_at:win.end,
    window_start:win.start,window_end:win.end,
    record_count:total,coverage_status:total?'BOUNDED_OBSERVED':'BOUNDED_EMPTY',
    collection_basis:'RUN_CREATED_AT',lifecycle_updates_complete:false,
    continuity_complete:false,coverage_complete_claimed:false,raw_payload_persisted:false,
    possible_commitment:false,records:rows};
}
function endpoint(path){return API+'/repos/'+REPO+path}
export async function requestJson(url,{token,method='GET',body,fetchFn=fetch}={}){
  if(typeof url!=='string'||!url.startsWith(API+'/repos/'+REPO+'/'))
    throw Error('api_target_not_allowed');
  const response=await fetchFn(url,{method,redirect:'manual',
    headers:{accept:'application/vnd.github+json','user-agent':'deliveryos-ci-snapshot/1.0',
      'x-github-api-version':'2022-11-28',authorization:'Bearer '+token,
      ...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  if(!response||response.status>=300&&response.status<400||response.redirected)
    throw Error('github_api_redirect_forbidden');
  if(response.status===404)return {status:404,value:null};
  if(response.status<200||response.status>=300)
    throw Error('github_api_status_'+String(response.status));
  return {status:response.status,value:await response.json()};
}
export async function collect(token,{now=new Date(),fetchFn=fetch}={}){
  const win=windowFor(now),url=new URL(endpoint('/actions/runs'));
  url.searchParams.set('created',win.start.replace(/\.\d+Z$/,'Z')+'..'+win.end.replace(/\.\d+Z$/,'Z'));
  url.searchParams.set('per_page','100');
  url.searchParams.set('page','1');
  const response=await requestJson(url.href,{token,fetchFn});
  if(response.status!==200||!Array.isArray(response.value?.workflow_runs))
    throw Error('github_actions_response_invalid');
  return makeSnapshot(response.value.workflow_runs,response.value.total_count,win);
}
export async function publish(snapshot,ctx,{token,fetchFn=fetch}={}){
  if(snapshot?.schema!=='cesar-os-github-public-ci-snapshot-v1'||
     snapshot?.repository!==REPO||String(snapshot?.repository_id)!==REPO_ID||
     snapshot?.source_id!==SOURCE||snapshot?.collection_basis!=='RUN_CREATED_AT'||
     snapshot?.lifecycle_updates_complete!==false||snapshot?.continuity_complete!==false||
     snapshot?.possible_commitment!==false||
     !Number.isSafeInteger(snapshot.record_count)||snapshot.record_count<0||
     snapshot.record_count>MAX_RUNS||snapshot.records?.length!==snapshot.record_count||
     !/^[a-f0-9]{40}$/.test(ctx?.sha||''))throw Error('publish_contract_invalid');
  // The sole writable target is a fixed file on a fixed dedicated branch.
  const refPath='/git/ref/heads/'+SNAPSHOT_BRANCH;
  const found=await requestJson(endpoint(refPath),{token,fetchFn});
  if(found.status===404){
    const created=await requestJson(endpoint('/git/refs'),{token,method:'POST',
      body:{ref:'refs/heads/'+SNAPSHOT_BRANCH,sha:ctx.sha},fetchFn});
    if(created.status!==201||created.value?.ref!=='refs/heads/'+SNAPSHOT_BRANCH||
       created.value?.object?.sha!==ctx.sha)throw Error('snapshot_branch_receipt_invalid');
  }else if(found.status!==200||found.value?.ref!=='refs/heads/'+SNAPSHOT_BRANCH){
    throw Error('snapshot_ref_invalid');
  }
  const filePath='/contents/'+SNAPSHOT_PATH;
  const existing=await requestJson(endpoint(filePath)+'?ref='+SNAPSHOT_BRANCH,{token,fetchFn});
  if(existing.status!==404&&existing.status!==200)throw Error('snapshot_file_lookup_invalid');
  const data=Buffer.from(JSON.stringify(snapshot)+'\n','utf8').toString('base64');
  const put={message:'chore(ci): update bounded public Actions snapshot',
    content:data,branch:SNAPSHOT_BRANCH};
  if(existing.status===200){
    if(!/^[a-f0-9]{40}$/.test(existing.value?.sha||''))throw Error('snapshot_file_sha_invalid');
    put.sha=existing.value.sha;
  }
  const written=await requestJson(endpoint(filePath),{token,method:'PUT',body:put,fetchFn});
  if(![200,201].includes(written.status)||
     written.value?.content?.path!==SNAPSHOT_PATH||
     !/^[a-f0-9]{40}$/.test(written.value?.content?.sha||'')||
     !/^[a-f0-9]{40}$/.test(written.value?.commit?.sha||''))
    throw Error('snapshot_publish_receipt_invalid');
  return {status:'PUBLISHED',count:snapshot.record_count,branch:SNAPSHOT_BRANCH,
    commit_sha:written.value.commit.sha};
}
export async function main(env=process.env,{fetchFn=fetch,now=new Date()}={}){
  const ctx=verifyContext(env);
  const snapshot=await collect(env.GITHUB_TOKEN,{now,fetchFn});
  const archived=await archiveSnapshot(snapshot,ctx,{token:env.GITHUB_TOKEN,fetchFn,requestJson});
  const latest=await publish(snapshot,ctx,{token:env.GITHUB_TOKEN,fetchFn});
  return {...latest,archive_status:archived.status,archive_path:archived.path};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().then(x=>console.log(JSON.stringify(x))).catch(e=>{
    console.error('deliveryos_snapshot_failed:'+String(e?.message||e).slice(0,120));
    process.exitCode=1;
  });
}

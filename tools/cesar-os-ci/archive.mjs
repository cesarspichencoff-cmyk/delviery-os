// DeliveryOS public CI snapshot archive. Additive, manual-first, no schedule.
// Each valid snapshot is written once to a deterministic, time-addressed file.
// No arbitrary GitHub API target, history overwrite, or completion claim.
import {Buffer} from 'node:buffer';

const REPO='cesarspichencoff-cmyk/delviery-os';
const SOURCE='github-actions-public-deliveryos';
const BRANCH='cesar-os-ci-snapshots';
const PREFIX='ci-snapshots/deliveryos/archive/';
const SHA=/^[a-f0-9]{40}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const archiveJson=s=>JSON.stringify(s)+'\n';

export function archivePathFor(snapshot){
  if(snapshot?.schema!=='cesar-os-github-public-ci-snapshot-v1'||
    snapshot?.source_id!==SOURCE||snapshot?.repository!==REPO||
    snapshot?.collection_basis!=='RUN_CREATED_AT'||
    snapshot?.lifecycle_updates_complete!==false||
    snapshot?.continuity_complete!==false||
    snapshot?.coverage_complete_claimed!==false||
    snapshot?.possible_commitment!==false||
    snapshot?.raw_payload_persisted!==false||
    typeof snapshot.generated_at!=='string'||!ISO.test(snapshot.generated_at)||
    snapshot.window_end!==snapshot.generated_at||
    !Number.isFinite(Date.parse(snapshot.generated_at))||
    !Number.isFinite(Date.parse(snapshot.window_start))||
    Date.parse(snapshot.generated_at)-Date.parse(snapshot.window_start)!==3600000||
    !Number.isSafeInteger(snapshot.record_count)||snapshot.record_count<0||
    snapshot.record_count>100||snapshot.records?.length!==snapshot.record_count||
    snapshot.coverage_status!==(snapshot.record_count?'BOUNDED_OBSERVED':'BOUNDED_EMPTY'))
      throw Error('archive_snapshot_contract_invalid');
  const ts=snapshot.generated_at.replace(/[-:.]/g,'');
  return PREFIX+ts.slice(0,4)+'/'+ts.slice(4,6)+'/'+ts.slice(6,8)+'/'+ts+'.json';
}

export async function archiveSnapshot(snapshot,ctx,{token,fetchFn,requestJson}={}){
  const path=archivePathFor(snapshot);
  if(!SHA.test(ctx?.sha||'')||typeof token!=='string'||token.length<30||
     typeof requestJson!=='function')throw Error('archive_context_invalid');
  const api=part=>'https://api.github.com/repos/'+REPO+part;
  const req=(part,options={})=>requestJson(api(part),{token,fetchFn,...options});
  const branch=await req('/git/ref/heads/'+BRANCH);
  if(branch.status===404){
    const made=await req('/git/refs',{method:'POST',body:{ref:'refs/heads/'+BRANCH,sha:ctx.sha}});
    if(made.status!==201||made.value?.ref!=='refs/heads/'+BRANCH||
       made.value?.object?.sha!==ctx.sha)throw Error('archive_branch_receipt_invalid');
  }else if(branch.status!==200||branch.value?.ref!=='refs/heads/'+BRANCH){
    throw Error('archive_branch_identity_invalid');
  }
  const existing=await req('/contents/'+path+'?ref='+BRANCH);
  const expected=archiveJson(snapshot);
  if(existing.status===200){
    const encoded=existing.value?.content;
    if(existing.value?.encoding!=='base64'||typeof encoded!=='string'||
       Buffer.from(encoded.replace(/\s/g,''),'base64').toString('utf8')!==expected)
      throw Error('archive_collision_or_unverifiable');
    return {status:'ALREADY_ARCHIVED',path,branch:BRANCH};
  }
  if(existing.status!==404)throw Error('archive_lookup_invalid');
  const written=await req('/contents/'+path,{method:'PUT',body:{
    message:'chore(ci): archive immutable bounded public CI snapshot',
    branch:BRANCH,content:Buffer.from(expected,'utf8').toString('base64')
  }});
  if(![200,201].includes(written.status)||written.value?.content?.path!==path||
     !SHA.test(written.value?.content?.sha||'')||!SHA.test(written.value?.commit?.sha||''))
    throw Error('archive_write_receipt_invalid');
  return {status:'ARCHIVED',path,branch:BRANCH,commit_sha:written.value.commit.sha};
}

// Explicit, bounded, read-only GitHub Actions run reconciliation. No admission of commitments.
import {requestJson} from './snapshot.mjs';
import {REPO,REPO_ID,OWNER_ID,SOURCE,MAX_RECONCILE} from './archive-consumer.mjs';
const STATUSES=new Set(['queued','in_progress','completed','waiting','requested','pending']);
const CONCLUSIONS=new Set([null,'success','failure','cancelled','skipped','neutral','timed_out','action_required','stale','startup_failure']);
const requireIt=(cond,msg)=>{if(!cond)throw Error(msg);};
const API='https://api.github.com/repos/'+REPO;
const normalizeLabel=(s,n)=>String(s||'unknown').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,n);

export function validateRunUpdate(run,prior,{now=new Date()}={}){
  requireIt(run&&prior&&Number.isSafeInteger(prior.id)&&run.id===prior.id&&
    run.repository?.full_name===REPO&&String(run.repository?.id)===REPO_ID&&
    String(run.repository?.owner?.id)===OWNER_ID,'reconcile_run_identity_invalid');
  requireIt(STATUSES.has(run.status)&&CONCLUSIONS.has(run.conclusion)&&
    (run.conclusion===null||run.status==='completed'),'reconcile_status_invalid');
  const created=Date.parse(run.created_at),updated=Date.parse(run.updated_at),old=Date.parse(prior.updated_at);
  requireIt(Number.isFinite(created)&&Number.isFinite(updated)&&Number.isFinite(old)&&
    run.created_at===prior.created_at&&updated>=created&&updated>=old&&
    updated<=now.getTime()+60000,'reconcile_clock_or_history_invalid');
  requireIt(normalizeLabel(run.name,100)===prior.workflow&&normalizeLabel(run.head_branch,130)===prior.branch,
    'reconcile_workflow_identity_drift');
  return {id:prior.id,workflow:prior.workflow,branch:prior.branch,
    created_at:run.created_at,updated_at:run.updated_at,status:run.status,
    conclusion:run.conclusion,domain:'WORK',source_id:SOURCE,
    truth_class:'SOURCE_CLAIM',possible_commitment:false,raw_payload_persisted:false};
}

export async function reconcilePublicRuns(token,plan,{fetchFn=fetch,now=new Date()}={}){
  requireIt(plan?.schema==='cesar-os-ci-replay-plan-v1'&&plan.source_id===SOURCE&&
    Array.isArray(plan.reconcile_ids)&&plan.reconcile_ids.length<=MAX_RECONCILE&&
    Array.isArray(plan.records)&&typeof token==='string'&&token.length>=30,
    'reconcile_plan_invalid');
  const byId=new Map(plan.records.map(x=>[x.id,x]));
  const results=[],unresolved=[];
  for(const id of plan.reconcile_ids){
    requireIt(Number.isSafeInteger(id)&&id>0&&byId.has(id),'reconcile_id_invalid');
    const result=await requestJson(API+'/actions/runs/'+id,{token,fetchFn});
    if(result.status===404){unresolved.push({id,reason:'RUN_NOT_FOUND'});continue;}
    requireIt(result.status===200,'reconcile_http_failed');
    const next=validateRunUpdate(result.value,byId.get(id),{now});
    if(Date.parse(next.updated_at)>Date.parse(byId.get(id).updated_at)||
      next.status!==byId.get(id).status||next.conclusion!==byId.get(id).conclusion)results.push(next);
  }
  return {schema:'cesar-os-ci-reconciliation-v1',source_id:SOURCE,
    checked:plan.reconcile_ids.length,updates:results,unresolved,
    pending_count:plan.reconcile_deferred+unresolved.length,
    lifecycle_updates_complete:false,continuity_complete:false,
    possible_commitment:false,external_effect_authorized:false,db_writes:0};
}

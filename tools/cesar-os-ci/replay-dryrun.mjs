// Manual only. Reads bounded public GitHub CI evidence; NEVER stores it or writes D1.
import {pathToFileURL} from 'node:url';
import {discoverArchiveEvidence,planReplay,SOURCE} from './archive-consumer.mjs';
import {reconcilePublicRuns} from './run-reconciler.mjs';

export async function replayDryRun({start,end,token,now=new Date(),fetchFn=fetch}={}){
  const evidence=await discoverArchiveEvidence(token,{start,end,now,fetchFn});
  const plan=planReplay(evidence.snapshots,{start,end,now});
  const reconciliation=await reconcilePublicRuns(token,plan,{now,fetchFn});
  return {
    schema:'cesar-os-work-replay-dryrun-v1',status:'READ_ONLY_REPORT',source_id:SOURCE,
    horizon:{start,end},archived_files:evidence.snapshots.length,
    missing_days:evidence.days_missing,coverage:plan.coverage,
    observed_runs:plan.records.length,run_ids_checked:reconciliation.checked,
    late_state_updates:reconciliation.updates.map(x=>({id:x.id,status:x.status,
      conclusion:x.conclusion,updated_at:x.updated_at,truth_class:x.truth_class,
      possible_commitment:x.possible_commitment})),
    unresolved_runs:reconciliation.unresolved,
    runs_pending_reconciliation:reconciliation.pending_count,
    cursor_candidate_revision:plan.cursor.revision,cursor_persisted:false,
    ingestion_receipt_observed:false,external_effect_authorized:false,db_writes:0,
    lifecycle_updates_complete:false,continuity_complete:false
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const token=process.env.GITHUB_TOKEN;
  const start=process.env.CESAR_OS_REPLAY_START;
  const end=process.env.CESAR_OS_REPLAY_END;
  replayDryRun({start,end,token}).then(report=>{
    console.log(JSON.stringify(report));
  }).catch(err=>{
    console.error('read_only_replay_failed:'+String(err?.message||err).slice(0,140));
    process.exitCode=1;
  });
}

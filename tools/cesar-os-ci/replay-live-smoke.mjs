// Pull-request-only live read smoke of the public GitHub archive API. No persistence.
import {replayDryRun} from './replay-dryrun.mjs';

const now=new Date();
const start=new Date(now.getTime()-30*60*1000).toISOString();
const end=now.toISOString();
const token=process.env.GITHUB_TOKEN;
if(typeof token!=='string'||token.length<30)throw Error('read_only_token_required');
const report=await replayDryRun({start,end,token,now});
if(report.schema!=='cesar-os-work-replay-dryrun-v1'||
   report.status!=='READ_ONLY_REPORT'||report.db_writes!==0||
   report.cursor_persisted!==false||report.ingestion_receipt_observed!==false||
   report.coverage.continuity_complete!==false||
   report.source_id!=='github-actions-public-deliveryos')
  throw Error('real_github_read_only_contract_failed');
console.log(JSON.stringify({
  status:'READ_ONLY_GITHUB_API_PROOF',
  source_id:report.source_id,archive_count:report.archived_files,
  missing_days:report.missing_days.length,
  gaps:report.coverage.gaps.length,continuity_complete:false,
  db_writes:0,cursor_persisted:false
}));


// One already-public historical file seeded manually for this read-only integration proof.
// It does NOT prove the producer published that archive automatically.
const archived=await replayDryRun({
  start:'2026-10-10T19:46:45.627Z',
  end:'2026-10-10T20:46:45.627Z',
  token,now
});
if(archived.archived_files<1||archived.observed_runs!==2||
  archived.coverage.gaps.length!==0||archived.db_writes!==0||
  archived.cursor_persisted!==false||archived.ingestion_receipt_observed!==false||
  archived.coverage.continuity_complete!==false)
  throw Error('real_historical_archive_replay_contract_failed');
console.log(JSON.stringify({
  status:'REAL_PUBLIC_ARCHIVE_READ_PROVEN',
  provenance:'MANUALLY_SEEDED_EXISTING_PUBLIC_SNAPSHOT',
  source_id:archived.source_id,archived_files:archived.archived_files,
  observed_runs:archived.observed_runs,run_ids_checked:archived.run_ids_checked,
  late_state_updates:archived.late_state_updates.length,
  unresolved_runs:archived.unresolved_runs.length,
  coverage_gaps:archived.coverage.gaps.length,
  db_writes:0,cursor_persisted:false,
  lifecycle_updates_complete:false,continuity_complete:false
}));

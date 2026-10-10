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

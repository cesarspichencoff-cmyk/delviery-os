// REVIEW ONLY: pinned GitHub re-read before candidate cursor CAS.
// Does not create a private receipt. Caller-supplied receiptFor/store remain MOCKABLE;
// NEVER expose this as a production endpoint without private service-bound receipt v2.
import {readPinnedArchive} from './pinned-archive-reader.mjs';
import {commitAfterReceipts} from './replay-ack-gate.mjs';
import {SOURCE} from './archive-consumer.mjs';
const fail=x=>{throw Error(x)};
export async function commitAfterPinnedSource(plan,{token,fetchFn=fetch,intents,receiptFor,store}={}){
 if(plan?.schema!=='cesar-os-ci-replay-plan-v1'||plan.source_id!==SOURCE||
    !Array.isArray(plan.new_archive_entries)||!Array.isArray(plan.new_archive_paths)||
    plan.new_archive_entries.length!==plan.new_archive_paths.length||
    plan.new_archive_paths.length>200)
   fail('pinned_cursor_plan_invalid');
 if(typeof token!=='string'||token.length<30||typeof fetchFn!=='function')
   fail('pinned_cursor_source_unavailable');
 const seen=new Set();
 for(const item of plan.new_archive_entries){
   if(!item||seen.has(item.archive_path)||!plan.new_archive_paths.includes(item.archive_path))
     fail('pinned_cursor_manifest_invalid');
   seen.add(item.archive_path);
   const verified=await readPinnedArchive(token,item.archive_path,{fetchFn});
   if(verified.verified_via!=='GITHUB_CONTENTS_API_FIXED_ORIGIN'||
      verified.private_ingest_performed!==false||
      verified.git_blob_sha!==item.git_blob_sha||
      verified.snapshot_sha256!==item.snapshot_sha256||
      verified.record_count!==item.record_count)
     fail('pinned_cursor_source_content_mismatch');
 }
 return commitAfterReceipts(plan,{intents,receiptFor,store});
}

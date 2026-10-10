// CANDIDATE ONLY: checks a trusted internal receipt reader before cursor CAS.
// No direct HTTP, no D1 writes except through a caller-provided cursor store.
import {SOURCE} from './archive-consumer.mjs';
const BATCH=/^publicci_[0-9]{10}_[a-f0-9]{8}$/;
const RECEIPT=/^sir_[a-f0-9]{20}$/;
const assert=(v,e)=>{if(!v)throw Error(e);};

export async function commitAfterReceipts(plan,{intents,receiptFor,store}={}){
  assert(plan?.schema==='cesar-os-ci-replay-plan-v1'&&plan.source_id===SOURCE&&
    Array.isArray(plan.new_archive_paths)&&Array.isArray(plan.new_archive_entries)&&Array.isArray(intents)&&
    Number.isSafeInteger(plan.expected_previous_revision)&&
    plan.cursor?.revision===plan.expected_previous_revision+1&&
    typeof receiptFor==='function'&&store?.compareAndSwap,
    'receipt_gate_contract_invalid');
  const expected=new Set(plan.new_archive_paths);
  const manifest=new Map(plan.new_archive_entries.map(x=>[x.archive_path,x]));
  assert(expected.size===plan.new_archive_paths.length&&manifest.size===expected.size&&
    plan.new_archive_entries.length===expected.size&&
    plan.new_archive_entries.every(x=>expected.has(x.archive_path)&&
      /^[a-f0-9]{64}$/.test(x.snapshot_sha256)&&
      Number.isSafeInteger(x.record_count)&&x.record_count>=0&&x.record_count<=100),
    'receipt_gate_archive_manifest_invalid');
  const needsReceipt=new Set(plan.new_archive_entries.filter(x=>x.record_count>0).map(x=>x.archive_path));
  const assigned=new Map();
  for(const item of intents){
    assert(item&&needsReceipt.has(item.archive_path)&&!assigned.has(item.archive_path)&&
      item.source_id===SOURCE&&typeof item.batch_id==='string'&&BATCH.test(item.batch_id)&&
      Number.isSafeInteger(item.items_expected)&&item.items_expected>=0&&item.items_expected<=100&&
      item.items_expected===manifest.get(item.archive_path)?.record_count&&
      item.snapshot_sha256===manifest.get(item.archive_path)?.snapshot_sha256,
      'receipt_gate_intent_invalid');
    assigned.set(item.archive_path,item);
  }
  assert(assigned.size===needsReceipt.size,'receipt_gate_incomplete_intents');
  const verified=[];
  let empty_archives_verified=0;
  for(const path of plan.new_archive_paths){
    if(manifest.get(path).record_count===0){empty_archives_verified++;continue;}
    const intent=assigned.get(path);
    const receipt=await receiptFor(intent.batch_id);
    assert(receipt?.schema==='cesar-os-work-batch-receipt-read-v1'&&
      receipt.source_id===SOURCE&&receipt.batch_id===intent.batch_id&&
      receipt.status==='PROCESSED'&&RECEIPT.test(receipt.receipt_id||'')&&
      receipt.external_effect_authorized===false&&
      receipt.items_seen===intent.items_expected&&
      receipt.snapshot_sha256===intent.snapshot_sha256&&
      Number.isSafeInteger(receipt.items_new)&&receipt.items_new>=0&&
      Number.isSafeInteger(receipt.items_deduped)&&receipt.items_deduped>=0&&
      receipt.items_new+receipt.items_deduped===receipt.items_seen&&
      receipt.coverage_status===(intent.items_expected?'BOUNDED_OBSERVED':'BOUNDED_EMPTY'),
      'receipt_gate_not_acked');
    verified.push({archive_path:path,batch_id:intent.batch_id,receipt_id:receipt.receipt_id});
  }
  const saved=await store.compareAndSwap(plan.expected_previous_revision,plan.cursor);
  if(saved?.status!=='COMMITTED'||saved.revision!==plan.cursor.revision)
    return {status:'CURSOR_CAS_CONFLICT',acknowledged:verified.length,cursor_written:false};
  return {status:verified.length?'RECEIPTS_VERIFIED_CURSOR_COMMITTED':'EMPTY_ARCHIVES_CURSOR_COMMITTED',
    source_id:SOURCE,acknowledged:verified.length,empty_archives_verified,cursor_revision:saved.revision,
    cursor_written:true,external_effect_authorized:false};
}

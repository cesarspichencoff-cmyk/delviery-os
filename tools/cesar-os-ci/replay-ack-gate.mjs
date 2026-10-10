// CANDIDATE ONLY: checks a trusted internal receipt reader before cursor CAS.
// No direct HTTP, no D1 writes except through a caller-provided cursor store.
import {SOURCE} from './archive-consumer.mjs';
const BATCH=/^publicci_[0-9]{10}_[a-f0-9]{8}$/;
const RECEIPT=/^sir_[a-f0-9]{20}$/;
const assert=(v,e)=>{if(!v)throw Error(e);};

export async function commitAfterReceipts(plan,{intents,receiptFor,store}={}){
  assert(plan?.schema==='cesar-os-ci-replay-plan-v1'&&plan.source_id===SOURCE&&
    Array.isArray(plan.new_archive_paths)&&Array.isArray(intents)&&
    Number.isSafeInteger(plan.expected_previous_revision)&&
    plan.cursor?.revision===plan.expected_previous_revision+1&&
    typeof receiptFor==='function'&&store?.compareAndSwap,
    'receipt_gate_contract_invalid');
  const expected=new Set(plan.new_archive_paths);
  const assigned=new Map();
  for(const item of intents){
    assert(item&&expected.has(item.archive_path)&&!assigned.has(item.archive_path)&&
      item.source_id===SOURCE&&typeof item.batch_id==='string'&&BATCH.test(item.batch_id)&&
      Number.isSafeInteger(item.items_expected)&&item.items_expected>=0&&item.items_expected<=100,
      'receipt_gate_intent_invalid');
    assigned.set(item.archive_path,item);
  }
  assert(assigned.size===expected.size,'receipt_gate_incomplete_intents');
  const verified=[];
  for(const path of plan.new_archive_paths){
    const intent=assigned.get(path);
    const receipt=await receiptFor(intent.batch_id);
    assert(receipt?.schema==='cesar-os-work-batch-receipt-read-v1'&&
      receipt.source_id===SOURCE&&receipt.batch_id===intent.batch_id&&
      receipt.status==='PROCESSED'&&RECEIPT.test(receipt.receipt_id||'')&&
      receipt.external_effect_authorized===false&&
      receipt.items_seen===intent.items_expected&&
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
  return {status:'RECEIPTS_VERIFIED_CURSOR_COMMITTED',
    source_id:SOURCE,acknowledged:verified.length,cursor_revision:saved.revision,
    cursor_written:true,external_effect_authorized:false};
}

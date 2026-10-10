// Standalone candidate: deterministic admission decision for a future trusted WORK v2 writer.
// No D1 binding, no HTTP, no commits, no human commitment admission.
const SOURCE='github-actions-public-deliveryos';
const BATCH=/^publicci_[0-9]{10}_[0-9a-f]{8}$/;
const SHA256=/^[a-f0-9]{64}$/,GIT_SHA=/^[a-f0-9]{40}$/;
const PATH=/^ci-snapshots\/deliveryos\/archive\/\d{4}\/\d{2}\/\d{2}\/\d{8}T\d{9}Z\.json$/;
const fail=code=>{throw Error(code)};
export function validateV2Attestation(a){
 if(!a||typeof a!=='object'||a.schema!=='cesar-os-work-archive-attestation-v1'||
   a.source_id!==SOURCE||!BATCH.test(a.batch_id||'')||
   !PATH.test(a.archive_path||'')||!SHA256.test(a.snapshot_sha256||'')||
   !GIT_SHA.test(a.git_blob_sha||'')||
   !Number.isSafeInteger(a.record_count)||a.record_count<1||a.record_count>100||
   a.archive_verification!=='TRUSTED_SOURCE_REVALIDATED_AT_INGEST'||
   a.possible_commitment!==false||a.external_effect_authorized!==false)
   fail('v2_attestation_contract_invalid');
 return {...a};
}
export function decideV2BatchAdmission(attestation,existing){
 const next=validateV2Attestation(attestation);
 if(existing==null)return {status:'NEW_ATTESTED_BATCH_CANDIDATE',eligible_for_transaction:true,write_performed:false};
 if(existing.source_id!==SOURCE||existing.batch_id!==next.batch_id)
   fail('v2_existing_receipt_identity_invalid');
 if(existing.schema!=='cesar-os-work-batch-receipt-read-v2'||
    existing.archive_verification!=='TRUSTED_SOURCE_REVALIDATED_AT_INGEST')
   return {status:'LEGACY_OR_UNVERIFIED_RECEIPT',eligible_for_transaction:false,write_performed:false};
 const match=existing.archive_path===next.archive_path&&
   existing.snapshot_sha256===next.snapshot_sha256&&
   existing.git_blob_sha===next.git_blob_sha&&
   existing.items_seen===next.record_count&&
   existing.status==='PROCESSED';
 return {status:match?'ALREADY_PROCESSED_IDENTICAL':'BATCH_CONTENT_CONFLICT',
   eligible_for_transaction:false,write_performed:false};
}

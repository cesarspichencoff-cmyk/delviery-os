import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateV2Attestation,decideV2BatchAdmission} from '../tools/cesar-os-ci/receipt-v2-admission.mjs';
const attestation={
  schema:'cesar-os-work-archive-attestation-v1',
  source_id:'github-actions-public-deliveryos',
  batch_id:'publicci_2026101020_533a0859',
  archive_path:'ci-snapshots/deliveryos/archive/2026/10/10/20261010T204645627Z.json',
  snapshot_sha256:'61f6575d1101113015734e01be57182e38ec41f7fa2e683c8c4380403b5fcdd1',
  git_blob_sha:'1b7963fdab69be502b88c9f0864277d5be96cb47',
  record_count:2,archive_verification:'TRUSTED_SOURCE_REVALIDATED_AT_INGEST',
  possible_commitment:false,external_effect_authorized:false
};
const verifiedArchive={archive_path:attestation.archive_path,
 rawBytes:readFileSync(new URL('./fixtures/cesar-os-deliveryos-public-20261010.json',import.meta.url))};
const prior={
  schema:'cesar-os-work-batch-receipt-read-v2',
  source_id:attestation.source_id,batch_id:attestation.batch_id,
  archive_path:attestation.archive_path,snapshot_sha256:attestation.snapshot_sha256,
  git_blob_sha:attestation.git_blob_sha,items_seen:2,status:'PROCESSED',
  archive_verification:attestation.archive_verification
};
test('fresh, fixed-source attestation is only a transaction candidate',()=>{
  const d=decideV2BatchAdmission(attestation,null,{verifiedArchive});
  assert.equal(d.status,'NEW_ATTESTED_BATCH_CANDIDATE');
  assert.equal(d.eligible_for_transaction,true);
  assert.equal(d.write_performed,false);
});
test('same batch with identical source/bytes is idempotently acknowledged',()=>{
  const d=decideV2BatchAdmission(attestation,prior,{verifiedArchive});
  assert.equal(d.status,'ALREADY_PROCESSED_IDENTICAL');
  assert.equal(d.eligible_for_transaction,false);
});
test('content collision with same batch is never quietly deduplicated',()=>{
  for(const changed of [
    {snapshot_sha256:'a'.repeat(64)},
    {git_blob_sha:'b'.repeat(40)},
    {archive_path:'ci-snapshots/deliveryos/archive/2026/10/10/20261010T211000000Z.json'},
    {items_seen:1},{status:'INGESTED_UNVERIFIED'}
  ]){
    const d=decideV2BatchAdmission(attestation,{...prior,...changed},{verifiedArchive});
    assert.equal(d.status,'BATCH_CONTENT_CONFLICT');
    assert.equal(d.write_performed,false);
  }
});
test('v1 legacy receipt cannot be upgraded to v2 by assertion',()=>{
  const d=decideV2BatchAdmission(attestation,{...prior,schema:'cesar-os-work-batch-receipt-read-v1'},{verifiedArchive});
  assert.equal(d.status,'LEGACY_OR_UNVERIFIED_RECEIPT');
  assert.equal(d.eligible_for_transaction,false);
});
test('foreign source, untrusted attestation, commitments and oversized row count fail closed',()=>{
  for(const changed of [
    {source_id:'other'},{batch_id:'bogus'},{snapshot_sha256:'not_sha'},
    {git_blob_sha:'not_sha'},{archive_path:'../../fake'},
    {record_count:101},{possible_commitment:true},
    {external_effect_authorized:true},{archive_verification:'CLIENT_SUPPLIED'}
  ])assert.throws(()=>validateV2Attestation({...attestation,...changed}),/v2_attestation_contract_invalid/);
});
test('receipt lookup with unexpected source or batch must fail before admission',()=>{
  assert.throws(()=>decideV2BatchAdmission(attestation,{...prior,source_id:'foreign'},{verifiedArchive}),/v2_existing_receipt_identity_invalid/);
  assert.throws(()=>decideV2BatchAdmission(attestation,{...prior,batch_id:'publicci_2026101021_aaaaaaaa'},{verifiedArchive}),/v2_existing_receipt_identity_invalid/);
});

test('candidate admission independently rehashes actual public archive bytes',()=>{
 const d=decideV2BatchAdmission(attestation,null,{verifiedArchive});
 assert.equal(d.status,'NEW_ATTESTED_BATCH_CANDIDATE');
});
test('tampered bytes or missing verified archive context cannot authorize admission',()=>{
 const broken=Buffer.from(verifiedArchive.rawBytes);
 broken[15]=broken[15]===65?66:65;
 for(const bad of [
   {archive_path:verifiedArchive.archive_path,rawBytes:broken},
   {archive_path:verifiedArchive.archive_path,rawBytes:Buffer.from('{}')},
   undefined
 ]){
  assert.throws(()=>decideV2BatchAdmission(attestation,null,{verifiedArchive:bad}));
 }
});
test('a claimed SHA-256 matching no actual archive bytes is refused',()=>{
 assert.throws(()=>decideV2BatchAdmission({...attestation,snapshot_sha256:'0'.repeat(64)},null,
   {verifiedArchive}),/v2_attestation_bytes_mismatch/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commitAfterReceipts} from '../tools/cesar-os-ci/replay-ack-gate.mjs';
import {memoryCursorStore} from '../tools/cesar-os-ci/cursor-store.mjs';
import {planReplay,SOURCE} from '../tools/cesar-os-ci/archive-consumer.mjs';

const generated='2026-10-10T21:00:00.000Z',started='2026-10-10T20:00:00.000Z';
const snapshot={schema:'cesar-os-github-public-ci-snapshot-v1',source_id:SOURCE,
 repository:'cesarspichencoff-cmyk/delviery-os',repository_id:'1279837591',repository_owner_id:'292320191',
 generated_at:generated,window_start:started,window_end:generated,record_count:1,
 records:[{id:735,workflow:'CI',branch:'main',status:'completed',conclusion:'success',created_at:'2026-10-10T20:30:00.000Z',updated_at:'2026-10-10T20:31:00.000Z'}],coverage_status:'BOUNDED_OBSERVED',
 collection_basis:'RUN_CREATED_AT',lifecycle_updates_complete:false,continuity_complete:false,
 coverage_complete_claimed:false,raw_payload_persisted:false,possible_commitment:false};
const path='ci-snapshots/deliveryos/archive/2026/10/10/20261010T210000000Z.json';
const plan=planReplay([{path,snapshot}],{start:started,end:generated,now:new Date('2026-10-11T00:00:00.000Z')});
const batch='publicci_2026101021_abcdef12';
const intents=[{archive_path:path,source_id:SOURCE,batch_id:batch,items_expected:1,snapshot_sha256:plan.new_archive_entries[0].snapshot_sha256}];
const receipt={schema:'cesar-os-work-batch-receipt-read-v2',source_id:SOURCE,batch_id:batch,
 archive_path:path,archive_verification:'TRUSTED_SOURCE_REVALIDATED_AT_INGEST',
 status:'PROCESSED',receipt_id:'sir_'+'a'.repeat(20),snapshot_sha256:plan.new_archive_entries[0].snapshot_sha256,items_seen:1,items_new:1,
 items_deduped:0,coverage_status:'BOUNDED_OBSERVED',external_effect_authorized:false};

test('missing receipt prevents cursor update',async()=>{
 const store=memoryCursorStore();
 await assert.rejects(commitAfterReceipts(plan,{intents,store,receiptFor:async()=>({status:'NOT_PROCESSED'})}),/receipt_gate_not_acked/);
 assert.equal((await store.load()).revision,0);
});
test('schema-validated receipts allow one CAS, not a second',async()=>{
 const store=memoryCursorStore(),options={intents,store,receiptFor:async()=>receipt};
 const result=await commitAfterReceipts(plan,options);
 assert.equal(result.status,'RECEIPTS_VERIFIED_CURSOR_COMMITTED');
 assert.equal(result.acknowledged,1);
 assert.equal((await store.load()).revision,1);
 assert.equal((await commitAfterReceipts(plan,options)).status,'CURSOR_CAS_CONFLICT');
});
test('wrong source, incorrect count and wrong coverage refuse commit',async()=>{
 for(const broken of [{...receipt,source_id:'another'}, {...receipt,items_seen:2},
  {...receipt,coverage_status:'BOUNDED_EMPTY'}]){
  const store=memoryCursorStore();
  await assert.rejects(commitAfterReceipts(plan,{intents,store,receiptFor:async()=>broken}),/receipt_gate_not_acked/);
  assert.equal((await store.load()).revision,0);
 }
});
test('missing or duplicate intents refuse any receipt call',async()=>{
 const store=memoryCursorStore();let called=0;
 for(const bad of [[],[...intents,...intents]]){
  await assert.rejects(commitAfterReceipts(plan,{intents:bad,store,receiptFor:async()=>{called++;return receipt;}}));
 }
 assert.equal(called,0);
 assert.equal((await store.load()).revision,0);
});

test('receipt for different archived content cannot advance cursor',async()=>{
 const store=memoryCursorStore();
 await assert.rejects(commitAfterReceipts(plan,{intents,store,receiptFor:async()=>({...receipt,snapshot_sha256:'b'.repeat(64)})}),/receipt_gate_not_acked/);
 assert.equal((await store.load()).revision,0);
});
test('caller cannot claim a different count than the archived file',async()=>{
 const store=memoryCursorStore(),fakeIntents=[{...intents[0],items_expected:0}];let called=0;
 await assert.rejects(commitAfterReceipts(plan,{intents:fakeIntents,store,receiptFor:async()=>{called++;return receipt;}}),/receipt_gate_intent_invalid/);
 assert.equal(called,0);
 assert.equal((await store.load()).revision,0);
});
test('missing archive digest in receipt is rejected before cursor write',async()=>{
 const store=memoryCursorStore(),without={...receipt};
 delete without.snapshot_sha256;
 await assert.rejects(commitAfterReceipts(plan,{intents,store,receiptFor:async()=>without}),/receipt_gate_not_acked/);
 assert.equal((await store.load()).revision,0);
});

test('verified zero-observation archive advances evidence cursor without fabricated ingest receipt',async()=>{
 const empty={...snapshot,record_count:0,records:[],coverage_status:'BOUNDED_EMPTY'};
 const p=planReplay([{path,snapshot:empty}],{start:started,end:generated,now:new Date('2026-10-11T00:00:00.000Z')});
 const store=memoryCursorStore();let reads=0;
 const result=await commitAfterReceipts(p,{intents:[],store,receiptFor:async()=>{reads++;throw Error('receipt_must_not_be_queried');}});
 assert.equal(result.status,'EMPTY_ARCHIVES_CURSOR_COMMITTED');
 assert.equal(result.acknowledged,0);assert.equal(result.empty_archives_verified,1);
 assert.equal(reads,0);assert.equal((await store.load()).revision,1);
});
test('empty archive cannot be paired with an unrelated existing receipt',async()=>{
 const empty={...snapshot,record_count:0,records:[],coverage_status:'BOUNDED_EMPTY'};
 const p=planReplay([{path,snapshot:empty}],{start:started,end:generated,now:new Date('2026-10-11T00:00:00.000Z')});
 const store=memoryCursorStore();
 await assert.rejects(commitAfterReceipts(p,{intents,store,receiptFor:async()=>receipt}),/receipt_gate_intent_invalid/);
 assert.equal((await store.load()).revision,0);
});

test('legacy v1 receipt never supplies missing provenance by inference',async()=>{
 const store=memoryCursorStore();
 await assert.rejects(commitAfterReceipts(plan,{intents,store,
   receiptFor:async()=>({...receipt,schema:'cesar-os-work-batch-receipt-read-v1'})}),/receipt_gate_not_acked/);
 assert.equal((await store.load()).revision,0);
});
test('v2 archive path must match the verified archive from the plan',async()=>{
 const store=memoryCursorStore();
 await assert.rejects(commitAfterReceipts(plan,{intents,store,
   receiptFor:async()=>({...receipt,archive_path:'ci-snapshots/deliveryos/archive/2026/10/10/other.json'})}),/receipt_gate_not_acked/);
 assert.equal((await store.load()).revision,0);
});
test('v2 without trusted-at-ingest verification is insufficient',async()=>{
 const store=memoryCursorStore();
 await assert.rejects(commitAfterReceipts(plan,{intents,store,
   receiptFor:async()=>({...receipt,archive_verification:'CLIENT_SUPPLIED'})}),/receipt_gate_not_acked/);
 assert.equal((await store.load()).revision,0);
});

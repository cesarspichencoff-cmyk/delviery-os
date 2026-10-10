import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commitAfterReceipts} from '../tools/cesar-os-ci/replay-ack-gate.mjs';
import {memoryCursorStore} from '../tools/cesar-os-ci/cursor-store.mjs';
import {planReplay,SOURCE} from '../tools/cesar-os-ci/archive-consumer.mjs';

const generated='2026-10-10T21:00:00.000Z',started='2026-10-10T20:00:00.000Z';
const snapshot={schema:'cesar-os-github-public-ci-snapshot-v1',source_id:SOURCE,
 repository:'cesarspichencoff-cmyk/delviery-os',repository_id:'1279837591',repository_owner_id:'292320191',
 generated_at:generated,window_start:started,window_end:generated,record_count:0,records:[],coverage_status:'BOUNDED_EMPTY',
 collection_basis:'RUN_CREATED_AT',lifecycle_updates_complete:false,continuity_complete:false,
 coverage_complete_claimed:false,raw_payload_persisted:false,possible_commitment:false};
const path='ci-snapshots/deliveryos/archive/2026/10/10/20261010T210000000Z.json';
const plan=planReplay([{path,snapshot}],{start:started,end:generated,now:new Date('2026-10-11T00:00:00.000Z')});
const batch='publicci_2026101021_abcdef12';
const intents=[{archive_path:path,source_id:SOURCE,batch_id:batch,items_expected:0}];
const receipt={schema:'cesar-os-work-batch-receipt-read-v1',source_id:SOURCE,batch_id:batch,
 status:'PROCESSED',receipt_id:'sir_'+'a'.repeat(20),items_seen:0,items_new:0,
 items_deduped:0,coverage_status:'BOUNDED_EMPTY',external_effect_authorized:false};

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
 for(const broken of [{...receipt,source_id:'another'}, {...receipt,items_seen:1},
  {...receipt,coverage_status:'BOUNDED_OBSERVED'}]){
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

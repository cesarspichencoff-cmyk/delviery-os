import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commitAfterPinnedSource} from '../tools/cesar-os-ci/trusted-cursor-gate.mjs';
import {planReplay} from '../tools/cesar-os-ci/archive-consumer.mjs';
import {memoryCursorStore} from '../tools/cesar-os-ci/cursor-store.mjs';
import {gitBlobSha} from '../tools/cesar-os-ci/archive-consumer.mjs';

const token='t'.repeat(40);
const path='ci-snapshots/deliveryos/archive/2026/10/10/20261010T204645627Z.json';
const bytes=readFileSync(new URL('./fixtures/cesar-os-deliveryos-public-20261010.json',import.meta.url));
const snapshot=JSON.parse(bytes.toString('utf8'));
const horizon={start:snapshot.window_start,end:snapshot.window_end,now:new Date('2026-10-11T00:00:00.000Z')};
const makePlan=(obj=snapshot,raw=bytes)=>planReplay([{path,snapshot:obj,rawBytes:raw}],horizon);
const plan=makePlan();
const batch='publicci_2026101020_533a0859';
const intents=[{archive_path:path,source_id:'github-actions-public-deliveryos',batch_id:batch,
 items_expected:2,snapshot_sha256:plan.new_archive_entries[0].snapshot_sha256,
 git_blob_sha:plan.new_archive_entries[0].git_blob_sha}];
const receipt={
 schema:'cesar-os-work-batch-receipt-read-v2',source_id:'github-actions-public-deliveryos',
 batch_id:batch,status:'PROCESSED',receipt_id:'sir_'+'a'.repeat(20),
 archive_path:path,archive_verification:'TRUSTED_SOURCE_REVALIDATED_AT_INGEST',
 items_seen:2,items_new:2,items_deduped:0,
 snapshot_sha256:intents[0].snapshot_sha256,git_blob_sha:intents[0].git_blob_sha,
 coverage_status:'BOUNDED_OBSERVED',external_effect_authorized:false
};
function fakeSource(data,calls,st=200){
 return async(url,opts)=>{
   calls.push({url,opts});
   return {status:st,redirected:false,json:async()=>({
    type:'file',path,sha:gitBlobSha(data),size:data.length,encoding:'base64',
    content:data.toString('base64')})};
 };
}
test('trusted-cursor candidate requires real pinned source before simulated receipt CAS',async()=>{
 const calls=[],store=memoryCursorStore();
 const result=await commitAfterPinnedSource(plan,{token,fetchFn:fakeSource(bytes,calls),
   intents,receiptFor:async()=>receipt,store});
 assert.equal(result.status,'RECEIPTS_VERIFIED_CURSOR_COMMITTED');
 assert.equal(result.cursor_written,true);
 assert.equal((await store.load()).revision,1);
 assert.equal(calls.length,1);
 assert(calls[0].url.endsWith(path+'?ref=cesar-os-ci-snapshots'));
 assert.equal(calls[0].opts.method,'GET');
});
test('matched receipt cannot override mismatched source archive digest',async()=>{
 const store=memoryCursorStore(),calls=[];
 const different=Buffer.from(JSON.stringify(snapshot,null,2)+'\n');
 await assert.rejects(commitAfterPinnedSource(plan,{token,fetchFn:fakeSource(different,calls),
   intents,receiptFor:async()=>receipt,store}),/pinned_cursor_source_content_mismatch/);
 assert.equal((await store.load()).revision,0);
 assert.equal(calls.length,1);
});
test('not-found GitHub path prevents even an otherwise valid receipt',async()=>{
 const store=memoryCursorStore(),calls=[];let reads=0;
 await assert.rejects(commitAfterPinnedSource(plan,{token,
   fetchFn:fakeSource(bytes,calls,404),intents,store,
   receiptFor:async()=>{reads++;return receipt;}}),/pinned_archive_not_found/);
 assert.equal(reads,0);
 assert.equal((await store.load()).revision,0);
});
test('cryptographically verified empty file needs no fake ingest receipt',async()=>{
 const empty={...snapshot,record_count:0,records:[],coverage_status:'BOUNDED_EMPTY'};
 const raw=Buffer.from(JSON.stringify(empty)+'\n');
 const p=makePlan(empty,raw),store=memoryCursorStore(),calls=[];
 let receiptReads=0;
 const r=await commitAfterPinnedSource(p,{token,fetchFn:fakeSource(raw,calls),intents:[],
   receiptFor:async()=>{receiptReads++;throw Error('unneeded')},store});
 assert.equal(r.status,'EMPTY_ARCHIVES_CURSOR_COMMITTED');
 assert.equal(receiptReads,0);assert.equal(calls.length,1);
 assert.equal((await store.load()).revision,1);
});
test('trusted path rejects missing or malformed input without a GET',async()=>{
 let calls=0;
 await assert.rejects(commitAfterPinnedSource(plan,{token:'x',intents,store:memoryCursorStore(),
   fetchFn:async()=>{calls++;throw Error('network')}}),/pinned_cursor_source_unavailable/);
 assert.equal(calls,0);
});

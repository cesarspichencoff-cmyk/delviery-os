import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {verifyContext,windowFor,makeSnapshot,collect,publish,requestJson,REPO,REPO_ID,OWNER_ID,MAX_RUNS} from '../tools/cesar-os-ci/snapshot.mjs';

const now=new Date('2026-10-10T13:40:00.000Z'),win=windowFor(now);
const token='f'.repeat(40),sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:REPO,GITHUB_REPOSITORY_ID:REPO_ID,
 GITHUB_REPOSITORY_OWNER_ID:OWNER_ID,GITHUB_REF:'refs/heads/main',
 GITHUB_EVENT_NAME:'schedule',GITHUB_SHA:sha,GITHUB_TOKEN:token};
const run=(id,more={})=>({id,name:'DeliveryOS Thermal Shadow Gate',
  head_branch:'feat/example',status:'completed',conclusion:'success',
  created_at:'2026-10-10T13:12:00Z',updated_at:'2026-10-10T13:14:00Z',
  repository:{full_name:REPO},...more});

test('fixed identity, event, ref and token are required',()=>{
 assert.equal(verifyContext(env).repository,REPO);
 for(const [k,v] of [['GITHUB_REPOSITORY','someone/private'],
 ['GITHUB_REPOSITORY_ID','42'],['GITHUB_REPOSITORY_OWNER_ID','9'],
 ['GITHUB_REF','refs/heads/feature'],['GITHUB_EVENT_NAME','pull_request'],
 ['GITHUB_SHA','invalid'],['GITHUB_TOKEN','a']]){
  assert.throws(()=>verifyContext({...env,[k]:v}),/untrusted_workflow_context/);
 }
});
test('one-hour deterministic boundaries, metadata-only and commitment false',()=>{
 const a=makeSnapshot([run(3),run(2)],2,win);
 assert.equal(a.schema,'cesar-os-github-public-ci-snapshot-v1');
 assert.equal(a.records[0].id,2); assert.equal(a.records[1].id,3);
 assert.equal(a.possible_commitment,false);
 assert.equal(a.coverage_complete_claimed,false);
 assert.equal(a.collection_basis,'RUN_CREATED_AT');
 assert.equal(a.lifecycle_updates_complete,false);
 assert.equal(a.continuity_complete,false);
 assert.equal(a.raw_payload_persisted,false);
 assert.equal(a.record_count,2);
 assert.equal(Date.parse(a.window_end)-Date.parse(a.window_start),3600000);
 assert.equal(JSON.stringify(a).includes('GITHUB_TOKEN'),false);
});
test('empty window preserves bounded-empty',()=>{
 const a=makeSnapshot([],0,win);
 assert.equal(a.coverage_status,'BOUNDED_EMPTY');
});
test('100 pass, 101 fail closed without snapshot',()=>{
 assert.equal(makeSnapshot(Array.from({length:100},(_,i)=>run(i+1)),100,win).records.length,100);
 assert.throws(()=>makeSnapshot(Array.from({length:100},(_,i)=>run(i+1)),101,win),/incomplete_run_window/);
});
test('drift, duplicates, repo spoof, status mismatch fail',()=>{
 assert.throws(()=>makeSnapshot([run(1)],2,win),/incomplete_run_window/);
 assert.throws(()=>makeSnapshot([run(1),run(1)],2,win),/run_duplicate/);
 assert.throws(()=>makeSnapshot([run(1,{repository:{full_name:'other/repo'}})],1,win),/run_provenance_invalid/);
 assert.throws(()=>makeSnapshot([run(1,{status:'queued',conclusion:'success'})],1,win),/run_provenance_invalid/);
 assert.throws(()=>makeSnapshot([run(1,{created_at:'2026-10-10T11:12:00Z'})],1,win),/run_provenance_invalid/);
 assert.throws(()=>makeSnapshot([run(1,{updated_at:'2026-10-10T13:10:00Z'})],1,win),/run_provenance_invalid/);
 assert.throws(()=>makeSnapshot([run(1,{updated_at:'2026-10-10T15:00:00Z'})],1,win),/run_provenance_invalid/);
});
test('sanitize branch and workflow labels',()=>{
 const r=makeSnapshot([run(9,{name:'build\nunexpected',head_branch:'evil\tbranch'})],1,win).records[0];
 assert.equal(r.workflow,'build unexpected');assert.equal(r.branch,'evil branch');
});
test('collect uses pinned repo path, one hour, single 100-run page',async()=>{
 let called=0;
 const fetchFn=async(url,opts)=>{
  called++;
  assert.equal(new URL(url).pathname,'/repos/'+REPO+'/actions/runs');
  assert.equal(new URL(url).searchParams.get('per_page'),'100');
  assert(new URL(url).searchParams.get('created').includes('..'));
  assert.equal(opts.headers.authorization,'Bearer '+token);
  return {status:200,redirected:false,json:async()=>({total_count:1,workflow_runs:[run(1)]})};
 };
 const result=await collect(token,{now,fetchFn});
 assert.equal(called,1);assert.equal(result.record_count,1);
});
test('GitHub failure and unauthorized API target fail closed',async()=>{
 await assert.rejects(requestJson('https://evil.example/token',{token}),/api_target_not_allowed/);
 await assert.rejects(requestJson('https://api.github.com/repos/other/repo/actions/runs',{token}),/api_target_not_allowed/);
 await assert.rejects(collect(token,{now,fetchFn:async()=>({status:403,redirected:false})}),/github_api_status_403/);
});
test('publish only exact ref and path, with existing SHA',async()=>{
 const snapshot=makeSnapshot([run(2)],1,win);
 const calls=[];
 const responses=[
  {status:200,value:{ref:'refs/heads/cesar-os-ci-snapshots'}},
  {status:200,value:{sha:'b'.repeat(40)}},
  {status:200,value:{content:{path:'ci-snapshots/deliveryos/latest.json',sha:'c'.repeat(40)},commit:{sha:'d'.repeat(40)}}}
 ];
 const fetchFn=async(url,opts)=>{
  calls.push({url,opts});
  const r=responses[calls.length-1];
  return {status:r.status,redirected:false,json:async()=>r.value};
 };
 const r=await publish(snapshot,{sha},{token,fetchFn});
 assert.equal(r.status,'PUBLISHED');assert.equal(r.commit_sha,'d'.repeat(40));assert.equal(calls.length,3);
 assert.equal(calls[2].opts.method,'PUT');
 const body=JSON.parse(calls[2].opts.body);
 assert.equal(body.branch,'cesar-os-ci-snapshots');
 assert.equal(body.sha,'b'.repeat(40));
 assert.equal(JSON.parse(Buffer.from(body.content,'base64')).record_count,1);
 assert(calls[2].url.endsWith('/contents/ci-snapshots/deliveryos/latest.json'));
});
test('first-time publish creates fixed snapshot branch and file only',async()=>{
 const snapshot=makeSnapshot([],0,win),calls=[];
 const statuses=[404,201,404,201];
 const fetchFn=async(url,opts)=>{
   calls.push({url,opts});
   return {status:statuses[calls.length-1],redirected:false,
     json:async()=>calls.length===2?{ref:'refs/heads/cesar-os-ci-snapshots',object:{sha}}:{content:{path:'ci-snapshots/deliveryos/latest.json',sha:'c'.repeat(40)},commit:{sha:'d'.repeat(40)}}};
 };
 const result=await publish(snapshot,{sha},{token,fetchFn});
 assert.equal(result.status,'PUBLISHED');
 assert.equal(calls.length,4);
 assert.equal(JSON.parse(calls[1].opts.body).ref,'refs/heads/cesar-os-ci-snapshots');
 assert.equal(JSON.parse(calls[1].opts.body).sha,sha);
});

test('reject publish receipt from wrong file or missing commit SHA',async()=>{
 const snap=makeSnapshot([],0,win);
 const replies=[
   {status:200,value:{ref:'refs/heads/cesar-os-ci-snapshots'}},
   {status:404,value:null},
   {status:201,value:{content:{path:'other/snapshot.json',sha:'b'.repeat(40)}}}
 ];
 let n=0;const fetchFn=async()=>{const r=replies[n++];return {status:r.status,redirected:false,json:async()=>r.value}};
 await assert.rejects(publish(snap,{sha},{token,fetchFn}),/snapshot_publish_receipt_invalid/);
});
test('reject mismatched created branch receipt and malformed snapshot before a write',async()=>{
 const snap=makeSnapshot([],0,win);const bad={...snap,collection_basis:'ARBITRARY'};
 await assert.rejects(publish(bad,{sha},{token,fetchFn:async()=>{throw Error('must not call')}}),/publish_contract_invalid/);
 const replies=[
   {status:404,value:null},
   {status:201,value:{ref:'refs/heads/other',object:{sha}}}
 ];
 let n=0;const fetchFn=async()=>{const r=replies[n++];return {status:r.status,redirected:false,json:async()=>r.value}};
 await assert.rejects(publish(snap,{sha},{token,fetchFn}),/snapshot_branch_receipt_invalid/);
});

test('manual-only workflow tests before requiring repo-wide write token',()=>{
 const yml=readFileSync(new URL('../.github/workflows/cesar-os-public-ci-snapshot.yml',import.meta.url),'utf8');
 assert.match(yml,/^on:\\s*\\n\\s+workflow_dispatch:\\s*$/m);
 assert.doesNotMatch(yml,/^\\s*(schedule|cron|push|pull_request|pull_request_target|workflow_run):/m);
 assert.match(yml,/^permissions: \\{\\}$/m);
 assert.match(yml,/^\\s+actions: read$/m);
 assert.match(yml,/^\\s+contents: write$/m);
 assert.match(yml,/uses: actions\\/checkout@[a-f0-9]{40}/);
 assert.match(yml,/persist-credentials: false/);
 assert(yml.indexOf('run: node --test test/cesar-os-ci-snapshot.test.mjs')>=0);
 assert(yml.indexOf('run: node --test test/cesar-os-ci-snapshot.test.mjs') <
        yml.indexOf('run: node tools/cesar-os-ci/snapshot.mjs'));
 assert.match(yml,/github.ref == 'refs\\/heads\\/main'/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archivePathFor,archiveSnapshot} from '../tools/cesar-os-ci/archive.mjs';
import {main} from '../tools/cesar-os-ci/snapshot.mjs';

const sha='a'.repeat(40),token='t'.repeat(40);
const snapshot=(more={})=>({
  schema:'cesar-os-github-public-ci-snapshot-v1',source_id:'github-actions-public-deliveryos',
  repository:'cesarspichencoff-cmyk/delviery-os',
  repository_id:'1279837591',repository_owner_id:'292320191',collection_basis:'RUN_CREATED_AT',
  generated_at:'2026-10-10T20:46:45.627Z',window_start:'2026-10-10T19:46:45.627Z',
  window_end:'2026-10-10T20:46:45.627Z',record_count:1,records:[{id:123}],
  coverage_status:'BOUNDED_OBSERVED',lifecycle_updates_complete:false,
  continuity_complete:false,coverage_complete_claimed:false,
  raw_payload_persisted:false,possible_commitment:false,...more
});
const path='ci-snapshots/deliveryos/archive/2026/10/10/20261010T204645627Z.json';
const api='https://api.github.com/repos/cesarspichencoff-cmyk/delviery-os';
function replies(q,seen){let i=0;return async(url,opts)=>{
  seen.push({url,opts});assert(url.startsWith(api+'/'));
  if(i>=q.length)throw Error('unexpected_network_request');
  return q[i++];
};}
const okBranch={status:200,value:{ref:'refs/heads/cesar-os-ci-snapshots'}};
const notFound={status:404,value:null};
const okWrite={status:201,value:{content:{path,sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}}};

test('fixed, ISO-safe, time-addressed path',()=>{
  assert.equal(archivePathFor(snapshot()),path);
  assert.equal(archivePathFor(snapshot({generated_at:'2026-10-11T01:02:03.004Z',window_start:'2026-10-11T00:02:03.004Z',window_end:'2026-10-11T01:02:03.004Z'})),
    'ci-snapshots/deliveryos/archive/2026/10/11/20261011T010203004Z.json');
});

test('malformed or broadened completeness claims are rejected before API calls',async()=>{
  for(const changed of [{continuity_complete:true},{lifecycle_updates_complete:true},
    {possible_commitment:true},{coverage_complete_claimed:true},{raw_payload_persisted:true},
    {repository:'else/else'},{repository_id:'7'},{repository_owner_id:'9'},{generated_at:'../../bad'},{window_start:'2026-10-10T18:46:45.627Z'},
    {record_count:101},{record_count:0},{collection_basis:'UPDATED_AT'}]){
    const s=snapshot(changed);assert.throws(()=>archivePathFor(s),/archive_snapshot_contract_invalid/);
    await assert.rejects(archiveSnapshot(s,{sha},{token,requestJson:()=>{throw Error('network_called')}}),/archive_snapshot_contract_invalid/);
  }
});

test('create-only journal write preserves legacy latest and verified path',async()=>{
  const calls=[];const r=await archiveSnapshot(snapshot(),{sha},{token,
    requestJson:replies([okBranch,notFound,okWrite],calls)});
  assert.equal(r.status,'ARCHIVED');assert.equal(r.path,path);
  assert.equal(calls.length,3);
  assert(calls[0].url.endsWith('/git/ref/heads/cesar-os-ci-snapshots'));
  assert(calls[1].url.endsWith('/contents/'+path+'?ref=cesar-os-ci-snapshots'));
  assert.equal(calls[2].opts.method,'PUT');
  assert.deepEqual(JSON.parse(Buffer.from(calls[2].opts.body.content,'base64')),JSON.parse(JSON.stringify(snapshot())));
  assert.equal(calls[2].opts.body.sha,undefined);
  assert(!calls.some(c=>c.url.endsWith('/latest.json')));
});

test('new snapshot branch is created using triggering SHA, not arbitrary base',async()=>{
  const calls=[];
  const made={status:201,value:{ref:'refs/heads/cesar-os-ci-snapshots',object:{sha}}};
  const out=await archiveSnapshot(snapshot(),{sha},{token,requestJson:replies([notFound,made,notFound,okWrite],calls)});
  assert.equal(out.status,'ARCHIVED');
  assert.deepEqual(calls[1].opts.body,{ref:'refs/heads/cesar-os-ci-snapshots',sha});
});

test('exact duplicate archive is idempotent and never overwritten',async()=>{
  const calls=[];const original=Buffer.from(JSON.stringify(snapshot())+'\n').toString('base64');
  const out=await archiveSnapshot(snapshot(),{sha},{token,requestJson:replies([
    okBranch,{status:200,value:{encoding:'base64',content:original}}
  ],calls)});
  assert.equal(out.status,'ALREADY_ARCHIVED');assert.equal(calls.length,2);
});

test('archive path collision is fail-closed with no PUT',async()=>{
  const calls=[];await assert.rejects(archiveSnapshot(snapshot(),{sha},{token,requestJson:replies([
    okBranch,{status:200,value:{encoding:'base64',content:Buffer.from('{}').toString('base64')}}
  ],calls)}),/archive_collision_or_unverifiable/);assert.equal(calls.length,2);
});

test('missing identity, branch receipt and invalid write result fail closed',async()=>{
  await assert.rejects(archiveSnapshot(snapshot(),{sha:'oops'},{token,requestJson:()=>{throw Error('called')}}),/archive_context_invalid/);
  await assert.rejects(archiveSnapshot(snapshot(),{sha},{token,requestJson:replies([
    {status:200,value:{ref:'refs/heads/not-archive'}}
  ],[])}),/archive_branch_identity_invalid/);
  await assert.rejects(archiveSnapshot(snapshot(),{sha},{token,requestJson:replies([
    notFound,{status:201,value:{ref:'refs/heads/wrong',object:{sha}}}
  ],[])}),/archive_branch_receipt_invalid/);
  await assert.rejects(archiveSnapshot(snapshot(),{sha},{token,requestJson:replies([
    okBranch,notFound,{status:201,value:{content:{path:'other'},commit:{sha:'c'.repeat(40)}}}
  ],[])}),/archive_write_receipt_invalid/);
});


const context={
 GITHUB_REPOSITORY:'cesarspichencoff-cmyk/delviery-os',
 GITHUB_REPOSITORY_ID:'1279837591',GITHUB_REPOSITORY_OWNER_ID:'292320191',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
 GITHUB_SHA:sha,GITHUB_TOKEN:token
};
function response(status,value){return {status,redirected:false,json:async()=>value};}

test('whole producer archives before latest and keeps manual workflow identity',async()=>{
 const calls=[];
 const fetchFn=async(url,opts)=>{
  const path=new URL(url).pathname;
  calls.push({path,method:opts.method});
  if(path.endsWith('/actions/runs'))return response(200,{total_count:0,workflow_runs:[]});
  if(path.endsWith('/git/ref/heads/cesar-os-ci-snapshots'))return response(200,{ref:'refs/heads/cesar-os-ci-snapshots'});
  if(path.includes('/contents/ci-snapshots/deliveryos/archive/')&&opts.method==='GET')return response(404,null);
  if(path.includes('/contents/ci-snapshots/deliveryos/archive/')&&opts.method==='PUT')return response(201,{
    content:{path:path.split('/contents/')[1],sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}
  });
  if(path.endsWith('/contents/ci-snapshots/deliveryos/latest.json')&&opts.method==='GET')return response(404,null);
  if(path.endsWith('/contents/ci-snapshots/deliveryos/latest.json')&&opts.method==='PUT')return response(201,{
    content:{path:'ci-snapshots/deliveryos/latest.json',sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}
  });
  throw Error('unexpected_API_call:'+path);
 };
 const r=await main(context,{fetchFn,now:new Date('2026-10-10T20:46:45.627Z')});
 assert.equal(r.status,'PUBLISHED');assert.equal(r.archive_status,'ARCHIVED');
 assert.equal(calls.filter(x=>x.method==='PUT').length,2);
 const puts=calls.filter(x=>x.method==='PUT');
 assert.match(puts[0].path,/\/archive\//);
 assert(puts[1].path.endsWith('/latest.json'));
});

test('whole producer never replaces latest if archived path conflicts',async()=>{
 const calls=[];
 const fetchFn=async(url,opts)=>{
  const path=new URL(url).pathname;
  calls.push(path);
  if(path.endsWith('/actions/runs'))return response(200,{total_count:0,workflow_runs:[]});
  if(path.endsWith('/git/ref/heads/cesar-os-ci-snapshots'))return response(200,{ref:'refs/heads/cesar-os-ci-snapshots'});
  if(path.includes('/contents/ci-snapshots/deliveryos/archive/'))return response(200,{
    encoding:'base64',content:Buffer.from('{}').toString('base64')
  });
  throw Error('must_not_touch_latest_or_put');
 };
 await assert.rejects(main(context,{fetchFn,now:new Date('2026-10-10T20:46:45.627Z')}),/archive_collision_or_unverifiable/);
 assert.equal(calls.length,3);
 assert(!calls.some(x=>x.endsWith('/latest.json')));
});

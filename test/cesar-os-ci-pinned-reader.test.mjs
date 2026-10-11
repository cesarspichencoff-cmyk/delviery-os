import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readPinnedArchive} from '../tools/cesar-os-ci/pinned-archive-reader.mjs';
import {gitBlobSha} from '../tools/cesar-os-ci/archive-consumer.mjs';
const path='ci-snapshots/deliveryos/archive/2026/10/10/20261010T204645627Z.json';
const token='t'.repeat(40);
const raw=readFileSync(new URL('./fixtures/cesar-os-deliveryos-public-20261010.json',import.meta.url));
const sha=gitBlobSha(raw);
const okValue=(bytes=raw)=>({type:'file',path,encoding:'base64',sha:gitBlobSha(bytes),
 size:bytes.length,content:bytes.toString('base64')});
const fake=(reply,calls)=>async(url,opts)=>{
 calls.push({url,opts});
 return {status:reply.status??200,redirected:!!reply.redirected,json:async()=>reply.value};
};

test('real-public fixture is verified from pinned GET and no D1 effect claimed',async()=>{
 const calls=[];
 const record=await readPinnedArchive(token,path,{fetchFn:fake({value:okValue()},calls)});
 assert.equal(record.source_id,'github-actions-public-deliveryos');
 assert.equal(record.record_count,2);
 assert.equal(record.git_blob_sha,sha);
 assert.equal(record.snapshot_sha256,createHash('sha256').update(raw).digest('hex'));
 assert.equal(record.archive_verification,'GITHUB_BLOB_READ_VERIFIED_NOT_INGESTED');
 assert.equal(record.private_ingest_performed,false);
 assert.equal(record.external_effect_authorized,false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,
  'https://api.github.com/repos/cesarspichencoff-cmyk/delviery-os/contents/'+
  path+'?ref=cesar-os-ci-snapshots');
 assert.equal(calls[0].opts.method,'GET');
 assert.equal(calls[0].opts.redirect,'manual');
});
test('untrusted token or path rejected before any API call',async()=>{
 let called=0;
 for(const p of ['../../other','ci-snapshots/deliveryos/latest.json',
   '/ci-snapshots/deliveryos/archive/2026/10/10/test.json',
   'ci-snapshots/deliveryos/archive/2026/10/10/20261010T204645627Z.json?ref=main']){
  await assert.rejects(readPinnedArchive(token,p,{fetchFn:async()=>{called++;throw Error('network_unexpected')}}),
   /pinned_archive_request_invalid/);
 }
 await assert.rejects(readPinnedArchive('bad',path,{fetchFn:async()=>{called++;throw Error('network_unexpected')}}),
  /pinned_archive_request_invalid/);
 assert.equal(called,0);
});
test('404, forbidden and redirects do not create evidence',async()=>{
 for(const reply of [{status:404},{status:403,value:{}},{status:302,redirected:true}]){
  await assert.rejects(readPinnedArchive(token,path,{fetchFn:fake(reply,[])}));
 }
});
test('forged API path, sha, encoding and claimed size fail closed',async()=>{
 for(const v of [
  {...okValue(),path:'other'},
  {...okValue(),sha:'f'.repeat(40)},
  {...okValue(),encoding:'utf8'},
  {...okValue(),size:raw.length+1},
  {...okValue(),content:'!!!!'},
  {...okValue(),content:'YWJj='},
  {...okValue(),type:'dir'}
 ]){
  await assert.rejects(readPinnedArchive(token,path,{fetchFn:fake({value:v},[])}));
 }
});
test('same hash in metadata is insufficient if raw content differs',async()=>{
 const bytes=Buffer.from(JSON.stringify({...JSON.parse(raw.toString()),repository_id:'999'})+'\n');
 await assert.rejects(readPinnedArchive(token,path,{fetchFn:fake({value:okValue(bytes)},[])}),
  /archive_identity_mismatch|archive_snapshot_contract_invalid/);
});
test('oversized base64 response rejected before archive parsing',async()=>{
 const value=okValue();
 value.content='A'.repeat(140004);
 await assert.rejects(readPinnedArchive(token,path,{fetchFn:fake({value},[])}),
  /pinned_archive_response_invalid/);
});

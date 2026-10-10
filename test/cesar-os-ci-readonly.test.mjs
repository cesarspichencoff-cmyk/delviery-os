import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateArchive,planReplay,gitBlobSha} from '../tools/cesar-os-ci/archive-consumer.mjs';
import {validateRunUpdate} from '../tools/cesar-os-ci/run-reconciler.mjs';

const repo='cesarspichencoff-cmyk/delviery-os';
const run={id:37,workflow:'DeliveryOS Test',branch:'main',
 status:'in_progress',conclusion:null,
 created_at:'2026-10-10T20:30:00.000Z',updated_at:'2026-10-10T20:30:00.000Z'};
const snapshot={
 schema:'cesar-os-github-public-ci-snapshot-v1',source_id:'github-actions-public-deliveryos',
 repository:repo,repository_id:'1279837591',repository_owner_id:'292320191',
 collection_basis:'RUN_CREATED_AT',generated_at:'2026-10-10T21:00:00.000Z',
 window_start:'2026-10-10T20:00:00.000Z',window_end:'2026-10-10T21:00:00.000Z',
 record_count:1,records:[run],coverage_status:'BOUNDED_OBSERVED',
 lifecycle_updates_complete:false,continuity_complete:false,
 coverage_complete_claimed:false,possible_commitment:false,raw_payload_persisted:false
};
const path='ci-snapshots/deliveryos/archive/2026/10/10/20261010T210000000Z.json';
const now=new Date('2026-10-11T00:00:00.000Z');

test('verified archive bytes yield exact Git and SHA-256 hashes',()=>{
 const rawBytes=Buffer.from(JSON.stringify(snapshot,null,2)+'\n');
 const proof=validateArchive(snapshot,path,{rawBytes});
 assert.equal(proof.git_blob_sha,gitBlobSha(rawBytes));
 assert.equal(proof.hash,createHash('sha256').update(rawBytes).digest('hex'));
});
test('missing archive windows remain gaps, never false completed coverage',()=>{
 const p=planReplay([{path,snapshot}],{
  start:'2026-10-10T19:00:00.000Z',
  end:'2026-10-10T22:00:00.000Z',now
 });
 assert.equal(p.records.length,1);
 assert.equal(p.coverage.gaps.length,2);
 assert.equal(p.coverage.continuity_complete,false);
 assert.equal(p.external_effect_authorized,false);
 assert.equal(p.db_writes,0);
});
test('a late state update stays a source claim without human commitment',()=>{
 const after={id:37,name:run.workflow,head_branch:run.branch,
  status:'completed',conclusion:'failure',
  created_at:run.created_at,updated_at:'2026-10-10T21:25:00.000Z',
  repository:{full_name:repo,id:1279837591,owner:{id:292320191}}
 };
 const checked=validateRunUpdate(after,run,{now});
 assert.equal(checked.status,'completed');
 assert.equal(checked.conclusion,'failure');
 assert.equal(checked.truth_class,'SOURCE_CLAIM');
 assert.equal(checked.possible_commitment,false);
});
test('spoofed owner and contradictory same-time state are rejected',()=>{
 const base={id:37,name:run.workflow,head_branch:run.branch,
  status:'completed',conclusion:'success',
  created_at:run.created_at,updated_at:run.updated_at,
  repository:{full_name:repo,id:1279837591,owner:{id:292320191}}
 };
 assert.throws(()=>validateRunUpdate(base,run,{now}),/reconcile_equal_timestamp_conflict/);
 assert.throws(()=>validateRunUpdate({...base,repository:{...base.repository,id:99}},run,{now}),/reconcile_run_identity_invalid/);
});

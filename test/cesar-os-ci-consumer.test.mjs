import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateArchive,planReplay,verifyHorizon,discoverArchiveEvidence,checkpointShape,MAX_RECONCILE} from '../tools/cesar-os-ci/archive-consumer.mjs';
import {reconcilePublicRuns,validateRunUpdate} from '../tools/cesar-os-ci/run-reconciler.mjs';
import {memoryCursorStore,D1CursorStore,MIGRATION_SQL} from '../tools/cesar-os-ci/cursor-store.mjs';

const REPO='cesarspichencoff-cmyk/delviery-os',token='t'.repeat(40),UTC='2026-10-11T00:00:00.000Z';
const makeRun=(id,created,more={})=>({id,workflow:'DeliveryOS Thermal Shadow Gate',branch:'main',
 status:'in_progress',conclusion:null,created_at:created,updated_at:created,...more});
const snapshot=(end,records=[],more={})=>{
 const beg=new Date(Date.parse(end)-3600000).toISOString();
 return {schema:'cesar-os-github-public-ci-snapshot-v1',source_id:'github-actions-public-deliveryos',
 repository:REPO,repository_id:'1279837591',repository_owner_id:'292320191',
 generated_at:end,window_start:beg,window_end:end,record_count:records.length,
 coverage_status:records.length?'BOUNDED_OBSERVED':'BOUNDED_EMPTY',
 collection_basis:'RUN_CREATED_AT',lifecycle_updates_complete:false,
 continuity_complete:false,coverage_complete_claimed:false,raw_payload_persisted:false,
 possible_commitment:false,records,...more};
};
const archive=s=>({path:'ci-snapshots/deliveryos/archive/'+s.generated_at.slice(0,4)+'/'+s.generated_at.slice(5,7)+'/'+s.generated_at.slice(8,10)+'/'+s.generated_at.replace(/[-:.]/g,'')+'.json',snapshot:s});
const earlier='2026-10-10T21:00:00.000Z',later='2026-10-10T23:00:00.000Z';
const s1=snapshot(earlier,[makeRun(1,'2026-10-10T20:40:00.000Z')]);
const s2=snapshot(later,[makeRun(2,'2026-10-10T22:30:00.000Z')]);
const horizon={start:'2026-10-10T20:00:00.000Z',end:UTC,now:new Date(UTC)};
const replies=(map,calls)=>async(url,opts)=>{
 calls.push({url,opts});const path=new URL(url).pathname,answer=map[path];
 if(!answer)return {status:404,redirected:false};
 return {status:answer.status??200,redirected:false,json:async()=>answer.value};
};

test('fixed repository and archive path are verified',()=>{
 const x=validateArchive(s1,archive(s1).path);
 assert.match(x.hash,/^[a-f0-9]{64}$/);
 assert.throws(()=>validateArchive(s1,'else'),/archive_path_mismatch/);
 for(const part of [{repository_id:'999'},{repository_owner_id:'999'},{continuity_complete:true},{raw_payload_persisted:true}]){
  assert.throws(()=>validateArchive(snapshot(earlier,s1.records,part),archive(s1).path));
 }
});
test('archive rejects invalid status and created_at outside declared window',()=>{
 for(const record of [{...s1.records[0],status:'queued',conclusion:'failure'},
  {...s1.records[0],created_at:'2026-10-10T18:00:00.000Z'}]){
  assert.throws(()=>validateArchive(snapshot(earlier,[record]),archive(s1).path));
 }
});
test('missed windows and empty archive are never complete coverage',()=>{
 const p=planReplay([archive(s1),archive(s2)],horizon);
 assert.equal(p.coverage.gaps.length,2);
 assert.equal(p.records.length,2);
 assert(p.records.every(x=>x.possible_commitment===false&&x.source_claim_only));
 assert.equal(p.coverage.continuity_complete,false);
 const empty=planReplay([],horizon);
 assert.equal(empty.coverage.status,'GAPS_DETECTED');
 assert.equal(empty.coverage.gaps.length,1);
});
test('replay cursor catches late archive and avoids reprocessing known path',()=>{
 const a=planReplay([archive(s2)],horizon);
 const b=planReplay([archive(s1),archive(s2)],{...horizon,cursor:a.cursor});
 assert.equal(b.archives_new,1);
 const c=planReplay([archive(s1),archive(s2)],{...horizon,cursor:b.cursor});
 assert.equal(c.archives_new,0);
 assert.equal(c.expected_previous_revision,2);
});
test('an archive changed after the cursor was recorded fails closed',()=>{
 const a=planReplay([archive(s1)],horizon);
 const changed=snapshot(earlier,[makeRun(1,'2026-10-10T20:40:00.000Z',{status:'completed',conclusion:'success',updated_at:'2026-10-10T20:50:00.000Z'})]);
 assert.throws(()=>planReplay([archive(changed)],{...horizon,cursor:a.cursor}),/archive_changed_since_checkpoint/);
});
test('newer lifecycle observation wins, equal timestamp contradiction stops',()=>{
 const first=snapshot('2026-10-10T22:00:00.000Z',[makeRun(19,'2026-10-10T21:30:00.000Z')]);
 const updated=snapshot('2026-10-10T22:30:00.000Z',[makeRun(19,'2026-10-10T21:30:00.000Z',{status:'completed',conclusion:'success',updated_at:'2026-10-10T22:02:00.000Z'})]);
 assert.equal(planReplay([archive(first),archive(updated)],horizon).records[0].conclusion,'success');
 const bad=snapshot('2026-10-10T22:25:00.000Z',[makeRun(19,'2026-10-10T21:30:00.000Z',{status:'completed',conclusion:'failure',updated_at:'2026-10-10T22:02:00.000Z'})]);
 assert.throws(()=>planReplay([archive(first),archive(updated),archive(bad)],horizon),/same_update_conflicting_state/);
});
test('bounded lookback rejects future and >7 day horizons',()=>{
 assert.throws(()=>verifyHorizon('2026-10-01T00:00:00.000Z',UTC,{now:new Date(UTC)}),/archive_horizon_invalid/);
 assert.throws(()=>verifyHorizon(UTC,UTC,{now:new Date(UTC)}),/archive_horizon_invalid/);
 assert.throws(()=>verifyHorizon(UTC,'2026-10-12T00:00:00.000Z',{now:new Date(UTC)}),/archive_horizon_invalid/);
 assert.throws(()=>checkpointShape({schema:'x',source_id:'unknown',revision:1,archives:{}}),/cursor_invalid/);
});
test('reconcile work is limited and rotates to prevent starvation',()=>{
 const runs=Array.from({length:MAX_RECONCILE+3},(_,i)=>makeRun(i+1,'2026-10-10T20:30:00.000Z'));
 const first=planReplay([archive(snapshot(earlier,runs))],horizon);
 assert.equal(first.reconcile_ids.length,20);
 assert.equal(first.reconcile_deferred,3);
 const next=planReplay([archive(snapshot(earlier,runs))],{...horizon,cursor:first.cursor});
 assert.deepEqual(next.reconcile_ids.slice(0,3),[21,22,23]);
});
test('public discovery uses pinned paths and only GET methods',async()=>{
 const calls=[],day='ci-snapshots/deliveryos/archive/2026/10/10',file=archive(s1).path;
 const map={['/repos/'+REPO+'/contents/'+day]:{value:[{type:'file',path:file,name:file.split('/').at(-1),sha:'a'.repeat(40)}]},
 ['/repos/'+REPO+'/contents/'+file]:{value:{sha:'a'.repeat(40),encoding:'base64',content:Buffer.from(JSON.stringify(s1)).toString('base64')}}};
 const result=await discoverArchiveEvidence(token,{start:horizon.start,end:'2026-10-10T21:30:00.000Z',now:new Date(UTC),fetchFn:replies(map,calls)});
 assert.equal(result.snapshots.length,1);
 assert.equal(calls.length,2);
 assert(calls.every(c=>c.opts.method==='GET'));
});
test('missing daily directory is evidence gap, not zero CI runs',async()=>{
 const result=await discoverArchiveEvidence(token,{...horizon,fetchFn:replies({},[])});
 assert.deepEqual(result.days_missing,['2026-10-10']);
 assert.equal(result.complete_claimed,false);
});
test('directory path spoofing fails before content fetch',async()=>{
 const day='ci-snapshots/deliveryos/archive/2026/10/10',calls=[];
 const map={['/repos/'+REPO+'/contents/'+day]:{value:[{type:'file',path:'else/path',name:'bad',sha:'a'.repeat(40)}]}};
 await assert.rejects(discoverArchiveEvidence(token,{...horizon,fetchFn:replies(map,calls)}),/archive_listing_untrusted/);
 assert.equal(calls.length,1);
});
test('late terminal state comes only as source claim, not human commitment',async()=>{
 const prior=s1.records[0],p=planReplay([archive(s1)],horizon),calls=[];
 const update={id:1,name:prior.workflow,head_branch:prior.branch,
  status:'completed',conclusion:'failure',created_at:prior.created_at,
  updated_at:'2026-10-10T21:35:00.000Z',
  repository:{full_name:REPO,id:1279837591,owner:{id:292320191}}};
 const out=await reconcilePublicRuns(token,p,{fetchFn:replies({['/repos/'+REPO+'/actions/runs/1']:{value:update}},calls),now:new Date(UTC)});
 assert.equal(out.updates.length,1);
 assert.equal(out.updates[0].possible_commitment,false);
 assert.equal(out.lifecycle_updates_complete,false);
 assert.equal(out.db_writes,0);
});
test('reconciler rejects forged owner and clock regression',()=>{
 const prior=s1.records[0];
 const base={id:1,name:prior.workflow,head_branch:prior.branch,
  status:'completed',conclusion:'success',created_at:prior.created_at,updated_at:'2026-10-10T21:35:00.000Z',
  repository:{full_name:REPO,id:1279837591,owner:{id:292320191}}};
 assert.throws(()=>validateRunUpdate({...base,repository:{...base.repository,id:45}},prior,{now:new Date(UTC)}),/reconcile_run_identity_invalid/);
 assert.throws(()=>validateRunUpdate({...base,updated_at:'2026-10-10T20:00:00.000Z'},prior,{now:new Date(UTC)}),/reconcile_clock_or_history_invalid/);
});
test('memory cursor supports CAS and rejects stale revision',async()=>{
 const store=memoryCursorStore(),plan=planReplay([archive(s1)],horizon);
 assert.equal((await store.load()).revision,0);
 assert.equal((await store.compareAndSwap(0,plan.cursor)).status,'COMMITTED');
 assert.equal((await store.load()).revision,1);
 assert.equal((await store.compareAndSwap(0,plan.cursor)).status,'CAS_CONFLICT');
});
test('D1 adapter is read-only until explicit compare-and-swap',async()=>{
 const queries=[];
 const db={prepare(sql){queries.push(sql);return {bind(){return {first:async()=>null}}};}};
 const result=await new D1CursorStore(db).load();
 assert.equal(result.revision,0);
 assert.equal(queries.length,1);
 assert(queries[0].startsWith('SELECT '));
 assert(MIGRATION_SQL.includes('CREATE TABLE IF NOT EXISTS ci_archive_cursors'));
});
test('D1 CAS reports conflicts without claiming a write',async()=>{
 const calls=[],db={prepare(sql){const o={sql,params:null};calls.push(o);return {bind(...args){o.params=args;return {run:async()=>({meta:{changes:0}})}}};}};
 const cursor=checkpointShape(null);cursor.revision=1;
 const result=await new D1CursorStore(db).compareAndSwap(0,cursor);
 assert.equal(result.status,'CAS_CONFLICT');
 assert.equal(result.written,false);
 assert.equal(calls[0].params[0],'github-actions-public-deliveryos');
});

test('adjacent verified empty windows stay BOUNDED_EMPTY and incomplete',()=>{
 const a=snapshot('2026-10-10T21:00:00.000Z',[]);
 const b=snapshot('2026-10-10T22:00:00.000Z',[]);
 const p=planReplay([archive(a),archive(b)],{...horizon,end:'2026-10-10T22:00:00.000Z'});
 assert.equal(p.coverage.status,'BOUNDED_EMPTY');
 assert.equal(p.coverage.gaps.length,0);
 assert.equal(p.coverage.continuity_complete,false);
});
test('equal timestamp contradictory conclusion is rejected',()=>{
 const prior=makeRun(48,'2026-10-10T20:30:00.000Z',{status:'completed',conclusion:'success'});
 const changed={id:48,name:prior.workflow,head_branch:prior.branch,status:'completed',
  conclusion:'failure',created_at:prior.created_at,updated_at:prior.updated_at,
  repository:{full_name:REPO,id:1279837591,owner:{id:292320191}}};
 assert.throws(()=>validateRunUpdate(changed,prior,{now:new Date(UTC)}),/reconcile_equal_timestamp_conflict/);
});

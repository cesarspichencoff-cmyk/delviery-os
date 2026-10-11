import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {packWorkObservationInserts,WORK_COLUMNS,MAX_ROWS_PER_INSERT,D1_FREE_QUERY_CEILING} from '../tools/cesar-os-ci/d1-bulk-plan.mjs';

const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
function obs(id){
 const row={
  source_id:'github-actions-public-deliveryos',external_ref:'run:'+id,
  signal_type:'PROJECT_CI',observed_at:'2026-10-10T20:46:45.627Z',
  ingested_at:'2026-10-10T20:47:00.000Z',domain:'WORK',privacy_scope:'ORGANIZATIONAL',
  truth_class:'SOURCE_CLAIM',authority:'OBSERVATION_ONLY',sensitivity:'LOW',
  subject_type:'GITHUB_WORKFLOW_RUN',subject_ref:'run:'+id,fact_summary:'CI workflow status',
  possible_commitment:false,due_at:'',confidence:1,evidence_ref:'github:run:'+id,
  attention_candidate:'SILENT',metadata_json:'{}'
 };
 row.content_fingerprint=sha([row.signal_type,row.fact_summary,row.due_at,row.subject_ref].join('|'));
 row.observation_id='obs_'+sha(['source-observation-v1',row.source_id,row.external_ref,row.content_fingerprint].join('|')).slice(0,20);
 return row;
}

test('100 records fit free D1 query and parameter ceilings without serial writes',()=>{
 assert.equal(WORK_COLUMNS.length,21);
 assert.equal(MAX_ROWS_PER_INSERT,4);
 const plan=packWorkObservationInserts(Array.from({length:100},(_,i)=>obs(i+1)));
 assert.equal(plan.rows_seen,100);
 assert.equal(plan.statement_count,25);
 assert.equal(plan.estimated_total_statements,30);
 assert(plan.estimated_total_statements<=D1_FREE_QUERY_CEILING);
 assert(plan.observations.every(x=>x.row_count===4&&x.params.length===84));
 assert(plan.observations.every(x=>!x.sql.includes('ON CONFLICT')&&!x.sql.includes('DO NOTHING')));
 assert.equal(plan.strict_existing_id_conflicts,true);
 assert.equal(plan.duplicate_content_comparison_implemented,false);
 assert(plan.observations.every(x=>!x.sql.includes('INSERT OR IGNORE')));
 assert.equal(plan.executed,false);
});
test('5 records become 2 multirow statements with exact binding counts',()=>{
 const plan=packWorkObservationInserts([1,2,3,4,5].map(obs));
 assert.deepEqual(plan.observations.map(x=>x.row_count),[4,1]);
 assert.deepEqual(plan.observations.map(x=>x.params.length),[84,21]);
 assert.equal(plan.max_parameters,84);
 assert(plan.observations.every(x=>x.params.includes('github-actions-public-deliveryos')));
});
test('empty collection is bounded, not a fabricated persisted receipt',()=>{
 const plan=packWorkObservationInserts([]);
 assert.equal(plan.rows_seen,0);
 assert.equal(plan.statement_count,0);
 assert.equal(plan.executed,false);
});
test('source impersonation, commitments, duplicate IDs and overlimit fail closed',()=>{
 for(const changed of [{source_id:'foreign'},{domain:'PERSONAL'},{truth_class:'FACT'},
  {possible_commitment:true},{observation_id:'obs_wrong!'}]){
   assert.throws(()=>packWorkObservationInserts([{...obs(1),...changed}]),/d1_work_observation_invalid/);
 }
 assert.throws(()=>packWorkObservationInserts([obs(1),obs(1)]),/d1_work_observation_invalid/);
 assert.throws(()=>packWorkObservationInserts(Array.from({length:101},(_,i)=>obs(i+1))),/d1_work_observation_count_invalid/);
});
test('missing column or invalid confidence fails before producing SQL',()=>{
 const missing={...obs(1)};delete missing.signal_type;
 assert.throws(()=>packWorkObservationInserts([missing]),/d1_work_missing_signal_type/);
 assert.throws(()=>packWorkObservationInserts([{...obs(1),confidence:NaN}]),/d1_work_confidence_invalid/);
});

test('raw payload, secrets, malformed and oversized metadata fail before SQL',()=>{
 for(const metadata_json of [
   '{"raw_payload":{"body":"private"}}',
   '{"nested":{"access_token":"secret"}}',
   '{"authorization":"Bearer private"}',
   '{"response_body":"raw"}',
   'not_json',
   JSON.stringify({oversized:'x'.repeat(4100)}),
   '[]',
   'null'
 ]){
  assert.throws(()=>packWorkObservationInserts([{...obs(1),metadata_json}]),/d1_work_metadata_/);
 }
});
test('bounded public metadata object is normalized to JSON text',()=>{
 const good={...obs(2),metadata_json:{public_run_id:27,raw_payload_persisted:false}};
 const p=packWorkObservationInserts([good]);
 const idx=WORK_COLUMNS.indexOf('metadata_json');
 const data=JSON.parse(p.observations[0].params[idx]);
 assert.equal(data.public_run_id,27);
 assert.equal(data.raw_payload_persisted,false);
});

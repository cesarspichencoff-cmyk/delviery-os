import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replayDryRun} from '../tools/cesar-os-ci/replay-dryrun.mjs';

const token='t'.repeat(40);
const horizon={start:'2026-10-10T20:00:00.000Z',end:'2026-10-10T21:00:00.000Z',now:new Date('2026-10-11T00:00:00.000Z')};

test('missing archive returns gaps, never a false zero-work conclusion',async()=>{
 const calls=[];
 const fetchFn=async(url,opts)=>{
  calls.push({url,opts});return {status:404,redirected:false};
 };
 const r=await replayDryRun({...horizon,token,fetchFn});
 assert.equal(r.status,'READ_ONLY_REPORT');
 assert.equal(r.archived_files,0);
 assert.equal(r.missing_days.length,1);
 assert.equal(r.coverage.status,'GAPS_DETECTED');
 assert.equal(r.continuity_complete,false);
 assert.equal(r.cursor_persisted,false);
 assert.equal(r.db_writes,0);
 assert.equal(r.ingestion_receipt_observed,false);
 assert(calls.every(x=>x.opts.method==='GET'));
});

test('failure of source authentication propagates without fabricated report',async()=>{
 const fetchFn=async()=>({status:403,redirected:false});
 await assert.rejects(replayDryRun({...horizon,token,fetchFn}),/github_api_status_403/);
});

test('long horizon is refused before network request',async()=>{
 await assert.rejects(replayDryRun({start:'2026-10-01T00:00:00.000Z',end:horizon.end,now:horizon.now,token,
  fetchFn:async()=>{throw Error('must_not_call_network')}}),/archive_horizon_invalid/);
});

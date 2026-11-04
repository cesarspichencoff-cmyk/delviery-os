'use strict';
// Synthetic examples are not an SQL Server lock manager or timing measurement.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {review,SCHEMA}=require('./comandas_reader_writer_contention_counterexample_review_only.cjs');
const sql=fs.readFileSync(path.join(__dirname,
 'comandas_reader_one_order_serializable_REVIEW_ONLY.sql'),'utf8');
const base=()=>({schema:SCHEMA,candidate_sql:sql,scenario:{
 reader_lock_acquired_ms:0,reader_lock_released_ms:500,
 writer_attempted_ms:20,relation:'SAME_ROW',
 reader_lock_kind:'SHARED_READ',writer_action:'UPDATE',
 reader_lock_timeout_ms:100
}});
let n=0;
function test(name,fn){fn();n++;console.log('PASS '+name)}
function holds(mut,reason,delay=null,conflict=false){
 const x=base();mut(x);
 const r=review(x);
 assert.equal(r.schema,SCHEMA);assert.equal(r.status,'HOLD');
 assert.equal(r.reason,reason);
 assert.equal(r.hypothetical_writer_wait_ms,delay);
 assert.equal(r.modeled_conflict,conflict);
 assert.equal(r.reader_lock_timeout_ms,100);
 assert.equal(r.scenario_is_synthetic,true);
 assert.equal(r.measured_sql_wait_ms,null);
 for(const k of ['actual_lock_mode_proven','writer_safety_proven',
  'source_revision_proven','candidate_sql_plan_proven',
  'query_execution_authorized','print_authorized'])assert.equal(r[k],false);
 assert.ok(Object.values(r.effects).every(v=>v===false));
}
const exceeded='HYPOTHETICAL_WRITER_DELAY_EXCEEDS_READER_LOCK_TIMEOUT';
const bounded='HYPOTHETICAL_WRITER_DELAY_NOT_A_SAFETY_PROOF';
const mutateSql=(a,b)=>x=>{
 assert.equal(x.candidate_sql.split(a).length,2,'SQL_MARKER_NOT_UNIQUE');
 x.candidate_sql=x.candidate_sql.replace(a,b);
};
test('shared reader holds a resource 480ms after writer arrives: 100ms does not protect writer',
 ()=>holds(()=>{},exceeded,480,true));
test('writer may wait longer than reader lock timeout',()=>{
 holds(x=>x.scenario.reader_lock_timeout_ms=100,
  exceeded,480,true);
});
test('writer 90ms hypothetical delay is still not authenticated safety',()=>{
 holds(x=>{x.scenario.reader_lock_released_ms=100;
  x.scenario.writer_attempted_ms=10},bounded,90,true);
});
test('writer 100ms hypothetical delay does not prove a hard production budget',()=>{
 holds(x=>{x.scenario.reader_lock_released_ms=101;
  x.scenario.writer_attempted_ms=1},bounded,100,true);
});
test('writer 101ms hypothetical wait exceeds reader 100ms limit',()=>{
 holds(x=>{x.scenario.reader_lock_released_ms=102;
  x.scenario.writer_attempted_ms=1},exceeded,101,true);
});
test('writer arriving after lock release is not production proof',
 ()=>holds(x=>x.scenario.writer_attempted_ms=600,
  'NO_HYPOTHETICAL_OVERLAP_NOT_REAL_SAFETY',0,false));
test('writer arriving exactly when reader releases has no modeled overlap',
 ()=>holds(x=>x.scenario.writer_attempted_ms=500,
  'NO_HYPOTHETICAL_OVERLAP_NOT_REAL_SAFETY',0,false));
test('fixture disjoint resource does not prove whole query disjoint',
 ()=>holds(x=>x.scenario.relation='DISJOINT',
  'DISJOINT_FIXTURE_NOT_WHOLE_PLAN_PROOF',0,false));
test('unknown resource overlap requires HOLD',
 ()=>holds(x=>x.scenario.relation='UNKNOWN','LOCK_INTERSECTION_UNPROVEN'));
test('unknown read lock mode requires HOLD',
 ()=>holds(x=>x.scenario.reader_lock_kind='UNKNOWN','LOCK_MODE_UNPROVEN'));
test('writer first means acquisition order is not established',
 ()=>holds(x=>{x.scenario.reader_lock_acquired_ms=50;
  x.scenario.writer_attempted_ms=20},
  'WRITER_FIRST_OR_ACQUISITION_ORDER_UNPROVEN'));
test('insert at identical row is not sufficient to prove range overlap',
 ()=>holds(x=>x.scenario.writer_action='INSERT','INSERT_LOCK_RANGE_NOT_ESTABLISHED'));
test('insert intersecting key range could hypothetically wait',
 ()=>holds(x=>{x.scenario.writer_action='INSERT';
  x.scenario.reader_lock_kind='KEY_RANGE_READ';
  x.scenario.relation='INTERSECTING_KEY_RANGE'},exceeded,480,true));
test('delete intersecting key range could hypothetically wait',
 ()=>holds(x=>{x.scenario.writer_action='DELETE';
  x.scenario.reader_lock_kind='KEY_RANGE_READ';
  x.scenario.relation='INTERSECTING_KEY_RANGE'},exceeded,480,true));
test('delete already read row could hypothetically wait',
 ()=>holds(x=>x.scenario.writer_action='DELETE',exceeded,480,true));
test('later read lock start does not change writer timeout scope',
 ()=>holds(x=>{x.scenario.reader_lock_acquired_ms=300;
  x.scenario.reader_lock_released_ms=1000;
  x.scenario.writer_attempted_ms=400},exceeded,600,true));
test('instantaneous synthetic read has no overlap',
 ()=>holds(x=>{x.scenario.reader_lock_released_ms=0;
  x.scenario.writer_attempted_ms=0},
 'NO_HYPOTHETICAL_OVERLAP_NOT_REAL_SAFETY',0,false));
test('large hypothetical lock interval is not constrained by TOP(201)',
 ()=>holds(x=>{x.scenario.reader_lock_released_ms=10000;
  x.scenario.writer_attempted_ms=1},exceeded,9999,true));
test('one millisecond delay is not world evidence',
 ()=>holds(x=>{x.scenario.reader_lock_released_ms=21;
  x.scenario.writer_attempted_ms=20},bounded,1,true));
test('200ms writer delay under key range is still possible in fixture',
 ()=>holds(x=>{x.scenario.reader_lock_released_ms=210;
  x.scenario.writer_attempted_ms=10;
  x.scenario.relation='INTERSECTING_KEY_RANGE';
  x.scenario.reader_lock_kind='KEY_RANGE_READ'},exceeded,200,true));
test('negative fixture time prohibited',
 ()=>holds(x=>x.scenario.writer_attempted_ms=-1,'SYNTHETIC_TIMELINE_INVALID'));
test('fractional fixture time prohibited',
 ()=>holds(x=>x.scenario.reader_lock_released_ms=3.1,'SYNTHETIC_TIMELINE_INVALID'));
test('nonmonotonic release before acquire prohibited',
 ()=>holds(x=>{x.scenario.reader_lock_acquired_ms=400;
  x.scenario.reader_lock_released_ms=300},'SYNTHETIC_TIMELINE_INVALID'));
test('input above hypothetical bounded timeline prohibited',
 ()=>holds(x=>x.scenario.reader_lock_released_ms=1000001,'SYNTHETIC_TIMELINE_INVALID'));
test('reader timeout cannot be silently changed',
 ()=>holds(x=>x.scenario.reader_lock_timeout_ms=500,'SYNTHETIC_TIMELINE_INVALID'));
test('writer action without known semantics prohibited',
 ()=>holds(x=>x.scenario.writer_action='UPSERT','SYNTHETIC_TIMELINE_INVALID'));
test('unknown relation text prohibited',
 ()=>holds(x=>x.scenario.relation='SAFE','SYNTHETIC_TIMELINE_INVALID'));
test('unapproved declared lock mode prohibited',
 ()=>holds(x=>x.scenario.reader_lock_kind='NOLOCK','SYNTHETIC_TIMELINE_INVALID'));
test('extra witness-like property rejected',
 ()=>holds(x=>x.scenario.writer_safe=true,'SYNTHETIC_TIMELINE_INVALID'));
test('root synthetic metadata cannot claim measured timing',
 ()=>holds(x=>x.real_wait_ms=0,'INPUT_INVALID'));
test('wrong schema rejected',
 ()=>holds(x=>x.schema='verified-sql','INPUT_INVALID'));
test('change isolation to READ COMMITTED refused',
 ()=>holds(mutateSql('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;',
 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED;'),'SQL_CANDIDATE_POLICY_DRIFT'));
test('change SQL reader lock timeout refused',
 ()=>holds(mutateSql('SET LOCK_TIMEOUT 100;','SET LOCK_TIMEOUT 500;'),
 'SQL_CANDIDATE_POLICY_DRIFT'));
test('change native iFood origin refused',
 ()=>holds(mutateSql("c.IDORGCMDVENDA='DLV_IFO'","c.IDORGCMDVENDA='FAKE'"),
 'SQL_CANDIDATE_POLICY_DRIFT'));
test('change TOP 201 to TOP 1 refused',
 ()=>holds(mutateSql('SELECT TOP (201)','SELECT TOP (1)'),
 'SQL_CANDIDATE_POLICY_DRIFT'));
test('adding UPDATE is not a review operation',
 ()=>holds(x=>x.candidate_sql+='\nUPDATE TEKNISA.COMANDAVEN SET IDSTCOMANDA=0;',
 'SQL_CANDIDATE_POLICY_DRIFT'));
test('adding NOLOCK not accepted as a no-writer-block shortcut',
 ()=>holds(mutateSql('FROM TEKNISA.COMANDAVEN AS c',
 'FROM TEKNISA.COMANDAVEN AS c WITH(NOLOCK)'),'SQL_CANDIDATE_POLICY_DRIFT'));
test('changing deadlock priority does not count as writer guarantee',
 ()=>holds(mutateSql('SET DEADLOCK_PRIORITY LOW;','SET DEADLOCK_PRIORITY HIGH;'),
 'SQL_CANDIDATE_POLICY_DRIFT'));
test('changing MAXDOP cannot be silently approved',
 ()=>holds(mutateSql('OPTION (MAXDOP 1);','OPTION (MAXDOP 8);'),
 'SQL_CANDIDATE_POLICY_DRIFT'));
test('second SELECT statement refused',
 ()=>holds(x=>x.candidate_sql+='\nSELECT TOP(1) * FROM TEKNISA.COMANDAVEN;',
 'SQL_CANDIDATE_POLICY_DRIFT'));
if(n!==40)throw Error('EXPECTED_40_TESTS_GOT_'+n);
console.log('COMANDAS_WRITER_CONTENTION_COUNTEREXAMPLE_PASS '+n+'/'+n+
 ' SYNTHETIC_HYPOTHETICAL_ONLY_NO_SQL_NO_PRINT_ALWAYS_HOLD');

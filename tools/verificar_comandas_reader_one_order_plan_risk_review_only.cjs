'use strict';
// Stage 3: real SQL/SHOWPLAN/Windows services NEVER invoked; fake summaries only.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {review,SCHEMA,PLAN_SCHEMA,TABLES}=
 require('./comandas_reader_one_order_plan_risk_review_only.cjs');
const sql=fs.readFileSync(path.join(__dirname,
 'comandas_reader_one_order_serializable_REVIEW_ONLY.sql'),'utf8');
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const copy=x=>JSON.parse(JSON.stringify(x));
const basePlan=()=>({
 schema:PLAN_SCHEMA,origin:'CANDIDATE_ESTIMATED_SELF_REPORTED',
 query_sha256:sha(sql),
 operators:TABLES.map(table=>({table,method:'INDEX_SEEK',estimated_rows:1})),
 warnings:[],estimated_cost:0.001,estimated_rows:1,
 params:{nrVendaRest:'VARCHAR(10)',nrComanda:'VARCHAR(10)'},
 claimed_writer_safe:false,claimed_semantic_complete:false
});
const input=()=>({schema:SCHEMA,candidate_sql:sql,plan:basePlan()});
const condition=(mutate,expected)=>{
 const x=input();mutate(x);const r=review(x);
 assert.equal(r.status,'HOLD');assert.equal(r.reason,expected);
 for(const key of ['source_plan_authenticated','execution_plan_proven',
   'plan_is_candidate_proven','sql_runtime_identity_proven',
   'writer_lock_impact_proven','semantic_revision_complete_proven',
   'can_query_orders','can_print','can_cutover','artifact_release_allowed'])
  assert.equal(r[key],false,key);
 assert.equal(r.real_sql_rows_read,0);
 assert.ok(Object.values(r.effects).every(v=>v===false));
 return r;
};
const replaceSql=(from,to)=>x=>{
 const parts=x.candidate_sql.split(from);
 assert.equal(parts.length,2,'SOURCE_MARKER_NOT_UNIQUE: '+from);
 x.candidate_sql=parts.join(to);
};
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name)}
const nominal='SELF_REPORTED_PLAN_IS_NOT_LOCK_OR_REVISION_ATTESTATION';
test('candidate with no plan can never be promoted',()=>condition(x=>x.plan=null,'CANDIDATE_PLAN_NOT_AVAILABLE'));
test('even four fictitious seeks stay HOLD',()=>condition(()=>{},nominal));
test('estimated plan claiming low cost is not measured SQL execution',()=>{
 const r=condition(x=>x.plan.estimated_cost=0,nominal);
 assert.equal(r.writer_lock_impact_proven,false);
});
test('actual self-reported plan cannot promote a real plan',()=>{
 condition(x=>x.plan.origin='CANDIDATE_ACTUAL_SELF_REPORTED',nominal);
});
test('installed V2 cached plan is never the candidate plan',()=>{
 condition(x=>x.plan.origin='INSTALLED_V2_CACHED',
  'CACHED_INSTALLED_V2_PLAN_IS_NOT_CANDIDATE_PLAN');
});
test('unknown plan provenance blocks',()=>condition(x=>x.plan.origin='UNKNOWN','PLAN_PROVENANCE_UNKNOWN'));
test('claimed matching query hash can only compare supplied bytes',()=>{
 const r=condition(()=>{},nominal);assert.equal(r.candidate_sha256,sha(sql));
});
test('mismatched plan digest blocks',()=>condition(x=>x.plan.query_sha256='f'.repeat(64),
 'PLAN_QUERY_SHA_DIFFERS_FROM_CANDIDATE'));
test('synthetic candidate with wrong branch store blocks',()=>{
 condition(replaceSql("c.CDLOJA='01'","c.CDLOJA='99'"),'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('omitted VENDAREST shop equality blocks review',()=>{
 condition(replaceSql('AND v.CDLOJA=c.CDLOJA','AND v.NRVENDAREST=c.NRVENDAREST'),
 'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('omitted ITCOMANDAVEN shop equality blocks review',()=>{
 condition(replaceSql('AND i.CDLOJA=c.CDLOJA','AND i.NRCOMANDA=c.NRCOMANDA'),
 'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('extra OR on VENDAREST join cannot bypass the store boundary',()=>{
 condition(replaceSql('AND v.NRVENDAREST=c.NRVENDAREST',
  "AND v.NRVENDAREST=c.NRVENDAREST OR v.CDLOJA='02'"),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('extra OR on ITCOMANDAVEN join cannot bypass the store boundary',()=>{
 condition(replaceSql('AND i.NRCOMANDA=c.NRCOMANDA',
  "AND i.NRCOMANDA=c.NRCOMANDA OR i.CDLOJA='02'"),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('WHERE disjunction cannot widen Itaim scope while equality remains',()=>{
 condition(replaceSql("AND c.CDLOJA='01'",
  "AND c.CDLOJA='01' OR c.CDLOJA='02'"),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('a trailing non-SELECT SQL command cannot masquerade as reviewed scope',()=>{
 condition(x=>x.candidate_sql+=" WAITFOR DELAY '00:00:01';",
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('a later READ COMMITTED SET cannot override the reviewed isolation',()=>{
 condition(replaceSql('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;',
  'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;\nSET TRANSACTION ISOLATION LEVEL READ COMMITTED;'),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('a later LOCK_TIMEOUT cannot silently relax writer-risk policy',()=>{
 condition(replaceSql('SET LOCK_TIMEOUT 100;',
  'SET LOCK_TIMEOUT 100;\nSET LOCK_TIMEOUT 60000;'),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('a later DEADLOCK_PRIORITY HIGH is not accepted',()=>{
 condition(replaceSql('SET DEADLOCK_PRIORITY LOW;',
  'SET DEADLOCK_PRIORITY LOW;\nSET DEADLOCK_PRIORITY HIGH;'),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('unreviewed session settings before SELECT are rejected',()=>{
 condition(replaceSql('SET NOCOUNT ON;',
  'SET NOCOUNT ON;\nSET XACT_ABORT OFF;'),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('unreviewed extra SELECT projection is rejected even if FROM is pinned',()=>{
 condition(replaceSql('i.DSOBSDESCIT,i.DSOBSPEDDIGCMD,i.TXPRODCOMVEN',
  'i.DSOBSDESCIT,i.DSOBSPEDDIGCMD,i.TXPRODCOMVEN,c.IDSTCOMANDA'),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('harmless SQL comment remains HOLD and still requires matching raw plan digest',()=>{
 const x=input();
 x.candidate_sql=x.candidate_sql.replace('SET LOCK_TIMEOUT 100;',
  'SET LOCK_TIMEOUT 100; /* LAB ONLY; unchanged SQL */');
 // The SHA binds the exact SQL bytes, including non-executable comments.
 // The prior test omitted this step, so it correctly hit SHA mismatch.
 const stale=review(x);
 assert.equal(stale.status,'HOLD');
 assert.equal(stale.reason,'PLAN_QUERY_SHA_DIFFERS_FROM_CANDIDATE');
 x.plan.query_sha256=sha(x.candidate_sql);
 const r=review(x);
 assert.equal(r.status,'HOLD');
 assert.equal(r.reason,nominal);
 assert.equal(r.can_query_orders,false);
 assert.equal(r.writer_lock_impact_proven,false);
});
test('synthetic candidate with wrong iFood source blocks',()=>{
 condition(replaceSql("c.IDORGCMDVENDA='DLV_IFO'",
 "c.IDORGCMDVENDA='DLV_FAKE'"),'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('removing SERIALIZABLE scope blocked',()=>{
 condition(replaceSql('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;',
 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED;'),'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('changing lock timeout is not auto approved',()=>{
 condition(replaceSql('SET LOCK_TIMEOUT 100;','SET LOCK_TIMEOUT 9999;'),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('removing MAXDOP is not auto approved',()=>{
 condition(replaceSql('OPTION (MAXDOP 1);','OPTION (MAXDOP 16);'),
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('multiple native SELECT statements not admitted',()=>{
 condition(x=>x.candidate_sql+=' SELECT 1;', 'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('SQL NOLOCK is never assumed consistent',()=>{
 condition(replaceSql('FROM TEKNISA.COMANDAVEN AS c',
 'FROM TEKNISA.COMANDAVEN AS c WITH(NOLOCK)'),'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('SQL DML is forbidden',()=>{
 condition(x=>x.candidate_sql+=' UPDATE TEKNISA.COMANDAVEN SET IDSTCOMANDA=0;',
  'CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
});
test('wrong order parameter type cannot claim optimal seek',()=>{
 condition(x=>x.plan.params.nrComanda='NVARCHAR(64)',
  'NATIVE_PARAMETER_TYPE_UNVERIFIED');
});
test('both native parameters must agree with varchar10 metadata',()=>{
 condition(x=>x.plan.params.nrVendaRest='VARCHAR(20)',
  'NATIVE_PARAMETER_TYPE_UNVERIFIED');
});
test('missing native table access is not a proven plan',()=>{
 condition(x=>x.plan.operators.pop(),'PLAN_SOURCE_TABLE_COVERAGE_INCOMPLETE');
});
test('extra duplicate source table requires independent interpretation',()=>{
 condition(x=>x.plan.operators.push(copy(x.plan.operators[0])),
 'PLAN_TABLE_AMBIGUITY_REQUIRES_REVIEW');
});
test('unknown source table is untrusted input',()=>{
 condition(x=>x.plan.operators[1].table='CUSTOMER','PLAN_OPERATOR_SHAPE_INVALID');
});
test('unrecognized access method rejected',()=>{
 condition(x=>x.plan.operators[2].method='MAGICAL_SEEK','PLAN_OPERATOR_SHAPE_INVALID');
});
test('negative estimated rows rejected',()=>{
 condition(x=>x.plan.estimated_rows=-1,'PLAN_SUMMARY_SHAPE_INVALID');
});
test('nonfinite plan cost rejected',()=>{
 condition(x=>x.plan.estimated_cost=Infinity,'PLAN_SUMMARY_SHAPE_INVALID');
});
test('extra self-attested field does not become evidence',()=>{
 condition(x=>x.plan.actual_execution_verified=true,'PLAN_SUMMARY_SHAPE_INVALID');
});
test('root authorization injection fails closed',()=>{
 condition(x=>x.print_authorized=true,'INPUT_INVALID');
});
test('scan in PRODUCT requires review despite other seeks',()=>{
 condition(x=>x.plan.operators[3].method='INDEX_SCAN',
  'SCAN_OR_UNVERIFIED_ACCESS_PATH_REQUIRES_PLAN_REVIEW');
});
test('clustered scan in native header blocks',()=>{
 condition(x=>x.plan.operators[0].method='CLUSTERED_INDEX_SCAN',
  'SCAN_OR_UNVERIFIED_ACCESS_PATH_REQUIRES_PLAN_REVIEW');
});
test('unknown method is not assumed seek',()=>{
 condition(x=>x.plan.operators[1].method='UNKNOWN',
  'SCAN_OR_UNVERIFIED_ACCESS_PATH_REQUIRES_PLAN_REVIEW');
});
test('implicit conversion requires review',()=>{
 condition(x=>x.plan.warnings=['CONVERT_IMPLICIT'],
  'IMPLICIT_CONVERSION_MAY_WEAKEN_SEEK');
});
test('spills require independent review',()=>{
 condition(x=>x.plan.warnings=['SPILL'],
  'PLAN_WARNINGS_REQUIRE_INDEPENDENT_REVIEW');
});
test('unknown source warning flags are invalid',()=>{
 condition(x=>x.plan.warnings=['GUARANTEED_SAFE'],
  'PLAN_WARNING_UNTRUSTED');
});
test('self report of writer safety cannot prove lack of blocking',()=>{
 condition(x=>x.plan.claimed_writer_safe=true,
  'UNATTESTED_WRITER_OR_SEMANTIC_CLAIM');
});
test('self report of logical commits cannot prove completeness',()=>{
 condition(x=>x.plan.claimed_semantic_complete=true,
  'UNATTESTED_WRITER_OR_SEMANTIC_CLAIM');
});
test('omitted plan fields cannot be defaulted',()=>{
 condition(x=>delete x.plan.operators,'PLAN_SUMMARY_SHAPE_INVALID');
});
test('unrecognized plan origin fails shape',()=>{
 condition(x=>x.plan.origin='SQL_SERVER_AUTHORIZED','PLAN_SUMMARY_SHAPE_INVALID');
});
if(n!==48)throw Error('PLAN_REVIEW_TEST_COUNT_MISMATCH '+n);
console.log('COMANDAS_ONE_ORDER_PLAN_RISK_REVIEW_PASS '+n+'/'+n+
 ' OFFLINE_SYNTHETIC_NO_SQL_OR_SHOWPLAN_NO_PRINT_ALWAYS_HOLD');

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {review}=require('./comandas_reader_sql_consistency_gate_v1_review_only.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const base=()=>({
 schema:'tata.comandas.reader-sql-consistency-input.v1',
 metadata:{database_name:'teknisa',current_login:'NT SERVICE\\TataComandaReader',
  is_read_committed_snapshot_on:1,snapshot_isolation_state_desc:'OFF'},
 proposal:{statement_count:1,isolation_level:'READ_COMMITTED',target_orders:1,
  uses_nolock:false,reader_host:'CAIXA_MOOCA',unit:'ITAIM',
  source_query_kind:'NATIVE_HEADER_ITEMS_AND_NOTES'}
});
const run=fn=>{const x=base();fn(x);return review(x)};
let n=0;
function t(name,fn){fn();n++;}
function holds(fn,reason){
 const x=run(fn);assert.equal(x.state,'HOLD',reason);
 assert.equal(x.reason,reason);assert.equal(x.sourceRevisionAuthenticated,false);
 assert.equal(x.actualStatementSnapshotProven,false);
 assert.equal(x.databaseSettingsIndependentlyProven,false);
 assert.equal(x.ordersPublishable,0);assert.equal(x.printAuthorized,false);
 assert.equal(x.clientActionsExecuted,0);
}
t('even qualified read-committed RCSI remains HOLD',()=>{
 const v=review(base());assert.equal(v.reason,'CONFIG_ELIGIBLE_BUT_NOT_ATTESTED');
 assert.equal(v.eligibleToConsiderSingleStatementSnapshot,true);
 assert.equal(v.actualStatementSnapshotProven,false);
});
t('RCSI OFF cannot claim one-statement consistency',()=>holds(x=>x.metadata.is_read_committed_snapshot_on=0,
 'READ_COMMITTED_LOCKING_DOES_NOT_PROVE_STATEMENT_SNAPSHOT'));
t('snapshot setting enabled but session not proven remains HOLD',()=>{
 const x=run(x=>{x.metadata.snapshot_isolation_state_desc='ON';x.proposal.isolation_level='SNAPSHOT'});
 assert.equal(x.reason,'SNAPSHOT_SETTING_ON_BUT_ACTUAL_TRANSACTION_NOT_ATTESTED');
 assert.equal(x.actualTransactionIsolationProven,false);
});
t('snapshot disabled blocked',()=>holds(x=>x.proposal.isolation_level='SNAPSHOT',
 'SNAPSHOT_ISOLATION_NOT_ENABLED'));
t('snapshot in transition blocked',()=>holds(x=>{
 x.proposal.isolation_level='SNAPSHOT';
 x.metadata.snapshot_isolation_state_desc='IN_TRANSITION_TO_ON'
},'SNAPSHOT_ISOLATION_NOT_ENABLED'));
t('READ UNCOMMITTED prohibited',()=>holds(x=>x.proposal.isolation_level='READ_UNCOMMITTED',
 'SESSION_ISOLATION_NOT_ALLOWED_FOR_LOW_IMPACT_CAPTURE'));
t('SERIALIZABLE prohibited',()=>holds(x=>x.proposal.isolation_level='SERIALIZABLE',
 'SESSION_ISOLATION_NOT_ALLOWED_FOR_LOW_IMPACT_CAPTURE'));
t('REPEATABLE_READ prohibited',()=>holds(x=>x.proposal.isolation_level='REPEATABLE_READ',
 'SESSION_ISOLATION_NOT_ALLOWED_FOR_LOW_IMPACT_CAPTURE'));
t('NOLOCK prohibited',()=>holds(x=>x.proposal.uses_nolock=true,
 'SINGLE_BOUNDED_ORDER_OR_NOLOCK_POLICY_FAILED'));
t('query fetching 50 orders prohibited',()=>holds(x=>x.proposal.target_orders=50,
 'SINGLE_BOUNDED_ORDER_OR_NOLOCK_POLICY_FAILED'));
t('multi-query capture prohibited',()=>holds(x=>x.proposal.statement_count=2,
 'SINGLE_BOUNDED_ORDER_OR_NOLOCK_POLICY_FAILED'));
t('wrong database prohibited',()=>holds(x=>x.metadata.database_name='master',
 'DB_OR_CONFIGURED_READER_LOGIN_MISMATCH'));
t('wrong identity prohibited',()=>holds(x=>x.metadata.current_login='sa',
 'DB_OR_CONFIGURED_READER_LOGIN_MISMATCH'));
t('wrong host prohibited',()=>holds(x=>x.proposal.reader_host='FOXXY',
 'HOST_UNIT_OR_SOURCE_QUERY_SCOPE_MISMATCH'));
t('other unit prohibited',()=>holds(x=>x.proposal.unit='MOOCA',
 'HOST_UNIT_OR_SOURCE_QUERY_SCOPE_MISMATCH'));
t('wrong dataset prohibited',()=>holds(x=>x.proposal.source_query_kind='GESTOR',
 'HOST_UNIT_OR_SOURCE_QUERY_SCOPE_MISMATCH'));
t('unknown RCSI status prohibited',()=>holds(x=>x.metadata.is_read_committed_snapshot_on=null,
 'ISOLATION_SETTINGS_MISSING_OR_UNKNOWN'));
t('missing metadata prohibited',()=>holds(x=>delete x.metadata.is_read_committed_snapshot_on,
 'INCOMPLETE_METADATA_OR_PROPOSAL'));
t('extra field falsely claiming authenticated prohibited',()=>holds(x=>x.metadata.source_proven=true,
 'INCOMPLETE_METADATA_OR_PROPOSAL'));
t('extra proposal claiming print authorized prohibited',()=>holds(x=>x.proposal.print=true,
 'INCOMPLETE_METADATA_OR_PROPOSAL'));
t('invalid envelope prohibited',()=>holds(x=>x.schema='INVALID','INVALID_INPUT'));
t('mismatched shape refused',()=>holds(x=>x.extra=true,'INVALID_INPUT'));
t('static SQL metadata query has no runtime changes',()=>{
 const q=fs.readFileSync(path.join(__dirname,
 'comandas_reader_isolation_catalog_v1_REVIEW_ONLY.sql'),'utf8');
 const sql=q.replace(/\/\*[\s\S]*?\*\//g,' ').trim();
 assert.match(sql,/^SELECT\s+/i);
 assert.equal((sql.match(/\bSELECT\b/gi)||[]).length,1);
 assert.match(sql,/d\.is_read_committed_snapshot_on/i);
 assert.match(sql,/d\.snapshot_isolation_state_desc/i);
 assert.match(sql,/SUSER_SNAME\(\)/);
 assert.match(sql,/WHERE\s+d\.name\s*=\s*DB_NAME\(\)/i);
 assert.doesNotMatch(sql,/\b(ALTER|UPDATE|INSERT|DELETE|EXEC|GRANT|NOLOCK|TRUNCATE)\b/i);
});
console.log('READER_SQL_ISOLATION_FAIL_CLOSED_REVIEW_PASS '+n+'/'+n+
 ' PURE_FAKE_METADATA_NO_DB_CONNECTION');

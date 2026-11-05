'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {SCHEMA,JOINS,review}=require('./comandas_reader_join_unique_catalog_review_only.cjs');
const query=fs.readFileSync(path.join(__dirname,
 'comandas_reader_join_unique_catalog_REVIEW_ONLY.sql'),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const row=(t,n,col,ordinal,flag={})=>({
 source_schema:'TEKNISA',source_table:t,index_name:n,index_id:flag.id??1,
 index_type:'NONCLUSTERED',is_unique:flag.unique??1,
 is_disabled:flag.disabled??0,is_hypothetical:flag.hypothetical??0,
 has_filter:flag.filtered??0,key_ordinal:ordinal,
 is_included_column:flag.included??0,source_column:col
});
const example=()=>({schema:SCHEMA,rows:Object.entries(JOINS)
 .flatMap(([t,cols])=>cols.map((col,i)=>row(t,'LAB_UNIQUE_'+t,col,i+1)))});
const change=(fn,expected,covered)=>{
 const input=example();fn(input);
 const result=review(input);
 assert.equal(result.status,'HOLD');assert.equal(result.reason,expected);
 assert.equal(result.catalog_identity_authenticated,false);
 assert.equal(result.catalog_exhaustiveness_authenticated,false);
 assert.equal(result.current_database_constraints_proven,false);
 assert.equal(result.actual_join_multiplicity_proven,false);
 assert.equal(result.native_revision_semantics_proven,false);
 assert.equal(result.candidate_plan_proven,false);
 assert.equal(result.writer_blocking_safe_proven,false);
 assert.equal(result.print_authorized,false);
 assert.equal(result.query_orders_authorized,false);
 assert.ok(Object.values(result.effects).every(v=>v===false));
 if(covered!==undefined)assert.equal(result.supplied_catalog_key_coverage,covered);
 return result;
};
const good='SELF_REPORTED_UNFILTERED_UNIQUE_KEY_CANDIDATES_ONLY';
const bad='AT_LEAST_ONE_JOIN_KEY_UNIQUENESS_NOT_SUPPORTED_BY_INPUT';
let n=0;
function test(name,fn){fn();n++;console.log('PASS '+name)}
test('four fictitious unfiltered UNIQUE indexes still always HOLD',()=>{
 const result=change(()=>{},good,true);
 assert.equal(result.candidate_tables_with_supplied_unique_evidence.length,4);
});
test('fictitious unique subset of join equality columns supports only a hypothetical at-most-one',()=>{
 change(x=>x.rows=x.rows.filter(r=>
  !(r.source_table==='COMANDAVEN'&&r.source_column==='NRCOMANDA')),good,true);
});
test('unfiltered UNIQUE with an extra key is not proof for shorter join',()=>{
 const r=change(x=>{
  x.rows.push(row('PRODUTO','LAB_UNIQUE_PRODUTO','OTHER_COLUMN',2));
 },bad,false);
 assert.ok(!r.candidate_tables_with_supplied_unique_evidence.includes('PRODUTO'));
});
test('included nonkey column does not invalidate a qualifying UNIQUE key',()=>{
 change(x=>x.rows.push(row('PRODUTO','LAB_UNIQUE_PRODUTO','EXTRA_INCLUDED',0,
  {included:1})),good,true);
});
test('is_unique false cannot enforce JOIN cardinality',()=>{
 change(x=>x.rows.find(r=>r.source_table==='PRODUTO').is_unique=0,bad,false);
});
test('disabled unique index cannot be a key witness',()=>{
 change(x=>x.rows.filter(r=>r.source_table==='VENDAREST')
  .forEach(r=>r.is_disabled=1),bad,false);
});
test('hypothetical unique index cannot be a key witness',()=>{
 change(x=>x.rows.filter(r=>r.source_table==='ITCOMANDAVEN')
  .forEach(r=>r.is_hypothetical=1),bad,false);
});
test('filtered unique index cannot prove global join without predicate proof',()=>{
 change(x=>x.rows.filter(r=>r.source_table==='COMANDAVEN')
  .forEach(r=>r.has_filter=1),bad,false);
});
test('only index-prefix information without UNIQUE bit does not promote',()=>{
 change(x=>x.rows.forEach(r=>r.is_unique=0),bad,false);
});
test('missing product catalog never implies unique product',()=>{
 change(x=>x.rows=x.rows.filter(r=>r.source_table!=='PRODUTO'),bad,false);
});
test('missing sale catalog never implies one VENDAREST match',()=>{
 change(x=>x.rows=x.rows.filter(r=>r.source_table!=='VENDAREST'),bad,false);
});
test('missing item line key never implies uniqueness per native line',()=>{
 change(x=>x.rows=x.rows.filter(r=>
 !(r.source_table==='ITCOMANDAVEN'&&r.source_column==='NRPRODCOMVEN')),good,true);
});
test('wrong item join key extra column blocks claimed uniqueness',()=>{
 change(x=>x.rows.push(row('ITCOMANDAVEN','LAB_UNIQUE_ITCOMANDAVEN',
  'NOT_IN_ITEM_JOIN',5)),bad,false);
});
test('INCLUDE cannot replace the actual index key',()=>{
 change(x=>x.rows.filter(r=>r.source_table==='PRODUTO').forEach(r=>{
  r.key_ordinal=0;r.is_included_column=1;
 }),bad,false);
});
test('noncontiguous index ordinal is a contradictory summary',()=>{
 change(x=>x.rows.find(r=>r.source_table==='PRODUTO').key_ordinal=2,
  'KEY_ORDINALS_INCONSISTENT');
});
test('duplicate key ordinal in same index cannot be attested',()=>{
 change(x=>x.rows.filter(r=>r.source_table==='VENDAREST')
  .forEach(r=>r.key_ordinal=1),'KEY_ORDINALS_INCONSISTENT');
});
test('duplicate key name in same UNIQUE index cannot be trusted',()=>{
 change(x=>x.rows.filter(r=>r.source_table==='VENDAREST')
  .forEach(r=>r.source_column='CDFILIAL'),'DUPLICATE_EFFECTIVE_INDEX_KEY_COLUMN');
});
test('conflicting UNIQUE bit for one index is malformed',()=>{
 change(x=>x.rows.find(r=>r.source_table==='VENDAREST').is_unique=0,
  'CONFLICTING_INDEX_CATALOG_METADATA');
});
test('conflicting index names for same index ID are malformed',()=>{
 change(x=>x.rows.find(r=>r.source_table==='VENDAREST').index_name='OTHER',
  'CONFLICTING_INDEX_CATALOG_METADATA');
});
test('metadata for other units or tables cannot enter the scope',()=>{
 change(x=>x.rows[0].source_schema='OTHER','CATALOG_ROW_INVALID_OR_SCOPE_MISMATCH');
});
test('extra customer order ID is forbidden in catalog inputs',()=>{
 change(x=>x.rows[0].native_order_id='1234','CATALOG_ROW_INVALID_OR_SCOPE_MISMATCH');
});
test('catalog input cannot include fiscal/customer fields',()=>{
 change(x=>x.rows[0].source_column='CUSTOMER_ADDRESS',
  'AT_LEAST_ONE_JOIN_KEY_UNIQUENESS_NOT_SUPPORTED_BY_INPUT');
});
test('bad cardinality bits cannot be silently converted from text',()=>{
 change(x=>x.rows[0].is_unique='1','CATALOG_ROW_INVALID_OR_SCOPE_MISMATCH');
});
test('input schema drift cannot be silently promoted',()=>{
 change(x=>x.schema='tata.comandas.other','CATALOG_SHAPE_OR_BOUND_INVALID');
});
test('no returned rows cannot establish unique indexes',()=>{
 change(x=>x.rows=[],'CATALOG_SHAPE_OR_BOUND_INVALID');
});
test('SQL blueprint reads system catalog only, never order tables',()=>{
 const q=query.replace(/\/\*[\s\S]*?\*\//g,' ')
  .replace(/--[^\r\n]*/g,' ');
 assert.equal((q.match(/\bSELECT\b/gi)||[]).length,1);
 assert.match(q,/\bFROM sys\.schemas AS s\b/i);
 for(const name of ['sys.tables','sys.indexes','sys.index_columns','sys.columns'])
  assert.ok(q.includes(name),name);
 for(const column of ['i.is_unique','i.is_disabled','i.is_hypothetical',
  'i.has_filter','ic.key_ordinal','ic.is_included_column'])
  assert.ok(q.includes(column),column);
 assert.doesNotMatch(q,/\bFROM\s+TEKNISA\./i);
 assert.doesNotMatch(q,/\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|EXEC|EXECUTE|OPENROWSET|OPENQUERY|NOLOCK|SET TRANSACTION|SHOWPLAN|PRINT)\b/i);
});
if(n!==26)throw Error('EXPECTED_26_CATALOG_REVIEW_TESTS_'+n);
console.log('COMANDAS_JOIN_UNIQUE_CATALOG_REVIEW_PASS '+n+'/'+n+
 ' SELF_REPORTED_ONLY_ALWAYS_HOLD_NO_SQL_NO_PRINT');

'use strict';
// REVIEW ONLY — inspect text; NEVER run SQL, Windows Reader or events.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {review,SCHEMA,COLUMNS}=require('./comandas_reader_native_revision_capability_review_only.cjs');
const reader=fs.readFileSync(path.join(__dirname,
 'tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1'),'utf8');
const catalog=fs.readFileSync(path.join(__dirname,
 'comandas_reader_native_revision_metadata_REVIEW_ONLY.sql'),'utf8');
const base=()=>({schema:SCHEMA,reader_source:reader,catalog_sql:catalog});
const clone=x=>({...x});
const original='SOURCE_SELECT_HAS_NO_INDEPENDENT_REVISION_TOKEN';
let n=0;
function test(name,fn){fn();n++;console.log('PASS '+name)}
function hold(input,reason){
 const x=review(input);assert.equal(x.state,'HOLD');assert.equal(x.reason,reason);
 assert.equal(x.metadata_query_executed,false);
 assert.equal(x.actual_schema_discovered,false);
 assert.equal(x.source_native_revision_id_proven,false);
 assert.equal(x.monotonicity_proven,false);
 assert.equal(x.atomic_snapshot_proven,false);
 assert.equal(x.absence_of_hidden_versions_proven,false);
 assert.equal(x.migration_authorized,false);
 assert.equal(x.print_authorized,false);
 assert.equal(x.no_loss_proven,false);
 assert.equal(x.no_reemit_proven,false);
 assert.equal(x.real_orders_read,0);
 assert.equal(x.artifacts,null);
 assert.ok(Object.values(x.effects).every(v=>v===false));return x;
}
function mutation(from,to){
 assert.equal(base().reader_source.split(from).length,2,'MUTATION_MARKER_NOT_UNIQUE');
 const x=base();x.reader_source=x.reader_source.replace(from,to);return x;
}
function catalogMutation(from,to){
 assert.equal(base().catalog_sql.split(from).length,2,'CATALOG_MARKER_NOT_UNIQUE');
 const x=base();x.catalog_sql=x.catalog_sql.replace(from,to);return x;
}
test('exact current native SELECT is reviewed but no revision is proven',()=>{
 const r=hold(base(),original);
 assert.equal(r.source_select_scope_reviewed,true);
 assert.equal(r.source_field_count,32);
 assert.equal(r.metadata_sql_text_policy_checked,true);
});
test('known 32 alias-qualified native columns tracked',()=>{
 assert.equal(COLUMNS.length,32);
 assert.ok(COLUMNS.includes('r.DTHRABERMESA'));
 assert.ok(COLUMNS.includes('i.NRPRODCOMVEN'));
 assert.ok(COLUMNS.includes('c.IDSTCOMANDA'));
});
test('SQL opener date cannot be converted into a revision token',()=>{
 const r=hold(base(),original);assert.equal(r.monotonicity_proven,false);
});
test('item number is identity inside a command, not a mutation version',()=>{
 hold(base(),original);assert.ok(COLUMNS.includes('i.NRPRODCOMVEN'));
});
test('status field is not an independently monotonic revision',()=>hold(base(),original));
test('two stable polls do not prove statement-level transaction snapshot',()=>{
 const r=hold(base(),original);assert.equal(r.atomic_snapshot_proven,false);
});
test('a metadata inventory SQL text does not prove existence of any column',()=>{
 const r=hold(base(),original);assert.equal(r.actual_schema_discovered,false);
});
test('invented revision column in native SELECT is drift not approved',()=>{
 hold(mutation('c.DSOBSCOMANDA,v.DTHRABERMESA',
 'c.DSOBSCOMANDA,c.IDREVISAO,v.DTHRABERMESA'),
 'SOURCE_PROJECTION_DRIFT_REQUIRES_REVIEW');
});
test('deleting native item observation field is not silently approved',()=>{
 hold(mutation('i.DSOBSDESCIT,i.DSOBSPEDDIGCMD,i.TXPRODCOMVEN',
 'i.DSOBSDESCIT,i.TXPRODCOMVEN'),
 'SOURCE_PROJECTION_DRIFT_REQUIRES_REVIEW');
});
test('rewriting header join fails static scope',()=>{
 hold(mutation('JOIN TEKNISA.VENDAREST v',
 'JOIN TEKNISA.OUTRA_TABELA v'),'SOURCE_SELECT_SCOPE_DRIFT');
});
test('altering source unit fails source contract',()=>{
 hold(mutation("c.CDLOJA='01'","c.CDLOJA='99'"),'SOURCE_SELECT_SCOPE_DRIFT');
});
test('altering source origin fails source contract',()=>{
 hold(mutation("N'DLV_IFO'","N'DLV_SIMULADO'"),'SOURCE_SELECT_SCOPE_DRIFT');
});
test('NOLOCK cannot become an attestation',()=>{
 hold(mutation('FROM TEKNISA.COMANDAVEN c',
 'FROM TEKNISA.COMANDAVEN c WITH (NOLOCK)'),'SOURCE_SELECT_SCOPE_DRIFT');
});
test('missing SQL source block is not accepted',()=>{
 const x=mutation('$cmd.CommandText = @"','$cmd.CommandText = "');
 hold(x,'SOURCE_QUERY_NOT_UNIQUE');
});
test('duplicate native query source requires review',()=>{
 const x=base();const m=/\$cmd\.CommandText\s*=\s*@"[\s\S]*?"@/.exec(x.reader_source);
 assert.ok(m);x.reader_source+='\n'+m[0];
 hold(x,'SOURCE_QUERY_NOT_UNIQUE');
});
test('changing only filename identity is a contract drift',()=>{
 hold(mutation('$safeOrder+"_"+$hash+".json"',
 '$safeOrder+"_"+$hash+".txt"'),'WATCHER_DEDUPLICATION_CONTRACT_DRIFT');
});
test('removing bounded 250 checkpoint changes dedupe contract',()=>{
 hold(mutation('Select-Object -First 250',
 'Select-Object -First 251'),'WATCHER_DEDUPLICATION_CONTRACT_DRIFT');
});
test('changing emitted-hash branch changes dedupe contract',()=>{
 hold(mutation('if([string]$entry.emitted_hash -eq $hash)',
 'if([string]$entry.emitted_hash -ne $hash)'),
 'WATCHER_DEDUPLICATION_CONTRACT_DRIFT');
});
test('catalog query cannot contain SQL DELETE',()=>{
 const x=base();x.catalog_sql+=' DELETE FROM TEKNISA.COMANDAVEN;';
 hold(x,'CATALOG_METADATA_QUERY_SCOPE_INVALID');
});
test('catalog query cannot include second SELECT',()=>{
 const x=base();x.catalog_sql+=' SELECT 1;';
 hold(x,'CATALOG_METADATA_QUERY_SCOPE_INVALID');
});
test('catalog cannot broaden source tables',()=>{
 hold(catalogMutation("N'VENDAREST')","N'VENDAREST', N'CLIENTES')"),
 'CATALOG_METADATA_QUERY_SCOPE_INVALID');
});
test('catalog must include system types to interpret declared column type',()=>{
 hold(catalogMutation('JOIN sys.types AS ty','JOIN sys.objects AS ty'),
 'CATALOG_METADATA_QUERY_SCOPE_INVALID');
});
test('catalog query cannot be a database write',()=>{
 const x=base();
 const normalized=x.catalog_sql.replace(/\r\n/g,'\n');
 const liveQueryStart='\nSELECT\n  s.name AS source_schema,';
 assert.equal(normalized.split(liveQueryStart).length,2,'SQL_SELECT_MARKER_NOT_UNIQUE');
 x.catalog_sql=normalized.replace(liveQueryStart,
  '\nUPDATE\n  s.name AS source_schema,');
 hold(x,'CATALOG_METADATA_QUERY_SCOPE_INVALID');
});
test('no fake metadata result can be injected as evidence',()=>{
 const x=base();x.metadata_rows=[{source_column:'IDREVISAO',sql_type:'rowversion'}];
 hold(x,'INPUT_OR_EXTERNAL_WITNESS_UNSUPPORTED');
});
test('a self-reported validated token cannot be injected',()=>{
 const x=base();x.claimed_source_token={field:'IDREVISAO',monotonic:true};
 hold(x,'INPUT_OR_EXTERNAL_WITNESS_UNSUPPORTED');
});
test('a claim to have executed the catalog is rejected as an extra field',()=>{
 const x=base();x.catalog_executed=true;
 hold(x,'INPUT_OR_EXTERNAL_WITNESS_UNSUPPORTED');
});
test('invalid schema is rejected without any effects',()=>{
 const x=base();x.schema='UNRECOGNIZED';
 hold(x,'INPUT_OR_EXTERNAL_WITNESS_UNSUPPORTED');
});
test('malformed string input fails closed',()=>{
 hold({schema:SCHEMA,reader_source:null,catalog_sql:catalog},
 'INPUT_OR_EXTERNAL_WITNESS_UNSUPPORTED');
});
if(n!==28)throw Error('UNEXPECTED_TEST_COUNT_'+n);
console.log('READER_NATIVE_REVISION_CAPABILITY_REVIEW_PASS '+n+'/'+n+
 ' STATIC_SOURCE_ONLY NO_DATABASE_QUERIED_NO_MIGRATION_NO_PRINT');

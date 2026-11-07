'use strict';
/**
 * REVIEW ONLY: source-code and SQL-text capability audit, NOT a database
 * schema audit, query execution, or permission to migrate/checkpoint/print.
 * A matching inventory establishes only what the current SELECT projects.
 */
const SCHEMA='tata.comandas.reader-native-revision-capability-review.v1';
const COLUMNS=Object.freeze([
 'c.CDFILIAL','c.CDLOJA','c.DSOBSCOMANDA','c.IDORGCMDVENDA',
 'c.IDSTCOMANDA','c.NRCOMANDA','c.NRCOMANDAEXT','c.NRVENDAREST',
 'i.CDFILIAL','i.CDPRODUTO','i.DSOBSDESCIT','i.DSOBSPEDDIGCMD',
 'i.IDSTPRCOMVEN','i.NRCOMANDA','i.NRPRODCOMVEN','i.NRVENDAREST',
 'i.QTPRODCOMVEN','i.TXPRODCOMVEN','p.CDARVPROD','p.CDPRODUTO',
 'r.CDFILIAL','r.CDLOJA','r.DSOBSCOMANDA','r.DTHRABERMESA',
 'r.IDORGCMDVENDA','r.IDSTCOMANDA','r.NRCOMANDA','r.NRCOMANDAEXT',
 'r.NRVENDAREST','v.CDFILIAL','v.DTHRABERMESA','v.NRVENDAREST'
]);
const effects=Object.freeze({sql:false,network:false,service:false,
 checkpoint_write:false,event_write:false,sequence:false,print:false,
 deployment:false,metadata_query_execution:false});
const result=(reason,notes={})=>Object.freeze({
 schema:SCHEMA,state:'HOLD',reason,
 source_select_scope_reviewed:notes.source_select_scope_reviewed||false,
 source_field_count:notes.source_field_count||0,
 metadata_sql_text_policy_checked:notes.metadata_sql_text_policy_checked||false,
 metadata_query_executed:false,actual_schema_discovered:false,
 source_native_revision_id_proven:false,monotonicity_proven:false,
 atomic_snapshot_proven:false,absence_of_hidden_versions_proven:false,
 no_loss_proven:false,no_reemit_proven:false,real_orders_read:0,
 migration_authorized:false,print_authorized:false,artifacts:null,effects
});
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function review(input){
 try{
  if(!isObject(input)||!['schema','reader_source','catalog_sql'].every(x=>Object.hasOwn(input,x))||
   Object.keys(input).length!==3||input.schema!==SCHEMA||
   typeof input.reader_source!=='string'||typeof input.catalog_sql!=='string'||
   input.reader_source.length>300000||input.catalog_sql.length>30000)
   return result('INPUT_OR_EXTERNAL_WITNESS_UNSUPPORTED');
  const reader=input.reader_source;
  const query=[...reader.matchAll(/\$cmd\.CommandText\s*=\s*@"([\s\S]*?)"@/g)];
  if(query.length!==1)return result('SOURCE_QUERY_NOT_UNIQUE');
  const q=query[0][1];
  if(!/\bWITH recent AS\s*\(\s*SELECT TOP \(@top\)/i.test(q)||
    !/\bFROM TEKNISA\.COMANDAVEN c\b/i.test(q)||
    !/\bJOIN TEKNISA\.VENDAREST v\b/i.test(q)||
    !/\bLEFT JOIN TEKNISA\.ITCOMANDAVEN i\b/i.test(q)||
    !/\bLEFT JOIN TEKNISA\.PRODUTO p\b/i.test(q)||
    !/\bWHERE c\.CDFILIAL='0001' AND c\.CDLOJA='01'/i.test(q)||
    !/c\.IDORGCMDVENDA\)\s*=\s*N'DLV_IFO'/i.test(q)||
    !/\bORDER BY r\.DTHRABERMESA DESC,r\.NRVENDAREST DESC,i\.NRPRODCOMVEN/i.test(q)||
    /\b(NOLOCK|READ UNCOMMITTED|INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i.test(q))
   return result('SOURCE_SELECT_SCOPE_DRIFT');
  const cols=[...new Set([...q.matchAll(/\b([cvrip])\.([A-Z][A-Z0-9_]*)\b/g)]
    .map(x=>x[1]+'.'+x[2]))].sort();
  if(cols.length!==COLUMNS.length||cols.some((v,i)=>v!==COLUMNS[i]))
   return result('SOURCE_PROJECTION_DRIFT_REQUIRES_REVIEW',{source_field_count:cols.length});
  if(!reader.includes('$hash=Get-TataCanonicalSha256V1 -Value $hashBasis')||
     !reader.includes('$baselineHash = if((-not [bool]$checkpoint.bootstrap_complete)')||
     !reader.includes('Select-Object -First 250')||
     !reader.includes('$safeOrder+"_"+$hash+".json"')||
     !reader.includes('if([string]$entry.emitted_hash -eq $hash)'))
   return result('WATCHER_DEDUPLICATION_CONTRACT_DRIFT',{source_field_count:cols.length});
  const catalog=input.catalog_sql.replace(/\/\*[\s\S]*?\*\//g,' ')
    .replace(/--[^\r\n]*/g,' ').trim();
  if(!/^SELECT\s+/i.test(catalog)||!catalog.endsWith(';')||
     (catalog.match(/;/g)||[]).length!==1||
     (catalog.match(/\bSELECT\b/gi)||[]).length!==1||
     /\b(INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|MERGE|GRANT|TRUNCATE|OPENROWSET|NOLOCK)\b/i.test(catalog)||
     !/\bFROM sys\.schemas AS s\b/i.test(catalog)||
     !/\bJOIN sys\.tables AS t\b/i.test(catalog)||
     !/\bJOIN sys\.columns AS c\b/i.test(catalog)||
     !/\bJOIN sys\.types AS ty\b/i.test(catalog)||
     !/\bWHERE s\.name = N'TEKNISA'/i.test(catalog)||
     !/t\.name IN \(N'COMANDAVEN', N'ITCOMANDAVEN', N'VENDAREST'\)/i.test(catalog))
   return result('CATALOG_METADATA_QUERY_SCOPE_INVALID',{source_field_count:cols.length,
     source_select_scope_reviewed:true});
  // Source hashes, opening time, item number, state and local observed_at
  // are not database-authenticated monotonic order revision identifiers.
  // A future catalog response (not present here) would need independent
  // semantic and transaction verification before it could promote anything.
  return result('SOURCE_SELECT_HAS_NO_INDEPENDENT_REVISION_TOKEN',{
    source_field_count:cols.length,source_select_scope_reviewed:true,
    metadata_sql_text_policy_checked:true
  });
 }catch{return result('UNEXPECTED_REVIEW_INPUT')}
}
module.exports={review,SCHEMA,COLUMNS};

'use strict';
/**
 * PR #135 / STAGE 3 — Pure, offline SQL plan risk contract.
 *
 * Plan summaries supplied to this function are UNTRUSTED, including summaries
 * claiming to be estimated/actual plans. A matching SQL SHA only compares
 * user-supplied bytes. No SQL, SHOWPLAN, network, writes, readers or printing.
 * ALL results are HOLD and no safe plan, lock budget or native revision is
 * authenticated by this function.
 */
const {createHash}=require('node:crypto');
const SCHEMA='tata.comandas.one-order-plan-risk-review.v1';
const PLAN_SCHEMA='tata.comandas.one-order-plan-summary-untrusted.v1';
const HEX=/^[a-f0-9]{64}$/;
const TABLES=Object.freeze(['COMANDAVEN','VENDAREST','ITCOMANDAVEN','PRODUTO']);
const METHODS=Object.freeze(['INDEX_SEEK','CLUSTERED_INDEX_SEEK','INDEX_SCAN',
 'CLUSTERED_INDEX_SCAN','TABLE_SCAN','UNKNOWN']);
const shape=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).sort().join('|')===keys.slice().sort().join('|');
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
// The entire native FROM/JOIN/WHERE/ORDER tail is intentionally pinned.
// Mere presence of CDLOJA equality is not enough: OR on the JOIN or WHERE
// can undo the shop boundary while still matching a substring test.
// Any structural SQL change requires explicit offline review and new fixtures.
// Lock the reviewed session settings AND the 17-column projection, not
// just their presence. A later SET can silently override isolation/timeout.
// Structural changes must be reviewed offline; whitespace/comments may vary.
const REVIEWED_NATIVE_PREFIX=[
 "SET NOCOUNT ON;",
 "SET DEADLOCK_PRIORITY LOW;",
 "SET LOCK_TIMEOUT 100;",
 "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;",
 "SELECT TOP (201)",
 "c.CDFILIAL,c.CDLOJA,c.NRVENDAREST,c.NRCOMANDA,",
 "c.NRCOMANDAEXT,c.IDORGCMDVENDA,c.IDSTCOMANDA,v.DTHRABERMESA,",
 "i.NRPRODCOMVEN,i.CDPRODUTO,p.CDARVPROD,i.QTPRODCOMVEN,",
 "i.IDSTPRCOMVEN,",
 "c.DSOBSCOMANDA,",
 "i.DSOBSDESCIT,i.DSOBSPEDDIGCMD,i.TXPRODCOMVEN",
].join(' ').toUpperCase();
const REVIEWED_NATIVE_TAIL=[
 "FROM TEKNISA.COMANDAVEN AS c",
 "INNER JOIN TEKNISA.VENDAREST AS v",
 "ON v.CDFILIAL=c.CDFILIAL",
 "AND v.CDLOJA=c.CDLOJA",
 "AND v.NRVENDAREST=c.NRVENDAREST",
 "LEFT JOIN TEKNISA.ITCOMANDAVEN AS i",
 "ON i.CDFILIAL=c.CDFILIAL",
 "AND i.CDLOJA=c.CDLOJA",
 "AND i.NRVENDAREST=c.NRVENDAREST",
 "AND i.NRCOMANDA=c.NRCOMANDA",
 "LEFT JOIN TEKNISA.PRODUTO AS p",
 "ON p.CDPRODUTO=i.CDPRODUTO",
 "WHERE c.CDFILIAL='0001'",
 "AND c.CDLOJA='01'",
 "AND c.IDORGCMDVENDA='DLV_IFO'",
 "AND c.NRVENDAREST=@nrVendaRest",
 "AND c.NRCOMANDA=@nrComanda",
 "ORDER BY i.NRPRODCOMVEN ASC",
 "OPTION (MAXDOP 1);",
].join(' ').toUpperCase();
const EFFECTS=Object.freeze({
 sql:false,showplan:false,network:false,files:false,service:false,
 printer:false,sequence:false,checkpoint:false,deploy:false
});
function hold(reason,details={}){
 return Object.freeze({
  schema:SCHEMA,status:'HOLD',reason,
  candidate_sha256:details.candidate_sha256||null,
  inspected_plan_origin:details.inspected_plan_origin||'NONE',
  observed_table_methods:details.observed_table_methods||null,
  source_plan_authenticated:false,execution_plan_proven:false,
  plan_is_candidate_proven:false,sql_runtime_identity_proven:false,
  writer_lock_impact_proven:false,semantic_revision_complete_proven:false,
  real_sql_rows_read:0,can_query_orders:false,can_print:false,
  can_cutover:false,artifact_release_allowed:false,effects:EFFECTS
 });
}
function review(input){
 try{
  if(!shape(input,['schema','candidate_sql','plan'])||input.schema!==SCHEMA||
    typeof input.candidate_sql!=='string'||input.candidate_sql.length>25000||
    input.candidate_sql.length<500)return hold('INPUT_INVALID');
  const sql=input.candidate_sql;
  const effective=sql.replace(/\/\*[\s\S]*?\*\//g,' ')
    .replace(/--[^\r\n]*/g,' ');
  // Session settings, projection and data scope are independently pinned.
  const prefixAt=effective.search(/\bFROM\s+TEKNISA\.COMANDAVEN\s+AS\s+c\b/i);
  const nativePrefix=prefixAt<0?'':effective.slice(0,prefixAt)
    .replace(/\s+/g,' ').trim().toUpperCase();
  if(nativePrefix!==REVIEWED_NATIVE_PREFIX)
   return hold('CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
  // Match the complete reviewed native data scope, not isolated substrings.
  const fromAt=effective.search(/\bFROM\s+TEKNISA\.COMANDAVEN\s+AS\s+c\b/i);
  const nativeTail=fromAt<0?'':effective.slice(fromAt)
    .replace(/\s+/g,' ').trim().toUpperCase();
  if(nativeTail!==REVIEWED_NATIVE_TAIL)
   return hold('CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
  if(!/\bSET TRANSACTION ISOLATION LEVEL SERIALIZABLE\s*;/i.test(effective)||
    !/\bSELECT TOP \(201\)\s/i.test(effective)||
    !/\bSET LOCK_TIMEOUT 100\s*;/i.test(effective)||
    !/\bSET DEADLOCK_PRIORITY LOW\s*;/i.test(effective)||
    !/\bOPTION \(MAXDOP 1\)\s*;/i.test(effective)||
    !/\bc\.CDFILIAL='0001'/i.test(effective)||
    !/\bc\.CDLOJA='01'/i.test(effective)||
    !/\bc\.IDORGCMDVENDA='DLV_IFO'/i.test(effective)||
    !/\bc\.NRVENDAREST=@nrVendaRest/i.test(effective)||
    !/\bc\.NRCOMANDA=@nrComanda/i.test(effective)||
    !/\bv\.CDLOJA\s*=\s*c\.CDLOJA\b/i.test(effective)||
    !/\bi\.CDLOJA\s*=\s*c\.CDLOJA\b/i.test(effective)||
    (effective.match(/\bSELECT\b/gi)||[]).length!==1||
    /\b(?:NOLOCK|READPAST|BEGIN TRAN|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|EXEC|EXECUTE)\b/i.test(effective))
   return hold('CANDIDATE_SQL_SCOPE_OR_POLICY_CHANGED');
  const digest=hash(sql);
  if(input.plan===null)return hold('CANDIDATE_PLAN_NOT_AVAILABLE',{candidate_sha256:digest});
  const p=input.plan;
  if(!shape(p,['schema','origin','query_sha256','operators','warnings','estimated_cost',
     'estimated_rows','params','claimed_writer_safe','claimed_semantic_complete'])||
     p.schema!==PLAN_SCHEMA||!HEX.test(p.query_sha256)||
     !['INSTALLED_V2_CACHED','CANDIDATE_ESTIMATED_SELF_REPORTED',
       'CANDIDATE_ACTUAL_SELF_REPORTED','UNKNOWN'].includes(p.origin)||
     !Array.isArray(p.operators)||p.operators.length>30||
     !Array.isArray(p.warnings)||p.warnings.length>30||
     !Number.isFinite(p.estimated_cost)||p.estimated_cost<0||
     !Number.isFinite(p.estimated_rows)||p.estimated_rows<0||
     typeof p.claimed_writer_safe!=='boolean'||
     typeof p.claimed_semantic_complete!=='boolean'||
     !shape(p.params,['nrVendaRest','nrComanda']))
   return hold('PLAN_SUMMARY_SHAPE_INVALID',{candidate_sha256:digest});
  if(p.origin==='INSTALLED_V2_CACHED')
   return hold('CACHED_INSTALLED_V2_PLAN_IS_NOT_CANDIDATE_PLAN',{
    candidate_sha256:digest,inspected_plan_origin:p.origin});
  if(p.origin==='UNKNOWN')
   return hold('PLAN_PROVENANCE_UNKNOWN',{candidate_sha256:digest});
  if(p.query_sha256!==digest)
   return hold('PLAN_QUERY_SHA_DIFFERS_FROM_CANDIDATE',{
    candidate_sha256:digest,inspected_plan_origin:p.origin});
  if(p.params.nrVendaRest!=='VARCHAR(10)'||p.params.nrComanda!=='VARCHAR(10)')
   return hold('NATIVE_PARAMETER_TYPE_UNVERIFIED',{
    candidate_sha256:digest,inspected_plan_origin:p.origin});
  const methods={},tableNames=new Set();
  for(const o of p.operators){
   if(!shape(o,['table','method','estimated_rows'])||
     !TABLES.includes(o.table)||!METHODS.includes(o.method)||
     !Number.isFinite(o.estimated_rows)||o.estimated_rows<0)
    return hold('PLAN_OPERATOR_SHAPE_INVALID',{candidate_sha256:digest});
   if(tableNames.has(o.table))return hold('PLAN_TABLE_AMBIGUITY_REQUIRES_REVIEW',{
     candidate_sha256:digest});
   tableNames.add(o.table);
   methods[o.table]=o.method;
  }
  if(!TABLES.every(x=>tableNames.has(x)))
   return hold('PLAN_SOURCE_TABLE_COVERAGE_INCOMPLETE',{
    candidate_sha256:digest,inspected_plan_origin:p.origin,observed_table_methods:methods});
  for(const w of p.warnings){
   if(typeof w!=='string'||w.length>180||
      !['CONVERT_IMPLICIT','MISSING_INDEX','SPILL','CARDINALITY_UNKNOWN',
        'PLAN_CHANGE','LOCK_FOOTPRINT_UNKNOWN'].includes(w))
    return hold('PLAN_WARNING_UNTRUSTED',{candidate_sha256:digest});
  }
  if(p.claimed_writer_safe||p.claimed_semantic_complete)
   return hold('UNATTESTED_WRITER_OR_SEMANTIC_CLAIM',{
     candidate_sha256:digest,inspected_plan_origin:p.origin});
  if(p.warnings.includes('CONVERT_IMPLICIT'))
   return hold('IMPLICIT_CONVERSION_MAY_WEAKEN_SEEK',{
    candidate_sha256:digest,inspected_plan_origin:p.origin,observed_table_methods:methods});
  if(Object.values(methods).some(x=>x==='INDEX_SCAN'||
      x==='CLUSTERED_INDEX_SCAN'||x==='TABLE_SCAN'||x==='UNKNOWN'))
   return hold('SCAN_OR_UNVERIFIED_ACCESS_PATH_REQUIRES_PLAN_REVIEW',{
    candidate_sha256:digest,inspected_plan_origin:p.origin,observed_table_methods:methods});
  if(p.warnings.length)
   return hold('PLAN_WARNINGS_REQUIRE_INDEPENDENT_REVIEW',{
    candidate_sha256:digest,inspected_plan_origin:p.origin,observed_table_methods:methods});
  // Even four seeks in a supposedly matching *estimated* plan cannot
  // prove lock footprints, writers' latency or logical Teknisa commits.
  // The actor who supplied the summary could alter every field.
  return hold('SELF_REPORTED_PLAN_IS_NOT_LOCK_OR_REVISION_ATTESTATION',{
    candidate_sha256:digest,inspected_plan_origin:p.origin,observed_table_methods:methods});
 }catch{return hold('UNSUPPORTED_PLAN_REVIEW_INPUT')}
}
module.exports={review,SCHEMA,PLAN_SCHEMA,TABLES};

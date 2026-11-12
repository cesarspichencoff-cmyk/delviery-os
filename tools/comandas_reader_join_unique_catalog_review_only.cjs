'use strict';
/**
 * Stage 3 / PR #135: self-reported index catalog semantics only.
 * No database or filesystem access. Input is NOT authenticated as coming
 * from SQL Server, even with a plausible matching unique index. All
 * results always HOLD, with all production permissions false.
 *
 * Unfiltered enforcing unique index with ALL effective key columns
 * contained in the equality join key => AT MOST ONE row in that table for
 * an exact equality probe (assuming independently verified, current metadata).
 * It does NOT prove a matching row exists, that item revisions are complete,
 * actual physical query plan, write-blocking risk or printing.
 */
const SCHEMA='tata.comandas.join-unique-catalog-review.v1';
const JOINS=Object.freeze({
 COMANDAVEN:Object.freeze(['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA']),
 VENDAREST:Object.freeze(['CDFILIAL','NRVENDAREST']),
 ITCOMANDAVEN:Object.freeze(['CDFILIAL','NRVENDAREST','NRCOMANDA','NRPRODCOMVEN']),
 PRODUTO:Object.freeze(['CDPRODUTO'])
});
const rowFields=['source_schema','source_table','index_name','index_id',
 'index_type','is_unique','is_disabled','is_hypothetical','has_filter',
 'key_ordinal','is_included_column','source_column'];
const exact=(x,names)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join('|')===names.slice().sort().join('|');
const bit=x=>x===0||x===1;
const effects=Object.freeze({sql:false,showplan:false,network:false,
 files:false,service:false,printer:false,spooler:false,sequence:false,
 deploy:false,cutover:false});
const decisions={};
for(const [table,cols] of Object.entries(JOINS))decisions[table]=Object.freeze(cols);
function hold(reason,detail={}){
 return Object.freeze({
  schema:SCHEMA,status:'HOLD',reason,
  candidate_tables_with_supplied_unique_evidence:detail.tables||[],
  supplied_catalog_key_coverage:detail.coverage??false,
  catalog_identity_authenticated:false,
  catalog_exhaustiveness_authenticated:false,
  current_database_constraints_proven:false,
  actual_join_multiplicity_proven:false,
  zero_missing_item_rows_proven:false,
  candidate_plan_proven:false,
  writer_blocking_safe_proven:false,
  native_revision_semantics_proven:false,
  query_orders_authorized:false,
  print_authorized:false,
  effects
 });
}
function review(input){
 try{
  if(!exact(input,['schema','rows'])||input.schema!==SCHEMA||
     !Array.isArray(input.rows)||input.rows.length<1||
     input.rows.length>2500)
   return hold('CATALOG_SHAPE_OR_BOUND_INVALID');
  const groups=new Map();
  for(const r of input.rows){
   if(!exact(r,rowFields)||r.source_schema!=='TEKNISA'||
      !Object.hasOwn(JOINS,r.source_table)||
      typeof r.index_name!=='string'||r.index_name.length<1||
      r.index_name.length>128||
      !Number.isSafeInteger(r.index_id)||r.index_id<1||
      !['CLUSTERED','NONCLUSTERED'].includes(r.index_type)||
      !bit(r.is_unique)||!bit(r.is_disabled)||
      !bit(r.is_hypothetical)||!bit(r.has_filter)||
      !Number.isSafeInteger(r.key_ordinal)||r.key_ordinal<0||
      r.key_ordinal>32||!bit(r.is_included_column)||
      !(r.source_column===null||
        typeof r.source_column==='string'&&
        /^[A-Za-z_][A-Za-z_0-9]{0,127}$/.test(r.source_column))||
      (r.key_ordinal>0&&(r.is_included_column!==0||r.source_column===null)))
    return hold('CATALOG_ROW_INVALID_OR_SCOPE_MISMATCH');
   const id=r.source_table+'|'+r.index_id;
   let g=groups.get(id);
   if(!g){
    g={table:r.source_table,index_name:r.index_name,index_id:r.index_id,
      index_type:r.index_type,unique:r.is_unique,
      disabled:r.is_disabled,hypothetical:r.is_hypothetical,
      filtered:r.has_filter,rows:[]};
    groups.set(id,g);
   }
   if(g.index_name!==r.index_name||g.index_type!==r.index_type||
     g.unique!==r.is_unique||g.disabled!==r.is_disabled||
     g.hypothetical!==r.is_hypothetical||g.filtered!==r.has_filter)
    return hold('CONFLICTING_INDEX_CATALOG_METADATA');
   g.rows.push(r);
  }
  const covered=[];
  for(const [table,joinColumns] of Object.entries(decisions)){
   const equality=new Set(joinColumns);
   let supported=false;
   for(const g of groups.values()){
    if(g.table!==table||g.unique!==1||g.disabled!==0||
       g.hypothetical!==0||g.filtered!==0)continue;
    const keys=g.rows.filter(r=>r.key_ordinal>0);
    if(keys.length===0)continue;
    const ordinals=new Set(keys.map(r=>r.key_ordinal));
    if(ordinals.size!==keys.length||
       !keys.every(r=>r.key_ordinal<=keys.length))
     return hold('KEY_ORDINALS_INCONSISTENT');
    const cols=keys.map(r=>r.source_column);
    if(new Set(cols).size!==cols.length)
     return hold('DUPLICATE_EFFECTIVE_INDEX_KEY_COLUMN');
    if(cols.every(col=>equality.has(col))){
      supported=true;break;
    }
   }
   if(supported)covered.push(table);
  }
  // Even a complete self-reported catalog never becomes independent proof.
  const all=covered.length===Object.keys(JOINS).length;
  return hold(all
    ?'SELF_REPORTED_UNFILTERED_UNIQUE_KEY_CANDIDATES_ONLY'
    :'AT_LEAST_ONE_JOIN_KEY_UNIQUENESS_NOT_SUPPORTED_BY_INPUT',{
     tables:covered,coverage:all});
 }catch{return hold('CATALOG_REVIEW_EXCEPTION')}
}
module.exports={SCHEMA,JOINS,review};

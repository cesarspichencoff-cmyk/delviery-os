'use strict';
/** V8.7 — Future SOURCE-CLAIM review ONLY. Data inputs can be forged; passing
 * never authenticates SQL, print, physical effect or production V6.8. */
const ID=/^[0-9]{1,20}$/,SHA=/^[0-9a-f]{64}$/i;
const str=x=>typeof x==='string'&&x.length>0&&x===x.trim();
const finish=(status,reason,info={})=>({
 schema:'tata.comandas.senha-item-bridge.v87.review-only',status,reason,...info,
 actual_sql_identity_proven:false,sql_permission_change_authorized:false,
 order_print_identity_proven:false,v68_production_source_proven:false,
 v68_three_views_proven:false,physical_print_authorized:false,
 effects:{sql:false,file_write:false,service:false,printer:false,spooler:false}
});
function assess(x){
 try{
  if(!x||!x.event||!Array.isArray(x.sql_item_rows)||!Array.isArray(x.print_blocks))
   return finish('HOLD','MISSING_INDEPENDENT_SOURCE_SURFACES');
  const e=x.event,p=x.provenance||{};
  if(!str(e.order_key)||!SHA.test(e.snapshot_hash||'')||!Array.isArray(e.items)||!e.items.length)
   return finish('HOLD','WATCHER_EVENT_IDENTITY_INVALID');
  if(p.human_authorized_new_sql_column!==true||
     p.current_effective_grant_verified!==true||p.executed_as_service_sid!==true)
   return finish('HOLD','NEW_COLUMN_GRANT_OR_FRESH_READ_NOT_PROVEN');
  if(p.snapshot_hash!==e.snapshot_hash||p.order_key!==e.order_key)
   return finish('HOLD','SOURCE_REVISION_NOT_SAME');
  if(x.sql_item_rows.length!==e.items.length)
   return finish('HOLD','ITEM_ROW_COUNT_MISMATCH');
  const seen=new Set(),senhas=new Set();
  for(const row of x.sql_item_rows){
   if(row.order_key!==e.order_key||row.snapshot_hash!==e.snapshot_hash)
    return finish('HOLD','NATIVE_ITEM_SOURCE_ORDER_OR_REVISION_MISMATCH');
   const it=e.items.find(i=>i.NRPRODCOMVEN===row.NRPRODCOMVEN);
   if(!it||seen.has(row.NRPRODCOMVEN))return finish('HOLD','NATIVE_ITEM_AMBIGUOUS');
   seen.add(row.NRPRODCOMVEN);
   if(row.CDPRODUTO!==it.CDPRODUTO||row.QTPRODCOMVEN!==it.QTPRODCOMVEN)
    return finish('HOLD','NATIVE_PRODUCT_OR_QUANTITY_MISMATCH');
   if(!ID.test(String(row.CDSENHAPED||'')))return finish('HOLD','NATIVE_SENHA_MISSING');
   senhas.add(String(Number(row.CDSENHAPED)));
   const notes=it.source_item_notes||{};
   for(const f of ['DSOBSPEDDIGCMD','TXPRODCOMVEN'])
    if(Object.hasOwn(notes,f)&&row[f]!==notes[f])
     return finish('HOLD','PREPARATION_NOTE_SOURCE_DIVERGENCE');
  }
  if(!x.print_blocks.length)return finish('HOLD','LOG_BLOCK_MISSING');
  const blocks=new Set(),candidate=new Set();
  for(const b of x.print_blocks){
   if(!str(b.log_source)||!Number.isSafeInteger(b.line_offset)||b.line_offset<0||
      !ID.test(String(b.senha||'')))return finish('HOLD','INVALID_LOG_BLOCK_DESCRIPTOR');
   const key=b.log_source+'|'+b.line_offset;
   if(blocks.has(key))return finish('HOLD','DUPLICATE_LOG_BLOCK_ANCHOR');
   blocks.add(key);candidate.add(String(Number(b.senha)));
  }
  for(const senha of senhas)if(!candidate.has(senha))
   return finish('HOLD','NATIVE_SENHA_NOT_FOUND_IN_LOG');
  if((x.collision_evidence||[]).some(r=>
      senhas.has(String(Number(r.senha)))&&r.order_key!==e.order_key))
   return finish('HOLD','SENHA_SHARED_WITH_OTHER_ORDER');
  if(p.full_senha_collision_scope_covered!==true)
   return finish('HOLD','SENHA_UNIQUENESS_SCOPE_NOT_PROVEN');
  return finish('REVIEW_CANDIDATE_NOT_PROVEN',
   'PAPER_LOG_LACKS_ORDER_ITEM_REVISION_ANCHOR',{
    item_rows_checked:e.items.length,unique_senha_groups:senhas.size,
    log_blocks_seen:blocks.size});
 }catch{return finish('HOLD','INVALID_OR_MALFORMED_SOURCE_EVIDENCE')}
}
module.exports={assess};

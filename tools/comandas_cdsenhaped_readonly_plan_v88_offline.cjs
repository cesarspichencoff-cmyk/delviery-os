'use strict';
/*
 * V8.8 OFFLINE PLAN ONLY. This module has no SQL execution, connections,
 * filesystem, service operations or printers. Native Odhen's
 * SQL_GET_CDSENHAPED selects all senha rows by filial/loja; it does NOT
 * prove a particular order-to-item-to-print mapping.
 * ITCOMANDAVEN.CDSENHAPED is NOT in the last authorized reader grant.
 */
const {createHash}=require('node:crypto');
const SHA=/^[0-9a-f]{64}$/i;
const HEADER=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
 'NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
const ITEM=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
const REQUIRED={
 COMANDAVEN:['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','IDORGCMDVENDA'],
 ITCOMANDAVEN:['CDFILIAL','NRVENDAREST','NRCOMANDA','NRPRODCOMVEN','CDPRODUTO',
  'QTPRODCOMVEN','IDSTPRCOMVEN','CDSENHAPED','DSOBSDESCIT','DSOBSPEDDIGCMD',
  'TXPRODCOMVEN'],
 VENDAREST:['CDFILIAL','NRVENDAREST','DTHRABERMESA']};
const SQL=[
 'SELECT TOP (101)',
 ' I.CDFILIAL, C.CDLOJA, I.NRVENDAREST, I.NRCOMANDA,',
 ' I.NRPRODCOMVEN, I.CDPRODUTO, I.QTPRODCOMVEN, I.IDSTPRCOMVEN,',
 ' I.CDSENHAPED, I.DSOBSDESCIT, I.DSOBSPEDDIGCMD, I.TXPRODCOMVEN,',
 ' C.IDORGCMDVENDA, V.DTHRABERMESA',
 'FROM TEKNISA.ITCOMANDAVEN AS I',
 'INNER JOIN TEKNISA.COMANDAVEN AS C',
 ' ON C.CDFILIAL=I.CDFILIAL AND C.NRVENDAREST=I.NRVENDAREST',
 ' AND C.NRCOMANDA=I.NRCOMANDA',
 'INNER JOIN TEKNISA.VENDAREST AS V',
 ' ON V.CDFILIAL=I.CDFILIAL AND V.NRVENDAREST=I.NRVENDAREST',
 'WHERE I.CDFILIAL=@cdfilial AND C.CDLOJA=@cdloja',
 ' AND I.NRVENDAREST=@nrvendarest AND I.NRCOMANDA=@nrcomanda',
 ' AND V.DTHRABERMESA>=@day_start AND V.DTHRABERMESA<@day_end',
 'ORDER BY I.NRPRODCOMVEN;'].join('\n');
function hold(reason,extra={}){
 return {schema:'tata.comandas.cdsenhaped.readonly-plan.v88',
  status:'HOLD',reason,sql_template:null,parameters:[],
  current_grant_proven:false,sql_identity_authenticated:false,
  new_column_read_authorized:false,sql_execution_allowed:false,
  sql_executed:false,independent_print_source_proven:false,
  three_vias_proven:false,physical_print_authorized:false,
  effects:{database:false,files:false,service:false,spooler:false,printer:false},
  ...extra};
}
function makePlan(event,manifest){
 try{
  const o=event?.order;
  if(event?.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
   !o||o.CDFILIAL!=='0001'||o.CDLOJA!=='01'||
   !/^[0-9]{1,12}$/.test(o.NRVENDAREST||'')||
   !/^[0-9]{1,12}$/.test(o.NRCOMANDA||'')||
   !/^DLV_/.test(o.IDORGCMDVENDA||'')||
   !/^2026-10-14T/.test(o.DTHRABERMESA||'')||
   event.order_key!==[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|')||
   !SHA.test(event.snapshot_hash||'')||
   o.observation_scan_complete!==true||!Array.isArray(o.observation_rows)||
   !Array.isArray(o.items)||o.items.length<1||o.items.length>100)
    return hold('SOURCE_SCOPE_INVALID');
  if(HEADER.some(k=>!Object.hasOwn(o,k)))return hold('SOURCE_STRUCTURE_INVALID');
  const seen=new Set(),canonicalItems=o.items.map(it=>{
   if(ITEM.some(k=>!Object.hasOwn(it,k))||
     !/^[0-9]{1,6}$/.test(it.NRPRODCOMVEN||'')||
     typeof it.CDPRODUTO!=='string'||!it.CDPRODUTO||
     seen.has(it.NRPRODCOMVEN))throw Error('ITEM_INVALID');
   seen.add(it.NRPRODCOMVEN);
   return Object.fromEntries(ITEM.map(k=>[k,it[k]]));
  });
  const canonical=Object.fromEntries(HEADER.map(k=>[k,o[k]]));
  canonical.items=canonicalItems;
  const noteSeen=new Set();let orderNotes=0;
  const notes=o.observation_rows.map(r=>{
   if(!r||typeof r.value!=='string'||!r.value.trim()||
     r.value!==r.value.trim()||r.join_proven!==true)throw Error('NOTE_INVALID');
   if(r.scope_hint==='order'){
    if(r.source_field!=='DSOBSCOMANDA'||++orderNotes>1)throw Error('ORDER_NOTE');
    return {source_field:r.source_field,value:r.value,scope_hint:'order',join_proven:true};
   }
   if(r.scope_hint!=='item'||!['DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN'].includes(r.source_field)||
    !Number.isSafeInteger(r.item_index)||r.item_index<0||
    r.item_index>=o.items.length||r.CDPRODUTO!==o.items[r.item_index].CDPRODUTO)
    throw Error('ITEM_NOTE_INVALID');
   const key=r.item_index+'|'+r.source_field;
   if(noteSeen.has(key))throw Error('NOTE_DUPLICATE');
   noteSeen.add(key);
   return {source_field:r.source_field,value:r.value,item_index:r.item_index,
    CDPRODUTO:r.CDPRODUTO,scope_hint:'item',join_proven:true};
  });
  if(notes.length)canonical.observation_rows=notes;
  const hash=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  if(hash!==event.snapshot_hash.toLowerCase())return hold('WATCHER_HASH_INVALID');
  if(manifest?.schema!=='deliveryos.tata-reader-permission-manifest.v1'||
    manifest.principal!=='NT SERVICE\\TataComandaReader'||
    manifest.database!=='teknisa'||manifest.object_schema!=='TEKNISA')
   return hold('HISTORIC_GRANT_MANIFEST_INVALID');
  const missing=[];
  for(const [table,columns] of Object.entries(REQUIRED)){
   const authorized=manifest.effective_columns?.[table];
   if(!Array.isArray(authorized))return hold('HISTORIC_GRANT_SURFACE_INCOMPLETE');
   for(const column of columns)if(!authorized.includes(column))
    missing.push(table+'.'+column);
  }
  return hold(missing.length?'NEW_COLUMN_NOT_IN_LAST_PROVEN_GRANT':
   'HISTORIC_GRANT_NOT_CURRENT_SQL_PROOF',{
    status:'OFFLINE_SQL_TEMPLATE_REVIEW_HOLD',
    sql_template:SQL,parameters:['cdfilial','cdloja','nrvendarest',
     'nrcomanda','day_start','day_end'],
    sql_contains_actual_order_values:false,
    // The live SQL rows have no watcher snapshot_hash or order_key:
    // copying those fields from a watcher into SQL rows would be a forged
    // provenance assertion, NOT proof of the same historical revision.
    sql_result_contains_watcher_snapshot_hash:false,
    sql_result_contains_watcher_order_key:false,
    can_attest_historical_revision_from_this_sql:false,
    sql_result_directly_satisfies_v87:false,
    expected_order_day:'2026-10-14',
    row_ceiling:101,
    source_snapshot_hash_self_checked:true,
    missing_historic_grants:missing,
    grant_claim_is_historic_not_fresh:true});
 }catch{return hold('SOURCE_INPUT_MALFORMED')}
}
module.exports={makePlan,SQL,REQUIRED};

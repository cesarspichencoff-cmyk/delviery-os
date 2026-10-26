'use strict';
/**
 * V8.9: compare native item SELECT data to an independently hash-validated
 * watcher event, WITHOUT inventing SQL columns order_key / snapshot_hash.
 * OFFLINE DATA PARITY only; SQL time-of-read is not 2026-10-14 revision proof.
 * No SQL client, process, filesystem, network or printing capability.
 */
const {makePlan}=require('./comandas_cdsenhaped_readonly_plan_v88_offline.cjs');
const native=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
 'NRPRODCOMVEN','CDPRODUTO','QTPRODCOMVEN','IDSTPRCOMVEN',
 'CDSENHAPED','DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN',
 'IDORGCMDVENDA','DTHRABERMESA'];
const texts=['DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN'];
function hold(code,stats={}){
 return {schema:'tata.comandas.native-items-parity.v89',status:'HOLD',reason:code,
  ...stats,source_history_hash_verified:false,
  historical_sql_revision_proven:false,sql_row_identity_authenticated:false,
  database_grant_proven:false,printed_block_identity_proven:false,
  physical_print_authorized:false,three_vias_proven:false,
  source_effects:{sql:false,file_write:false,service:false,printer:false,spooler:false}};
}
function qty(v){
 const s=String(v);
 if(!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$/.test(s))return null;
 const [major,dec='']=s.split('.');
 const n=BigInt(major)*1000n+BigInt(dec.padEnd(3,'0'));
 return n>0n?n:null;
}
function compare(event,manifest,rows){
 try{
  const prepared=makePlan(event,manifest);
  if(prepared.status!=='OFFLINE_SQL_TEMPLATE_REVIEW_HOLD'||
    prepared.source_snapshot_hash_self_checked!==true)
   return hold('ORIGINAL_WATCHER_SCOPE_OR_HASH_NOT_VALIDATED');
  if(!Array.isArray(rows)||!Array.isArray(event.order?.items)||
    rows.length!==event.order.items.length||rows.length<1||rows.length>100)
   return hold('NATIVE_SQL_ITEM_CARDINALITY_MISMATCH');
  const order=event.order,itemMap=new Map(),noteMap=new Map();
  for(let i=0;i<order.items.length;i++){
   const item=order.items[i];
   if(itemMap.has(item.NRPRODCOMVEN))return hold('WATCHER_ITEM_ID_NOT_UNIQUE');
   itemMap.set(item.NRPRODCOMVEN,item);
   noteMap.set(item.NRPRODCOMVEN,Object.create(null));
  }
  for(const row of order.observation_rows){
   if(row.scope_hint!=='item')continue;
   const item=order.items[row.item_index];
   if(!item||!noteMap.has(item.NRPRODCOMVEN))
    return hold('WATCHER_ITEM_OBSERVATION_UNBOUND');
   noteMap.get(item.NRPRODCOMVEN)[row.source_field]=row.value;
  }
  const seen=new Set(),senhaSet=new Set();let notes=0;
  for(const row of rows){
   if(!row||typeof row!=='object'||Array.isArray(row)||
      Object.hasOwn(row,'order_key')||Object.hasOwn(row,'snapshot_hash'))
    return hold('NATIVE_ROW_CLAIMS_NON_SQL_WATCHER_PROVENANCE');
   if(native.some(k=>!Object.hasOwn(row,k)))
    return hold('NATIVE_SQL_SELECTED_COLUMNS_INCOMPLETE');
   if(row.CDFILIAL!==order.CDFILIAL||row.CDLOJA!==order.CDLOJA||
      row.NRVENDAREST!==order.NRVENDAREST||row.NRCOMANDA!==order.NRCOMANDA||
      row.IDORGCMDVENDA!==order.IDORGCMDVENDA)
    return hold('NATIVE_SQL_ORDER_SCOPE_MISMATCH');
   if(typeof row.DTHRABERMESA!=='string'||
      !row.DTHRABERMESA.startsWith('2026-10-14T'))
    return hold('NATIVE_SQL_DAY_NOT_SAME');
   const item=itemMap.get(row.NRPRODCOMVEN);
   if(!item||seen.has(row.NRPRODCOMVEN))
    return hold('NATIVE_SQL_ITEM_ABSENT_OR_DUPLICATE');
   seen.add(row.NRPRODCOMVEN);
   if(row.CDPRODUTO!==item.CDPRODUTO||
      row.IDSTPRCOMVEN!==item.IDSTPRCOMVEN)
    return hold('NATIVE_SQL_PRODUCT_OR_ITEM_STATUS_DIFFERENT');
   const a=qty(row.QTPRODCOMVEN),b=qty(item.QTPRODCOMVEN);
   if(a===null||b===null||a!==b)
    return hold('NATIVE_SQL_QUANTITY_DIFFERENT');
   if(!/^[0-9]{1,5}$/.test(String(row.CDSENHAPED??''))||
      Number(row.CDSENHAPED)===0)
    return hold('NATIVE_SQL_SENHA_INVALID');
   senhaSet.add(String(Number(row.CDSENHAPED)));
   const expected=noteMap.get(row.NRPRODCOMVEN);
   for(const field of texts){
     const actual=row[field]===null?'':row[field];
     if(typeof actual!=='string')
      return hold('NATIVE_SQL_NOTE_VALUE_MALFORMED');
     if(Object.hasOwn(expected,field)){
       if(actual!==expected[field])
        return hold('NATIVE_SQL_PREPARATION_NOTE_DIFFERENT');
       notes++;
     }else if(actual.trim())
      return hold('NATIVE_SQL_NEW_NOTE_NOT_IN_WATCHER');
   }
  }
  return {schema:'tata.comandas.native-items-parity.v89',
   status:'NATIVE_ITEM_VALUES_CONSISTENT_HISTORY_NOT_PROVEN',
   reason:'CURRENT_SQL_VALUES_CANNOT_ATTEST_WATCHER_HISTORICAL_REVISION',
   items_compared:rows.length,notes_compared:notes,
   distinct_senhas:senhaSet.size,
   source_history_hash_verified:true,
   historical_sql_revision_proven:false,sql_row_identity_authenticated:false,
   database_grant_proven:false,printed_block_identity_proven:false,
   physical_print_authorized:false,three_vias_proven:false,
   source_effects:{sql:false,file_write:false,service:false,printer:false,spooler:false}};
 }catch{return hold('INVALID_OR_UNTRUSTED_INPUT')}
}
module.exports={compare,qty};

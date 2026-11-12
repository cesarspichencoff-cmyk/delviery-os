'use strict';
/**
 * Native Reader observation rowset -> canonical private EVENT shape (REVIEW ONLY).
 * Input must come from ONE native SQL rowset joining exact header/item identities.
 * This pure function NEVER accesses SQL, keys, files, network, browser or printers.
 * Caller claims that a query exhausted are NOT proof of actual database origin
 * or isolation; the assembled event remains blocked for operational publication.
 * Private candidate includes sensitive notes and MUST remain inside authorised host.
 */
const {snapshotHash}=require('./tata_comanda_reader_native_essentials_v857_offline.cjs');
const SCHEMA='tata.comandas.native-note-rowset-review.v1';
const HEAD=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT',
 'IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
const ITEM=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
const NOTE=['DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN'];
const COLUMNS=[...HEAD,...ITEM,'DSOBSCOMANDA',...NOTE];
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clean=x=>typeof x==='string'&&x.length>0&&x.length<=2000&&
 x===x.trim()&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(x);
const denial=reason=>Object.freeze({
 schema:SCHEMA,status:'HOLD',reason,unit:'ITAIM',
 inputIntegrityChecked:false,sourceAuthenticated:false,
 currentSqlSnapshotProven:false,observationScanIndependentlyProven:false,
 readerVersionProven:false,independentIfoodIdentityProven:false,
 direct_column_rowset_exhausted_reported:false,
 native_child_item_coverage_proven:false,
 native_child_observation_coverage_proven:false,
 semantic_observation_coverage_proven:false,
 realOrderPublishable:false,printAuthorized:false,
 privateEvent:null,notesCount:0,itemsCount:0,
 effects:Object.freeze({sql:false,write:false,network:false,service:false,
  printer:false,spooler:false,sequence:false})
});
const maybeNote=x=>x===null||x===''||clean(x);
function build(input){
 try{
  if(!record(input)||Object.keys(input).sort().join('|')!==
    ['schema','rows','source_read_exhausted'].sort().join('|')||
    input.schema!=='tata.comandas.native-note-rowset-input.v1'||
    input.source_read_exhausted!==true||!Array.isArray(input.rows)||
    input.rows.length<1||input.rows.length>200)
    return denial('BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED');
  const rows=input.rows;
  if(rows.some(r=>!record(r)||Object.keys(r).sort().join('|')!==
    COLUMNS.slice().sort().join('|')||
    HEAD.some(k=>!clean(r[k]))||ITEM.some(k=>!clean(r[k]))||
    !maybeNote(r.DSOBSCOMANDA)||NOTE.some(k=>!maybeNote(r[k]))))
   return denial('NATIVE_SOURCE_COLUMNS_OR_VALUES_UNTRUSTED');
  const first=rows[0],frozenHead=HEAD.map(k=>first[k]);
  if(first.CDFILIAL!=='0001'||first.CDLOJA!=='01'||
    first.IDORGCMDVENDA!=='DLV_IFO'||
    !['3','P','X'].includes(first.IDSTCOMANDA)||
    !/^\d{1,12}$/.test(first.NRCOMANDAEXT))
    return denial('ITAIM_DELIVERY_SOURCE_SCOPE_INVALID');
  if(rows.some(r=>HEAD.some((k,i)=>r[k]!==frozenHead[i])||
      r.DSOBSCOMANDA!==first.DSOBSCOMANDA))
    return denial('NATIVE_HEADER_OR_ORDER_NOTE_NOT_SAME_SNAPSHOT');
  if(new Set(rows.map(r=>r.NRPRODCOMVEN)).size!==rows.length)
    return denial('NATIVE_ITEM_LINE_KEY_DUPLICATE');
  if(rows.some(r=>!/^\d+(?:\.0+)?$/.test(r.QTPRODCOMVEN)||
    !Number.isSafeInteger(Number(r.QTPRODCOMVEN))||
    Number(r.QTPRODCOMVEN)<=0))
    return denial('NATIVE_QUANTITY_INVALID');
  // Stable code-unit ordering: never depend on Windows/Linux locale or ICU.
  const sorted=[...rows].sort((a,b)=>a.NRPRODCOMVEN===b.NRPRODCOMVEN?0:
    a.NRPRODCOMVEN<b.NRPRODCOMVEN?-1:1);
  const order={};
  for(const k of HEAD)order[k]=first[k];
  order.items=sorted.map(r=>{const v={};for(const k of ITEM)v[k]=r[k];return v;});
  // This SELECT only projects inline/header notes. Even when all result
  // rows are consumed, the native schema can hold separate combo components
  // and observations in ITCOMANDAEST, OBSITCOMANDAVEN, OBSITCOMANDAEST.
  // Text descriptions may require OCORRENCIA. Do not certify these joins.
  order.observation_scan_complete=false;
  order.observation_rows=[];
  for(let i=0;i<sorted.length;i++){
   const r=sorted[i];
   for(const field of NOTE){
    if(!r[field])continue;
    order.observation_rows.push({source_field:field,value:r[field],
      scope_hint:'item',join_proven:true,item_index:i,CDPRODUTO:r.CDPRODUTO});
   }
  }
  if(first.DSOBSCOMANDA)
   order.observation_rows.push({source_field:'DSOBSCOMANDA',
    value:first.DSOBSCOMANDA,scope_hint:'order',join_proven:true});
  const order_key=HEAD.slice(0,4).map(k=>first[k]).join('|');
  const hash=snapshotHash(order);
  if(!/^[0-9a-f]{64}$/.test(hash))
   return denial('CANONICAL_SNAPSHOT_HASH_NOT_COMPUTABLE');
  const event={
   schema:'deliveryos.tata-reader-stable-order-event.v1',
   order_key,snapshot_hash:hash,order,
   service_resolution:{service:null,evidence:'UNKNOWN',source_ref:null,
    blockers:['SERVICE_NOT_ATTESTED']},
   ready_for_downstream_shadow:false,
   blockers:['SOURCE_ROWSET_CALLER_NOT_AUTHENTICATED',
    'READ_COMPLETENESS_NOT_INDEPENDENTLY_ATTESTED',
    'NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ'],
   effects:{sql:false,printer:false,spooler:false,sequence:false,network:false}
  };
  return Object.freeze({...denial('REVIEW_ONLY_SOURCE_AUTHORITY_UNPROVEN'),
   status:'PRIVATE_CANONICAL_EVENT_CANDIDATE',
   inputIntegrityChecked:true,
   direct_column_rowset_exhausted_reported:true,
   itemsCount:order.items.length,notesCount:order.observation_rows.length,
   privateEvent:event});
 }catch{return denial('INVALID_OR_CONFLICTING_ROWSET')}
}
module.exports={build,SCHEMA};

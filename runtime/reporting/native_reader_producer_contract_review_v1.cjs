'use strict';
// REVIEW-ONLY shape gate between the existing PowerShell native Reader watcher
// and the DeliveryOS Reader V2 replay. No I/O or side effects.
// Canonical shape and digest DO NOT attest actual DB source, completeness,
// clock, product semantics, genuine iFood identity or customer consent.
const {snapshotHash}=require('./native_reader_shadow_replay_v1.cjs');
const SCHEMA='tata.reader.native-producer-contract-review.v1';
const FIELDS=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
 'NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
const ITEMS=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
const ITEM_NOTES=new Set(['DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN']);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safe=x=>typeof x==='string'&&x.length>0&&x.length<=2000&&
 x===x.trim()&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(x);
const out=(reason,extra={})=>Object.freeze({
 schema:SCHEMA,state:'HOLD',reason,unit:'ITAIM',
 sourceKind:'REVIEW_OF_CALLER_SUPPLIED_EVENT_NOT_LIVE',
 canonicalContractChecked:false,actualNativeSourceAuthenticated:false,
 observationScanIndependentlyProven:false,sourceFreshnessProven:false,
 independentIfoodIdentityProven:false,nativeLifecycleSemanticsProven:false,
 ordersPublishable:0,printAuthorized:false,actionsExecuted:0,
 rawOrderIdsExported:0,customerFieldsExported:0,...extra
});
function review(event){
 try{
  if(!obj(event)||event.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
    !obj(event.order))return out('INVALID_SOURCE_EVENT_ENVELOPE');
  const o=event.order;
  // A declaracao explicita de lacuna do proprio produtor prevalece sobre
  // campos de completude fornecidos depois por um caller/sombra. O fluxo
  // nativo da PR135 hoje declara filhos/observacoes nao verificados.
  // Isso nao autentica os casos sem flags; eles seguem HOLD por origem.
  if(event.ready_for_downstream_shadow===false||
    (Array.isArray(event.blockers)&&event.blockers.length>0))
   return out('NATIVE_PRODUCER_DECLARED_CHILD_OR_SOURCE_BLOCKER');
  if(FIELDS.some(k=>!Object.hasOwn(o,k))||o.CDFILIAL!=='0001'||
    o.CDLOJA!=='01'||o.IDORGCMDVENDA!=='DLV_IFO')
   return out('NATIVE_ITAIM_SCOPE_OR_REQUIRED_FIELDS_INVALID');
  if(!Array.isArray(o.items)||o.items.length<1||o.items.length>200||
    o.items.some(x=>!obj(x)||ITEMS.some(k=>!safe(x[k]))))
   return out('NATIVE_ITEM_STRUCTURE_INCOMPLETE');
  if(new Set(o.items.map(x=>x.NRPRODCOMVEN)).size!==o.items.length)
   return out('NATIVE_ITEM_LINE_IDENTITIES_AMBIGUOUS');
  if(!Object.hasOwn(o,'observation_scan_complete')||
    o.observation_scan_complete!==true)
   return out('OBSERVATION_COMPLETENESS_MISSING_OR_UNATTESTED');
  if(!Array.isArray(o.observation_rows)||o.observation_rows.length>400)
   return out('NATIVE_OBSERVATION_ROWS_MISSING_OR_EXCESSIVE');
  // item_index is assigned by the producer, not an independent native-line witness.
  // If two native lines share CDPRODUTO, matching that code and an index alone
  // cannot distinguish which line owns an item-scoped observation.
  const itemCodeCounts=new Map();
  for(const item of o.items)
   itemCodeCounts.set(item.CDPRODUTO,(itemCodeCounts.get(item.CDPRODUTO)||0)+1);
  const seen=new Set();
  for(const row of o.observation_rows){
   if(!obj(row)||!safe(row.source_field)||!safe(row.value)||
      row.join_proven!==true||!['item','order'].includes(row.scope_hint))
    return out('OBSERVATION_ROW_NOT_JOINED');
   if(row.scope_hint==='order'){
    if(row.source_field!=='DSOBSCOMANDA'||Object.hasOwn(row,'item_index')||
      Object.hasOwn(row,'CDPRODUTO'))
     return out('ORDER_OBSERVATION_SCOPE_MISMATCH');
   }else{
    if(!ITEM_NOTES.has(row.source_field)||
      !Number.isInteger(row.item_index)||row.item_index<0||
      row.item_index>=o.items.length||
      row.CDPRODUTO!==o.items[row.item_index].CDPRODUTO)
     return out('ITEM_OBSERVATION_JOIN_MISMATCH');
   }
   if(row.scope_hint==='item'&&itemCodeCounts.get(row.CDPRODUTO)>1)
    return out('ITEM_OBSERVATION_NATIVE_LINE_AMBIGUOUS');
   const k=row.source_field+'|'+(row.scope_hint==='item'?row.item_index:'ORDER');
   if(seen.has(k))return out('OBSERVATION_NATIVE_FIELD_DUPLICATED');
   seen.add(k);
  }
  const canonicalDigest=snapshotHash(o);
  const received=event.snapshot_hash;
  if(typeof received!=='string'||!/^[0-9a-fA-F]{64}$/.test(received))
   return out('SNAPSHOT_HASH_INVALID_HEX');
  if(!/^[0-9a-f]{64}$/.test(received))
   return out(received.toLowerCase()===canonicalDigest
    ?'SNAPSHOT_HASH_UPPERCASE_ONLY'
    :'SNAPSHOT_HASH_UPPERCASE_AND_SERIALIZATION_DIVERGENT');
  if(received!==canonicalDigest)
   return out('SNAPSHOT_HASH_NOT_BOUND_TO_CANONICAL_FIELDS');
  const key=[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|');
  if(typeof event.order_key!=='string'||event.order_key!==key)
   return out('NATIVE_FOUR_PART_KEY_MISMATCH');
  if(!['3','P','X'].includes(o.IDSTCOMANDA))
   return out('NATIVE_STATE_UNSUPPORTED_OR_UNINTERPRETED');
  return out('CANONICAL_ENVELOPE_SELF_CONSISTENT_BUT_SOURCE_UNATTESTED',{
   canonicalContractChecked:true,itemRows:o.items.length,
   noteRows:o.observation_rows.length});
 }catch{
  return out('NATIVE_PRODUCER_REVIEW_INVALID_INPUT');
 }
}
module.exports={review,SCHEMA};

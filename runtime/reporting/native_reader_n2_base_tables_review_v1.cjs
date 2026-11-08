'use strict';
// Pure REVIEW-ONLY N2 comparison: a previously emitted Reader V2 event
// against separately supplied base-table rows, with explicit CDLOJA on items.
// NO SQL, I/O, services, process, printing, mutation, source authority or PII output.
// Caller input is not an authenticated DB attestation. MATCH NEVER => publish.
const {snapshotHash}=require('./native_reader_shadow_replay_v1.cjs');
const SCHEMA='deliveryos.native-reader-n2-base-tables-review.v1';
const INPUT='deliveryos.native-reader-n2-base-tables-input.v1';
const H=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT',
 'IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
const I=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
const NOTE=['DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN'];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const populated=x=>typeof x==='string'&&x.trim().length>0;
const eq=(a,b)=>a===b;
function hold(reason,extra={}){
 return Object.freeze({schema:SCHEMA,state:'HOLD',reason,
  headMatching:false,itemsMatching:false,notesMatching:false,
  eventHashRecomputed:false,sourceSqlSessionAuthenticated:false,
  sourceRowsetIndependentlyExhausted:false,atomicityProven:false,
  independentIfoodIdentityProven:false,ordersPublishable:0,
  homePublishAuthorized:false,printAuthorized:false,actionsExecuted:0,
  customerDataExported:false,rawOrderIdsExported:0,rawHashExported:false,
  ...extra});
}
function review(input){
 try{
  if(!obj(input)||input.schema!==INPUT||!obj(input.event)||
     !obj(input.base)||!obj(input.event.order))
   return hold('ENVELOPE_INVALID');
  const {event:e,base:b}=input,o=e.order;
  if(e.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
     !Array.isArray(o.items)||!Array.isArray(o.observation_rows)||
     o.items.length<1||o.items.length>200||o.observation_rows.length>400||
     !Array.isArray(b.headerRows)||!Array.isArray(b.vendaRows)||
     !Array.isArray(b.itemRows)||b.itemRows.length>201)
   return hold('SOURCE_ROWS_OR_BOUNDS_INVALID');
  if(b.readExhausted!==true)
   return hold('READER_SUPPLIED_EXHAUSTION_MISSING');
  // A 201st row is a truncation sentinel. Never accept a top-200 slice.
  if(b.itemRows.length===201)return hold('SOURCE_ROWSET_LIMIT_REACHED');
  if(b.headerRows.length!==1||b.vendaRows.length!==1)
   return hold('BASE_HEADER_OR_SALE_NOT_UNIQUE');
  const hdr=b.headerRows[0],sale=b.vendaRows[0];
  if(!obj(hdr)||!obj(sale)||H.some(k=>!Object.hasOwn(hdr,k))||
     o.CDFILIAL!=='0001'||o.CDLOJA!=='01'||o.IDORGCMDVENDA!=='DLV_IFO'||
     H.some(k=>!eq(hdr[k],o[k]))||
     !['CDFILIAL','CDLOJA','NRVENDAREST','DTHRABERMESA']
       .every(k=>eq(sale[k],o[k]))||
     e.order_key!==[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|'))
   return hold('BASE_HEADER_SCOPE_OR_SALE_MISMATCH');
  const hash=snapshotHash(o);
  if(typeof hash!=='string'||typeof e.snapshot_hash!=='string'||
     !/^[0-9A-Fa-f]{64}$/.test(e.snapshot_hash)||
     e.snapshot_hash.toLowerCase()!==hash)
   return hold('EVENT_DIGEST_NOT_CANONICAL');
  // Unlike the installed V2 join, the independent base source MUST carry
  // each item's own shop code, not only the COMANDAVEN shop.
  const byLine=new Map(),bySku=new Map();
  for(const row of b.itemRows){
   if(!obj(row)||!I.every(k=>Object.hasOwn(row,k))||
      !['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA']
        .every(k=>row[k]===o[k]))
    return hold('ITEM_NATIVE_SHOP_OR_ORDER_SCOPE_MISMATCH');
   if(!populated(row.NRPRODCOMVEN)||byLine.has(row.NRPRODCOMVEN))
    return hold('BASE_ITEM_LINE_DUPLICATE_OR_INVALID');
   byLine.set(row.NRPRODCOMVEN,row);
   bySku.set(row.CDPRODUTO,(bySku.get(row.CDPRODUTO)||0)+1);
  }
  if(byLine.size!==o.items.length)return hold('BASE_ITEM_ROW_COUNT_MISMATCH');
  const usedNativeLines=new Set();
  const noteRows=[];
  if(populated(hdr.DSOBSCOMANDA))
   noteRows.push({source_field:'DSOBSCOMANDA',scope_hint:'order',
    value:hdr.DSOBSCOMANDA.trim()});
  for(let idx=0;idx<o.items.length;idx++){
   const oi=o.items[idx];
   if(!obj(oi)||!populated(oi.NRPRODCOMVEN))return hold('EVENT_ITEM_INVALID');
   if(usedNativeLines.has(oi.NRPRODCOMVEN))
    return hold('EVENT_NATIVE_LINE_DUPLICATE_OR_UNMATCHED');
   usedNativeLines.add(oi.NRPRODCOMVEN);
   const src=byLine.get(oi.NRPRODCOMVEN);
   if(!src||I.some(k=>!eq(src[k],oi[k])))
    return hold('BASE_ITEM_FIELD_OR_LINE_MISMATCH');
   for(const field of NOTE){
    if(populated(src[field])){
     // A producer-assigned item_index + SKU is not an independent line witness
     // when multiple native lines share that same product code.
     if(bySku.get(src.CDPRODUTO)>1)
      return hold('DUPLICATE_SKU_ITEM_NOTE_LINE_UNPROVEN');
     noteRows.push({source_field:field,scope_hint:'item',item_index:idx,
      CDPRODUTO:src.CDPRODUTO,value:src[field].trim()});
    }
   }
  }
  if(usedNativeLines.size!==byLine.size)
   return hold('EVENT_NATIVE_LINE_DUPLICATE_OR_UNMATCHED');
  if(noteRows.length!==o.observation_rows.length)
   return hold('BASE_NOTE_ROW_COUNT_MISMATCH');
  for(let i=0;i<noteRows.length;i++){
   const n=noteRows[i],observed=o.observation_rows[i];
   if(!obj(observed)||observed.join_proven!==true||
      Object.keys(n).some(k=>!eq(n[k],observed[k])))
    return hold('BASE_NOTE_FIELDS_OR_ITEM_LINK_MISMATCH');
  }
  // Matching caller-supplied rows still cannot prove transaction-level
  // consistency at the moment the original Reader V2 event was captured.
  return hold('ONE_ORDER_BASE_TABLE_FIELDS_MATCH_NOT_ATOMIC',{
   headMatching:true,itemsMatching:true,notesMatching:true,
   eventHashRecomputed:true,itemRows:o.items.length,
   observationRows:o.observation_rows.length});
 }catch{return hold('BASE_ROW_COMPARISON_EXCEPTION');}
}
module.exports=Object.freeze({SCHEMA,INPUT,review});

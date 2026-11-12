'use strict';
/**
 * Pure, offline comparison of ONE pre-existing Reader event, its processing
 * record (names already captured), and an independently obtained iFood detail.
 * No SQL, host, browser, filesystem, network, print or storage access.
 *
 * Three caller-supplied objects do NOT attest their own custody. Matching
 * short code, local minute, names and quantities is CORRELATION, never a
 * native UUID foreign key, full child-table coverage or release permission.
 */
const SCHEMA='deliveryos.reader-ifood-processing-correlation.v1';
const INPUT='deliveryos.reader-ifood-processing-input.v1';
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.length>0&&x.length<=160&&x===x.trim()&&
  !/[\x00-\x1f\x7f]/.test(x);
const norm=x=>x.normalize('NFC').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
function quantity(x){
  const s=typeof x==='number'&&Number.isSafeInteger(x)?String(x):x;
  if(typeof s!=='string'||!/^\d{1,5}(?:\.\d{1,4})?$/.test(s))return null;
  const [whole,fraction='']=s.split('.');
  const value=Number(whole)*10000+Number(fraction.padEnd(4,'0'));
  return value>0&&value<=100000000?value:null;
}
function localMinute(x){
  if(typeof x!=='string')return null;
  const m=/^(20\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):([0-5]\d)(?:\.\d{1,7})?$/.exec(x);
  if(!m)return null;
  const [y,mo,d,h,mi]=m.slice(1,6).map(Number);
  if(h>23||mi>59)return null;
  const date=new Date(Date.UTC(y,mo-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return null;
  // Do NOT convert a SQL wall time without zone into an absolute instant.
  return x.slice(0,16);
}
const result=(reason,extra={})=>Object.freeze({
  schema:SCHEMA,state:'HOLD',reason,matchedProducts:0,matchedQuantities:0,
  readerEventHashAuthenticated:false,processingOriginAuthenticated:false,
  ifoodDetailAuthenticated:false,merchantIdentityIndependentlyProven:false,
  nativeUuidLinkProven:false,childTableCoverageProven:false,
  observationCoverageProven:false,sqlWriterSafetyProven:false,
  ordersPublishable:0,homePublishAuthorized:false,printAuthorized:false,
  actionsExecuted:0,rawOrderIdsExported:0,rawProductNamesExported:0,
  rawProductCodesExported:0,rawUuidExported:false,customerDataExported:false,
  ...extra
});
function compare(input){
  try{
    if(!object(input)||input.schema!==INPUT||!object(input.event)||
       !object(input.processing)||!object(input.ifood)||
       !object(input.event.order))return result('ENVELOPE_INVALID');
    const {event:e,processing:p,ifood:f}=input,o=e.order;
    if(e.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
       o.CDFILIAL!=='0001'||o.CDLOJA!=='01'||o.IDORGCMDVENDA!=='DLV_IFO'||
       !text(e.order_key)||e.order_key!==
       [o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|')||
       !sha(e.snapshot_hash)||!Array.isArray(o.items)||
       o.items.length===0||o.items.length>200)
      return result('READER_SCOPE_OR_SHAPE_INVALID');
    if(p.order_key!==e.order_key||p.snapshot_hash!==e.snapshot_hash||
       !Array.isArray(p.lines)||p.lines.length!==o.items.length)
      return result('PROCESSING_RECORD_NOT_BOUND_TO_READER_REVISION');
    const native=new Map();
    for(const row of o.items){
      if(!object(row)||!text(row.NRPRODCOMVEN)||!text(row.CDPRODUTO)||
         native.has(row.NRPRODCOMVEN)||quantity(row.QTPRODCOMVEN)===null)
        return result('READER_LINES_AMBIGUOUS_OR_INVALID');
      native.set(row.NRPRODCOMVEN,row);
    }
    const processed=new Map();
    for(const row of p.lines){
      if(!object(row)||!text(row.NRPRODCOMVEN)||!text(row.CDPRODUTO)||
         !text(row.product_name)||processed.has(row.NRPRODCOMVEN)||
         !native.has(row.NRPRODCOMVEN))
        return result('PROCESSING_LINE_OR_NAME_INVALID');
      const original=native.get(row.NRPRODCOMVEN);
      if(row.CDPRODUTO!==original.CDPRODUTO||
         quantity(row.quantity)===null||
         quantity(row.quantity)!==quantity(original.QTPRODCOMVEN))
        return result('PROCESSING_NATIVE_PRODUCT_OR_QUANTITY_MISMATCH');
      processed.set(row.NRPRODCOMVEN,row);
    }
    if(processed.size!==native.size)return result('PROCESSING_LINE_COVERAGE_INCOMPLETE');
    const readerMinute=localMinute(o.DTHRABERMESA);
    const ifoodMinute=localMinute(f.placed_at_local);
    if(f.store_id!=='53069'||f.short_code!==o.NRCOMANDAEXT||
       !/^\d{4}$/.test(f.short_code)||
       readerMinute===null||ifoodMinute===null||readerMinute!==ifoodMinute)
      return result('IFOOD_STORE_SHORT_CODE_OR_LOCAL_MINUTE_MISMATCH');
    if(!Array.isArray(f.items)||f.items.length!==processed.size||
       f.items.length>200)return result('IFOOD_PRODUCT_LINE_COUNT_MISMATCH');
    const multiset=new Map();
    for(const row of p.lines){
      const key=JSON.stringify([norm(row.product_name),quantity(row.quantity)]);
      multiset.set(key,(multiset.get(key)||0)+1);
    }
    for(const row of f.items){
      if(!object(row)||!text(row.name)||quantity(row.quantity)===null)
        return result('IFOOD_PRODUCT_NAME_OR_QUANTITY_INVALID');
      const key=JSON.stringify([norm(row.name),quantity(row.quantity)]);
      const count=multiset.get(key)||0;
      if(count===0)return result('IFOOD_PRODUCT_NAME_OR_QUANTITY_MISMATCH');
      if(count===1)multiset.delete(key);
      else multiset.set(key,count-1);
    }
    if(multiset.size!==0)return result('IFOOD_PRODUCT_MULTISET_INCOMPLETE');
    return result('PRODUCT_NAMES_AND_QUANTITIES_CORRELATED_NOT_IDENTITY_PROVEN',{
      matchedProducts:p.lines.length,matchedQuantities:p.lines.length,
      processingRevisionBoundByCaller:true,
      ifoodStoreShortCodeLocalMinuteMatched:true
    });
  }catch{return result('CORRELATION_EXCEPTION_HOLD');}
}
module.exports=Object.freeze({SCHEMA,INPUT,compare});

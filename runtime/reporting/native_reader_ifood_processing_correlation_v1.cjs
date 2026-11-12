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
const {snapshotHash}=require('./native_reader_shadow_replay_v1.cjs');
const SCHEMA='deliveryos.reader-ifood-processing-correlation.v1';
const INPUT='deliveryos.reader-ifood-processing-input.v1';
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.length>0&&x.length<=160&&x===x.trim()&&
  !/[\x00-\x1f\x7f]/.test(x);
const baseNorm=x=>x.normalize('NFC').toLocaleLowerCase('pt-BR')
  .replace(/\s+/g,' ').trim();
const norm=x=>baseNorm(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .normalize('NFC');
// Diacritic folding is for review-only correlation, never an identity join.
// Distinct names on the SAME source may collapse to one folded label: reject.
function ambiguousFold(rows,key){
 const byFold=new Map();
 for(const row of rows){
  if(!object(row)||!text(row[key]))continue; // existing input validator follows
  const source=baseNorm(row[key]),folded=norm(row[key]);
  if(byFold.has(folded)&&byFold.get(folded)!==source)return true;
  byFold.set(folded,source);
 }
 return false;
}
function quantity(x){
  const s=typeof x==='number'&&Number.isSafeInteger(x)?String(x):x;
  if(typeof s!=='string'||!/^\d{1,5}(?:\.\d{1,4})?$/.test(s))return null;
  const [whole,fraction='']=s.split('.');
  const value=Number(whole)*10000+Number(fraction.padEnd(4,'0'));
  return value>0&&value<=100000000?value:null;
}
const code=x=>typeof x!=='string'?null:/^[0-9]{10}$/.test(x)?x:/^[0-9]\.[0-9]{2}\.[0-9]{2}\.[0-9]{3}\.[0-9]{2}$/.test(x)?x.replace(/\./g,''):null;
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
  schema:SCHEMA,state:'HOLD',reason,matchedProducts:0,matchedQuantities:0,matchedProductCodes:0,
  readerEventHashAuthenticated:false,readerSnapshotRecomputed:false,
  processingOriginAuthenticated:false,
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
    // A producer's explicit HOLD cannot be waived by matching names or hashes.
    if(e.ready_for_downstream_shadow===false||
       (Array.isArray(e.blockers)&&e.blockers.length>0))
      return result('READER_DECLARED_SOURCE_OR_CHILD_INCOMPLETE');
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
    const codeMode=f.items.some(row=>Object.prototype.hasOwnProperty.call(row,'externalCode'));
    if(ambiguousFold(p.lines,'product_name')||ambiguousFold(f.items,'name'))
      return result('FOLDED_PRODUCT_NAME_COLLISION_AMBIGUOUS');
    let nameMultisetMatch=true, matchedProductNames=0;
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
      if(count===0){
        nameMultisetMatch=false;
        if(!codeMode)return result('IFOOD_PRODUCT_NAME_OR_QUANTITY_MISMATCH');
        continue;
      }
      matchedProductNames++;
      if(count===1)multiset.delete(key);
      else multiset.set(key,count-1);
    }
    if(multiset.size!==0){
      nameMultisetMatch=false;
      if(!codeMode)return result('IFOOD_PRODUCT_MULTISET_INCOMPLETE');
    }
    // Optional independently visible Gestor externalCode <-> native CDARVPROD.
    // The whole basket must carry codes; partial or invalid codes HOLD.
    // Matching codes remains content correlation, NOT source custody or UUID identity.
    const anyCode=codeMode;
    let matchedProductCodes=0;
    if(anyCode){
      if(!f.items.every(row=>code(row.externalCode)!==null))
        return result('IFOOD_EXTERNAL_CODES_PARTIAL_OR_INVALID');
      const byCode=new Map();
      for(const row of o.items){
        const c=code(row.CDARVPROD);
        if(c===null)return result('NATIVE_PRODUCT_CODE_MISSING_OR_INVALID');
        const k=JSON.stringify([c,quantity(row.QTPRODCOMVEN)]);
        byCode.set(k,(byCode.get(k)||0)+1);
      }
      for(const row of f.items){
        const k=JSON.stringify([code(row.externalCode),quantity(row.quantity)]);
        const count=byCode.get(k)||0;
        if(!count)return result('IFOOD_NATIVE_CODE_AND_QTY_MISMATCH');
        if(count===1)byCode.delete(k);else byCode.set(k,count-1);
      }
      if(byCode.size)return result('IFOOD_NATIVE_CODE_MULTISET_INCOMPLETE');
      matchedProductCodes=f.items.length;
    }
    // A copied digest does not prove that the event content produced those bytes.
    // This preflight proves only self-consistency, never independent custody.
    if(snapshotHash(o)!==e.snapshot_hash)
      return result('READER_SNAPSHOT_NOT_SELF_CONSISTENT');
    // Names may be commercial aliases; codes+quantities are a stronger REVIEW
    // candidate, never source custody, authenticated UUID binding, or print.
    const reason=codeMode&&!nameMultisetMatch
      ? 'PRODUCT_CODES_AND_QUANTITIES_CORRELATED_NAMES_DIFFER_REVIEW_ONLY'
      : 'PRODUCT_NAMES_AND_QUANTITIES_CORRELATED_NOT_IDENTITY_PROVEN';
    return result(reason,{
      readerSnapshotRecomputed:true,
      matchedProducts:p.lines.length,matchedQuantities:p.lines.length,matchedProductCodes,
      matchedProductNames,nameMultisetMatched:nameMultisetMatch,
      processingRevisionBoundByCaller:true,
      ifoodStoreShortCodeLocalMinuteMatched:true
    });
  }catch{return result('CORRELATION_EXCEPTION_HOLD');}
}

const NOTE_INPUT='deliveryos.reader-ifood-inline-note-review-input.v1';
// Counts-only diagnostic; item position is only a review hypothesis.
const noteText=x=>typeof x==='string'&&x.length>0&&x.length<=2000&&
 x===x.trim()&&!/[\x00-\x1f\x7f]/.test(x);
const noteNorm=x=>norm(x).replace(/[.!?;,\s]+$/gu,'').trim();
function reviewInlineItemNotes(input){
 const out=(reason,extra={})=>Object.freeze({
  schema:'deliveryos.reader-ifood-inline-note-review.v1',state:'HOLD',reason,
  sameIndexQuantityMatched:false,independentItemLineBindingProven:false,
  nativeChildTableCoverageProven:false,observationScanIndependentlyProven:false,
  merchantIdentityProven:false,homePublishAuthorized:false,printAuthorized:false,
  ordersPublishable:0,actionsExecuted:0,customerDataExported:false,
  rawNotesExported:0,matchedDirectNotes:0,optionNameCorrelations:0,
  unexplainedNativeNotes:0,missingGestorDirectNotes:0,
  duplicateNativeNoteFieldEntries:0,...extra
 });
 try{
  if(!object(input)||input.schema!==NOTE_INPUT||
      !Array.isArray(input.gestorItems)||!Array.isArray(input.readerItems)||
      input.gestorItems.length<1||input.gestorItems.length>200||
      input.gestorItems.length!==input.readerItems.length)
   return out('ITEM_LINE_COUNT_OR_INPUT_INVALID');
  const counts={matchedDirectNotes:0,optionNameCorrelations:0,
   unexplainedNativeNotes:0,missingGestorDirectNotes:0,
   duplicateNativeNoteFieldEntries:0};
  for(let i=0;i<input.gestorItems.length;i++){
   const g=input.gestorItems[i],r=input.readerItems[i];
   const options=g?.options??[];
   if(!object(g)||!object(r)||quantity(g.quantity)===null||
      quantity(g.quantity)!==quantity(r.quantity)||!Array.isArray(r.observations)||
      r.observations.length>100||!Array.isArray(options)||options.length>100)
    return out('ITEM_INDEX_QUANTITY_OR_NOTE_PROJECTION_INVALID');
   const raw=g.observations??'';
   if(typeof raw!=='string'||(raw!==''&&!noteText(raw)))
    return out('GESTOR_INLINE_NOTE_INVALID');
   const gNote=raw?noteNorm(raw):'';
   const opts=[];
   for(const opt of options){
    const label=typeof opt==='string'?opt:object(opt)?opt.name:null;
    if(!noteText(label))return out('GESTOR_OPTION_NAME_INVALID');
    opts.push(noteNorm(label));
   }
   const readerNotes=[],seen=new Set();
   for(const note of r.observations){
    const label=typeof note==='string'?note:object(note)?note.value:null;
    if(!noteText(label))return out('READER_INLINE_NOTE_INVALID');
    const v=noteNorm(label);
    if(!v)return out('READER_INLINE_NOTE_INVALID');
    if(seen.has(v))counts.duplicateNativeNoteFieldEntries++;
    else{seen.add(v);readerNotes.push(v)}
   }
   if(gNote){
    const index=readerNotes.indexOf(gNote);
    if(index<0)counts.missingGestorDirectNotes++;
    else{counts.matchedDirectNotes++;readerNotes.splice(index,1)}
   }
   for(const n of readerNotes){
    if(opts.includes(n))counts.optionNameCorrelations++;
    else counts.unexplainedNativeNotes++;
   }
  }
  const reason=counts.missingGestorDirectNotes||counts.unexplainedNativeNotes
   ?'UNEXPLAINED_OR_MISSING_INLINE_NOTES_REVIEW_ONLY'
   :'DIRECT_AND_OPTION_NOTE_TEXT_CORRELATED_NOT_COMPLETE';
  return out(reason,{sameIndexQuantityMatched:true,itemLinesReviewed:input.gestorItems.length,...counts});
 }catch{return out('INLINE_NOTE_REVIEW_EXCEPTION_HOLD')}
}

module.exports=Object.freeze({SCHEMA,INPUT,compare,NOTE_INPUT,reviewInlineItemNotes});

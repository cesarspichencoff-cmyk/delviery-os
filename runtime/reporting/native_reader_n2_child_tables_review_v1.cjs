'use strict';
// Offline, pure child-table reconciliation for one native Reader order.
// Source is caller supplied. No SQL, browser, I/O, prints, writes, or effect authority.
// Uses the existing N2 base-table reviewer; never substitutes for it.
const {review:reviewBase,INPUT:BASE_INPUT}=require('./native_reader_n2_base_tables_review_v1.cjs');
const SCHEMA='deliveryos.native-reader-n2-child-tables-review.v1';
const INPUT='deliveryos.native-reader-n2-child-tables-input.v1';
const TABLES=['ITCOMANDAVEN_COMBO','ITCOMANDAEST','OBSITCOMANDAVEN','OBSITCOMANDAEST','OCORRENCIA','PRODUTO'];
const LIMIT={ITCOMANDAVEN_COMBO:200,ITCOMANDAEST:200,OBSITCOMANDAVEN:400,OBSITCOMANDAEST:400,OCORRENCIA:800,PRODUTO:400};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const val=x=>typeof x==='string'&&x.length>0&&x.length<=180&&x===x.trim();
const qty=x=>/^\d+(?:\.\d{1,4})?$/.test(String(x))&&Number(x)>0&&Number.isFinite(Number(x));
const pair=x=>JSON.stringify([x.CDGRPOCOR,x.CDOCORR]);
const child=x=>JSON.stringify([x.NRPRODCOMVEN,x.CDPRODUTO]);
const name=x=>x.normalize('NFC').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
const observedQty=x=>x===null||(typeof x==='string'||typeof x==='number')&&
 /^\d+(?:\.\d{1,4})?$/.test(String(x))&&
 Number.isFinite(Number(x));
const denial=(reason,extra={})=>Object.freeze({
 schema:SCHEMA,state:'HOLD',reason,
 baseSourceStructureMatched:false,childJoinShapeMatched:false,
 callerReportedTableExhaustion:false,independentTableExhaustionProven:false,
 sqlSnapshotAtomicityProven:false,sqlWriterSafetyProven:false,
 independentIfoodUuidBindingProven:false,merchantMappingIndependentlyProven:false,
 nativeProductMasterAuthenticated:false,operationalReadyProven:false,
 processingNameBindingCallerOnly:false,processingNameRowsMatched:0,
 processingNativeMasterIndependentlyAttested:false,
 ordersPublishable:0,homePublishAuthorized:false,printAuthorized:false,
 actionsExecuted:0,rawOrderIdsExported:0,rawProductCodesExported:0,
 rawProductNamesExported:0,customerDataExported:false,
 ...extra
});
function reconcile(input){
 try{
  if(!obj(input)||input.schema!==INPUT||!obj(input.baseInput)||
      input.baseInput.schema!==BASE_INPUT||!obj(input.childRows))
   return denial('INPUT_ENVELOPE_INVALID');
  // A structure-only match must not contradict the producer's own negative
  // source/child-coverage declaration, even if all supplied rows reconcile.
  const event=input.baseInput.event;
  if(obj(event)&&(event.ready_for_downstream_shadow===false||
      (Array.isArray(event.blockers)&&event.blockers.length>0)))
   return denial('READER_DECLARED_SOURCE_OR_CHILD_INCOMPLETE');
  const base=reviewBase(input.baseInput);
  if(base.reason!=='ONE_ORDER_BASE_TABLE_FIELDS_MATCH_NOT_ATOMIC'||
      base.headMatching!==true||base.itemsMatching!==true||
      base.notesMatching!==true||base.eventHashRecomputed!==true)
   return denial('N2_BASE_NOT_MATCHED');
  const rs=input.childRows;
  if(Object.keys(rs).sort().join('|')!==TABLES.slice().sort().join('|'))
   return denial('REQUIRED_NATIVE_CHILD_TABLE_CAPTURE_MISSING');
  for(const table of TABLES){
   const set=rs[table];
   if(!obj(set)||!Array.isArray(set.rows)||
       set.readExhausted!==true||!Number.isSafeInteger(set.totalRows)||
       set.totalRows!==set.rows.length||
       set.rows.length>=LIMIT[table])
    return denial('CHILD_ROWSET_MISSING_EXHAUSTION_OR_TRUNCATED');
  }
  const o=input.baseInput.event.order;
  const scope=['CDFILIAL','NRVENDAREST','NRCOMANDA'];
  // The vendor's child INSERT omits CDLOJA; its catalog PK on COMANDAVEN
  // is the exact 3-field order scope. Reject a contradictory shop if present.
  const scoped=x=>scope.every(k=>x[k]===o[k])&&
   (!Object.hasOwn(x,'CDLOJA')||x.CDLOJA===o.CDLOJA);
  const direct=new Map();
  for(const it of o.items){
   if(!obj(it)||!val(it.NRPRODCOMVEN)||!val(it.CDPRODUTO)||
      direct.has(it.NRPRODCOMVEN))return denial('DIRECT_ITEM_NATIVE_LINE_NOT_UNIQUE');
   direct.set(it.NRPRODCOMVEN,it);
  }
  const productById=new Map();
  for(const row of rs.PRODUTO.rows){
   if(!obj(row)||!val(row.CDPRODUTO)||!val(row.NMPRODUTO)||
      productById.has(row.CDPRODUTO))return denial('PRODUCT_MASTER_ROW_MISSING_OR_AMBIGUOUS');
   productById.set(row.CDPRODUTO,row);
  }
  const requiredProducts=new Set(o.items.map(x=>x.CDPRODUTO));
  // The vendor uses CDPRODPROMOCAO + NRSEQPRODCOM for combo grouping.
  // This projection comes from the SAME ITCOMANDAVEN identities already
  // reviewed in the base rowset; it is not a new or authenticated source.
  const comboLines=new Set();
  let comboGroups=0;
  for(const row of rs.ITCOMANDAVEN_COMBO.rows){
   if(!obj(row)||!scoped(row)||!val(row.NRPRODCOMVEN)||
      !direct.has(row.NRPRODCOMVEN)||
      row.CDPRODUTO!==direct.get(row.NRPRODCOMVEN).CDPRODUTO||
      comboLines.has(row.NRPRODCOMVEN)||
      !Object.hasOwn(row,'CDPRODPROMOCAO')||
      !Object.hasOwn(row,'NRSEQPRODCOM'))
    return denial('COMBO_NATIVE_LINE_OR_GROUP_SCOPE_INVALID');
   if(row.CDPRODPROMOCAO!==null&&!val(row.CDPRODPROMOCAO))
    return denial('COMBO_PRODUCT_ID_INVALID');
   if(row.NRSEQPRODCOM!==null&&!val(row.NRSEQPRODCOM))
    return denial('COMBO_SEQUENCE_GROUP_INVALID');
   // The installed supplier retrieval pairs CDPRODPROMOCAO with NRSEQPRODCOM.
   // A parent without its sequence, or a sequence without its parent, cannot
   // be retrieved as the same combo group: fail closed instead of counting it.
   if((row.CDPRODPROMOCAO===null)!==(row.NRSEQPRODCOM===null))
    return denial('COMBO_PARENT_SEQUENCE_GROUP_INCOMPLETE');
   comboLines.add(row.NRPRODCOMVEN);
   if(row.CDPRODPROMOCAO!==null){
    comboGroups++;
    requiredProducts.add(row.CDPRODPROMOCAO);
   }
  }
  if(comboLines.size!==direct.size)return denial('COMBO_LINE_PROJECTION_NOT_EXHAUSTIVE');
  const children=new Set();
  for(const row of rs.ITCOMANDAEST.rows){
   if(!obj(row)||!scoped(row)||
       !val(row.NRPRODCOMVEN)||!val(row.CDPRODUTO)||
       !qty(row.QTPROCOMEST)||!direct.has(row.NRPRODCOMVEN))
    return denial('CHILD_ITEM_PARENT_SCOPE_OR_QUANTITY_INVALID');
   const key=child(row);
   if(children.has(key))return denial('CHILD_ITEM_NATIVE_IDENTITY_DUPLICATE');
   children.add(key);
   requiredProducts.add(row.CDPRODUTO);
  }
  if([...requiredProducts].some(id=>!productById.has(id)))
   return denial('PRODUCT_NAME_FROM_NATIVE_MASTER_NOT_COVERED');
  // The one-order SQL recipe selects only referenced product codes.
  // Extra master rows contradict a minimal, scope-limited result set.
  if(productById.size!==requiredProducts.size)
   return denial('PRODUCT_MASTER_ROWS_OUTSIDE_THIS_ORDER');
  const occurrences=new Map();
  for(const row of rs.OCORRENCIA.rows){
   if(!obj(row)||!val(row.CDGRPOCOR)||!val(row.CDOCORR)||
      (!val(row.DSOCORR)&&!val(row.DSAPELIDOOBS)))
    return denial('OCCURRENCE_DICTIONARY_ROW_INVALID');
   const key=pair(row);
   if(occurrences.has(key))return denial('OCCURRENCE_IDENTITY_AMBIGUOUS');
   occurrences.set(key,row);
  }
  const seenDirectObs=new Set(),seenChildObs=new Set();
  const referencedOccurrences=new Set();
  for(const row of rs.OBSITCOMANDAVEN.rows){
   if(!obj(row)||!scoped(row)||
      !direct.has(row.NRPRODCOMVEN)||
      !occurrences.has(pair(row)))
    return denial('DIRECT_OBSERVATION_PARENT_OR_DICTIONARY_MISSING');
   if(!Object.hasOwn(row,'NRPRODCOMVENOBS')||
      !Object.hasOwn(row,'QTPRODCOMVENOBS')||
      (row.NRPRODCOMVENOBS!==null&&!val(String(row.NRPRODCOMVENOBS)))||
      !observedQty(row.QTPRODCOMVENOBS))
    return denial('DIRECT_OBSERVATION_PROJECTION_OR_QUANTITY_INVALID');
   const key=JSON.stringify([row.NRPRODCOMVEN,row.CDGRPOCOR,row.CDOCORR,row.NRPRODCOMVENOBS??null]);
   if(seenDirectObs.has(key))return denial('DIRECT_OBSERVATION_DUPLICATE');
   seenDirectObs.add(key);
   referencedOccurrences.add(pair(row));
  }
  for(const row of rs.OBSITCOMANDAEST.rows){
   if(!obj(row)||!scoped(row)||
       !children.has(child(row))||!occurrences.has(pair(row)))
    return denial('CHILD_OBSERVATION_PARENT_OR_DICTIONARY_MISSING');
   const key=JSON.stringify([row.NRPRODCOMVEN,row.CDPRODUTO,row.CDGRPOCOR,row.CDOCORR]);
   if(seenChildObs.has(key))return denial('CHILD_OBSERVATION_DUPLICATE');
   seenChildObs.add(key);
   referencedOccurrences.add(pair(row));
  }
  if(occurrences.size!==referencedOccurrences.size)
   return denial('OCCURRENCE_DICTIONARY_ROWS_OUTSIDE_THIS_ORDER');
  // Optional check against the processing names the existing Reader already
  // stored. Use exact native line + product ID + quantity, not name proximity.
  // This comparison still reuses caller-supplied sources (never independent).
  let processingNameRowsMatched=0;
  if(input.processing!==undefined){
   const p=input.processing,e=input.baseInput.event;
   if(!obj(p)||p.order_key!==e.order_key||p.snapshot_hash!==e.snapshot_hash||
      !Array.isArray(p.lines)||p.lines.length!==direct.size)
    return denial('PROCESSING_REVISION_OR_LINE_COVERAGE_MISMATCH');
   const matched=new Set();
   for(const row of p.lines){
    if(!obj(row)||!val(row.NRPRODCOMVEN)||!val(row.CDPRODUTO)||
       !val(row.product_name)||!qty(row.quantity)||
       matched.has(row.NRPRODCOMVEN))
     return denial('PROCESSING_LINE_OR_NAME_INVALID');
    const native=direct.get(row.NRPRODCOMVEN);
    const master=productById.get(row.CDPRODUTO);
    if(!native||!master||native.CDPRODUTO!==row.CDPRODUTO||
       Number(native.QTPRODCOMVEN)!==Number(row.quantity)||
       name(master.NMPRODUTO)!==name(row.product_name))
     return denial('PROCESSING_NAME_NATIVE_MASTER_OR_LINE_MISMATCH');
    matched.add(row.NRPRODCOMVEN);
   }
   if(matched.size!==direct.size)
    return denial('PROCESSING_LINE_COVERAGE_INCOMPLETE');
   processingNameRowsMatched=matched.size;
  }
  // These booleans are ALWAYS false even when caller claims all tables read.
  // A complete-looking caller-supplied set cannot attest SQL commit/clock,
  // RCSI-off writer impact, iFood UUID association or physical readiness.
  return denial('NATIVE_CHILD_RELATIONSHIPS_CONSISTENT_SOURCE_UNATTESTED',{
   baseSourceStructureMatched:true,childJoinShapeMatched:true,
   callerReportedTableExhaustion:true,
   directItems:direct.size,comboMappedLines:comboLines.size,
   comboProductLines:comboGroups,extensionRows:rs.ITCOMANDAEST.rows.length,
   directObservationRows:seenDirectObs.size,
   extensionObservationRows:seenChildObs.size,
   occurrenceDictionaryRows:occurrences.size,
   referencedProductNames:requiredProducts.size,
   processingNameBindingCallerOnly:processingNameRowsMatched>0,
   processingNameRowsMatched
  });
 }catch{return denial('CHILD_RECONCILIATION_EXCEPTION_HOLD');}
}
module.exports=Object.freeze({SCHEMA,INPUT,TABLES,reconcile});
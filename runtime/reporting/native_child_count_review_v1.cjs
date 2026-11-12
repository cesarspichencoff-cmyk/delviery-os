'use strict';
// Pure, REVIEW ONLY receipt of a hypothetical future bounded count query.
// Never calls SQL, filesystem, browser, printers, network or services.
// This reviewer does NOT certify origin, isolation, completeness or delivery.
const SCHEMA='tata.comandas.single-order-child-count-review.v1';
const FIELDS=['native_item_rows','native_combo_child_rows',
 'native_item_occurrence_rows','native_combo_occurrence_rows',
 'unresolved_item_occurrence_rows','missing_product_master_rows'];
const deny=reason=>Object.freeze({schema:SCHEMA,state:'HOLD',reason,
  nativeRowsObserved:null,childRowsReported:null,
  sourceAuthenticated:false,readAtomicityProven:false,
  fullChildCoverageProven:false,uuidJoinProven:false,
  homeAuthorized:false,printAuthorized:false,actionsExecuted:0});
function review({sourceRowCount,counts}={}){
 try{
  if(sourceRowCount!==1||!counts||typeof counts!=='object'||
    Array.isArray(counts)||Object.keys(counts).length!==FIELDS.length||
    !FIELDS.every(k=>Object.hasOwn(counts,k)&&Number.isSafeInteger(counts[k])&&counts[k]>=0))
   return deny('ONE_UNAMBIGUOUS_NATIVE_ROW_AND_EXACT_INTEGER_COUNTS_REQUIRED');
  if(counts.native_item_rows===0)return deny('NO_NATIVE_ITEM_ROWS');
  if(counts.unresolved_item_occurrence_rows>counts.native_item_occurrence_rows)
   return deny('OCCURRENCE_OR_COUNT_INCONSISTENT');
  const children=counts.native_combo_child_rows+
    counts.native_item_occurrence_rows+counts.native_combo_occurrence_rows;
  if(!Number.isSafeInteger(children))return deny('CHILD_COUNT_OVERFLOW');
  const blockers=['NATIVE_SOURCE_PROVENANCE_UNATTESTED',
   'READ_COMMITTED_MULTI_SUBQUERY_ATOMICITY_UNPROVEN',
   'IFOOD_UUID_TO_NATIVE_KEY_UNATTESTED'];
  if(children>0)blockers.push('CHILD_DETAIL_AND_JOIN_CARDINALITY_NOT_CAPTURED');
  if(children===0)blockers.push('ZERO_CHILD_ROWS_REPORTED_NOT_INDEPENDENT_COMPLETENESS');
  if(counts.unresolved_item_occurrence_rows>0)blockers.push('OCCURRENCE_CODES_MISSING_FROM_MASTER');
  if(counts.missing_product_master_rows>0)blockers.push('NATIVE_PRODUCTS_MISSING_FROM_MASTER');
  return Object.freeze({schema:SCHEMA,state:'REVIEW_ONLY_COUNTS',
   nativeRowsObserved:counts.native_item_rows,childRowsReported:children,
   unresolvedOccurrenceRows:counts.unresolved_item_occurrence_rows,
   missingProductMasterRows:counts.missing_product_master_rows,
   reasons:blockers,
   sourceAuthenticated:false,readAtomicityProven:false,
   fullChildCoverageProven:false,uuidJoinProven:false,
   homeAuthorized:false,printAuthorized:false,actionsExecuted:0});
 }catch{return deny('INVALID_COUNT_REVIEW_INPUT');}
}
module.exports={SCHEMA,FIELDS,review};

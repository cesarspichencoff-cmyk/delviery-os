'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {review}=require('../../runtime/reporting/native_child_count_review_v1.cjs');
const sql=fs.readFileSync(path.join(__dirname,'../../tools/comandas_reader_one_order_child_count_REVIEW_ONLY.sql'),'utf8');
const base=()=>({sourceRowCount:1,counts:{
 native_item_rows:2,native_combo_child_rows:0,native_item_occurrence_rows:0,
 native_combo_occurrence_rows:0,unresolved_item_occurrence_rows:0,
 missing_product_master_rows:0
}});
let passed=0;const t=(n,fn)=>{fn();passed++;console.log('PASS '+n)};
t('all required native child tables are referenced',()=>{
 for(const name of ['COMANDAVEN','ITCOMANDAVEN','ITCOMANDAEST',
  'OBSITCOMANDAVEN','OBSITCOMANDAEST','OCORRENCIA','PRODUTO'])
  assert.match(sql,new RegExp('TEKNISA\\.'+name+'\\b'));
});
t('exact four-part native key is bound; no shortcut via displayId',()=>{
 for(const x of ['c.CDFILIAL=@filial','c.CDLOJA=@loja',
  'c.NRVENDAREST=@venda','c.NRCOMANDA=@comanda',
  "c.IDORGCMDVENDA='DLV_IFO'"])assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/NRCOMANDAEXT|UUID|displayId/gi);
});
t('non-writing, no dirty-read shortcut and no data exfiltration',()=>{
 const src=sql.replace(/\\/[\\*][\\s\\S]*?[\\*]\\//g,'');
 assert.doesNotMatch(src,/\\b(?:UPDATE|DELETE|INSERT|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|NOLOCK|OPENROWSET|WAITFOR)\\b/i);
 assert.doesNotMatch(src,/NMPRODUTO|DSOBSCOMANDA|DSOCORR|CPF|CLIENTE|VRPRECCOMVEN/i);
});
t('zero child counts remain unproven, not accepted',()=>{
 const r=review(base());
 assert.equal(r.state,'REVIEW_ONLY_COUNTS');
 assert.equal(r.nativeRowsObserved,2);assert.equal(r.childRowsReported,0);
 assert.equal(r.fullChildCoverageProven,false);
 assert.equal(r.homeAuthorized,false);assert.equal(r.printAuthorized,false);
 assert.ok(r.reasons.includes('ZERO_CHILD_ROWS_REPORTED_NOT_INDEPENDENT_COMPLETENESS'));
});
t('child counts cannot be silently treated as complete details',()=>{
 const x=base();x.counts.native_combo_child_rows=3;x.counts.native_item_occurrence_rows=2;
 const r=review(x);assert.equal(r.childRowsReported,5);
 assert.ok(r.reasons.includes('CHILD_DETAIL_AND_JOIN_CARDINALITY_NOT_CAPTURED'));
});
t('unresolved occurrence is explicit',()=>{
 const x=base();x.counts.native_item_occurrence_rows=1;
 x.counts.unresolved_item_occurrence_rows=1;
 assert.ok(review(x).reasons.includes('OCCURRENCE_CODES_MISSING_FROM_MASTER'));
});
t('missing vendor product name mapping stays blocked',()=>{
 const x=base();x.counts.missing_product_master_rows=1;
 assert.ok(review(x).reasons.includes('NATIVE_PRODUCTS_MISSING_FROM_MASTER'));
});
t('no header or duplicate header blocks',()=>{
 assert.equal(review({...base(),sourceRowCount:0}).state,'HOLD');
 assert.equal(review({...base(),sourceRowCount:2}).state,'HOLD');
});
t('empty item list blocks',()=>{
 const x=base();x.counts.native_item_rows=0;
 assert.equal(review(x).state,'HOLD');
});
t('bad counts, extra fields, impossible occurrence count fail closed',()=>{
 for(const value of [-1,0.1,NaN,Infinity,'2',null]){
  const x=base();x.counts.native_item_rows=value;
  assert.equal(review(x).state,'HOLD');
 }
 const x=base();x.counts.unknown=0;assert.equal(review(x).state,'HOLD');
 const y=base();y.counts.unresolved_item_occurrence_rows=1;
 assert.equal(review(y).state,'HOLD');
});
t('caller-provided counts never prove UUID, source identity or read atomicity',()=>{
 const r=review(base());for(const k of ['sourceAuthenticated',
 'readAtomicityProven','fullChildCoverageProven','uuidJoinProven',
 'homeAuthorized','printAuthorized'])assert.equal(r[k],false,k);
 assert.equal(r.actionsExecuted,0);
});
console.log('NATIVE_ONE_ORDER_CHILD_COUNT_REVIEW_PASS '+passed+'/'+passed+' LAB_ONLY');

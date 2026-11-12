'use strict';
// Fully synthetic, exact one-order child relations, no SQL, network or PII.
const assert=require('node:assert/strict');
const {snapshotHash}=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const {INPUT,reconcile}=require('../../runtime/reporting/native_reader_n2_child_tables_review_v1.cjs');
const {INPUT:BASE_INPUT}=require('../../runtime/reporting/native_reader_n2_base_tables_review_v1.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const item=(line,product)=>({
 NRPRODCOMVEN:line,CDPRODUTO:product,CDARVPROD:'9.20.00.010.00',
 QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4'
});
const scope={CDFILIAL:'0001',NRVENDAREST:'LAB_SALE_A',NRCOMANDA:'LAB_CMD_A'};
const wrap=rows=>({readExhausted:true,totalRows:rows.length,rows});
function fixture(){
 const order={...scope,CDLOJA:'01',NRCOMANDAEXT:'4321',
  IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'P',
  DTHRABERMESA:'2026-11-11T22:59:55.0000000',
  items:[item('LINE_A','111'),item('LINE_B','222')],
  observation_scan_complete:true,observation_rows:[]};
 const event={schema:'deliveryos.tata-reader-stable-order-event.v1',
  order_key:'0001|01|LAB_SALE_A|LAB_CMD_A',
  snapshot_hash:snapshotHash(order),order};
 const hdr=Object.fromEntries(['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
  'NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'].map(k=>[k,order[k]]));
 hdr.DSOBSCOMANDA=null;
 const venda=Object.fromEntries(['CDFILIAL','CDLOJA','NRVENDAREST','DTHRABERMESA'].map(k=>[k,order[k]]));
 const itemRows=order.items.map(i=>({...scope,CDLOJA:'01',...i,
  DSOBSDESCIT:null,DSOBSPEDDIGCMD:null,TXPRODCOMVEN:null}));
 return {schema:INPUT,baseInput:{schema:BASE_INPUT,event,base:{
  headerRows:[hdr],vendaRows:[venda],itemRows,readExhausted:true}},
  childRows:{
   ITCOMANDAVEN_COMBO:wrap([{...scope,NRPRODCOMVEN:'LINE_A',
    CDPRODUTO:'111',CDPRODPROMOCAO:'444',NRSEQPRODCOM:'1'},
    {...scope,NRPRODCOMVEN:'LINE_B',CDPRODUTO:'222',
     CDPRODPROMOCAO:null,NRSEQPRODCOM:null}]),
   ITCOMANDAEST:wrap([{...scope,NRPRODCOMVEN:'LINE_A',CDPRODUTO:'333',QTPROCOMEST:'1.000'}]),
   OBSITCOMANDAVEN:wrap([{...scope,NRPRODCOMVEN:'LINE_B',CDGRPOCOR:'G1',CDOCORR:'O1'}]),
   OBSITCOMANDAEST:wrap([{...scope,NRPRODCOMVEN:'LINE_A',CDPRODUTO:'333',CDGRPOCOR:'G1',CDOCORR:'O2'}]),
   OCORRENCIA:wrap([{CDGRPOCOR:'G1',CDOCORR:'O1',DSOCORR:'FICT_NO_CILANTRO'},
     {CDGRPOCOR:'G1',CDOCORR:'O2',DSOCORR:'FICT_EXTRA_SAUCE'}]),
   PRODUTO:wrap([{CDPRODUTO:'111',NMPRODUTO:'FICT_HOT_ROLL'},
     {CDPRODUTO:'222',NMPRODUTO:'FICT_SALMON'},
     {CDPRODUTO:'333',NMPRODUTO:'FICT_CHILD_COMBO'},
     {CDPRODUTO:'444',NMPRODUTO:'FICT_COMBO_PARENT'}])
  }};
}
let checked=0;
function run(label,change,expected){
 const f=fixture(),original=JSON.stringify(f);if(change)change(f);
 const r=reconcile(f);
 assert.equal(r.state,'HOLD');
 assert.equal(r.reason,expected,label);
 assert.equal(r.ordersPublishable,0);
 for(const field of ['homePublishAuthorized','printAuthorized',
  'sqlSnapshotAtomicityProven','sqlWriterSafetyProven',
  'independentTableExhaustionProven','independentIfoodUuidBindingProven',
  'nativeProductMasterAuthenticated'])assert.equal(r[field],false,label+' '+field);
 assert.equal(JSON.stringify(f),change?JSON.stringify(f):original,'MUTATED_INPUT');
 const serialized=JSON.stringify(r);
 for(const secret of ['LAB_SALE_A','LAB_CMD_A','FICT_NO_CILANTRO','FICT_EXTRA_SAUCE',
  'FICT_SALMON','FICT_CHILD_COMBO','9.20.00.010.00'])
  assert.ok(!serialized.includes(secret),'LEAK '+secret);
 checked++;console.log('PASS '+label);
 return r;
}
const OK='NATIVE_CHILD_RELATIONSHIPS_CONSISTENT_SOURCE_UNATTESTED';
const success=run('synthetic complete relations remain HOLD without world attestation',null,OK);
assert.equal(success.childJoinShapeMatched,true);
assert.equal(success.extensionRows,1);
assert.equal(success.referencedProductNames,4);
assert.equal(success.comboMappedLines,2);
assert.equal(success.comboProductLines,1);
assert.equal(success.directObservationRows,1);
assert.equal(success.extensionObservationRows,1);
run('missing required child rowset is HOLD',
 x=>{delete x.childRows.OBSITCOMANDAEST},'REQUIRED_NATIVE_CHILD_TABLE_CAPTURE_MISSING');
run('empty child table needs explicit exhausted true',
 x=>{x.childRows.ITCOMANDAEST.readExhausted=false},'CHILD_ROWSET_MISSING_EXHAUSTION_OR_TRUNCATED');
run('truncated table count refused',x=>{x.childRows.PRODUTO.totalRows=2},
 'CHILD_ROWSET_MISSING_EXHAUSTION_OR_TRUNCATED');
run('base tampering cannot be masked by children',
 x=>{x.baseInput.base.itemRows[0].QTPRODCOMVEN='10.000'},'N2_BASE_NOT_MATCHED');
run('wrong sale scope for combo child fails',
 x=>{x.childRows.ITCOMANDAEST.rows[0].NRVENDAREST='OTHER'},'CHILD_ITEM_PARENT_SCOPE_OR_QUANTITY_INVALID');
run('combo group line cannot be borrowed from foreign order',
 x=>{x.childRows.ITCOMANDAVEN_COMBO.rows[0].NRCOMANDA='OTHER'},
 'COMBO_NATIVE_LINE_OR_GROUP_SCOPE_INVALID');
run('combo line cannot be missing',
 x=>{x.childRows.ITCOMANDAVEN_COMBO.rows.pop();
      x.childRows.ITCOMANDAVEN_COMBO.totalRows=1},
 'COMBO_LINE_PROJECTION_NOT_EXHAUSTIVE');
run('combo code must appear in native product dictionary',
 x=>{const a=x.childRows.PRODUTO;
      a.rows=a.rows.filter(r=>r.CDPRODUTO!=='444');a.totalRows=a.rows.length;},
 'PRODUCT_NAME_FROM_NATIVE_MASTER_NOT_COVERED');
run('repeated combo projection line is refused',
 x=>{const a=x.childRows.ITCOMANDAVEN_COMBO;
      a.rows.push(copy(a.rows[0]));a.totalRows=3;},
 'COMBO_NATIVE_LINE_OR_GROUP_SCOPE_INVALID');
run('cross-shop child field refused when separately supplied',
 x=>{x.childRows.ITCOMANDAEST.rows[0].CDLOJA='02'},'CHILD_ITEM_PARENT_SCOPE_OR_QUANTITY_INVALID');
run('cross-shop direct observation refused when separately supplied',
 x=>{x.childRows.OBSITCOMANDAVEN.rows[0].CDLOJA='02'},'DIRECT_OBSERVATION_PARENT_OR_DICTIONARY_MISSING');
run('cross-shop extension observation refused when separately supplied',
 x=>{x.childRows.OBSITCOMANDAEST.rows[0].CDLOJA='02'},'CHILD_OBSERVATION_PARENT_OR_DICTIONARY_MISSING');
run('orphan combo child parent refused',
 x=>{x.childRows.ITCOMANDAEST.rows[0].NRPRODCOMVEN='NONEXISTENT'},'CHILD_ITEM_PARENT_SCOPE_OR_QUANTITY_INVALID');
run('duplicate combo child identity refused',
 x=>{const rs=x.childRows.ITCOMANDAEST;rs.rows.push(copy(rs.rows[0]));rs.totalRows=2},
 'CHILD_ITEM_NATIVE_IDENTITY_DUPLICATE');
run('missing product master mapping refused',
 x=>{const a=x.childRows.PRODUTO;a.rows=a.rows.filter(r=>r.CDPRODUTO!=='333');a.totalRows=3},
 'PRODUCT_NAME_FROM_NATIVE_MASTER_NOT_COVERED');
run('ambiguous product master mapping refused',
 x=>{const a=x.childRows.PRODUTO;a.rows.push(copy(a.rows[0]));a.totalRows=5},
 'PRODUCT_MASTER_ROW_MISSING_OR_AMBIGUOUS');
run('invalid child quantity refused',
 x=>{x.childRows.ITCOMANDAEST.rows[0].QTPROCOMEST='0'},'CHILD_ITEM_PARENT_SCOPE_OR_QUANTITY_INVALID');
run('orphan native direct observation refused',
 x=>{x.childRows.OBSITCOMANDAVEN.rows[0].NRPRODCOMVEN='OTHER'},'DIRECT_OBSERVATION_PARENT_OR_DICTIONARY_MISSING');
run('orphan child observation refused',
 x=>{x.childRows.OBSITCOMANDAEST.rows[0].CDPRODUTO='OTHER'},'CHILD_OBSERVATION_PARENT_OR_DICTIONARY_MISSING');
run('unknown occurrence code refused',
 x=>{x.childRows.OBSITCOMANDAVEN.rows[0].CDOCORR='UNKNOWN'},'DIRECT_OBSERVATION_PARENT_OR_DICTIONARY_MISSING');
run('ambiguous occurrence dictionary refused',
 x=>{const a=x.childRows.OCORRENCIA;a.rows.push(copy(a.rows[0]));a.totalRows=3},'OCCURRENCE_IDENTITY_AMBIGUOUS');
run('duplicate direct observation refused',
 x=>{const a=x.childRows.OBSITCOMANDAVEN;a.rows.push(copy(a.rows[0]));a.totalRows=2},'DIRECT_OBSERVATION_DUPLICATE');
run('duplicate child observation refused',
 x=>{const a=x.childRows.OBSITCOMANDAEST;a.rows.push(copy(a.rows[0]));a.totalRows=2},'CHILD_OBSERVATION_DUPLICATE');
run('combo parent without native sequence is refused',
 x=>{x.childRows.ITCOMANDAVEN_COMBO.rows[0].NRSEQPRODCOM=null},
 'COMBO_PARENT_SEQUENCE_GROUP_INCOMPLETE');
run('combo sequence without native parent is refused',
 x=>{x.childRows.ITCOMANDAVEN_COMBO.rows[0].CDPRODPROMOCAO=null},
 'COMBO_PARENT_SEQUENCE_GROUP_INCOMPLETE');
run('truncation sentinel at fixed limit refused',
 x=>{const a=x.childRows.ITCOMANDAEST;a.rows=Array.from({length:200},()=>copy(a.rows[0]));a.totalRows=200},
 'CHILD_ROWSET_MISSING_EXHAUSTION_OR_TRUNCATED');
run('no options is a caller claim, never source completeness',
 x=>{x.childRows.ITCOMANDAEST=wrap([]);
      x.childRows.OBSITCOMANDAEST=wrap([]);
      x.childRows.OBSITCOMANDAVEN=wrap([]);
      x.childRows.OCORRENCIA=wrap([]);
      x.childRows.ITCOMANDAVEN_COMBO=wrap(x.childRows.ITCOMANDAVEN_COMBO.rows.map(r=>({...r,CDPRODPROMOCAO:null,NRSEQPRODCOM:null})));
      x.childRows.PRODUTO=wrap(x.childRows.PRODUTO.rows.slice(0,2));},OK);
// Review-only SQL blueprint is non-executable without explicit private binds.
const fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,
 '../../tools/comandas_reader_one_order_children_CAPTURE_OFFLINE_ONLY.sql'),'utf8');
const sqlBody=sql.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*--.*$/gm,'');
run('one-order SQL blueprint uses six native rowsets and private binds',null,
 'NATIVE_CHILD_RELATIONSHIPS_CONSISTENT_SOURCE_UNATTESTED');
assert.equal((sqlBody.match(/\bSELECT TOP\s*\(/g)||[]).length,6);
for(const table of ['ITCOMANDAVEN','ITCOMANDAEST','OBSITCOMANDAVEN',
 'OBSITCOMANDAEST','OCORRENCIA','PRODUTO'])
 assert.match(sqlBody,new RegExp('TEKNISA\\.'+table+'\\b'));
for(const bind of [':CDFILIAL',':CDLOJA',':NRVENDAREST',':NRCOMANDA'])
 assert.ok(sqlBody.includes(bind),'MISSING_PRIVATE_BIND '+bind);
for(const illegal of ['UPDATE','DELETE','INSERT','MERGE','ALTER','DROP',
 'TRUNCATE','EXEC','NOLOCK','READPAST','OPENROWSET','DBCC'])
 assert.doesNotMatch(sqlBody,new RegExp('\\b'+illegal+'\\b','i'));
assert.match(sql,/DO NOT EXECUTE ON CAIXA_MOOCA/);

console.log('NATIVE_CHILD_ONE_ORDER_RECONCILE_PASS '+checked+'/'+checked+' OFFLINE_ONLY_FIELD_HOLD');

// Existing processing record first: no additional SQL query or customer export.
require('./run-native-reader-ifood-processing-correlation-tests.cjs');

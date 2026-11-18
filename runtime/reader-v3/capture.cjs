'use strict';
// Reuses the PR135/137 structural reviewers without changing their authority.
const {snapshotHash}=require('../reporting/native_reader_shadow_replay_v1.cjs');
const {reconcileCaptureV3:reconcile,INPUT}=require('../reporting/native_reader_n2_child_tables_review_v1.cjs');
const {INPUT:BASE_INPUT}=require('../reporting/native_reader_n2_base_tables_review_v1.cjs');
const {hash}=require('./store.cjs');
const HEAD=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
const ITEM=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
const NOTES=['DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN'];
const FIELDS={
 ITCOMANDAVEN_COMBO:['CDFILIAL','NRVENDAREST','NRCOMANDA','NRPRODCOMVEN','CDPRODUTO','CDPRODPROMOCAO','NRSEQPRODCOM'],
 ITCOMANDAEST:['CDFILIAL','NRVENDAREST','NRCOMANDA','NRPRODCOMVEN','CDPRODUTO','QTPROCOMEST'],
 OBSITCOMANDAVEN:['CDFILIAL','NRVENDAREST','NRCOMANDA','NRPRODCOMVEN','CDGRPOCOR','CDOCORR','NRPRODCOMVENOBS','QTPRODCOMVENOBS'],
 OBSITCOMANDAEST:['CDFILIAL','NRVENDAREST','NRCOMANDA','NRPRODCOMVEN','CDPRODUTO','CDGRPOCOR','CDOCORR'],
 OCORRENCIA:['CDGRPOCOR','CDOCORR','CDPRODUTO','DSOCORR','DSAPELIDOOBS'],
 PRODUTO:['CDPRODUTO','NMPRODUTO']
};
const CAPS=[200,200,400,400,800,400];
function pick(row, fields){const o={};for(const f of fields){if(!Object.hasOwn(row,f))throw Error('COLUMN_MISSING');const v=row[f];if(v!==null&&(typeof v!=='string'||v.length>2000||/[\x00-\x08\x0b-\x1f\x7f]/.test(v)))throw Error('FIELD_INVALID');o[f]=v;}return o;}
function buildCapture(raw, key, now, service) {
 if(!raw||!Array.isArray(raw.headerRows)||raw.headerRows.length!==1||!Array.isArray(raw.itemRows)||raw.itemRows.length<1||raw.itemRows.length>=200)throw Error('BASE_BOUNDS');
 const h=pick(raw.headerRows[0],[...HEAD,'DSOBSCOMANDA']);
 if(h.CDFILIAL!=='0001'||h.CDLOJA!=='01'||!['DLV_IFO','DLV_NMO'].includes(h.IDORGCMDVENDA)||[h.CDFILIAL,h.CDLOJA,h.NRVENDAREST,h.NRCOMANDA].join('|')!==key)throw Error('SCOPE_MISMATCH');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(h.DTHRABERMESA))throw Error('NATIVE_TIME_INVALID');
 const rows=raw.itemRows.map(r=>pick(r,['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',...ITEM,...NOTES]));
 for(const r of rows)if(!/^\d+(?:\.\d{1,4})?$/.test(r.QTPRODCOMVEN)||!(Number(r.QTPRODCOMVEN)>0)||!Number.isFinite(Number(r.QTPRODCOMVEN)))throw Error('ITEM_QUANTITY_INVALID');
 const order=pick(h,HEAD);order.items=rows.map(r=>pick(r,ITEM));
 order.observation_scan_complete=true;order.observation_rows=[];
 if(h.DSOBSCOMANDA?.trim())order.observation_rows.push({source_field:'DSOBSCOMANDA',scope_hint:'order',value:h.DSOBSCOMANDA.trim(),join_proven:true});
 rows.forEach((r,i)=>NOTES.forEach(f=>{if(r[f]?.trim())order.observation_rows.push({source_field:f,scope_hint:'item',item_index:i,NRPRODCOMVEN:r.NRPRODCOMVEN,CDPRODUTO:r.CDPRODUTO,value:r[f].trim(),join_proven:true});}));
 const childRows={};let ix=0;
 for(const [name,fields] of Object.entries(FIELDS)){
  const s=raw.childRows?.[name];if(!s||s.readExhausted!==true||!Array.isArray(s.rows)||s.totalRows!==s.rows.length||s.rows.length>=CAPS[ix++])throw Error('ROWSET_NOT_EXHAUSTED');
  childRows[name]={readExhausted:true,totalRows:s.rows.length,rows:s.rows.map(r=>pick(r,fields))};
 }
 const event={schema:'deliveryos.tata-reader-stable-order-event.v1',order_key:key,snapshot_hash:snapshotHash(order),order};
 // V3 has an explicit native-line witness; historic N2 remains iFood-only.
 const baseInput={schema:BASE_INPUT,event,base:{headerRows:[h],vendaRows:[pick(h,['CDFILIAL','CDLOJA','NRVENDAREST','DTHRABERMESA'])],itemRows:rows,readExhausted:raw.readExhausted===true}};
 const reviewed=reconcile({schema:INPUT,baseInput,childRows});
 if(!reviewed.childJoinShapeMatched)throw Error(reviewed.reason);
 const content={order,childRows,service};
 return {schema:'deliveryos.reader-v3.capture.v1',order_key:key,revision:hash(content),observed_at:now.toISOString(),...content,
  evidence:{relationships:'CONSISTENT',sql_isolation:'READ_COMMITTED',sql_snapshot_atomicity_proven:false,
   source_writer_finished_proven:false,independent_ifood_completeness:'NOT_CONFIRMED',native_status_semantics:'UNINTERPRETED'},
  effects:{database_write:false,print:false,operational_action:false}};
}
module.exports={buildCapture,FIELDS,CAPS};
